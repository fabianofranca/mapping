// R2 (#1107): `Screen.direction` leva a direção de leitura ao interior de cada componente. A tela
// `rtl` (a de `layoutScreen`, ou montada à mão) espelha o `row` dentro da instância; a opção
// `direction` do `update` vence a da tela; sem nenhuma das duas, nada muda (ltr).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import type { Screen } from '../../../src/model/components/screen';
import { DEFAULT_PALETTE } from '../../../src/canvas/components/palette';
import {
  ScreenRenderer,
  type ScreenRendererLabels,
} from '../../../src/canvas/components/screenRenderer';

beforeAll(() => installFakeCanvas());

const LABELS: ScreenRendererLabels = {
  typeWithoutComponent: (name) => name,
  unknownType: (id) => id,
  warningTypeWithoutComponent: 'x',
  warningUnknownType: 'y',
  drawWarning: ({ code }) => code,
};

/** Um `row` de 100x40 com dois filhos fixos (20 e 30 de largura), sem gap nem padding. */
const PAIR = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'pair',
  name: 'Par',
  size: { width: 100, height: 40 },
  template: {
    type: 'frame',
    name: 'par',
    layout: { type: 'row', align: 'start' },
    children: [
      { type: 'rect', name: 'a', width: 20, height: 10, fill: '#FF0000' },
      { type: 'rect', name: 'b', width: 30, height: 10, fill: '#0000FF' },
    ],
  },
};

const library = loadLibrary([
  {
    path: 'spec.json',
    text: JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'mini',
      name: 'Mini',
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'L',
          annotationTypes: [
            { id: 'pair', name: 'Par', component: 'components/pair.json', fields: [] },
          ],
        },
      ],
    }),
  },
  { path: 'components/pair.json', text: JSON.stringify(PAIR) },
]);

/** As mesmas instâncias (mesmos objetos) em toda tela: só a direção muda entre elas. */
const INSTANCES: Screen['instances'] = [
  { id: 'p', typeId: 'pair', box: { x: 100, y: 10, width: 100, height: 40 }, values: {} },
];

function screenOf(direction?: 'ltr' | 'rtl'): Screen {
  return {
    id: 's',
    name: 'S',
    width: 300,
    height: 100,
    background: '#FFFFFF',
    ...(direction ? { direction } : {}),
    instances: INSTANCES,
  };
}

/** x (na tela) e largura dos dois retângulos do par: o vermelho (largura 20) e o azul (30). */
function rects(screen: Screen, direction?: 'ltr' | 'rtl'): { red: number; blue: number } {
  const group = new Konva.Group();
  const renderer = new ScreenRenderer(group, {
    labels: LABELS,
    measure: approximateMeasurer,
    palette: DEFAULT_PALETTE,
  });
  renderer.update(library, screen, direction ? { direction } : {});
  const xOf = (fill: string) =>
    (group.find('Rect') as Konva.Rect[])
      .filter((r) => String(r.fill()).toLowerCase() === fill)
      .map((r) => r.getAbsolutePosition().x)[0]!;
  return { red: xOf('#ff0000'), blue: xOf('#0000ff') };
}

describe('ScreenRenderer: direção da tela', () => {
  it('a tela ltr (sem a chave) segue como sempre: red em 100, blue em 120', () => {
    expect(rects(screenOf())).toEqual({ red: 100, blue: 120 });
    expect(rects(screenOf('ltr'))).toEqual({ red: 100, blue: 120 });
  });

  it("a tela rtl espelha o interior do componente: x' = largura - x - w dentro da caixa", () => {
    // dentro da instância (largura 100): red 0..20 -> 80; blue 20..50 -> 50 (mais a caixa em 100)
    expect(rects(screenOf('rtl'))).toEqual({ red: 180, blue: 150 });
  });

  it('a opção direction do update vence a da tela', () => {
    expect(rects(screenOf('rtl'), 'ltr')).toEqual({ red: 100, blue: 120 });
    expect(rects(screenOf(), 'rtl')).toEqual({ red: 180, blue: 150 });
  });

  it('trocar a direção da tela redesenha as instâncias', () => {
    const group = new Konva.Group();
    const renderer = new ScreenRenderer(group, {
      labels: LABELS,
      measure: approximateMeasurer,
    });
    expect(renderer.update(library, screenOf())).toBe(true);
    expect(renderer.update(library, screenOf('ltr'))).toBe(false);
    expect(renderer.update(library, screenOf('rtl'))).toBe(true);
    expect(renderer.update(library, screenOf('rtl'))).toBe(false);
  });
});
