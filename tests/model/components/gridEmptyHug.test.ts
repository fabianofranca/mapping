// CL1 (P4): empty grid with `hug`. The engine (`instantiate.ts`) is the source: the tracks axis measures
// `gap × (n − 1)` (the tracks exist, empty) and the flow lines axis measures 0; the slot arrangement
// (`arrange.ts`) and the `hug` measure of the component with a slot (`layout.ts`) agree with it.
import { describe, expect, it } from 'vitest';
import { contentExtent, resolveSlotLayout } from '../../../src/model/components/arrange';
import {
  COMPONENT_FORMAT,
  type SlotTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { layoutScreen } from '../../../src/model/components/layout';
import { loadLibrary } from '../../../src/model/components/library';

type Json = Record<string, unknown>;

/** What the engine measures for a `hug` × `hug` frame in a grid, without children. */
function engineSize(layout: Json): { width: number; height: number } {
  const component = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 100 },
    template: {
      type: 'frame',
      name: 'g',
      width: 'hug',
      height: 'hug',
      layout: { type: 'grid', ...layout },
      children: [],
    },
  };
  const { width, height } = measureComponent(
    component as never,
    {} as never,
    { width: null, height: null },
    { measure: approximateMeasurer },
  );
  return { width, height };
}

/** What the slot arrangement measures for the same layout, without children. */
function arrangeSize(layout: Json): { width: number; height: number } {
  const slot = {
    type: 'slot',
    layout: { type: 'grid', ...layout },
  } as unknown as SlotTemplate;
  return contentExtent(resolveSlotLayout(slot, {}), [], null);
}

describe('empty grid with hug: the engine and the slot arrangement measure the same', () => {
  it.each([
    ['columns 3, gap 10', { columns: 3, gap: 10 }, { width: 20, height: 0 }],
    ['rows 4, gap 5', { rows: 4, gap: 5 }, { width: 0, height: 15 }],
    [
      'columns 2, gap 8, lineGap 6',
      { columns: 2, gap: 8, lineGap: 6 },
      { width: 8, height: 0 },
    ],
    [
      'minColumnWidth 100, gap 8 (no limit: one track)',
      { minColumnWidth: 100, gap: 8 },
      { width: 0, height: 0 },
    ],
  ])('%s', (_name, layout, expected) => {
    expect(engineSize(layout)).toEqual(expected);
    expect(arrangeSize(layout)).toEqual(expected);
  });
});

/** A `hug` × `hug` component with a grid slot, without children, on a screen without geometry. */
function emptyHugSlot(layout: Json): { width: number; height: number } {
  const component = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'box',
    name: 'box',
    size: { width: 100, height: 40 },
    sizing: { width: 'hug', height: 'hug' },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'slot',
          width: 'hug',
          height: 'hug',
          layout: { type: 'grid', ...layout },
        },
      ],
    },
  };
  const spec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'grid-test',
    name: 'Grid',
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: [
          { id: 'box', name: 'box', component: 'components/box.json', fields: [] },
        ],
      },
    ],
  };
  const library = loadLibrary([
    { path: 'spec.json', text: JSON.stringify(spec) },
    { path: 'components/box.json', text: JSON.stringify(component) },
  ]);
  const result = layoutScreen(
    {
      id: 's',
      name: 'Screen',
      width: 320,
      height: 200,
      background: '#FFF',
      roots: [{ node: { id: 'g', typeId: 'box', values: {}, children: [] } }],
    },
    library,
    approximateMeasurer,
  );
  const box = result.screen.instances.find((i) => i.id === 'g')?.box;
  if (box === undefined) throw new Error('no instance');
  return { width: box.width, height: box.height };
}

describe('empty grid with hug on the screen without geometry (layout.ts)', () => {
  it.each([
    ['columns 3, gap 10', { columns: 3, gap: 10 }, 20, 0],
    ['rows 4, gap 5', { rows: 4, gap: 5 }, 0, 15],
  ])('%s', (_name, layout, width, height) => {
    expect(emptyHugSlot(layout)).toMatchObject({ width, height });
  });
});
