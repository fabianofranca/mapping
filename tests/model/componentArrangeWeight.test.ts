// Arrange `weight` on component markings (LG6, decision 10 of #2829): the root `weight` of a child
// component makes it grow on the main axis of its parent's `row`/`column` slot.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  canFit,
  fitMarking,
  loadSpecComponents,
  parseSpec,
  setFieldValue,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { emptyProject, marking } from './fixtures';

type Json = Record<string, unknown>;

const SPEC_ID = 'weights';
const SPEC_FILE = 'specs/weights/weights.spec.json';

const frame = (children: Json[], extra: Json = {}): Json => ({
  type: 'frame',
  layout: { type: 'none' },
  fill: '#EEEEEE',
  children,
  ...extra,
});

/** A container whose slot is a `row` (gap 8, padding 8, `align: center`), as `expand-row` of `library-gaps`. */
function rowComponent(id: string, size: Json, extra: Json = {}, slotLayout: Json = {}): Json {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size,
    ...extra,
    template: frame([
      {
        type: 'slot',
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        layout: { type: 'row', gap: 8, padding: 8, align: 'center', ...slotLayout },
      },
    ]),
  };
}

function item(id: string, extra: Json = {}, root: Json = {}, children: Json[] = []): Json {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 40, height: 40 },
    minSize: { width: 24, height: 24 },
    ...extra,
    template: frame(children, { fill: '#7C3AED', ...root }),
  };
}

const COMPONENTS: Record<string, Json> = {
  'expand-row': rowComponent('expand-row', { width: 300, height: 56 }),
  // The same row, hugging both axes: it fits to the floors of its weighted children.
  'hug-row': rowComponent(
    'hug-row',
    { width: 300, height: 56 },
    { sizing: { width: 'hug', height: 'hug' }, minSize: { width: 20, height: 20 } },
  ),
  'expand-item': item('expand-item', { weight: { $field: 'weight' } }),
  'plain-item': item('plain-item'),
  // `fill` alone does not grow in Arrange (Material 3 Text, sdui): no `weight`.
  'fill-item': item('fill-item', { sizing: { width: 'fill', height: 40 } }),
  'capped-item': item('capped-item', { weight: 1 }, { maxWidth: 60 }),
  // The child's own `hug` must not remeasure the weighted axis.
  'hug-item': item(
    'hug-item',
    { weight: 1, sizing: { width: 'hug', height: 40 } },
    {},
    [
      {
        type: 'text',
        text: 'Hello world',
        font: { size: 14, lineHeight: 20 },
        anchors: { left: 0, top: 10 },
      },
    ],
  ),
  // A weighted container that hugs its own content: its slot gets the final width, not the hugged one.
  'expand-card': rowComponent(
    'expand-card',
    { width: 100, height: 40 },
    { weight: 1, sizing: { width: 'hug', height: 40 } },
    { gap: 0, padding: 0, justify: 'end' },
  ),
};

const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: SPEC_ID,
  name: 'Weights',
  version: 1,
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: Object.keys(COMPONENTS).map((id) => ({
        id,
        name: id,
        component: `components/${id}.json`,
        fields: id === 'expand-item' ? [{ key: 'weight', type: 'number' }] : [],
      })),
    },
  ],
};

function catalogOf(): ComponentCatalog {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const texts = new Map(
    Object.entries(COMPONENTS).map(([id, c]) => [
      `specs/weights/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(parsed.spec, SPEC_FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

const catalog = catalogOf();

function baseProject(): Project {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let n = 0;
  const p = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'weights.spec.json',
  });
  return addContainer(p, {
    id: 'I1',
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
}

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function add(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  parentId: string | null = null,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId,
      specId: SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** The `expand-row` of the example at (100, 100) with three children (typeId, weight): 40, 76 and 152 wide. */
function expandRow(
  kids: readonly (readonly [string, number | undefined])[] = [
    ['expand-item', undefined],
    ['expand-item', 1],
    ['expand-item', 2],
  ],
  rowType = 'expand-row',
): Project {
  let p = add(baseProject(), 'C', rowType, box(100, 100, 300, 56));
  kids.forEach(([typeId, weight], i) => {
    const id = `T${i + 1}`;
    p = add(p, id, typeId, box(108 + i * 44, 108, 40, 40), 'C');
    if (weight !== undefined) p = setFieldValue(p, `A_${id}`, 'weight', weight);
  });
  return p;
}

const arrange = (p: Project) => arrangeMarking(p, catalog, 'C', approximateMeasurer);
const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;

describe('arrangeMarking: weight on the main axis', () => {
  it('the example: an expand-row with weights empty, 1 and 2 gives 40, 76 and 152 at x 8, 56 and 140', () => {
    const { project, warnings } = arrange(expandRow());
    expect(rectOf(project, 'T1')).toEqual(box(108, 108, 40, 40));
    expect(rectOf(project, 'T2')).toEqual(box(156, 108, 76, 40));
    expect(rectOf(project, 'T3')).toEqual(box(240, 108, 152, 40));
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 300, 56));
    expect(warnings).toEqual([]);
  });

  it('arranging again changes nothing', () => {
    const first = arrange(expandRow()).project;
    expect(arrange(first).project).toBe(first);
  });

  it('is one undo entry through the store action', () => {
    const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
    let n = 0;
    const actions = createProjectActions(store, {
      newId: () => `N${++n}`,
      components: () => catalog,
      measure: () => approximateMeasurer,
    });
    store.load(expandRow());
    expect(actions.arrange('C').ok).toBe(true);
    expect(rectOf(store.project.value as Project, 'T3').width).toBe(152);
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
    expect(rectOf(store.project.value as Project, 'T3').width).toBe(40);
  });

  it('a weighted child stops at its maxWidth and the rest goes to the other', () => {
    const p = expandRow([
      ['capped-item', undefined],
      ['expand-item', 1],
    ]);
    const { project } = arrange(p);
    expect(rectOf(project, 'T1').width).toBe(60);
    expect(rectOf(project, 'T2').width).toBe(216);
  });

  it('a hug parent on the main axis fits to the floors and leaves no slack', () => {
    const p = expandRow(
      [
        ['plain-item', undefined],
        ['expand-item', 1],
        ['expand-item', 2],
      ],
      'hug-row',
    );
    const { project } = arrange(p);
    // 8 + 40 + 8 + 24 + 8 + 24 + 8 = 120
    expect(rectOf(project, 'C').width).toBe(120);
    expect(rectOf(project, 'T1')).toMatchObject({ x: 108, width: 40 });
    expect(rectOf(project, 'T2')).toMatchObject({ x: 156, width: 24 });
    expect(rectOf(project, 'T3')).toMatchObject({ x: 188, width: 24 });
  });

  it('the child own hug does not remeasure the weighted axis', () => {
    const p = expandRow([
      ['plain-item', undefined],
      ['hug-item', undefined],
    ]);
    const { project } = arrange(p);
    expect(rectOf(project, 'T2').width).toBe(236);
  });

  it('a weighted container that hugs keeps the final width for its own slot', () => {
    let p = expandRow([
      ['plain-item', undefined],
      ['expand-card', undefined],
    ]);
    p = add(p, 'K', 'plain-item', box(160, 110, 30, 30), 'T2');
    const { project } = arrange(p);
    expect(rectOf(project, 'T2')).toMatchObject({ x: 156, width: 236 });
    // `justify: end` puts the grandchild at the right edge of the final width: 156 + 236 − 40.
    expect(rectOf(project, 'K').x + rectOf(project, 'K').width).toBe(156 + 236);
  });

  it('an empty weight field: no growth and no warning', () => {
    const p = expandRow([
      ['plain-item', undefined],
      ['expand-item', undefined],
      ['expand-item', 2],
    ]);
    const { project, warnings } = arrange(p);
    expect(rectOf(project, 'T2').width).toBe(40);
    expect(rectOf(project, 'T3').width).toBe(188);
    expect(warnings).toEqual([]);
  });

  it('an invalid result: not weighted, with the warning invalid value in weight', () => {
    const p = expandRow([
      ['plain-item', undefined],
      ['expand-item', 0],
      ['expand-item', 1],
    ]);
    const { project, warnings } = arrange(p);
    expect(rectOf(project, 'T2').width).toBe(40);
    expect(rectOf(project, 'T3').width).toBe(188);
    expect(warnings.map((w) => w.text)).toContain('invalid value in weight: 0');
  });

  it('fill without weight does not grow: the row arranges as before', () => {
    const p = expandRow([
      ['plain-item', undefined],
      ['fill-item', undefined],
    ]);
    const { project } = arrange(p);
    expect(rectOf(project, 'T1')).toEqual(box(108, 108, 40, 40));
    expect(rectOf(project, 'T2')).toEqual(box(156, 108, 40, 40));
  });
});

describe('fitMarking: the weighted axis belongs to the parent', () => {
  it('a weighted hug child in a row slot keeps its width', () => {
    const arranged = arrange(expandRow([['plain-item', undefined], ['hug-item', undefined]])).project;
    expect(canFit(arranged, catalog, 'T2')).toBe(true);
    expect(fitMarking(arranged, catalog, 'T2', approximateMeasurer)).toBe(arranged);
  });

  it('the same child outside a weighted slot fits its width to the content', () => {
    const p = add(baseProject(), 'T2', 'hug-item', box(100, 300, 236, 40));
    const fitted = fitMarking(p, catalog, 'T2', approximateMeasurer);
    expect(rectOf(fitted, 'T2').width).not.toBe(236);
  });
});
