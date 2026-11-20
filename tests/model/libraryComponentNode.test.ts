// CC1: level 2 of the `component` node — the inner type exists, has a component without slot or
// `screen`, its `values` match its fields, and the nodes do not form a cycle. Each error is at the
// node's `id` (type-level problems and cycles) or at `values.<key>` (key-level problems; the
// missing required field is at `values`, where it should be given).
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'lib.spec.json';
const OUTER = 'components/outer.json';

const text = (field: string): Raw => ({
  type: 'text',
  text: { $field: field },
  font: { size: 10, lineHeight: 12 },
});

function component(id: string, children: Raw[], over: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 200, height: 100 },
    template: { type: 'frame', layout: { type: 'column' }, children },
    ...over,
  };
}

const node = (id: string, extra: Raw = {}): Raw => ({ type: 'component', id, ...extra });

interface Setup {
  /** Children of the outer component. */
  readonly outer: Raw[];
  /** Extra types: id → { fields, component (JSON or null for none) }. */
  readonly types?: Record<string, { fields?: Raw[]; component: Raw | null }>;
}

const INNER_FIELDS: Raw[] = [
  { key: 'label', type: 'string', required: true },
  { key: 'tone', type: 'enum', options: ['calm', 'loud'] },
  { key: 'rows', type: 'table', columns: [{ key: 'k', type: 'string' }] },
  { key: 'link', type: 'ref', accepts: { free: true } },
  { key: 'count', type: 'number' },
];

const INNER = (): Raw =>
  component('inner', [
    text('label'),
    text('tone'),
    text('count'),
    { type: 'repeat', field: 'rows', template: { type: 'frame', children: [text('k')] } },
    text('link'),
  ]);

const OUTER_FIELDS: Raw[] = [
  { key: 'title', type: 'string' },
  { key: 'n', type: 'number' },
  { key: 'items', type: 'table', columns: [{ key: 'k', type: 'string' }] },
  { key: 'unused', type: 'string' },
];

function build(setup: Setup) {
  const types: Record<string, { fields?: Raw[]; component: Raw | null }> = {
    inner: { fields: INNER_FIELDS, component: INNER() },
    bare: { component: null },
    slotty: {
      component: component('slotty', [{ type: 'slot', id: 'content' }]),
    },
    screeny: { component: component('screeny', [text('x')], { screen: {} }) },
    ...setup.types,
  };
  const files: { path: string; text: string }[] = [];
  const annotationTypes: Raw[] = [
    { id: 'outer', name: 'Outer', component: OUTER, fields: OUTER_FIELDS },
  ];
  for (const [id, def] of Object.entries(types)) {
    annotationTypes.push({
      id,
      name: id,
      ...(def.component === null ? {} : { component: `components/${id}.json` }),
      fields: def.fields ?? [{ key: 'x', type: 'string' }],
    });
    if (def.component !== null)
      files.push({
        path: `components/${id}.json`,
        text: JSON.stringify(def.component),
      });
  }
  const spec = {
    format: 'mapping-spec',
    formatVersion: 7,
    id: 'lib',
    name: 'Lib',
    version: 1,
    layers: [{ id: 'l', name: 'L', color: '#112233', annotationTypes }],
  };
  files.push({ path: SPEC_PATH, text: JSON.stringify(spec) });
  files.push({
    path: OUTER,
    text: JSON.stringify(component('outer', setup.outer)),
  });
  return validateLibrary({ specPath: SPEC_PATH, files });
}

const brief = (i: LibraryIssue) => [i.file, i.path, i.message];
const errorsAt = (report: ReturnType<typeof build>, file = OUTER) =>
  report.errors.filter((e) => e.file === file).map(brief);

const AT = 'template.children[0]';
const GOOD_VALUES = { label: 'Hi' };

describe('component node: level 2', () => {
  it('a valid node passes with no error', () => {
    const report = build({
      outer: [
        node('inner', {
          values: {
            label: { $field: 'title' },
            tone: 'calm',
            count: { $field: 'n' },
            rows: { $field: 'items' },
          },
        }),
      ],
    });
    expect(report.errors).toEqual([]);
  });

  it('a type that does not exist, at the id', () => {
    expect(errorsAt(build({ outer: [node('nope')] }))).toEqual([
      [OUTER, `${AT}.id`, 'the type "nope" does not exist in the specialization'],
    ]);
  });

  it('a type without a component, at the id', () => {
    expect(errorsAt(build({ outer: [node('bare')] }))).toEqual([
      [OUTER, `${AT}.id`, 'the type "bare" has no component'],
    ]);
  });

  it('an inner component with a slot, at the id', () => {
    expect(errorsAt(build({ outer: [node('slotty')] }))).toEqual([
      [
        OUTER,
        `${AT}.id`,
        'the component of the type "slotty" has a slot and cannot be drawn by a component node',
      ],
    ]);
  });

  it('an inner component that draws in screen pixels, at the id', () => {
    expect(errorsAt(build({ outer: [node('screeny')] }))).toEqual([
      [
        OUTER,
        `${AT}.id`,
        'the component of the type "screeny" draws in screen pixels and cannot be drawn by a component node',
      ],
    ]);
  });

  it('a key that is not a field of the inner type, at values.<key>', () => {
    const report = build({
      outer: [node('inner', { values: { ...GOOD_VALUES, ghost: 1 } })],
    });
    expect(errorsAt(report)).toEqual([
      [OUTER, `${AT}.values.ghost`, 'the type "inner" has no field "ghost"'],
    ]);
  });

  it('a required field missing from values, at values', () => {
    expect(errorsAt(build({ outer: [node('inner', { values: {} })] }))).toEqual([
      [OUTER, `${AT}.values`, 'required field missing in values: label'],
    ]);
    expect(errorsAt(build({ outer: [node('inner')] }))).toEqual([
      [OUTER, `${AT}.values`, 'required field missing in values: label'],
    ]);
  });

  it('an enum literal outside the options, at values.<key>', () => {
    const report = build({
      outer: [node('inner', { values: { ...GOOD_VALUES, tone: 'wild' } })],
    });
    expect(errorsAt(report)).toEqual([
      [OUTER, `${AT}.values.tone`, '"wild" is not an option of the field "tone"'],
    ]);
  });

  it('a table field accepts only a $field of a table field of the outer type', () => {
    const message =
      'the table field "rows" only accepts { "$field": … } of a table field';
    for (const rows of [
      'literal',
      { $field: 'title' },
      { $field: 'missing' },
      { $field: 'items', default: 'x' },
    ]) {
      const report = build({
        outer: [node('inner', { values: { ...GOOD_VALUES, rows } })],
      });
      expect(errorsAt(report).filter((e) => e[2] === message)).toEqual([
        [OUTER, `${AT}.values.rows`, message],
      ]);
    }
  });

  it('a ref field cannot be given, at values.<key>', () => {
    const report = build({
      outer: [node('inner', { values: { ...GOOD_VALUES, link: 'x' } })],
    });
    expect(errorsAt(report)).toEqual([
      [OUTER, `${AT}.values.link`, 'the ref field "link" cannot be given in values'],
    ]);
  });

  it('works inside a repeat template and a slot fallback, with the real path', () => {
    const report = build({
      outer: [
        {
          type: 'repeat',
          field: 'items',
          template: { type: 'frame', children: [node('nope')] },
        },
      ],
    });
    expect(errorsAt(report)).toEqual([
      [
        OUTER,
        `${AT}.template.children[0].id`,
        'the type "nope" does not exist in the specialization',
      ],
    ]);
  });
});

describe('component node: cycles', () => {
  const pack = (edges: Record<string, string[]>) => {
    const types: Record<string, { fields?: Raw[]; component: Raw | null }> = {};
    for (const [id, to] of Object.entries(edges))
      if (id !== 'outer')
        types[id] = {
          component: component(
            id,
            to.map((t) => node(t)),
          ),
        };
    return build({ outer: (edges.outer ?? []).map((t) => node(t)), types });
  };
  const cycleErrors = (report: ReturnType<typeof build>) =>
    report.errors.filter((e) => e.message.startsWith('component cycle')).map(brief);

  it('a two-step cycle is reported once, at the node of the first type', () => {
    expect(cycleErrors(pack({ outer: ['a'], a: ['b'], b: ['a'] }))).toEqual([
      ['components/a.json', `${AT}.id`, 'component cycle: a → b → a'],
    ]);
  });

  it('a three-step cycle', () => {
    expect(cycleErrors(pack({ outer: [], a: ['b'], b: ['c'], c: ['a'] }))).toEqual([
      ['components/a.json', `${AT}.id`, 'component cycle: a → b → c → a'],
    ]);
  });

  it('a type that nests itself', () => {
    expect(cycleErrors(pack({ outer: [], a: ['a'] }))).toEqual([
      ['components/a.json', `${AT}.id`, 'component cycle: a → a'],
    ]);
  });

  it('an acyclic nesting passes', () => {
    expect(pack({ outer: ['a', 'b'], a: ['b'], b: [] }).errors).toEqual([]);
  });
});

describe('component node: fields of the outer type', () => {
  const warningsOf = (report: ReturnType<typeof build>, key: string) =>
    report.warnings.filter((w) =>
      w.message.includes(`field "${key}" of the type "outer"`),
    );

  it('a field cited only in values or only in provide is used', () => {
    const report = build({
      outer: [
        node('inner', {
          values: { label: { $field: 'title' } },
          provide: { size: { $field: 'n' } },
        }),
      ],
    });
    expect(warningsOf(report, 'title')).toEqual([]);
    expect(warningsOf(report, 'n')).toEqual([]);
    expect(warningsOf(report, 'unused')).toHaveLength(1);
  });

  it('an undeclared outer field in values is fieldUndeclared', () => {
    const report = build({
      outer: [node('inner', { values: { label: { $field: 'ghost' } } })],
    });
    expect(errorsAt(report)).toEqual([
      [
        OUTER,
        `${AT}.values.label.$field`,
        'the drawing uses the field "ghost", which the type "outer" does not declare',
      ],
    ]);
  });
});
