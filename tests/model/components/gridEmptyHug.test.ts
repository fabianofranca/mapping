// CL1 (P4): grade vazia com `hug`. O motor (`instantiate.ts`) é a fonte: o eixo das trilhas mede
// `gap × (n − 1)` (as trilhas existem, vazias) e o das linhas de fluxo mede 0; a arrumação do slot
// (`arrange.ts`) e a medida do `hug` do componente com slot (`layout.ts`) concordam com ele.
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

/** O que o motor mede para um quadro `hug` × `hug` em grade, sem filhos. */
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

/** O que a arrumação do slot mede para o mesmo layout, sem filhas. */
function arrangeSize(layout: Json): { width: number; height: number } {
  const slot = {
    type: 'slot',
    layout: { type: 'grid', ...layout },
  } as unknown as SlotTemplate;
  return contentExtent(resolveSlotLayout(slot, {}), [], null);
}

describe('grade vazia com hug: o motor e a arrumação do slot medem igual', () => {
  it.each([
    ['columns 3, gap 10', { columns: 3, gap: 10 }, { width: 20, height: 0 }],
    ['rows 4, gap 5', { rows: 4, gap: 5 }, { width: 0, height: 15 }],
    [
      'columns 2, gap 8, lineGap 6',
      { columns: 2, gap: 8, lineGap: 6 },
      { width: 8, height: 0 },
    ],
    [
      'minColumnWidth 100, gap 8 (sem limite: uma trilha)',
      { minColumnWidth: 100, gap: 8 },
      { width: 0, height: 0 },
    ],
  ])('%s', (_name, layout, expected) => {
    expect(engineSize(layout)).toEqual(expected);
    expect(arrangeSize(layout)).toEqual(expected);
  });
});

/** Um componente `hug` × `hug` com um slot em grade, sem filhas, numa tela sem geometria. */
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
      name: 'Tela',
      width: 320,
      height: 200,
      background: '#FFF',
      roots: [{ node: { id: 'g', typeId: 'box', values: {}, children: [] } }],
    },
    library,
    approximateMeasurer,
  );
  const box = result.screen.instances.find((i) => i.id === 'g')?.box;
  if (box === undefined) throw new Error('sem instância');
  return { width: box.width, height: box.height };
}

describe('grade vazia com hug na tela sem geometria (layout.ts)', () => {
  it.each([
    ['columns 3, gap 10', { columns: 3, gap: 10 }, 20, 0],
    ['rows 4, gap 5', { rows: 4, gap: 5 }, 0, 15],
  ])('%s', (_name, layout, width, height) => {
    expect(emptyHugSlot(layout)).toMatchObject({ width, height });
  });
});
