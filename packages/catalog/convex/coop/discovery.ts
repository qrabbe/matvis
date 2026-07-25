// NOTE: action-only, for the same reason as `./fetch.ts` — see the note there.
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import {
  COOP_BATCH_SIZE,
  DISCOVERY_DRAIN_MAX_BATCHES,
  ENQUEUE_CHUNK,
} from '../model/ingest';
import { loggedRun } from '../model/runs';

/**
 * Coop's product sitemap, which is what the catalog discovers from. It is not
 * recorded anywhere in the old repo, so it was re-derived: `coop.se/robots.txt`
 * points at `/sitemap.xml`, a sitemap index whose product entry is this file.
 * ~13.5k URLs, ~3.3 MB, `lastmod` per product.
 *
 * Every URL ends in the product's id: `.../ovriga-smaksattare/tabasco-rod-11210000018`.
 */
export const COOP_PRODUCT_SITEMAP_URL =
  'https://www.coop.se/handla/sitemap_products.xml';

/**
 * Ids Coop uses are GTIN-ish but not strictly: the sitemap holds 8, 11, 12 and
 * 13 digit ids. The range is wide enough to take all of them and narrow enough
 * to reject a non-product URL, whose last segment is a word or a `.xml` file.
 */
const EAN_PATTERN = /^\d{8,14}$/;

/**
 * Read the product id off one sitemap URL, or null when the URL is not a product
 * page. The id is the last dash-separated part of the last path segment, which
 * is also the whole segment when the slug is bare digits.
 */
export function eanFromProductUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0]!.replace(/\/+$/, '');
  const slug = path.slice(path.lastIndexOf('/') + 1);
  const candidate = slug.slice(slug.lastIndexOf('-') + 1);
  return EAN_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Every product id in a sitemap XML document, in document order and deduped.
 * Read with a regex rather than an XML parser: the Convex runtime has no DOM,
 * the document is a flat list of `<loc>` elements, and a malformed entry should
 * cost one URL rather than the whole 3 MB file.
 */
export function eansFromSitemap(xml: string): string[] {
  const eans = new Set<string>();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const ean = eanFromProductUrl(match[1]!.trim());
    if (ean) eans.add(ean);
  }
  return [...eans];
}

/** Split into chunks of `size`, the last one short. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Discovery: read the product sitemap and enqueue every id the catalog does not
 * already hold. Ids already in `raw_coop` are left to the refresh sweep, so a
 * re-run of this on an already-full catalog queues nothing and costs one HTTP
 * request — which is what makes it safe to schedule.
 *
 * Drains what it queued when it finds anything, up to
 * {@link DISCOVERY_DRAIN_MAX_BATCHES}; the queue cron finishes any remainder.
 */
export const discoverFromSitemap = internalAction({
  args: {
    sitemapUrl: v.optional(v.string()),
    drain: v.optional(v.boolean()),
  },
  returns: v.object({
    found: v.number(),
    queued: v.number(),
    known: v.number(),
    duplicate: v.number(),
  }),
  // Logged but not pause-gated: reading the sitemap and filling the queue costs
  // one request and writes nothing Coop is asked about. What pause has to stop
  // is the drain below, which is where the check sits.
  handler: async (ctx, { sitemapUrl, drain }) =>
    await loggedRun(ctx, 'discovery', null, async () => {
      const url = sitemapUrl ?? COOP_PRODUCT_SITEMAP_URL;
      const response = await fetch(url, {
        headers: { Accept: 'application/xml' },
      });
      if (!response.ok) {
        throw new Error(
          `Coop sitemap fetch failed: ${response.status} ${response.statusText}`,
        );
      }
      const eans = eansFromSitemap(await response.text());

      let queued = 0;
      let known = 0;
      let duplicate = 0;
      for (const batch of chunk(eans, ENQUEUE_CHUNK)) {
        const result = await ctx.runMutation(internal.ingest.enqueueEans, {
          eans: batch,
          source: 'sitemap',
        });
        queued += result.queued;
        known += result.known;
        duplicate += result.duplicate;
      }

      const paused = await ctx.runQuery(internal.ops.isPaused, {});
      if (queued > 0 && (drain ?? true) && !paused) {
        await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {
          batches: Math.min(
            Math.ceil(queued / COOP_BATCH_SIZE),
            DISCOVERY_DRAIN_MAX_BATCHES,
          ),
        });
      }

      return { found: eans.length, queued, known, duplicate };
    }),
});
