import { normalizeItemText, type StoreSlug } from '@matvis/shared';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from './_generated/server';
import { readScopedAccountId } from './model/auth';
import {
  itemGtinMapKindValidator,
  MAX_MAP_ROWS_PER_TEXT,
  storeValidator,
} from './validators';

/** One `(store, normalizedText, price)` triple identifies a single row —
 * `price` (including "absent", the generic row) is the price group a text
 * was split into, the same grouping the identify flow shows the user. */
async function findRow(
  ctx: MutationCtx,
  store: StoreSlug,
  normalizedText: string,
  price: number | undefined,
): Promise<{
  rows: Doc<'itemGtinMap'>[];
  existing: Doc<'itemGtinMap'> | undefined;
}> {
  const rows = await ctx.db
    .query('itemGtinMap')
    .withIndex('by_store_text', (q) =>
      q.eq('store', store).eq('normalizedText', normalizedText),
    )
    .collect();
  return { rows, existing: rows.find((r) => r.price === price) };
}

export const link = mutation({
  args: {
    token: v.string(),
    store: storeValidator,
    text: v.string(),
    kind: itemGtinMapKindValidator,
    gtin: v.optional(v.string()),
    price: v.optional(v.number()),
  },
  returns: v.id('itemGtinMap'),
  handler: async (ctx, { token, store, text, kind, gtin, price }) => {
    const accountId = await readScopedAccountId(ctx, token);
    if (accountId === null) throw new Error('Unauthenticated');

    if (kind === 'product' && !gtin) {
      throw new Error('gtin is required when kind is "product"');
    }
    if (kind !== 'product' && gtin !== undefined) {
      throw new Error('gtin must be omitted unless kind is "product"');
    }
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      throw new Error('price must be a non-negative finite number');
    }

    const normalizedText = normalizeItemText(text);
    if (normalizedText === '') {
      throw new Error('text normalizes to an empty string');
    }

    const { rows, existing } = await findRow(ctx, store, normalizedText, price);

    if (existing) {
      await ctx.db.patch(existing._id, {
        kind,
        gtin,
        price,
        source: 'app',
        createdBy: accountId,
      });
      return existing._id;
    }

    if (rows.length >= MAX_MAP_ROWS_PER_TEXT) {
      throw new Error(
        `"${normalizedText}" already has ${rows.length} mappings — too many distinct prices for one text`,
      );
    }

    return await ctx.db.insert('itemGtinMap', {
      store,
      normalizedText,
      kind,
      gtin,
      price,
      source: 'app',
      createdBy: accountId,
    });
  },
});

/** Reverts a mapping so the line returns to "to identify" — for undoing a
 * wrong pick, not the normal correction path (relinking with a new `kind`/
 * `gtin` on {@link link} already overwrites in place). */
export const unlink = mutation({
  args: {
    token: v.string(),
    store: storeValidator,
    text: v.string(),
    price: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { token, store, text, price }) => {
    const accountId = await readScopedAccountId(ctx, token);
    if (accountId === null) throw new Error('Unauthenticated');

    const normalizedText = normalizeItemText(text);
    const { existing } = await findRow(ctx, store, normalizedText, price);
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/** One-off import from `packages/connector/data/itemGtinMap.coop.json` (the
 * checked-in export of confirmed links made in `matvis-linker`, a sibling
 * tool outside this repo — see its README), run by a developer via `bunx
 * convex run mappings:upsert`. Same upsert-by-`(store, normalizedText,
 * price)` semantics as {@link link}, minus the token/account, since this is
 * an admin import rather than a signed-in write; `source` is always `seed`.
 * Not reachable from the client. */
export const upsert = internalMutation({
  args: {
    rows: v.array(
      v.object({
        store: storeValidator,
        text: v.string(),
        kind: itemGtinMapKindValidator,
        gtin: v.optional(v.string()),
        price: v.optional(v.number()),
      }),
    ),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, { rows }) => {
    let inserted = 0;
    let updated = 0;
    for (const { store, text, kind, gtin, price } of rows) {
      const normalizedText = normalizeItemText(text);
      if (normalizedText === '') continue;

      const { rows: existingRows, existing } = await findRow(
        ctx,
        store,
        normalizedText,
        price,
      );

      if (existing) {
        await ctx.db.patch(existing._id, {
          kind,
          gtin,
          price,
          source: 'seed',
        });
        updated++;
      } else if (existingRows.length < MAX_MAP_ROWS_PER_TEXT) {
        await ctx.db.insert('itemGtinMap', {
          store,
          normalizedText,
          kind,
          gtin,
          price,
          source: 'seed',
        });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});
