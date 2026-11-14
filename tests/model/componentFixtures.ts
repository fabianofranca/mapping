import {
  addContainer,
  applySpecialization,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Small library written in the test itself: a leaf type with fields of every type,
// a leaf that does not fit and containers (row, column, `hug`, `stretch`, `space-between`, no layout).

export const SPEC_FILE = 'specs/test/test.spec.json';
export const SPEC_ID = 'test';

type Json = Record<string, unknown>;

function leaf(
  id: string,
  size: Json,
  children: Json[],
  extra: Json = {},
  layout: Json = { type: 'none' },
): Json {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id,
    name: id,
    size,
    template: { type: 'frame', layout, fill: '#EEEEEE', children },
    ...extra,
  };
}

interface SlotOptions {
  readonly flow?: 'row' | 'column' | 'none';
  readonly align?: string;
  readonly justify?: string;
  /** Distance from the slot to the container edges (anchors on the four sides). */
  readonly inset?: number;
}

function container(id: string, size: Json, slot: SlotOptions, extra: Json = {}): Json {
  const flow = slot.flow ?? 'row';
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id,
    name: id,
    size,
    template: {
      type: 'frame',
      layout: { type: 'none' },
      fill: '#DDDDDD',
      children: [
        {
          type: 'slot',
          anchors: {
            left: slot.inset ?? 0,
            right: slot.inset ?? 0,
            top: slot.inset ?? 0,
            bottom: slot.inset ?? 0,
          },
          ...(flow === 'none'
            ? {}
            : {
                layout: {
                  type: flow,
                  gap: { $field: 'spacing', default: 8 },
                  padding: { $field: 'padding', default: 0 },
                  align: slot.align ?? 'start',
                  justify: slot.justify ?? 'start',
                },
              }),
        },
      ],
    },
    ...extra,
  };
}

/** Container with a slot in `layout.reverse` (format 4), to replace a type of `COMPONENTS` in the catalog. */
export function reversedContainer(
  id: string,
  flow: 'row' | 'column',
  size: Json,
  justify = 'start',
): Json {
  const base = container(id, size, { flow, justify }) as {
    template: { children: { layout: Json }[] };
  };
  const slot = base.template.children[0];
  if (slot === undefined) throw new Error('no slot');
  slot.layout = { ...slot.layout, reverse: true };
  return { ...base, formatVersion: 4 };
}

const CONTAINER_FIELDS = [
  { key: 'spacing', type: 'number', default: 8 },
  { key: 'padding', type: 'number', default: 0 },
];

export const COMPONENTS: Record<string, Json> = {
  text: leaf(
    'text',
    { width: 100, height: 40 },
    [
      {
        type: 'text',
        text: { $field: 'label', default: '' },
        font: { size: 14, lineHeight: 20 },
      },
    ],
    {
      minSize: { width: 60, height: 24 },
      preview: { label: 'Preview', count: 3, kind: 'b' },
    },
  ),
  // Two boxes of 80 in a row of 100: the engine warns "content larger than the box".
  wide: leaf(
    'wide',
    { width: 100, height: 40 },
    [
      { type: 'rect', width: 80, height: 10 },
      { type: 'rect', width: 80, height: 10 },
    ],
    {},
    { type: 'row', gap: 0 },
  ),
  row: container(
    'row',
    { width: 300, height: 100 },
    { flow: 'row' },
    { minSize: { width: 50, height: 30 } },
  ),
  rowhug: container(
    'rowhug',
    { width: 200, height: 60 },
    { flow: 'row' },
    { minSize: { width: 40, height: 20 }, sizing: { width: 'hug', height: 'hug' } },
  ),
  rowstretch: container(
    'rowstretch',
    { width: 300, height: 100 },
    { flow: 'row', align: 'stretch' },
  ),
  rowbetween: container(
    'rowbetween',
    { width: 300, height: 100 },
    { flow: 'row', justify: 'space-between' },
  ),
  rowcenter: container(
    'rowcenter',
    { width: 300, height: 100 },
    { flow: 'row', justify: 'center', align: 'center' },
  ),
  column: container('column', { width: 300, height: 300 }, { flow: 'column' }),
  columnhug: container(
    'columnhug',
    { width: 200, height: 100 },
    { flow: 'column' },
    { sizing: { width: 'hug', height: 'hug' }, minSize: { width: 20, height: 20 } },
  ),
  columnstretch: container(
    'columnstretch',
    { width: 300, height: 300 },
    { flow: 'column', align: 'stretch' },
    { sizing: { width: 'fill', height: 'hug' } },
  ),
  inset: container('inset', { width: 300, height: 200 }, { flow: 'row', inset: 20 }),
  box: container('box', { width: 300, height: 200 }, { flow: 'none' }),
};

/** Types of the specialization, in order; the type id is the component's. */
const TYPE_FIELDS: Record<string, unknown[]> = {
  text: [
    { key: 'label', type: 'string', default: 'Hello', tags: ['name'] },
    { key: 'count', type: 'number' },
    { key: 'kind', type: 'enum', options: ['a', 'b'], default: 'a' },
    { key: 'when', type: 'date' },
    { key: 'target', type: 'ref', accepts: { tags: ['name', 'list'], free: true } },
    {
      key: 'items',
      type: 'table',
      rowLabel: 'name',
      tags: ['list'],
      columns: [{ key: 'name', type: 'string' }],
    },
  ],
  wide: [],
};

export const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: SPEC_ID,
  name: 'Test',
  version: 1,
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: Object.keys(COMPONENTS).map((id) => ({
        id,
        name: `Type ${id}`,
        component: `components/${id}.json`,
        fields: TYPE_FIELDS[id] ?? CONTAINER_FIELDS,
      })),
    },
    {
      id: 'other',
      name: 'Other',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'plain',
          name: 'Simple',
          fields: [{ key: 'note', type: 'string' }],
        },
      ],
    },
  ],
};

export function testSpec(): Spec {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Text of each file in the package, by the path from the project root. */
export function packageTexts(overrides: Record<string, string | null> = {}) {
  const files = new Map<string, string>();
  for (const [id, component] of Object.entries(COMPONENTS)) {
    files.set(`specs/test/components/${id}.json`, JSON.stringify(component));
  }
  for (const [path, text] of Object.entries(overrides)) {
    if (text === null) files.delete(path);
    else files.set(path, text);
  }
  return files;
}

export function testCatalog(
  components: Record<string, Json> = COMPONENTS,
): ComponentCatalog {
  const texts = new Map(
    Object.entries(components).map(([id, c]) => [
      `specs/test/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

let counter = 0;
export function newId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/** Project with the specialization applied (layers `components` and `other`) and an I1 image of 1000×800. */
export function componentProject(): Project {
  let p = emptyProject();
  p = applySpecialization(p, testSpec(), {
    newId: (() => {
      let n = 0;
      return () => `LS${++n}`;
    })(),
    packageSpecName: 'test.spec.json',
  });
  return addContainer(p, {
    id: 'I1',
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
}

/**
 * Test catalog in which the slot of `column` and `columnhug` carries `gap` and `padding` as `$token`
 * (`space-2`/`space-4`), with different tables per mode: `light` (the first) 4/10, `dark` 12/20.
 */
export function tokenSlotCatalog(): ComponentCatalog {
  const base = testCatalog();
  const loaded = base.get(SPEC_ID);
  if (loaded === undefined) throw new Error('no test specialization');
  const byType = new Map(loaded.byType);
  const light = { 'space-2': 4, 'space-4': 10 };
  const dark = { 'space-2': 12, 'space-4': 20 };
  for (const id of ['column', 'columnhug']) {
    const component = byType.get(id);
    if (component === undefined || component.template.type !== 'frame') continue;
    const children = (component.template.children ?? []).map((child) =>
      child.type === 'slot' && child.layout !== undefined
        ? {
            ...child,
            layout: {
              ...child.layout,
              gap: { $token: 'space-2' },
              padding: { $token: 'space-4' },
            },
          }
        : child,
    );
    byType.set(id, {
      ...component,
      template: { ...component.template, children } as typeof component.template,
      resolvedTokens: light,
      resolvedTokensByMode: { light, dark },
    });
  }
  return new Map([[SPEC_ID, { ...loaded, byType }]]);
}

/**
 * Container (`row` or `column`) whose slot breaks into lines (`layout.wrap`, format 4), to replace
 * a type of `COMPONENTS` in the catalog. The `wrap` keys go into the slot's `layout`.
 */
export function wrappedContainer(
  id: string,
  flow: 'row' | 'column',
  size: Json,
  wrap: Json = { wrap: 'wrap' },
): Json {
  const base = container(id, size, { flow }) as {
    template: { children: { layout: Json }[] };
  };
  const slot = base.template.children[0];
  if (slot === undefined) throw new Error('no slot');
  slot.layout = { ...slot.layout, ...wrap };
  return { ...base, formatVersion: 4 };
}
