import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { storeValidator } from './model/fields';
import { searchForPortal } from './model/portalReads';

const portalListRow = v.object({
  ean: v.string(),
  name: v.string(),
  brand: v.optional(v.string()),
  packageSizeText: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  store: storeValidator,
});

export const search = query({
  args: {
    q: v.optional(v.string()),
    store: storeValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(portalListRow),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal('SplitRecommended'),
        v.literal('SplitRequired'),
        v.null(),
      ),
    ),
  }),
  handler: (ctx, args) => searchForPortal(ctx, args),
});
