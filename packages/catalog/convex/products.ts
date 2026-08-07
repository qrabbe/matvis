import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { coopProductInformationFields } from './schemes/coop';
import { project, rememberEan, upsertClean } from './model/project';

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
