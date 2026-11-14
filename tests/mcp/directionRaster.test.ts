// R1 (#1096): o raster do MCP desenha o espelho de rtl (matriz com scaleX negativo) do ícone e do
// caminho na caixa certa (fill, traço, tracejado e cap) e põe o texto rtl no lado físico do
// `align`. Limite conhecido: os glifos saem na ordem do texto, sem bidi. A paridade em pixels
// com o Konva está em tests/e2e/directionParity.spec.ts.
import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { textBars } from '../../mcp/image/textBars';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import type { IconSet } from '../../src/model/components/icons';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { baseNode, type Scene, type TextNode } from '../../src/model/components/scene';

type Json = Record<string, unknown>;

const book = createFontBook();
const measure = measurerFor(book);

const icons: IconSet = {
  viewBox: [24, 24],
  icons: {
    back: { mirror: true, paths: [{ d: 'M2 4L20 4L20 10L2 10Z', fill: true }] },
    line: {
      mirror: true,
      paths: [{ d: 'M2 12L20 12', stroke: true, width: 4, cap: 'butt' }],
    },
  },
} as never;

function sceneOf(child: Json, direction: 'rtl' | undefined): Scene {
  const file = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 60, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children: [child] },
  };
  return instantiate(
    file as never,
    {},
    { x: 0, y: 0, width: 60, height: 40 },
    { measure: approximateMeasurer, icons, ...(direction ? { direction } : {}) },
  );
}

/** As colunas [esquerda, direita) com tinta (qualquer pixel escuro). */
function ink(scene: Scene): { left: number; right: number } {
  const raster: Raster = createRaster(60, 40);
  raster.data.fill(255);
  paintScene(raster, [{ root: scene.root }], measure, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: 60, height: 40 },
    fonts: book,
  });
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 60; x++)
      if (raster.data[(y * 60 + x) * 4 + 1]! < 128) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
      }
  return { left, right };
}

const icon = (name: string): Json => ({
  type: 'icon',
  name,
  width: 24,
  height: 24,
  color: '#000000',
});
const path = (extra: Json): Json => ({
  type: 'path',
  name: 'p',
  d: 'M2 0L20 0L20 10L2 10Z',
  viewBox: [24, 10],
  width: 48,
  height: 20,
  mirror: true,
  ...extra,
});

describe('raster: o espelho do ícone e do caminho na mesma caixa', () => {
  it('ícone com fill: x de 2 a 20 em ltr; espelhado na caixa do nó em rtl', () => {
    expect(ink(sceneOf(icon('back'), undefined))).toEqual({ left: 2, right: 20 });
    expect(ink(sceneOf(icon('back'), 'rtl'))).toEqual({ left: 40, right: 58 });
  });

  it('ícone com traço (cap butt): espelha o traço', () => {
    expect(ink(sceneOf(icon('line'), undefined))).toEqual({ left: 2, right: 20 });
    expect(ink(sceneOf(icon('line'), 'rtl'))).toEqual({ left: 40, right: 58 });
  });

  it('caminho com fill: caixa 4 a 40 em ltr, 20 a 56 em rtl', () => {
    const fill = path({ fill: '#000000' });
    expect(ink(sceneOf(fill, undefined))).toEqual({ left: 4, right: 40 });
    expect(ink(sceneOf(fill, 'rtl'))).toEqual({ left: 20, right: 56 });
  });

  it('caminho tracejado: o tracejado começa na ponta espelhada (butt e round)', () => {
    const line = (cap: string) =>
      path({
        d: 'M2 5L20 5',
        stroke: { color: '#000000', width: 4, cap, dash: [10, 10] },
      });
    // o caminho vai de x=4 a x=40 (viewBox 24 → 48); o primeiro traço (10 do viewBox = 20 px) parte do início
    const butt = (d?: 'rtl') => ink(sceneOf(line('butt'), d));
    expect(butt()).toEqual({ left: 4, right: 24 });
    expect(butt('rtl')).toEqual({ left: 36, right: 56 });
    const round = (d?: 'rtl') => ink(sceneOf(line('round'), d));
    expect(round()).toEqual({ left: 2, right: 26 });
    expect(round('rtl')).toEqual({ left: 34, right: 58 });
  });
});

function textNode(align: TextNode['style']['align'], direction?: 'rtl'): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width: 60,
      height: 20,
      fills: [{ type: 'solid', color: '#000000' }],
    }),
    type: 'text',
    text: 'abc',
    style: {
      fontFamily: 'sans-serif',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 14,
      align,
      verticalAlign: 'top',
      ...(direction ? { direction } : {}),
    },
  };
}

describe('raster: texto rtl no lado físico do align', () => {
  const six = (text: string) => ({ width: text.length * 6, height: 14 });

  it('align right: a barra encosta na borda direita; align left, na esquerda', () => {
    const [right] = textBars(textNode('right', 'rtl'), six);
    expect(right!.x + right!.width).toBe(60);
    const [left] = textBars(textNode('left', 'rtl'), six);
    expect(left!.x).toBe(0);
  });

  it('o glifo pintado cai do mesmo lado (sem bidi: ordem do texto)', () => {
    const raster = createRaster(60, 20);
    raster.data.fill(255);
    paintScene(raster, [{ root: textNode('right', 'rtl') }], measure, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width: 60, height: 20 },
      fonts: book,
    });
    let right = -1;
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 60; x++)
        if (raster.data[(y * 60 + x) * 4 + 1]! < 128) right = Math.max(right, x);
    expect(right).toBeGreaterThanOrEqual(55);
  });
});
