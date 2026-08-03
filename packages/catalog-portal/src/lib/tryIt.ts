import type { Operation, ValidatorNode } from './contract';

// ── Turning a generated operation into a form ────────────────────────────────
// The catalog is public and unauthenticated and the portal already holds a
// Convex client, so "Try it" runs the real query against the real deployment.
// There is no key to handle, and the response on the page cannot go stale
// because it is not a sample.

/** First page a try-it call asks for. Small on purpose: this demonstrates the
 * shape, and the whole response is printed underneath. */
const TRY_IT_PAGE_SIZE = 3;

/**
 * Arguments the form supplies rather than asks for. `paginationOpts` is the
 * only one: every try-it call wants the first small page, and a cursor is not
 * something a reader can type.
 */
const SUPPLIED: Record<string, unknown> = {
  paginationOpts: { numItems: TRY_IT_PAGE_SIZE, cursor: null },
};

/**
 * Starting values, so the first click returns a product rather than an empty
 * array. Real EANs from the catalog; if one is ever dropped the call still
 * works and returns `[]`, which is a documented outcome rather than an error.
 */
const EXAMPLES: Record<string, string> = {
  ean: '11210000155',
  eans: '11210000155, 7300156585608',
  q: 'kaffe',
};

/** How the text a reader types becomes an argument value. */
export type InputKind = 'text' | 'list' | 'number' | 'choice';

export type ArgInput = {
  name: string;
  optional: boolean;
  kind: InputKind;
  /** Allowed values, when the validator is a union of string literals. */
  options: string[];
  example: string;
};

function inputKind(node: ValidatorNode): InputKind {
  if (node.type === 'number') return 'number';
  if (node.type === 'array' && node.value.type === 'string') return 'list';
  if (node.type === 'union' && node.value.every((m) => m.type === 'literal')) {
    return 'choice';
  }
  return 'text';
}

function choices(node: ValidatorNode): string[] {
  if (node.type !== 'union') return [];
  return node.value.flatMap((member) =>
    member.type === 'literal' && typeof member.value === 'string'
      ? [member.value]
      : [],
  );
}

/** The fields the form asks for, in declaration order. */
export function argInputs(op: Operation): ArgInput[] {
  return Object.entries(op.args.value)
    .filter(([name]) => !(name in SUPPLIED))
    .map(([name, field]) => ({
      name,
      optional: field.optional,
      kind: inputKind(field.fieldType),
      options: choices(field.fieldType),
      example: EXAMPLES[name] ?? '',
    }));
}

/** The typed argument object for a call, built from what the reader entered. An
 * empty optional field is left out entirely rather than sent as `""`. */
export function buildArgs(
  op: Operation,
  values: Record<string, string>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(op.args.value)) {
    if (name in SUPPLIED) {
      args[name] = SUPPLIED[name];
      continue;
    }
    const kind = inputKind(field.fieldType);
    const text = (values[name] ?? '').trim();
    if (text === '') {
      // A required field still has to be sent, so send the empty value of its
      // type and let the server say what it thinks of it.
      if (!field.optional) {
        args[name] = kind === 'list' ? [] : kind === 'number' ? 0 : '';
      }
      continue;
    }
    if (kind === 'list') {
      args[name] = text.split(/[\s,;]+/).filter(Boolean);
    } else if (kind === 'number') {
      args[name] = Number(text);
    } else {
      args[name] = text;
    }
  }
  return args;
}
