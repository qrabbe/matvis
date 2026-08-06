// Action-only, for the same reason as `./fetch.ts`.
import { chunk } from '@matvis/shared';
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import {
  COOP_BATCH_SIZE,
  DISCOVERY_DRAIN_MAX_BATCHES,
  ENQUEUE_CHUNK,
} from '../model/ingest';
import { loggedRun } from '../model/runs';

export const COOP_PRODUCT_SITEMAP_URL =
  'https://www.coop.se/handla/sitemap_products.xml';

const EAN_PATTERN = /^\d{8,14}$/;

export function eanFromProductUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0]!.replace(/\/+$/, '');
  const slug = path.slice(path.lastIndexOf('/') + 1);
  const candidate = slug.slice(slug.lastIndexOf('-') + 1);
  return EAN_PATTERN.test(candidate) ? candidate : null;
}

export function eansFromSitemap(xml: string): string[] {
  const eans = new Set<string>();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const ean = eanFromProductUrl(match[1]!.trim());
    if (ean) eans.add(ean);
  }
  return [...eans];
}

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
