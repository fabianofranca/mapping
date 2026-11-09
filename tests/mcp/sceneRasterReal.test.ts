import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import {
  baseNode,
  type FrameNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { layoutRuns } from '../../src/model/components/richText';

// CF9 (decisão 31): o rasterizador completo do servidor: texto de verdade (opentype.js), sombra,
// tracejado, `align` do traço, `cap`/`join`, `sides` e trechos. Texto sem `fonts` segue em barras.

const book = createFontBook();
const measure = measurerFor(book);

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}

const luma = (raster: Raster, x: number, y: number): number => {
  const i = (y * raster.width + x) * 4;
  return (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
};
const dark = (raster: Raster, x: number, y: number) => luma(raster, x, y) < 128;

function frame(
  children: SceneNode[],
  width: number,
  height: number,
  extra: Partial<FrameNode> = {},
): FrameNode {
  return {
    ...baseNode({ id: 'root', name: 'root', width, height }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
    ...extra,
  };
}

const solid = (color: string) => ({ type: 'solid' as const, color });

function paint(raster: Raster, root: SceneNode, scale = 1, withFonts = true) {
  paintScene(raster, [{ root }], measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    ...(withFonts ? { fonts: book } : {}),
  });
}

function label(text: string, weight: number, extra: Partial<TextNode> = {}): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width: 60,
      height: 20,
      transform: [1, 0, 0, 1, 10, 5],
      fills: [solid('#000000')],
    }),
    type: 'text',
    text,
    style: {
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: weight,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'middle',
    },
    ...extra,
  };
}

function ink(raster: Raster, x0: number, y0: number, x1: number, y1: number): number {
  let total = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) total += 255 - luma(raster, x, y);
  return total / 255;
}

describe('texto de verdade', () => {
  it('"Salvar" pinta glifos dentro do retângulo do rótulo, não barras', () => {
    const raster = canvas(100, 40);
    paint(raster, frame([label('Salvar', 400)], 100, 40));
    // Tudo fora do retângulo do rótulo (10,5 60×20) continua branco.
    expect(ink(raster, 0, 0, 100, 5)).toBe(0);
    expect(ink(raster, 0, 25, 100, 40)).toBe(0);
    expect(ink(raster, 0, 0, 10, 40)).toBe(0);
    const inside = ink(raster, 10, 5, 70, 25);
    expect(inside).toBeGreaterThan(15);
    // Uma barra de 6 caracteres a 0,6·20 de altura pintaria ~ 6·7,7·12 px; glifos pintam bem menos.
    expect(inside).toBeLessThan(150);
    // O texto ocupa só a largura medida ("Salvar" a 14 px ≈ 38 px), não a caixa inteira de 60 px.
    expect(ink(raster, 10 + 44, 0, 100, 40)).toBe(0);
    expect(ink(raster, 10, 5, 10 + 44, 25)).toBeGreaterThan(15);
  });

  it('o mesmo texto com weight 700 ocupa mais pixels', () => {
    const regular = canvas(100, 40);
    paint(regular, frame([label('Salvar', 400)], 100, 40));
    const bold = canvas(100, 40);
    paint(bold, frame([label('Salvar', 700)], 100, 40));
    expect(ink(bold, 0, 0, 100, 40)).toBeGreaterThan(ink(regular, 0, 0, 100, 40) * 1.05);
  });

  it('wrap none + ellipsis fica dentro da largura da caixa', () => {
    const raster = canvas(120, 40);
    const node = label('Pagar fatura do cartão de crédito', 400, {
      style: {
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 400,
        italic: false,
        lineHeight: 20,
        align: 'left',
        verticalAlign: 'middle',
        wrap: 'none',
        ellipsis: true,
      },
    });
    paint(raster, frame([node], 120, 40));
    expect(ink(raster, 10 + 60 + 1, 0, 120, 40)).toBe(0);
    expect(ink(raster, 10, 5, 70, 25)).toBeGreaterThan(10);
  });

  it.each(['left', 'center', 'right'] as const)(
    'wrap none sem ellipsis, align %s: a letra que passa da caixa sai cortada no meio (FX4)',
    (align) => {
      const raster = canvas(160, 40);
      const node = label('Pagar fatura do cartão de crédito', 400, {
        style: {
          fontFamily: 'sans-serif',
          fontSize: 14,
          fontWeight: 400,
          italic: false,
          lineHeight: 20,
          align,
          verticalAlign: 'middle',
          wrap: 'none',
        },
      });
      paint(raster, frame([node], 160, 40));
      // A caixa vai de x = 10 a 70: há tinta até a borda e nenhuma depois dela.
      expect(ink(raster, 10 + 60 - 4, 5, 70, 25)).toBeGreaterThan(0);
      expect(ink(raster, 70, 0, 160, 40)).toBe(0);
    },
  );

  it('trechos: o chip pinta o fundo e o texto de cada trecho', () => {
    const raster = canvas(160, 40);
    const runs = [
      {
        text: 'Ver ',
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      },
      {
        text: 'chip',
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 400,
        italic: false,
        color: '#000000',
        background: '#ff0000',
        radius: 4,
        padding: [2, 4] as [number, number],
      },
    ];
    const base = label('Ver chip', 400);
    const node: TextNode = {
      ...base,
      width: 140,
      runs,
      runLayout: layoutRuns(
        runs.map((r) => ({
          text: r.text,
          font: {
            family: r.fontFamily,
            size: r.fontSize,
            weight: r.fontWeight,
            italic: r.italic,
            lineHeight: 20,
            letterSpacing: 0,
          },
          ...(r.padding ? { chip: { padding: r.padding } } : {}),
        })),
        { size: 14, lineHeight: 20 },
        measure,
        140,
      ),
    };
    paint(raster, frame([node], 160, 40));
    let red = 0;
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 160; x++) {
        const i = (y * 160 + x) * 4;
        if (raster.data[i]! > 200 && raster.data[i + 1]! < 80) red++;
      }
    expect(red).toBeGreaterThan(40);
    expect(ink(raster, 10, 5, 40, 25)).toBeGreaterThan(5);
  });
});

describe('sombra, tracejado, align, cap, join e sides', () => {
  const box = (extra: Partial<SceneNode> = {}): SceneNode =>
    ({
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 40,
        height: 20,
        transform: [1, 0, 0, 1, 30, 20],
        fills: [solid('#ffffff')],
      }),
      type: 'rect',
      cornerRadius: 0,
      ...extra,
    }) as SceneNode;

  it('sombra com blur 6 e offsetY 2 escurece abaixo e some longe', () => {
    const raster = canvas(100, 80);
    paint(
      raster,
      frame(
        [
          box({
            effects: [{ color: '#000000', offset: { x: 0, y: 2 }, blur: 6 }],
          }),
        ],
        100,
        80,
      ),
    );
    expect(luma(raster, 50, 43)).toBeLessThan(230); // logo abaixo do retângulo
    expect(luma(raster, 50, 43)).toBeGreaterThan(40); // desfocada, não sólida
    expect(luma(raster, 50, 55)).toBeGreaterThan(250); // longe do alcance do blur
    expect(luma(raster, 50, 30)).toBe(255); // o retângulo branco cobre a sombra
    expect(luma(raster, 50, 43)).toBeLessThan(luma(raster, 50, 16)); // deslocada para baixo
  });

  it('traço tracejado [4, 2] alterna tinta e vão', () => {
    const raster = canvas(80, 20);
    const line: SceneNode = {
      ...baseNode({ id: 'l', name: 'l', width: 60, height: 0 }),
      type: 'line',
      points: [
        { x: 0, y: 10 },
        { x: 60, y: 10 },
      ],
      closed: false,
      stroke: { paints: [solid('#000000')], width: 2, align: 'center', dash: [4, 2] },
    };
    paint(raster, frame([line], 80, 20));
    expect(dark(raster, 2, 10)).toBe(true);
    expect(dark(raster, 5, 10)).toBe(false);
    expect(dark(raster, 8, 10)).toBe(true);
    expect(dark(raster, 11, 10)).toBe(false);
  });

  it('align outside desenha o anel fora do contorno; inside, dentro', () => {
    const outside = canvas(100, 80);
    paint(
      outside,
      frame(
        [
          box({
            fills: [],
            stroke: { paints: [solid('#000000')], width: 4, align: 'outside' },
          }),
        ],
        100,
        80,
      ),
    );
    expect(dark(outside, 28, 30)).toBe(true); // x 26..30, à esquerda da caixa
    expect(dark(outside, 32, 30)).toBe(false); // dentro da caixa
    const inside = canvas(100, 80);
    paint(
      inside,
      frame(
        [
          box({
            fills: [],
            stroke: { paints: [solid('#000000')], width: 4, align: 'inside' },
          }),
        ],
        100,
        80,
      ),
    );
    expect(dark(inside, 32, 30)).toBe(true); // x 30..34
    expect(dark(inside, 28, 30)).toBe(false);
  });

  it('cap round estende a ponta; butt não', () => {
    const make = (cap: 'butt' | 'round') => {
      const raster = canvas(60, 30);
      const line: SceneNode = {
        ...baseNode({ id: 'l', name: 'l', width: 30, height: 0 }),
        type: 'line',
        points: [
          { x: 15, y: 15 },
          { x: 45, y: 15 },
        ],
        closed: false,
        stroke: { paints: [solid('#000000')], width: 8, align: 'center', cap },
      };
      paint(raster, frame([line], 60, 30));
      return raster;
    };
    expect(dark(make('round'), 13, 15)).toBe(true);
    expect(dark(make('butt'), 13, 15)).toBe(false);
  });

  it('sides: [bottom] só traça o lado de baixo', () => {
    const raster = canvas(100, 80);
    paint(
      raster,
      frame(
        [
          box({
            fills: [],
            stroke: {
              paints: [solid('#000000')],
              width: 2,
              align: 'inside',
              sides: ['bottom'],
            },
          }),
        ],
        100,
        80,
      ),
    );
    expect(dark(raster, 50, 39)).toBe(true);
    expect(dark(raster, 50, 21)).toBe(false);
    expect(dark(raster, 31, 30)).toBe(false);
  });
});
