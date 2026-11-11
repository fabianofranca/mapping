// L2 (#1078): nas telas do visualizador, a filha de um slot com `clip` é recortada pela caixa do
// slot da mãe (`Instance.parentId`); sem `clip` nada muda.
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
const panel = (id: string, clip?: boolean) => ({
  ...header,
  id,
  name: id,
  size: { width: 300, height: 100 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'slot',
        anchors: { left: 20, right: 20, top: 10, bottom: 10 },
        ...(clip === undefined ? {} : { clip }),
      },
    ],
  },
});
const FILES = [
  {
    path: 'clip.spec.json',
    text: JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'clip',
      name: 'Clip',
      version: 1,
      layers: [
        {
          id: 'c',
          name: 'C',
          color: '#1E88E5',
          annotationTypes: ['cut', 'open', 'dot'].map((id) => ({
            id,
            name: id,
            component: `components/${id}.json`,
            fields: [],
          })),
        },
      ],
    }),
  },
  { path: 'components/cut.json', text: JSON.stringify(panel('cut', true)) },
  { path: 'components/open.json', text: JSON.stringify(panel('open')) },
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

function screenOf(parentType: string): Screen {
  return {
    id: 's',
    name: 's',
    width: 800,
    height: 400,
    background: '#fff',
    instances: [
      {
        id: 'P',
        typeId: parentType,
        box: { x: 100, y: 50, width: 300, height: 100 },
        values: {},
      },
      // A filha passa da caixa do slot (que vai de 120,60 a 380,140 na tela).
      {
        id: 'D',
        typeId: 'dot',
        box: { x: 360, y: 120, width: 60, height: 60 },
        values: {},
        parentId: 'P',
      },
    ],
  };
}

function setup() {
  const group = new Konva.Group();
  const renderer = new ScreenRenderer(group, {
    labels: LABELS,
    measure: approximateMeasurer,
  });
  /** O retângulo (espaço local do nó) que a filha recorta; `null` sem recorte. */
  const clipOf = (id: string): number[] | null => {
    const node = renderer.nodeOf(id);
    if (!node) return null;
    const fn = node.clipFunc();
    if (fn) {
      const rects: number[][] = [];
      const ctx = {
        beginPath() {},
        closePath() {},
        rect: (...a: number[]) => rects.push(a),
      };
      fn(ctx as unknown as Parameters<typeof fn>[0], node);
      return rects[0] ?? null;
    }
    const w = node.clipWidth();
    return w === undefined || w === 0
      ? null
      : [node.clipX(), node.clipY(), w, node.clipHeight()];
  };
  return { renderer, clipOf };
}

describe('ScreenRenderer: clip do slot', () => {
  it('recorta a filha pela caixa do slot da mãe, no espaço local da filha', () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, screenOf('cut'));
    // Slot na tela: x 120..380, y 60..140. A filha está em 360,120: o recorte local começa em -240,-60.
    expect(clipOf('D')).toEqual([-240, -60, 260, 80]);
    expect(clipOf('P')).toBeNull();
  });

  it('sem clip no slot a filha não é recortada', () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, screenOf('open'));
    expect(clipOf('D')).toBeNull();
  });

  it('a mãe que muda de tipo atualiza o recorte da filha sem redesenhá-la', () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, screenOf('cut'));
    expect(clipOf('D')).not.toBeNull();
    renderer.update(library, screenOf('open'));
    expect(clipOf('D')).toBeNull();
  });
});
