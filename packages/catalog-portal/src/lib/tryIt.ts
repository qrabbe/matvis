import type { Operation, ValidatorNode } from './contract';

const TRY_IT_PAGE_SIZE = 3;

const SUPPLIED: Record<string, unknown> = {
  paginationOpts: { numItems: TRY_IT_PAGE_SIZE, cursor: null },
};

const EXAMPLES: Record<string, string> = {
  ean: '11210000155',
  eans: '11210000155, 7300156585608',
  q: 'kaffe',
};

export type InputKind = 'text' | 'list' | 'number' | 'choice';

export type ArgInput = {
  name: string;
  optional: boolean;
  kind: InputKind;
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
