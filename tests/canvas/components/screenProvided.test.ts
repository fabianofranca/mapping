// MF3: cor herdada nas telas do visualizador e do laboratório, por `Instance.parentId` (decisão 9).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import type { Screen } from '../../../src/model/components/screen';
import {
  ScreenRenderer,
  type ScreenRendererLabels,
} from '../../../src/canvas/components/screenRenderer';

beforeAll(() => installFakeCanvas());

const LABELS: ScreenRendererLabels = {
  typeWithoutComponent: (name) => name,
  unknownType: (id) => id,
  warningTypeWithoutComponent: 'sem componente',
  warningUnknownType: 'desconhecido',
  drawWarning: ({ code }) => code,
};

const header = { format: 'mapping-component', formatVersion: 4 };
const slot = (provide?: Record<string, unknown>) => ({
  type: 'slot',
  anchors: { left: 0, right: 0, top: 0, bottom: 0 },
  layout: { type: 'row', gap: 4, padding: 0 },
  ...(provide === undefined ? {} : { provide }),
});
const container = (id: string, provide?: Record<string, unknown>) => ({
  ...header,
  id,
  name: id,
  size: { width: 300, height: 100 },
  template: { type: 'frame', layout: { type: 'none' }, children: [slot(provide)] },
});
const FILES = [
  {
    path: 'prov.spec.json',
    text: JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'prov',
      name: 'Prov',
      version: 1,
      layers: [
        {
          id: 'c',
          name: 'C',
          color: '#1E88E5',
          annotationTypes: [
            ['panel', [{ key: 'ink', type: 'string' }]],
            ['shell', []],
            ['label', []],
            ['dot', []],
          ].map(([id, fields]) => ({
            id,
            name: id,
            component: `components/${id as string}.json`,
            fields,
          })),
        },
      ],
    }),
  },
  {
    path: 'components/panel.json',
    text: JSON.stringify(
      container('panel', { ink: { $field: 'ink', default: '#0000ff' } }),
    ),
  },
  { path: 'components/shell.json', text: JSON.stringify(container('shell')) },
  {
    path: 'components/label.json',
    text: JSON.stringify({
      ...header,
      id: 'label',
      name: 'label',
      size: { width: 100, height: 40 },
      template: {
        type: 'frame',
        layout: { type: 'none' },
        children: [
          {
            type: 'text',
            text: 'x',
            color: { $provided: 'ink', default: '#999999' },
          },
        ],
      },
    }),
  },
  {
    path: 'components/dot.json',
    text: JSON.stringify({
      ...header,
      id: 'dot',
      name: 'dot',
      size: { width: 20, height: 20 },
      template: { type: 'frame', fill: '#123456' },
    }),
  },
];
const library = loadLibrary(FILES);

const box = (x: number) => ({ x, y: 0, width: 100, height: 40 });
const SCREEN: Screen = {
  id: 's',
  name: 's',
  width: 800,
  height: 400,
  background: '#fff',
  instances: [
    {
      id: 'P',
      typeId: 'panel',
      box: { x: 0, y: 0, width: 300, height: 100 },
      values: {},
    },
    {
      id: 'S',
      typeId: 'shell',
      box: { x: 0, y: 0, width: 300, height: 100 },
      values: {},
      parentId: 'P',
    },
    { id: 'L', typeId: 'label', box: box(0), values: {}, parentId: 'S' },
    { id: 'D', typeId: 'dot', box: box(0), values: {}, parentId: 'P' },
    { id: 'Q', typeId: 'label', box: box(400), values: {} },
  ],
};

function setup() {
  const group = new Konva.Group();
  const renderer = new ScreenRenderer(group, {
    labels: LABELS,
    measure: approximateMeasurer,
  });
  const textColor = (id: string): unknown =>
    (renderer.nodeOf(id)?.findOne('Text') as Konva.Text | undefined)?.fill();
  return { renderer, textColor };
}

function withInk(screen: Screen, ink: string): Screen {
  return {
    ...screen,
    instances: screen.instances.map((i) =>
      i.id === 'P' ? { ...i, values: { ...i.values, ink } } : i,
    ),
  };
}

describe('ScreenRenderer: cor herdada', () => {
  it('a filha lê o valor do ancestral que oferece (o pai que não oferece é atravessado)', () => {
    const { renderer, textColor } = setup();
    renderer.update(library, SCREEN);
    expect(textColor('L')).toBe('#0000ff');
    // Sem ancestral que ofereça (nível da tela): o default.
    expect(textColor('Q')).toBe('#999999');
  });

  it('trocar o campo do pai muda a cor da filha', () => {
    const { renderer, textColor } = setup();
    renderer.update(library, SCREEN);
    renderer.update(library, withInk(SCREEN, '#ff0000'));
    expect(textColor('L')).toBe('#ff0000');
    expect(textColor('Q')).toBe('#999999');
  });

  it('redesenha só a filha que lê: as outras ficam com o mesmo grupo e o mesmo desenho', () => {
    const { renderer } = setup();
    renderer.update(library, SCREEN);
    const before = new Map(
      ['S', 'L', 'D', 'Q'].map((id) => [id, renderer.nodeOf(id)?.children[0]]),
    );
    renderer.update(library, withInk(SCREEN, '#ff0000'));
    // Só `P` (objeto novo) e `L` (valor oferecido novo) redesenham; o desenho filho de S, D e Q é o mesmo.
    expect(renderer.nodeOf('L')?.children[0]).not.toBe(before.get('L'));
    for (const id of ['S', 'D', 'Q'])
      expect(renderer.nodeOf(id)?.children[0]).toBe(before.get(id));
  });
});
