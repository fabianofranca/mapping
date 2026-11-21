// The result a format plugin may return (stage #1923, FP2, decisions 9, 14 and 16):
// `checkFormatResult` is pure: shape, allowed operations and keys, local aliases, references that
// exist in the input, and the limits.
import { describe, expect, it } from 'vitest';
import {
  FORMAT_PLUGIN_LIMITS,
  FORMAT_RESULT_OPERATIONS,
  buildFormatInput,
  checkFormatResult,
  formatResultProblemText,
  type FormatInput,
  type FormatResultCheck,
} from '../../src/model';
import { formatProject } from './formatFixtures';

const input: FormatInput = buildFormatInput(formatProject(), 'data-model/openapi', {
  projectName: 'shop',
});
const m = (code: string) => `mapping://shop/m/${code}`;
const i = (code: string) => `mapping://shop/i/${code}`;
const a = (code: string) => `mapping://shop/a/${code}`;

/** One valid operation per allowed name (decision 9). */
const VALID: Record<string, Record<string, unknown>> = {
  add_container: {
    op: 'add_container',
    as: '$c',
    name: 'Imported',
    width: 400,
    height: 300,
    background: '#FFFFFF',
  },
  create_marking: {
    op: 'create_marking',
    as: '$m',
    container: i('c1'),
    rect: { x: 0, y: 0, width: 50, height: 50 },
    annotation: { type: 'class', values: { name: 'X' } },
  },
  update_marking: { op: 'update_marking', marking: m('m1'), name: 'Renamed' },
  create_annotation: {
    op: 'create_annotation',
    marking: m('m4'),
    type: 'class',
    values: { name: 'Y' },
  },
  update_annotation: {
    op: 'update_annotation',
    annotation: a('a3'),
    values: { name: 'Z' },
  },
  create_arrow: { op: 'create_arrow', from: m('m1'), to: m('m4'), name: 'goes' },
};

const check = (raw: unknown): FormatResultCheck => checkFormatResult(raw, input);

function problems(raw: unknown) {
  const out = check(raw);
  if (out.ok) throw new Error('expected a refusal');
  return out.problems;
}

function texts(raw: unknown): string[] {
  return problems(raw).map(formatResultProblemText);
}

describe('checkFormatResult: allowed operations (decision 9)', () => {
  it('lists exactly the six operations of the decision', () => {
    expect([...FORMAT_RESULT_OPERATIONS]).toEqual([
      'add_container',
      'create_marking',
      'update_marking',
      'create_annotation',
      'update_annotation',
      'create_arrow',
    ]);
  });

  it.each(FORMAT_RESULT_OPERATIONS)('accepts %s', (op) => {
    const out = check({ operations: [VALID[op]] });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.operations).toEqual([VALID[op]]);
  });

  it('accepts a result with warnings and an empty operation list', () => {
    const out = check({ operations: [], warnings: ['the modal was left out'] });
    expect(out).toEqual({
      ok: true,
      result: { operations: [], warnings: ['the modal was left out'] },
    });
  });

  it.each(['delete_marking', 'add_image', 'apply_specialization', 'create_layer'])(
    'refuses %s with the path of the operation',
    (op) => {
      expect(texts({ operations: [VALID.update_marking, { op }] })).toEqual([
        `operations[1].op: not allowed in a plugin result: ${op}`,
      ]);
    },
  );

  it('refuses an operation that is not an object or has no name', () => {
    expect(texts({ operations: ['create_marking'] })[0]).toMatch(/^operations\[0\]: /);
    expect(texts({ operations: [{}] })[0]).toMatch(/^operations\[0\]\.op: /);
  });
});

describe('checkFormatResult: keys', () => {
  it('refuses `file`, `base64` and `fileName` in add_container (no image from a plugin)', () => {
    for (const key of ['file', 'base64', 'fileName']) {
      const op = { ...VALID.add_container, [key]: 'x' };
      expect(texts({ operations: [op] })).toEqual([
        `operations[0].${key}: not allowed in a plugin result`,
      ]);
    }
  });

  it('refuses the legacy keys `image` and `parent` of create_marking', () => {
    for (const key of ['image', 'parent']) {
      const op = { ...VALID.create_marking, [key]: i('c1') };
      expect(texts({ operations: [op] })).toEqual([
        `operations[0].${key}: not allowed in a plugin result`,
      ]);
    }
  });

  it('refuses a key that the operation does not have, and the route of an arrow', () => {
    expect(texts({ operations: [{ ...VALID.update_marking, nope: 1 }] })[0]).toMatch(
      /^operations\[0\]\.nope: /,
    );
    expect(texts({ operations: [{ ...VALID.create_arrow, points: [] }] })[0]).toMatch(
      /^operations\[0\]\.points: /,
    );
  });

  it('requires the keys that name the target', () => {
    expect(texts({ operations: [{ op: 'update_marking', name: 'x' }] })).toEqual([
      'operations[0].marking: required',
    ]);
    expect(texts({ operations: [{ op: 'create_arrow', from: m('m1') }] })).toEqual([
      'operations[0].to: required',
    ]);
    const blank = { op: 'add_container', as: '$c', name: 'x' };
    expect(texts({ operations: [blank] })).toEqual([
      'operations[0].width: required',
      'operations[0].height: required',
      'operations[0].background: required',
    ]);
  });
});

describe('checkFormatResult: aliases and references (decision 14)', () => {
  it('refuses an alias without `$`', () => {
    const op = { ...VALID.add_container, as: 'c' };
    expect(texts({ operations: [op] })).toEqual([
      'operations[0].as: an alias starts with "$" and has letters, numbers, "_" or "-"',
    ]);
  });

  it('refuses an alias that is created twice', () => {
    expect(texts({ operations: [VALID.add_container, VALID.add_container] })).toEqual([
      'operations[1].as: the alias $c was already created',
    ]);
  });

  it('refuses an alias cited before it is created, and accepts it after', () => {
    const marking = { ...VALID.create_marking, container: '$c' };
    expect(texts({ operations: [marking, VALID.add_container] })).toEqual([
      'operations[0].container: the alias $c is not created before this operation',
    ]);
    expect(check({ operations: [VALID.add_container, marking] }).ok).toBe(true);
  });

  it('an operation cannot cite the alias it creates itself', () => {
    const op = { ...VALID.add_container, beside: '$c' };
    expect(texts({ operations: [op] })[0]).toMatch(/^operations\[0\]\.beside: /);
  });

  it('accepts the aliases created by `annotationAs` and by a row `_as`', () => {
    const marking = { ...VALID.create_marking, annotationAs: '$a' };
    const ops = [
      marking,
      {
        op: 'create_annotation',
        marking: m('m4'),
        type: 'class',
        values: {
          parent: { annotation: '$a' },
          attributes: [{ _as: '$row', name: 'id' }],
        },
      },
      {
        op: 'update_annotation',
        annotation: '$a',
        values: { parent: { annotation: a('a3'), key: 'attributes', row: '$row' } },
      },
    ];
    expect(check({ operations: ops }).ok).toBe(true);
  });

  it('refuses an alias cited in `values` before it is created', () => {
    const op = {
      op: 'create_annotation',
      marking: m('m4'),
      type: 'class',
      values: { parent: { annotation: '$a' } },
    };
    expect(texts({ operations: [op] })).toEqual([
      'operations[0].values.parent.annotation: the alias $a is not created before this operation',
    ]);
  });

  it('accepts the references and the codes of the input, and refuses the rest', () => {
    for (const marking of [m('m1'), 'm/m1', 'm1', 'M1']) {
      expect(check({ operations: [{ ...VALID.update_marking, marking }] }).ok).toBe(true);
    }
    expect(
      texts({ operations: [{ ...VALID.update_marking, marking: m('m2') }] }),
    ).toEqual([
      'operations[0].marking: not in the input and not an alias created earlier: ' +
        m('m2'),
    ]);
  });

  it('refuses a reference of the wrong kind, and accepts `null` where it clears', () => {
    expect(
      texts({ operations: [{ ...VALID.update_marking, marking: i('c1') }] })[0],
    ).toMatch(/^operations\[0\]\.marking: /);
    const clear = { ...VALID.update_marking, container: null, rect: { x: 1, y: 1 } };
    expect(check({ operations: [clear] }).ok).toBe(true);
    const unowned = { ...VALID.create_annotation, owner: null };
    expect(check({ operations: [unowned] }).ok).toBe(true);
  });

  it('checks the anchor target of a marking', () => {
    const anchored = {
      ...VALID.update_marking,
      anchor: { to: m('m4'), side: 'bottom' },
    };
    expect(check({ operations: [anchored] }).ok).toBe(true);
    const bad = { ...VALID.update_marking, anchor: { to: m('m2') } };
    expect(texts({ operations: [bad] })[0]).toMatch(/^operations\[0\]\.anchor\.to: /);
  });
});

describe('checkFormatResult: a marking without `rect`', () => {
  const withoutRect = (type: string) => ({
    op: 'create_marking',
    container: i('c1'),
    annotation: { type },
  });

  it('is refused for a type without a component (the plugin computes the rect)', () => {
    expect(texts({ operations: [withoutRect('class')] })).toEqual([
      'operations[0].rect: required: the type class has no component',
    ]);
    expect(texts({ operations: [withoutRect('data-model/class')] })).toHaveLength(1);
  });

  it('is accepted for a type with a component', () => {
    expect(check({ operations: [withoutRect('button')] }).ok).toBe(true);
  });

  it('is left to the batch when the type is not one of the format', () => {
    expect(check({ operations: [withoutRect('other/note')] }).ok).toBe(true);
  });
});

describe('checkFormatResult: shape', () => {
  it.each([null, undefined, 'text', 42, true, []])('refuses %j as a result', (raw) => {
    expect(texts(raw)[0]).toMatch(/^result: must be an object/);
  });

  it('refuses a Promise or a thenable (the plugin is synchronous)', () => {
    for (const raw of [Promise.resolve({ operations: [] }), { then() {} }]) {
      const out = check(raw);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.problems[0]!.code).toBe('plugin-output-invalid');
        expect(out.problems[0]!.message).toMatch(/Promise/);
      }
    }
  });

  it('needs an `operations` list and knows no other top-level key', () => {
    expect(texts({})).toEqual(['operations: required']);
    expect(texts({ operations: {} })).toEqual(['operations: must be a list']);
    expect(texts({ operations: [], extra: 1 })).toEqual([
      'extra: not allowed in a plugin result',
    ]);
    expect(texts({ operations: [], warnings: 'one' })).toEqual([
      'warnings: must be a list of texts',
    ]);
    expect(texts({ operations: [], warnings: [1] })).toEqual([
      'warnings[0]: must be a text',
    ]);
  });

  it('reports every problem, with the code `plugin-output-invalid`', () => {
    const out = problems({ operations: [{ op: 'delete_marking' }, { op: 'nope' }] });
    expect(out.map((x) => x.path)).toEqual(['operations[0].op', 'operations[1].op']);
    expect(new Set(out.map((x) => x.code))).toEqual(new Set(['plugin-output-invalid']));
  });
});

describe('checkFormatResult: limits (decision 16)', () => {
  it('has the limits of the decision', () => {
    expect(FORMAT_PLUGIN_LIMITS).toEqual({
      timeoutMs: 5000,
      memoryBytes: 64 * 1024 * 1024,
      stackBytes: 1024 * 1024,
      pluginBytes: 1024 * 1024,
      parseTextBytes: 4 * 1024 * 1024,
      generatedTextBytes: 4 * 1024 * 1024,
      projectionBytes: 16 * 1024 * 1024,
      operations: 5000,
      warnings: 100,
      warningChars: 500,
    });
  });

  it('accepts 5,000 operations and refuses 5,001 with plugin-limit', () => {
    const op = VALID.update_marking;
    const many = (n: number) => ({ operations: Array.from({ length: n }, () => op) });
    expect(check(many(5000)).ok).toBe(true);
    const out = problems(many(5001));
    expect(out).toEqual([
      {
        code: 'plugin-limit',
        path: 'operations',
        message: 'more than 5000 operations (5001)',
      },
    ]);
  });

  it('keeps 100 warnings; the rest is cut, with one warning saying so', () => {
    const exactly = check({
      operations: [],
      warnings: Array.from({ length: 100 }, (_, n) => `w${n}`),
    });
    expect(exactly.ok && exactly.result.warnings).toHaveLength(100);
    expect(exactly.ok && exactly.result.warnings![99]).toBe('w99');

    const out = check({
      operations: [],
      warnings: Array.from({ length: 130 }, (_, n) => `w${n}`),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const warnings = out.result.warnings!;
    expect(warnings).toHaveLength(100);
    expect(warnings[98]).toBe('w98');
    expect(warnings[99]).toBe('31 more warnings were cut (the limit is 100)');
  });

  it('cuts a warning at 500 characters', () => {
    const out = check({ operations: [], warnings: ['x'.repeat(900), 'short'] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings![0]).toHaveLength(500);
    expect(out.result.warnings![1]).toBe('short');
  });
});
