import { describe, expect, it } from 'vitest';
import type { Font } from 'opentype.js';
import { capHeightOf } from '../../mcp/image/glyphs';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { textBars } from '../../mcp/image/textBars';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { layoutRuns } from '../../src/model/components/richText';
import {
  baseNode,
  type FrameNode,
  type TextNode,
} from '../../src/model/components/scene';

// FX2 (decisões 3, 4, 6 e 8 da #896): `font.verticalAlign: "cap-middle"` no raster do servidor. O bloco
// do topo da maiúscula da primeira linha à base da última fica centrado na caixa do nó; o `middle`
// (centro da caixa de linha) não muda.

const book = createFontBook();
const measure = measurerFor(book);

const BOX_TOP = 5;
const BOX_HEIGHT = 30;
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;

const style = (verticalAlign: TextNode['style']['verticalAlign']): TextNode['style'] => ({
  fontFamily: 'sans-serif',
  fontSize: FONT_SIZE,
  fontWeight: 400,
  italic: false,
  lineHeight: LINE_HEIGHT,
  align: 'left',
  verticalAlign,
});

function textNode(
  text: string,
  verticalAlign: TextNode['style']['verticalAlign'],
  width = 60,
): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width,
      height: BOX_HEIGHT,
      transform: [1, 0, 0, 1, 10, BOX_TOP],
      fills: [{ type: 'solid', color: '#000000' }],
    }),
    type: 'text',
    text,
    style: style(verticalAlign),
  };
}

function richNode(
  text: string,
  verticalAlign: TextNode['style']['verticalAlign'],
): TextNode {
  const runs = [
    {
      text,
      fontFamily: 'sans-serif',
      fontSize: FONT_SIZE,
      fontWeight: 400,
      italic: false,
      color: '#000000',
    },
  ];
  return {
    ...textNode(text, verticalAlign, 100),
    runs,
    runLayout: layoutRuns(
      runs.map((r) => ({
        text: r.text,
        font: {
          family: r.fontFamily,
          size: r.fontSize,
          weight: r.fontWeight,
          italic: r.italic,
          lineHeight: LINE_HEIGHT,
          letterSpacing: 0,
        },
      })),
      { size: FONT_SIZE, lineHeight: LINE_HEIGHT },
      measure,
      100,
    ),
  };
}

/** Pinta o nó e devolve o centro vertical da tinta (px do modelo), com as bordas parciais contadas. */
function inkCenter(node: TextNode, scale: number): number {
  const width = Math.ceil(120 * scale);
  const height = Math.ceil(50 * scale);
  const raster: Raster = createRaster(width, height);
  raster.data.fill(255);
  const root: FrameNode = {
    ...baseNode({ id: 'root', name: 'root', width: 120, height: 50 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [node],
  };
  paintScene(raster, [{ root }], measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width, height },
    fonts: book,
  });
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    let total = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      total += 255 - (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
    }
    rows.push(total / 255);
  }
  const filled = rows.filter((r) => r > 0).sort((a, b) => a - b);
  // Linha cheia de referência: a mediana das linhas com tinta (as hastes do H, sem a barra do meio).
  const full = filled[Math.floor(filled.length / 2)]!;
  const first = rows.findIndex((r) => r > full * 0.02);
  const last = rows.length - 1 - [...rows].reverse().findIndex((r) => r > full * 0.02);
  const top = first + (1 - Math.min(1, rows[first]! / full));
  const bottom = last + Math.min(1, rows[last]! / full);
  return (top + bottom) / 2 / scale;
}

const BOX_CENTER = BOX_TOP + BOX_HEIGHT / 2;

describe('cap-middle no raster com a fonte embutida (decisão 8)', () => {
  for (const scale of [1, 4.2]) {
    it(`texto simples de uma linha: o centro da tinta fica a ≤ 0,5 px do centro da caixa (zoom ${scale})`, () => {
      const center = inkCenter(textNode('HHHH', 'cap-middle'), scale);
      expect(Math.abs(center - BOX_CENTER)).toBeLessThanOrEqual(0.5);
    });

    it(`texto simples de duas linhas: o bloco (topo do H da 1ª à base da 2ª) fica centrado (zoom ${scale})`, () => {
      // Largura que só cabe uma palavra por linha.
      const center = inkCenter(textNode('HHHH HHHH', 'cap-middle', 36), scale);
      expect(Math.abs(center - BOX_CENTER)).toBeLessThanOrEqual(0.5);
    });

    it(`texto com runs: o centro da tinta fica a ≤ 0,5 px do centro da caixa (zoom ${scale})`, () => {
      const center = inkCenter(richNode('HHHH', 'cap-middle'), scale);
      expect(Math.abs(center - BOX_CENTER)).toBeLessThanOrEqual(0.5);
    });
  }

  it('o middle não muda: centra a caixa de linha (com a Liberation Sans, a maiúscula cai a menos de 0,5 px)', () => {
    const middle = inkCenter(textNode('HHHH', 'middle'), 1);
    // Ascendente 0,905 e descendente 0,212 do corpo: a linha de base fica 0,3465 abaixo do centro da
    // linha e o centro da maiúscula (0,688 / 2) 0,344 acima da base. O raster do middle segue assim.
    expect(Math.abs(middle - BOX_CENTER)).toBeLessThanOrEqual(0.5);
  });

  it('sem fonte (barras), o cap-middle já não cai no topo', () => {
    const bar = (v: TextNode['style']['verticalAlign']) =>
      textBars(textNode('HHHH', v), measure)[0]!;
    const top = bar('top');
    const cap = bar('cap-middle');
    expect(cap.y).toBeGreaterThan(top.y + 1);
    // As proporções de reserva (maiúscula 0,7, ascendente 0,8, descendente 0,2 do corpo) põem o
    // centro da barra a 0,05 do corpo abaixo do centro da caixa.
    const center = cap.y + cap.height / 2;
    expect(center).toBeCloseTo(BOX_HEIGHT / 2 + 0.05 * FONT_SIZE, 5);
  });
});

describe('cap-middle com o texto mais alto que a caixa (MC0, decisão 31)', () => {
  // Largura que só cabe uma palavra por linha; a caixa tem 40 px: cabem 2 das 3 linhas de 20.
  const boxed = (text: string): TextNode => ({
    ...textNode(text, 'cap-middle', 36),
    height: 40,
  });
  const boxCenter = BOX_TOP + 40 / 2;

  for (const scale of [1, 4.2]) {
    it(`3 linhas numa caixa de 2 desenham 2, centradas como na app (zoom ${scale})`, () => {
      const three = inkCenter(boxed('HHHH HHHH HHHH'), scale);
      const two = inkCenter(boxed('HHHH HHHH'), scale);
      // O mesmo capMiddleShift com 2 linhas: a terceira não conta nem pinta.
      expect(Math.abs(three - two)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(three - boxCenter)).toBeLessThanOrEqual(0.5);
    });
  }
});

describe('capHeightOf (decisão 4)', () => {
  const face = book.fontFor('sans-serif', 400, false);

  it('usa o sCapHeight da fonte, no tamanho dado', () => {
    const cap = face.tables?.os2?.sCapHeight as number | undefined;
    expect(cap).toBeGreaterThan(0);
    expect(capHeightOf(face, 14)).toBeCloseTo((cap! / face.unitsPerEm) * 14, 6);
  });

  it('sem sCapHeight, cai na caixa do glifo H', () => {
    const without = Object.create(face, {
      tables: { value: { ...face.tables, os2: { ...face.tables?.os2, sCapHeight: 0 } } },
    }) as Font;
    const box = face.charToGlyph('H').getBoundingBox();
    expect(capHeightOf(without, 14)).toBeCloseTo((box.y2 / face.unitsPerEm) * 14, 6);
  });

  it('sem sCapHeight nem H, vale 0,7 do corpo', () => {
    const bare = {
      unitsPerEm: face.unitsPerEm,
      tables: {},
      charToGlyph: () => ({ index: 0, getBoundingBox: () => ({ y2: 0 }) }),
    } as unknown as Font;
    expect(capHeightOf(bare, 20)).toBeCloseTo(14, 6);
  });
});
