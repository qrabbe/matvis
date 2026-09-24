import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const MAX_QUANTITY = 1000;

function assertValidQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    throw new Error('quantity must be a finite number between 0 and 1000');
  }
}

function assertValidConsumedAt(consumedAt: number): void {
  if (!Number.isFinite(consumedAt) || consumedAt > Date.now() + 86_400_000) {
    throw new Error('consumedAt must not be far in the future');
  }
}

export const logConsumption = mutation({
  args: {
    token: v.string(),
    ean: v.string(),
    quantity: v.number(),
    consumedAt: v.number(),
  },
  returns: v.id('consumptionEvents'),
  handler: async (ctx, { token, ean, quantity, consumedAt }) => {
    assertValidQuantity(quantity);
    assertValidConsumedAt(consumedAt);
    return await ctx.db.insert('consumptionEvents', {
      token,
      ean,
      quantity,
      consumedAt,
    });
  },
});

export const deleteConsumption = mutation({
  args: {
    token: v.string(),
    eventId: v.id('consumptionEvents'),
  },
  returns: v.null(),
  handler: async (ctx, { token, eventId }) => {
    const event = await ctx.db.get(eventId);
    // Absent or someone else's token: nothing to delete, and never reveal
    // which. A caller cannot use this to discover whether an id exists.
    if (!event || event.token !== token) return null;
    await ctx.db.delete(eventId);
    return null;
  },
});

export const setExcluded = mutation({
  args: {
    token: v.string(),
    ean: v.string(),
    excluded: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { token, ean, excluded }) => {
    const existing = await ctx.db
      .query('productPreferences')
      .withIndex('by_token_ean', (q) => q.eq('token', token).eq('ean', ean))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { excluded });
    } else {
      await ctx.db.insert('productPreferences', { token, ean, excluded });
    }
    return null;
  },
});

const consumptionEventValidator = v.object({
  _id: v.id('consumptionEvents'),
  _creationTime: v.number(),
  ean: v.string(),
  quantity: v.number(),
  consumedAt: v.number(),
});

export const listConsumption = query({
  args: { token: v.string() },
  returns: v.array(consumptionEventValidator),
  handler: async (ctx, { token }) => {
    const events = await ctx.db
      .query('consumptionEvents')
      .withIndex('by_token', (q) => q.eq('token', token))
      .collect();
    return events.map(({ token: _token, ...event }) => event);
  },
});

const preferenceValidator = v.object({
  ean: v.string(),
  excluded: v.boolean(),
});

export const listPreferences = query({
  args: { token: v.string() },
  returns: v.array(preferenceValidator),
  handler: async (ctx, { token }) => {
    const rows = await ctx.db
      .query('productPreferences')
      .withIndex('by_token_ean', (q) => q.eq('token', token))
      .collect();
    return rows.map(({ ean, excluded }) => ({ ean, excluded }));
  },
});

export const exportAll = query({
  args: { token: v.string() },
  returns: v.object({
    consumptionEvents: v.array(consumptionEventValidator),
    productPreferences: v.array(preferenceValidator),
  }),
  handler: async (ctx, { token }) => {
    const [events, preferences] = await Promise.all([
      ctx.db
        .query('consumptionEvents')
        .withIndex('by_token', (q) => q.eq('token', token))
        .collect(),
      ctx.db
        .query('productPreferences')
        .withIndex('by_token_ean', (q) => q.eq('token', token))
        .collect(),
    ]);
    return {
      consumptionEvents: events.map(({ token: _token, ...event }) => event),
      productPreferences: preferences.map(({ ean, excluded }) => ({
        ean,
        excluded,
      })),
    };
  },
});
