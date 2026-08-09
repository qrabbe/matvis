import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { coopProductInformationFields } from './schemes/coop';
import { icaProductValidator } from './ica/parse';
import {
  project,
  projectIcaProduct,
  rememberEan,
  upsertClean,
} from './model/project';

/** Projects a fetched Coop payload straight into `catalog`. The payload itself
 * is never stored, so a projector change means refetching rather than
 * replaying. */
export const upsertCoopByEan = internalMutation({
  args: { data: v.object(coopProductInformationFields) },
  returns: v.object({ stored: v.boolean(), inserted: v.boolean() }),
  handler: async (ctx, { data }) => {
    const clean = project('coop', data);
    if (!clean) return { stored: false, inserted: false };
    await rememberEan(ctx, 'coop', clean.ean);
    const inserted = await upsertClean(ctx, clean);
    return { stored: true, inserted };
  },
});

/** The ICA equivalent, and the only writer the ICA lane has. The page payload
 * is never stored either, so a projector change means re-crawling rather than
 * replaying, exactly as it does for Coop.
 *
 * `sourceId` rides along so `rememberEan` can fill it in on a barcode the Coop
 * census reached first. Without it an ICA row could never be re-fetched, since
 * ICA pages are addressed by product id and not by EAN. */
export const upsertIcaByEan = internalMutation({
  args: { data: icaProductValidator, sourceId: v.optional(v.string()) },
  returns: v.object({ stored: v.boolean(), inserted: v.boolean() }),
  handler: async (ctx, { data, sourceId }) => {
    const clean = projectIcaProduct(data);
    if (!clean) return { stored: false, inserted: false };
    await rememberEan(ctx, 'ica', clean.ean, sourceId);
    const inserted = await upsertClean(ctx, clean);
    return { stored: true, inserted };
  },
});
