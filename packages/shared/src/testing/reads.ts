import type {
  DefaultFunctionArgs,
  FunctionVisibility,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server';

export type ReadRange = {
  table: string;
  kind: 'index' | 'search' | 'scan';
  index: string | null;
};

export type ReadCounts = {
  gets: number;
  docs: number;
  ranges: ReadRange[];
};

const CHAIN_METHODS = [
  'withIndex',
  'withSearchIndex',
  'fullTableScan',
  'order',
];
const TERMINALS = ['collect', 'take', 'first', 'unique', 'paginate'];

type AnyFn = (...args: unknown[]) => unknown;

function countDocs(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (result === null || result === undefined) return 0;
  if (typeof result === 'object' && 'page' in result) {
    const page = (result as { page: unknown }).page;
    return Array.isArray(page) ? page.length : 1;
  }
  return 1;
}

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

export function countReads<Ctx extends { db: object }>(
  ctx: Ctx,
): { ctx: Ctx; counts: ReadCounts } {
  const counts: ReadCounts = { gets: 0, docs: 0, ranges: [] };
  return { ctx: { ...ctx, db: wrapDb(ctx.db, counts) } as Ctx, counts };
}

export function rangesOn(counts: ReadCounts, table: string): ReadRange[] {
  return counts.ranges.filter((range) => range.table === table);
}

export function handlerOf<Ctx, Args extends DefaultFunctionArgs, Returns>(
  fn:
    | RegisteredQuery<FunctionVisibility, Args, Returns>
    | RegisteredMutation<FunctionVisibility, Args, Returns>,
): (ctx: Ctx, args: Args) => Returns {
  return (fn as unknown as { _handler: (ctx: Ctx, args: Args) => Returns })
    ._handler;
}
