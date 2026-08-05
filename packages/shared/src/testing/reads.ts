import type {
  DefaultFunctionArgs,
  FunctionVisibility,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server';

// Read counting for Convex handler tests, shared because both deployments want
// the same numbers. `convex-test` runs a handler against a real ctx, so wrapping
// that ctx's `db` counts what one invocation reads: which index ranges it
// opened, how many point reads it did, how many documents came back. Read counts
// are deterministic, so tests assert them as equalities and a change to one is
// either a regression or an improvement worth a line in the diff.

/** One range a handler opened, named by the index that served it. */
export type ReadRange = {
  table: string;
  kind: 'index' | 'search' | 'scan';
  index: string | null;
};

/** What a single handler invocation read. */
export type ReadCounts = {
  /** `ctx.db.get` calls, whether or not the document existed. */
  gets: number;
  /** Documents handed back, by a point read or by a range. */
  docs: number;
  /** Ranges opened, in the order they were opened. */
  ranges: ReadRange[];
};

// Builder methods that narrow a range, and the ones that run it. Anything else
// on the builder is passed straight through.
const CHAIN_METHODS = [
  'withIndex',
  'withSearchIndex',
  'fullTableScan',
  'order',
];
const TERMINALS = ['collect', 'take', 'first', 'unique', 'paginate'];

type AnyFn = (...args: unknown[]) => unknown;

/** Documents in a terminal's result: an array, a page, or a single row. */
function countDocs(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (result === null || result === undefined) return 0;
  if (typeof result === 'object' && 'page' in result) {
    const page = (result as { page: unknown }).page;
    return Array.isArray(page) ? page.length : 1;
  }
  return 1;
}

/**
 * Note the range a builder call opens. A `withIndex` is the range, so it counts
 * at once; a terminal reached without one read the whole table.
 */
function recordRange(
  name: string,
  args: unknown[],
  table: string,
  counts: ReadCounts,
  chain: { opened: boolean },
): void {
  if (name === 'withIndex' || name === 'withSearchIndex') {
    chain.opened = true;
    const [index] = args;
    counts.ranges.push({
      table,
      kind: name === 'withIndex' ? 'index' : 'search',
      index: typeof index === 'string' ? index : null,
    });
    return;
  }
  if (chain.opened) return;
  if (name === 'fullTableScan' || TERMINALS.includes(name)) {
    chain.opened = true;
    counts.ranges.push({ table, kind: 'scan', index: null });
  }
}

/** Wrap one `ctx.db.query(table)` chain so its range and its rows are counted. */
function wrapChain(
  builder: object,
  table: string,
  counts: ReadCounts,
  chain: { opened: boolean },
): object {
  return new Proxy(builder, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      const method = value as AnyFn;
      const name = typeof prop === 'string' ? prop : '';
      const isTerminal = TERMINALS.includes(name);
      if (!isTerminal && !CHAIN_METHODS.includes(name)) {
        return method.bind(target);
      }
      return (...args: unknown[]) => {
        recordRange(name, args, table, counts, chain);
        const result = method.apply(target, args);
        if (isTerminal) {
          return Promise.resolve(result).then((rows) => {
            counts.docs += countDocs(rows);
            return rows;
          });
        }
        return typeof result === 'object' && result !== null
          ? wrapChain(result, table, counts, chain)
          : result;
      };
    },
  });
}

/** Wrap `ctx.db` so `get` and every query chain report into `counts`. */
function wrapDb(db: object, counts: ReadCounts): object {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      const method = value as AnyFn;
      if (prop === 'get') {
        return async (...args: unknown[]) => {
          counts.gets += 1;
          const doc = await method.apply(target, args);
          if (doc !== null && doc !== undefined) counts.docs += 1;
          return doc;
        };
      }
      if (prop === 'query') {
        return (table: string) => {
          const builder = method.apply(target, [table]);
          return typeof builder === 'object' && builder !== null
            ? wrapChain(builder, table, counts, { opened: false })
            : builder;
        };
      }
      return method.bind(target);
    },
  });
}

/**
 * A copy of `ctx` whose `db` counts reads, plus the live counts. Pass the copy
 * to a handler and read `counts` once the handler has resolved.
 */
export function countReads<Ctx extends { db: object }>(
  ctx: Ctx,
): { ctx: Ctx; counts: ReadCounts } {
  const counts: ReadCounts = { gets: 0, docs: 0, ranges: [] };
  return { ctx: { ...ctx, db: wrapDb(ctx.db, counts) } as Ctx, counts };
}

/** The ranges opened against one table, for asserting a table went untouched. */
export function rangesOn(counts: ReadCounts, table: string): ReadRange[] {
  return counts.ranges.filter((range) => range.table === table);
}

/**
 * The raw handler a registered `query` or `mutation` keeps on `_handler`.
 * Calling it directly is what lets a test hand a handler a counting ctx in place
 * of the one `convex-test` built.
 */
export function handlerOf<Ctx, Args extends DefaultFunctionArgs, Returns>(
  fn:
    | RegisteredQuery<FunctionVisibility, Args, Returns>
    | RegisteredMutation<FunctionVisibility, Args, Returns>,
): (ctx: Ctx, args: Args) => Returns {
  return (fn as unknown as { _handler: (ctx: Ctx, args: Args) => Returns })
    ._handler;
}
