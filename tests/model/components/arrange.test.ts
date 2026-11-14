// Components Lab: containers with a row/column layout write the rectangles of the children.
import { describe, expect, it } from 'vitest';
import {
  arrange,
  dropIndex,
  findSlot,
  hasSlot,
  resolveSlotLayout,
  slotBox,
} from '../../../src/model/components/arrange';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary, withHostTokens } from '../../../src/model/components/library';
import {
  type Box,
  type Instance,
  type Screen,
  setValue,
  updateBox,
} from '../../../src/model/components/screen';

// --- library built in memory ----------------------------------------------------------------

interface SlotSpec {
  readonly layout?: Record<string, unknown>;
  readonly extra?: Record<string, unknown>;
}

function component(id: string, children: unknown[], frame: Record<string, unknown> = {}) {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id,
    name: id,
    size: { width: 200, height: 100 },
    template: { type: 'frame', layout: { type: 'none' }, children, ...frame },
  };
}

/** Container: `none` frame with a slot that fills everything; the slot layout varies per component. */
function container(id: string, slot: SlotSpec = {}) {
  return component(id, [
    {
      type: 'slot',
      width: 'fill',
      height: 'fill',
      ...(slot.layout ? { layout: slot.layout } : {}),
      ...slot.extra,
    },
  ]);
}

function flow(type: 'row' | 'column', extra: Record<string, unknown> = {}) {
  return {
    type,
    gap: { $field: 'spacing', default: 8 },
    padding: { $field: 'padding' },
    align: 'start',
    ...extra,
  };
}

const COMPONENTS = [
  container('row-start', { layout: flow('row') }),
  container('row-center', { layout: flow('row', { justify: 'center' }) }),
  container('row-end', { layout: flow('row', { justify: 'end' }) }),
  container('row-between', { layout: flow('row', { justify: 'space-between' }) }),
  container('row-align-center', { layout: flow('row', { align: 'center' }) }),
  container('row-align-end', { layout: flow('row', { align: 'end' }) }),
  container('row-stretch', { layout: flow('row', { align: 'stretch' }) }),
  container('column-start', { layout: flow('column') }),
  container('column-stretch', { layout: flow('column', { align: 'stretch' }) }),
  container('box'),
  container('hidden', { layout: flow('row'), extra: { visible: false } }),
  component(
    'inset',
    [
      {
        type: 'slot',
        anchors: { left: 10, top: 5, right: 10, bottom: 5 },
        layout: flow('row'),
      },
    ],
    { layout: { type: 'none' } },
  ),
  component('leaf', [
    {
      type: 'rect',
      width: 40,
      height: 20,
      anchors: { left: 0, top: 0 },
      fill: '#CCCCCC',
    },
  ]),
];

const FIELDS = [
  { key: 'spacing', label: 'Spacing', type: 'number', default: 8 },
  { key: 'padding', label: 'Padding', type: 'number', default: 0 },
];

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'arrange-test',
  name: 'Arrange',
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#1E88E5',
      annotationTypes: COMPONENTS.map((c) => ({
        id: c.id,
        name: c.id,
        component: `components/${c.id}.json`,
        fields: c.id === 'leaf' ? [] : FIELDS,
      })),
    },
  ],
};

const library = loadLibrary([
  { path: 'spec.json', text: JSON.stringify(SPEC) },
  ...COMPONENTS.map((c) => ({
    path: `components/${c.id}.json`,
    text: JSON.stringify(c),
  })),
]);

const measure = approximateMeasurer;

function typeOf(id: string) {
  const type = library.types.find((t) => t.id === id);
  if (!type?.component) throw new Error(`type without component: ${id}`);
  return { type, component: type.component };
}

// --- screen builders --------------------------------------------------------------------------

function host(
  id: string,
  typeId: string,
  box: Box,
  values: Instance['values'] = { spacing: 8, padding: 0 },
  parentId?: string,
): Instance {
  return { id, typeId, box, values, ...(parentId ? { parentId } : {}) };
}

function leaf(id: string, width: number, parentId: string, height = 20): Instance {
  return {
    id,
    typeId: 'leaf',
    box: { x: 0, y: 0, width, height },
    values: {},
    parentId,
  };
}

function screenOf(...instances: Instance[]): Screen {
  return {
    id: 's',
    name: 'Screen',
    width: 600,
    height: 600,
    background: '#FFFFFF',
    instances,
  };
}

function boxOf(screen: Screen, id: string): Box {
  const found = screen.instances.find((i) => i.id === id);
  if (!found) throw new Error(`instance missing: ${id}`);
  return found.box;
}

const CONTAINER_BOX: Box = { x: 100, y: 50, width: 400, height: 100 };

/** Container at the `CONTAINER_BOX` position with three leaves of widths 40/60/20. */
function rowScreen(typeId: string, values?: Instance['values']): Screen {
  return screenOf(
    host('c', typeId, CONTAINER_BOX, values),
    leaf('a', 40, 'c'),
    leaf('b', 60, 'c'),
    leaf('d', 20, 'c'),
  );
}

function xs(screen: Screen): number[] {
  return ['a', 'b', 'd'].map((id) => boxOf(screen, id).x);
}

// --- tests ------------------------------------------------------------------------------------

describe('findSlot / hasSlot / resolveSlotLayout', () => {
  it('the test library loads without problems', () => {
    expect(library.problems).toEqual([]);
  });

  it('finds the slot in depth and recognizes containers', () => {
    expect(findSlot(typeOf('row-start').component)?.type).toBe('slot');
    expect(findSlot(typeOf('leaf').component)).toBeUndefined();
    expect(hasSlot(typeOf('row-start').type)).toBe(true);
    expect(hasSlot(typeOf('box').type)).toBe(true);
    expect(hasSlot(typeOf('leaf').type)).toBe(false);
    expect(hasSlot(undefined)).toBe(false);

    const nested = component('nested', [
      {
        type: 'frame',
        children: [{ type: 'frame', children: [{ type: 'slot', name: 'fundo' }] }],
      },
    ]);
    const slot = findSlot(nested as never);
    expect(slot?.name).toBe('fundo');
  });

  it('resolves gap and padding from the fields, with the expression defaults', () => {
    const slot = findSlot(typeOf('row-center').component)!;
    expect(resolveSlotLayout(slot, { spacing: 12, padding: 6 })).toEqual({
      type: 'row',
      gap: 12,
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
      align: 'start',
      justify: 'center',
      reverse: false,
      wrap: 'none',
      lineGap: 0,
    });
    // Without values: the expression `default` in the gap; padding without a default is 0.
    expect(resolveSlotLayout(slot, {})).toMatchObject({
      gap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    // Numbers sometimes arrive as text.
    expect(resolveSlotLayout(slot, { spacing: '5', padding: '3' }).gap).toBe(5);
    expect(
      resolveSlotLayout(findSlot(typeOf('column-stretch').component)!, {}),
    ).toMatchObject({
      type: 'column',
      align: 'stretch',
    });
  });

  it('a slot without layout (Box) or with layout none resolves to none', () => {
    const slot = findSlot(typeOf('box').component)!;
    expect(resolveSlotLayout(slot, {}).type).toBe('none');
    const none = { type: 'slot', layout: { type: 'none' } } as const;
    expect(resolveSlotLayout(none, {}).type).toBe('none');
  });
});

describe('slotBox', () => {
  it('is the instance box when the slot fills the frame', () => {
    const instance = host('c', 'row-start', { x: 30, y: 40, width: 250, height: 120 });
    expect(slotBox(typeOf('row-start').component, instance, measure)).toEqual({
      x: 30,
      y: 40,
      width: 250,
      height: 120,
    });
  });

  it('respects the slot anchors inside a frame without layout', () => {
    const instance = host('c', 'inset', { x: 10, y: 20, width: 200, height: 100 });
    expect(slotBox(typeOf('inset').component, instance, measure)).toEqual({
      x: 20,
      y: 25,
      width: 180,
      height: 90,
    });
  });

  it('returns nothing when the slot is invisible', () => {
    const instance = host('c', 'hidden', CONTAINER_BOX);
    expect(slotBox(typeOf('hidden').component, instance, measure)).toBeUndefined();
  });
});

describe('arrange: row', () => {
  it('start with gap and padding: relative x 4, 52, 120; y at the top; sizes intact', () => {
    const result = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    expect(xs(result).map((x) => x - CONTAINER_BOX.x)).toEqual([4, 52, 120]);
    for (const id of ['a', 'b', 'd'])
      expect(boxOf(result, id).y).toBe(CONTAINER_BOX.y + 4);
    expect(boxOf(result, 'a')).toMatchObject({ width: 40, height: 20 });
    expect(boxOf(result, 'b')).toMatchObject({ width: 60, height: 20 });
    expect(boxOf(result, 'd')).toMatchObject({ width: 20, height: 20 });
  });

  it('center, end and space-between distribute the leftover on the main axis', () => {
    // Total = 40 + 60 + 20 + 2·8 = 136; leftover = 400 − 136 = 264.
    const values = { spacing: 8, padding: 0 };
    expect(xs(arrange(rowScreen('row-center', values), library, measure))).toEqual([
      232, 280, 348,
    ]);
    expect(xs(arrange(rowScreen('row-end', values), library, measure))).toEqual([
      364, 412, 480,
    ]);
    // Extra gap = 264 / 2 = 132; the last one ends at the right edge (500).
    expect(xs(arrange(rowScreen('row-between', values), library, measure))).toEqual([
      100, 280, 480,
    ]);
  });

  it('space-between with a single child acts as start', () => {
    const screen = screenOf(
      host('c', 'row-between', CONTAINER_BOX, { spacing: 8, padding: 4 }),
      leaf('a', 40, 'c'),
    );
    expect(boxOf(arrange(screen, library, measure), 'a').x).toBe(104);
  });

  it('align center, end and stretch on the cross axis', () => {
    const values = { spacing: 8, padding: 4 };
    // Content height = 100 − 8 = 92.
    const center = arrange(rowScreen('row-align-center', values), library, measure);
    expect(boxOf(center, 'a')).toMatchObject({ y: 90, height: 20 });
    const end = arrange(rowScreen('row-align-end', values), library, measure);
    expect(boxOf(end, 'a')).toMatchObject({ y: 126, height: 20 });
    const stretch = arrange(rowScreen('row-stretch', values), library, measure);
    for (const id of ['a', 'b', 'd'])
      expect(boxOf(stretch, id)).toMatchObject({ y: 54, height: 92 });
    expect(boxOf(stretch, 'b').width).toBe(60);
  });
});

describe('arrange: column', () => {
  const box: Box = { x: 10, y: 20, width: 200, height: 300 };
  function columnScreen(typeId: string): Screen {
    return screenOf(
      host('c', typeId, box, { spacing: 8, padding: 4 }),
      leaf('a', 40, 'c', 20),
      leaf('b', 50, 'c', 30),
      leaf('d', 60, 'c', 10),
    );
  }

  it('start: y 24, 52, 90 and x 14', () => {
    const result = arrange(columnScreen('column-start'), library, measure);
    expect(['a', 'b', 'd'].map((id) => boxOf(result, id).y)).toEqual([24, 52, 90]);
    for (const id of ['a', 'b', 'd']) expect(boxOf(result, id).x).toBe(14);
    expect(boxOf(result, 'b')).toMatchObject({ width: 50, height: 30 });
  });

  it('stretch: width becomes the content width (192)', () => {
    const result = arrange(columnScreen('column-stretch'), library, measure);
    for (const id of ['a', 'b', 'd'])
      expect(boxOf(result, id)).toMatchObject({ x: 14, width: 192 });
    expect(boxOf(result, 'b')).toMatchObject({ y: 52, height: 30 });
  });
});

describe('arrange: nesting and movement', () => {
  function nested(): Screen {
    return screenOf(
      host(
        'outer',
        'column-start',
        { x: 0, y: 0, width: 300, height: 200 },
        {
          spacing: 5,
          padding: 10,
        },
      ),
      host(
        'inner',
        'row-start',
        { x: 0, y: 0, width: 100, height: 40 },
        {
          spacing: 6,
          padding: 2,
        },
        'outer',
      ),
      leaf('a', 40, 'inner'),
      leaf('b', 40, 'inner'),
    );
  }

  it('the column positions the row and the row positions the leaves (absolute coordinates)', () => {
    const result = arrange(nested(), library, measure);
    expect(boxOf(result, 'inner')).toEqual({ x: 10, y: 10, width: 100, height: 40 });
    expect(boxOf(result, 'a')).toMatchObject({ x: 12, y: 12 });
    expect(boxOf(result, 'b')).toMatchObject({ x: 58, y: 12 });
  });

  it('moving the container with updateBox carries the children; arrange keeps them consistent', () => {
    const arranged = arrange(nested(), library, measure);
    const moved = updateBox(arranged, 'outer', {
      x: 200,
      y: 100,
      width: 300,
      height: 200,
    });
    expect(boxOf(moved, 'a')).toMatchObject({ x: 212, y: 112 });
    const again = arrange(moved, library, measure);
    expect(again).toBe(moved);
    expect(boxOf(again, 'inner')).toMatchObject({ x: 210, y: 110 });
    expect(boxOf(again, 'b')).toMatchObject({ x: 258, y: 112 });
  });

  it('moving a child of a container with layout returns it to the computed place', () => {
    const arranged = arrange(nested(), library, measure);
    const dragged = updateBox(arranged, 'inner', {
      x: 200,
      y: 100,
      width: 100,
      height: 40,
    });
    const again = arrange(dragged, library, measure);
    expect(boxOf(again, 'inner')).toMatchObject({ x: 10, y: 10 });
    expect(boxOf(again, 'a')).toMatchObject({ x: 12, y: 12 });
  });

  it('arrange fixes children that were left out of place after moving the container', () => {
    const arranged = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    const moved = updateBox(arranged, 'c', { x: 300, y: 200, width: 400, height: 100 });
    expect(xs(arrange(moved, library, measure)).map((x) => x - 300)).toEqual([
      4, 52, 120,
    ]);
  });
});

describe('arrange: no change and rearrangement', () => {
  it('Box (slot without layout) leaves the children and returns the same screen', () => {
    const screen = screenOf(host('c', 'box', CONTAINER_BOX), {
      ...leaf('a', 40, 'c'),
      box: { x: 7, y: 9, width: 40, height: 20 },
    });
    expect(arrange(screen, library, measure)).toBe(screen);
  });

  it('an already arranged screen comes back identical', () => {
    const arranged = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    expect(arranged).not.toBe(undefined);
    expect(arrange(arranged, library, measure)).toBe(arranged);
    const between = arrange(
      rowScreen('row-between', { spacing: 7, padding: 3 }),
      library,
      measure,
    );
    expect(arrange(between, library, measure)).toBe(between);
  });

  it('container without children, missing type and invisible slot change nothing', () => {
    const empty = screenOf(host('c', 'row-start', CONTAINER_BOX));
    expect(arrange(empty, library, measure)).toBe(empty);
    const unknown = screenOf(host('c', 'nao-existe', CONTAINER_BOX), leaf('a', 40, 'c'));
    expect(arrange(unknown, library, measure)).toBe(unknown);
    const hidden = screenOf(host('c', 'hidden', CONTAINER_BOX), leaf('a', 40, 'c'));
    expect(arrange(hidden, library, measure)).toBe(hidden);
    expect(boxOf(hidden, 'a')).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });

  it('changing the spacing with setValue and rearranging spaces again', () => {
    const arranged = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    const wider = arrange(setValue(arranged, 'c', 'spacing', 20), library, measure);
    expect(xs(wider)).toEqual([104, 164, 244]);
  });
});

describe('dropIndex', () => {
  const arranged = arrange(
    rowScreen('row-start', { spacing: 8, padding: 4 }),
    library,
    measure,
  );
  // Centers in x: 124, 182, 230.
  const rowLayout = resolveSlotLayout(findSlot(typeOf('row-start').component)!, {});

  it('row: counts the siblings whose center x is before the point', () => {
    const at = (x: number, exclude?: string) =>
      dropIndex(arranged, 'c', rowLayout, { x, y: 0 }, exclude);
    expect(at(100)).toBe(0);
    expect(at(150)).toBe(1);
    expect(at(200)).toBe(2);
    expect(at(300)).toBe(3);
    // Without the dragged one (b): centers 124 and 230 remain.
    expect(at(150, 'b')).toBe(1);
    expect(at(200, 'b')).toBe(1);
    expect(at(300, 'b')).toBe(2);
  });

  it('column: uses the center y', () => {
    const column = arrange(
      screenOf(
        host(
          'c',
          'column-start',
          { x: 10, y: 20, width: 200, height: 300 },
          {
            spacing: 8,
            padding: 4,
          },
        ),
        leaf('a', 40, 'c', 20),
        leaf('b', 50, 'c', 30),
        leaf('d', 60, 'c', 10),
      ),
      library,
      measure,
    );
    // Centers in y: 34, 67, 95.
    const layout = resolveSlotLayout(findSlot(typeOf('column-start').component)!, {});
    expect(dropIndex(column, 'c', layout, { x: 0, y: 10 })).toBe(0);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 50 })).toBe(1);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 80 })).toBe(2);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 200 })).toBe(3);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 80 }, 'a')).toBe(1);
  });

  it('none returns the end of the sibling list', () => {
    const none = resolveSlotLayout(findSlot(typeOf('box').component)!, {});
    expect(dropIndex(arranged, 'c', none, { x: 0, y: 0 })).toBe(3);
    expect(dropIndex(arranged, 'c', none, { x: 0, y: 0 }, 'a')).toBe(2);
  });
});

const withVersion4 = <T extends object>(c: T) => ({ ...c, formatVersion: 4 });

describe('arrange: slot gap and padding as $token (#948)', () => {
  const tokenComponent = withVersion4(
    component('tk', [
      {
        type: 'slot',
        width: 'fill',
        height: 'fill',
        layout: {
          type: 'row',
          gap: { $token: 'space-2' },
          padding: { $token: 'space-4' },
          align: 'start',
        },
      },
    ]),
  );
  const tokenSpec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'token-test',
    name: 'Token',
    tokens: {
      modes: ['light', 'dark'],
      values: { 'space-2': { light: 6, dark: 12 }, 'space-4': { light: 10, dark: 20 } },
    },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: [
          { id: 'tk', name: 'tk', component: 'components/tk.json', fields: [] },
          { id: 'leaf', name: 'leaf', component: 'components/leaf.json', fields: [] },
        ],
      },
    ],
  };
  const leafComponent = COMPONENTS.find((c) => c.id === 'leaf');
  const tokenLibrary = (mode?: string) =>
    withHostTokens(
      loadLibrary([
        { path: 'spec.json', text: JSON.stringify(tokenSpec) },
        { path: 'components/tk.json', text: JSON.stringify(tokenComponent) },
        { path: 'components/leaf.json', text: JSON.stringify(leafComponent) },
      ]),
      {},
      mode,
    );
  it('the library loads', () => {
    const l = tokenLibrary();
    expect(l.problems ?? []).toEqual([]);
    expect(l.types.map((t) => t.id)).toEqual(['tk', 'leaf']);
  });
  const screen = screenOf(
    host('c', 'tk', CONTAINER_BOX, {}),
    leaf('a', 40, 'c'),
    leaf('b', 60, 'c'),
  );

  it('slotBox and arrange use the gap and padding of the design tokens', () => {
    const result = arrange(screen, tokenLibrary(), measure);
    expect(boxOf(result, 'a')).toMatchObject({
      x: CONTAINER_BOX.x + 10,
      y: CONTAINER_BOX.y + 10,
    });
    expect(boxOf(result, 'b').x).toBe(CONTAINER_BOX.x + 10 + 40 + 6);
  });

  it('with the table of another mode, the value of that mode applies', () => {
    const result = arrange(screen, tokenLibrary('dark'), measure);
    expect(boxOf(result, 'a').x).toBe(CONTAINER_BOX.x + 20);
    expect(boxOf(result, 'b').x).toBe(CONTAINER_BOX.x + 20 + 40 + 12);
  });
});

// --- MC4: row wrap in the slot (decision 12 of #898) ------------------------------------------

describe('arrange: wrap in the slot (MC4)', () => {
  function wrapLibrary(slotLayout: Record<string, unknown>) {
    const flowComponent = {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'flow',
      name: 'flow',
      size: { width: 320, height: 200 },
      template: {
        type: 'frame',
        layout: { type: 'none' },
        children: [{ type: 'slot', width: 'fill', height: 'fill', layout: slotLayout }],
      },
    };
    const leafComponent = COMPONENTS.find((c) => c.id === 'leaf');
    const spec = {
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'wrap-test',
      name: 'Wrap',
      layers: [
        {
          id: 'ui',
          name: 'UI',
          color: '#1E88E5',
          annotationTypes: [
            { id: 'flow', name: 'flow', component: 'components/flow.json', fields: [] },
            { id: 'leaf', name: 'leaf', component: 'components/leaf.json', fields: [] },
          ],
        },
      ],
    };
    return loadLibrary([
      { path: 'spec.json', text: JSON.stringify(spec) },
      { path: 'components/flow.json', text: JSON.stringify(flowComponent) },
      { path: 'components/leaf.json', text: JSON.stringify(leafComponent) },
    ]);
  }

  const FLOW_BOX: Box = { x: 100, y: 50, width: 320, height: 200 };

  function flowScreen(count: number, height = 20): Screen {
    return screenOf(
      host('c', 'flow', FLOW_BOX, {}),
      ...Array.from({ length: count }, (_, i) => leaf(`k${i}`, 100, 'c', height)),
    );
  }

  const place = (slotLayout: Record<string, unknown>, count = 5, height = 20) => {
    const lib = wrapLibrary(slotLayout);
    const result = arrange(flowScreen(count, height), lib, measure);
    return (i: number) => {
      const b = boxOf(result, `k${i}`);
      return { x: b.x - FLOW_BOX.x, y: b.y - FLOW_BOX.y };
    };
  };

  it('the library with wrap loads and resolveSlotLayout brings the new keys', () => {
    const lib = wrapLibrary({
      type: 'row',
      wrap: 'wrap-reverse',
      lineGap: 12,
      maxPerLine: 3,
      maxLines: 2,
    });
    expect(lib.problems).toEqual([]);
    const slot = findSlot(lib.types.find((t) => t.id === 'flow')?.component as never);
    expect(resolveSlotLayout(slot as never, {})).toMatchObject({
      wrap: 'wrap-reverse',
      lineGap: 12,
      maxPerLine: 3,
      maxLines: 2,
    });
    const plain = wrapLibrary({ type: 'row' });
    const plainSlot = findSlot(
      plain.types.find((t) => t.id === 'flow')?.component as never,
    );
    expect(resolveSlotLayout(plainSlot as never, {})).toMatchObject({
      wrap: 'none',
      lineGap: 0,
    });
  });

  it('5 children of 100 in a row of 320, gap 8, lineGap 12: 3 + 2 (Compose FlowRow)', () => {
    const at = place({ type: 'row', gap: 8, wrap: 'wrap', lineGap: 12 });
    expect([0, 1, 2].map((i) => at(i).x)).toEqual([0, 108, 216]);
    expect([0, 1, 2].map((i) => at(i).y)).toEqual([0, 0, 0]);
    expect([3, 4].map((i) => at(i).x)).toEqual([0, 108]);
    expect([3, 4].map((i) => at(i).y)).toEqual([32, 32]);
  });

  it('column with wrap: the columns line up from left to right', () => {
    const at = place({ type: 'column', gap: 4, wrap: 'wrap', lineGap: 10 }, 5, 80);
    // 2 × 80 + 4 = 164 ≤ 200; the third does not fit.
    expect([0, 1].map((i) => at(i).y)).toEqual([0, 84]);
    expect([0, 2, 4].map((i) => at(i).x)).toEqual([0, 110, 220]);
  });

  it('wrap-reverse puts the new line above', () => {
    const at = place({ type: 'row', gap: 8, wrap: 'wrap-reverse', lineGap: 12 });
    expect([0, 1, 2].map((i) => at(i).y)).toEqual([32, 32, 32]);
    expect([3, 4].map((i) => at(i).y)).toEqual([0, 0]);
  });

  it('justify and reverse apply in each line', () => {
    const between = place({
      type: 'row',
      gap: 8,
      wrap: 'wrap',
      justify: 'space-between',
    });
    expect([0, 1, 2].map((i) => between(i).x)).toEqual([0, 110, 220]);
    expect([3, 4].map((i) => between(i).x)).toEqual([0, 220]);
    const reversed = place({ type: 'row', gap: 8, wrap: 'wrap', reverse: true });
    expect([0, 1, 2].map((i) => reversed(i).x)).toEqual([220, 112, 4]);
    expect([3, 4].map((i) => reversed(i).x)).toEqual([220, 112]);
  });

  it('maxPerLine 2 breaks every two', () => {
    const at = place({ type: 'row', gap: 4, wrap: 'wrap', maxPerLine: 2 });
    expect([0, 1, 2, 3, 4].map((i) => at(i).y)).toEqual([0, 0, 20, 20, 40]);
  });

  it('maxLines 1: children beyond the last line stay where they were', () => {
    const at = place({ type: 'row', gap: 8, wrap: 'wrap', maxLines: 1 });
    expect([0, 1, 2].map((i) => at(i).x)).toEqual([0, 108, 216]);
    // the other two were not moved (they were at 0, 0 of the screen).
    expect(at(3)).toEqual({ x: -FLOW_BOX.x, y: -FLOW_BOX.y });
    expect(at(4)).toEqual({ x: -FLOW_BOX.x, y: -FLOW_BOX.y });
  });

  it('a child larger than the whole line stays alone in a line', () => {
    const lib = wrapLibrary({ type: 'row', gap: 8, wrap: 'wrap', lineGap: 4 });
    const screen = screenOf(
      host('c', 'flow', FLOW_BOX, {}),
      leaf('a', 100, 'c'),
      leaf('big', 400, 'c'),
      leaf('b', 100, 'c'),
    );
    const result = arrange(screen, lib, measure);
    expect(boxOf(result, 'a').y - FLOW_BOX.y).toBe(0);
    expect(boxOf(result, 'big').y - FLOW_BOX.y).toBe(24);
    expect(boxOf(result, 'b').y - FLOW_BOX.y).toBe(48);
  });

  it('align center applies inside each line', () => {
    const lib = wrapLibrary({
      type: 'row',
      gap: 8,
      wrap: 'wrap',
      lineGap: 6,
      align: 'center',
    });
    const screen = screenOf(
      host('c', 'flow', FLOW_BOX, {}),
      leaf('a', 100, 'c', 40),
      leaf('b', 100, 'c', 20),
      leaf('c2', 100, 'c', 20),
      leaf('d', 100, 'c', 10),
    );
    const result = arrange(screen, lib, measure);
    const y = (id: string) => boxOf(result, id).y - FLOW_BOX.y;
    expect([y('a'), y('b'), y('c2'), y('d')]).toEqual([0, 10, 10, 46]);
  });
});
