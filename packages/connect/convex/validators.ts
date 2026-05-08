import { STORES } from '@matvis/shared';
import { v } from 'convex/values';

// Store slug validator, derived from the canonical STORES list in
// @matvis/shared so it can't drift from the zod ReceiptSource. Shared by the
// schema and by function argument validators.
export const storeValidator = v.union(...STORES.map((slug) => v.literal(slug)));
