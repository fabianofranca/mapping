// FX4 no PNG do MCP: stroke.offset, wrap "none" cortado por pixel e quatro sides (decisões 17, 19 e 21).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import type { StrokeSide } from '../../src/model/components/componentFormat';
import { instantiate } from '../../src/model/components/instantiate';
import {
  baseNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { plainLines } from '../../mcp/image/textBars';

const INK = '#FF00FF';
const WHITE = [255, 255, 255, 255];
const solid = (color: string) => ({ type: 'solid' as const, color });

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}
const pixel = (r: Raster, x: number, y: number): number[] => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};
const isInk = (p: number[]): boolean => p[0] === 255 && p[1] === 0 && p[2] === 255;

function paint(raster: Raster, root: SceneNode): void {
  paintScene(raster, [{ root }], approximateMeasurer, {
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    scaleX: 1,
    scaleY: 1,
  });
}

const rect = (stroke: NonNullable<SceneNode['stroke']>, radius = 0): SceneNode => ({
  ...baseNode({ id: 'r', name: 'r', width: 20, height: 20 }),
  type: 'rect',
  cornerRadius: radius,
  stroke,
  transform: [1, 0, 0, 1, 10, 10],
});

describe('stroke.offset no raster', () => {
  it('o anel fica afastado da forma: o pixel colado na borda é do fundo e o do anel é tinta', () => {
    const raster = canvas(40, 40);
    paint(raster, rect({ paints: [solid(INK)], width: 2, align: 'outside', offset: 3 }));
    // A forma começa em x = 10; o anel ocupa de 10 − 3 − 2 = 5 a 7.
    expect(isInk(pixel(raster, 6, 20))).toBe(true);
    expect(pixel(raster, 9, 20)).toEqual(WHITE);
    expect(pixel(raster, 11, 20)).toEqual(WHITE);
    expect(pixel(raster, 3, 20)).toEqual(WHITE);
  });

  it('o raio do canto cresce o offset (canto de raio 6 + 3)', () => {
    const raster = canvas(40, 40);
    paint(
      raster,
      rect({ paints: [solid(INK)], width: 2, align: 'center', offset: 3 }, 6),
    );
    // Caixa do anel: 7..33; um canto reto estaria em (7,7); o arredondado deixa (7,7) em branco.
    expect(pixel(raster, 7, 7)).toEqual(WHITE);
    expect(isInk(pixel(raster, 20, 7))).toBe(true);
  });

  it('com sides, o lado pedido se afasta e os outros nada pintam', () => {
    const raster = canvas(40, 40);
    paint(
      raster,
      rect({
        paints: [solid(INK)],
        width: 2,
        align: 'center',
        offset: 4,
        sides: ['bottom'],
      }),
    );
    // Base em y = 30; com offset 4 a linha fica em y = 34 (33 e 34).
    expect(isInk(pixel(raster, 20, 34))).toBe(true);
    expect(pixel(raster, 20, 30)).toEqual(WHITE);
    expect(pixel(raster, 20, 7)).toEqual(WHITE);
  });
});

describe('stroke.sides com os quatro lados no raster', () => {
  // A cena nunca traz os quatro lados (o `instantiate` os normaliza, MC0): o caminho é o do modelo.
  const sceneWith = (sides?: StrokeSide[]): SceneNode => {
    const { root } = instantiate(
      {
        format: 'mapping-component',
        formatVersion: 4,
        id: 't',
        name: 'T',
        size: { width: 20, height: 20 },
        template: {
          type: 'frame',
          children: [
            {
              type: 'rect',
              width: 20,
              height: 20,
              cornerRadius: 8,
              stroke: {
                color: INK,
                width: 2,
                align: 'inside',
                ...(sides ? { sides } : {}),
              },
            },
          ],
        },
      },
      {},
      { x: 10, y: 10, width: 20, height: 20 },
      { measure: approximateMeasurer },
    );
    return root;
  };

  it('é o contorno inteiro com raio, igual ao sides ausente', () => {
    const all = canvas(40, 40);
    paint(all, sceneWith(['top', 'right', 'bottom', 'left']));
    const none = canvas(40, 40);
    paint(none, sceneWith());
    expect(Buffer.from(all.data).equals(Buffer.from(none.data))).toBe(true);
    // O canto arredondado ficou em branco (não são quatro linhas retas se tocando).
    expect(pixel(all, 10, 10)).toEqual(WHITE);
  });
});

describe('wrap "none" cortado por pixel no raster', () => {
  const text = (align: 'left' | 'center' | 'right'): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 30, height: 20, fills: [solid(INK)] }),
    type: 'text',
    text: 'Texto bem comprido',
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
      wrap: 'none',
    },
  });

  it.each(['left', 'center', 'right'] as const)(
    'align %s: a barra passa da caixa nas barras, mas o desenho é recortado em 30 px',
    (align) => {
      // O texto tem 18 × 5,5 = 99 px; a caixa, 30. Nada se pinta além de x = 30.
      const root: SceneNode = {
        ...text(align),
        transform: [1, 0, 0, 1, 0, 0],
      };
      const raster = canvas(120, 20);
      paint(raster, root);
      expect(isInk(pixel(raster, 29, 10))).toBe(true);
      for (const x of [30, 31, 60, 99]) expect(pixel(raster, x, 10)).toEqual(WHITE);
    },
  );
});

describe('texto cortado de vários parágrafos (MC0, decisão 30)', () => {
  // Cada caractere mede 5,5 px (aproximado): a 1ª linha tem 99 px, a 2ª 27,5; a caixa, 60. O bloco
  // (99) é mais largo que a caixa e começa na borda esquerda; a linha curta se alinha dentro do bloco.
  const two = (align: 'left' | 'center' | 'right'): SceneNode => ({
    ...baseNode({ id: 't', name: 't', width: 60, height: 40, fills: [solid(INK)] }),
    type: 'text',
    text: 'Texto bem comprido\ncurto',
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
      wrap: 'none',
    },
  });

  it('center: a linha curta começa em (99 − 27,5) / 2 = 35,75, como na app', () => {
    const raster = canvas(120, 40);
    paint(raster, two('center'));
    // A segunda linha ocupa y 20..40 (barra em 24..36).
    expect(pixel(raster, 30, 30)).toEqual(WHITE);
    expect(isInk(pixel(raster, 40, 30))).toBe(true);
    expect(isInk(pixel(raster, 58, 30))).toBe(true);
  });

  it('right: a linha curta começa em 99 − 27,5 = 71,5, fora da caixa: nada se pinta', () => {
    const raster = canvas(120, 40);
    paint(raster, two('right'));
    for (const x of [5, 30, 45, 58]) expect(pixel(raster, x, 30)).toEqual(WHITE);
    // A linha comprida começa na borda e é cortada em 60.
    expect(isInk(pixel(raster, 20, 10))).toBe(true);
  });

  it('left: as duas linhas começam na borda', () => {
    const raster = canvas(120, 40);
    paint(raster, two('left'));
    expect(isInk(pixel(raster, 5, 30))).toBe(true);
  });
});

describe('só as linhas que cabem na altura (MC0, decisão 31)', () => {
  const tall = (verticalAlign: 'top' | 'middle' | 'bottom', extra = {}): SceneNode => ({
    ...baseNode({ id: 't', name: 't', width: 120, height: 40, fills: [solid(INK)] }),
    type: 'text',
    text: 'aaaa\nbbbb\ncccc',
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign,
      ...extra,
    },
  });

  it('top: 3 linhas numa caixa de 2 desenham 2 (a terceira não sai)', () => {
    const raster = canvas(120, 80);
    paint(raster, tall('top'));
    expect(isInk(pixel(raster, 5, 10))).toBe(true);
    expect(isInk(pixel(raster, 5, 30))).toBe(true);
    // A terceira linha cairia em y 40..60 (barra em 44..56).
    expect(pixel(raster, 5, 50)).toEqual(WHITE);
  });

  it('middle: o bloco de 2 linhas é que se centra (a linha 1 fica no topo da caixa)', () => {
    const raster = canvas(120, 80);
    paint(raster, tall('middle'));
    // Com 3 linhas o bloco subiria 10 px e a barra da 1ª linha ficaria em −6..6; com 2, em 4..16.
    expect(isInk(pixel(raster, 5, 10))).toBe(true);
    expect(isInk(pixel(raster, 5, 30))).toBe(true);
    expect(pixel(raster, 5, 50)).toEqual(WHITE);
  });

  it('bottom: o bloco de 2 linhas termina no fundo da caixa', () => {
    const raster = canvas(120, 80);
    paint(raster, tall('bottom'));
    expect(isInk(pixel(raster, 5, 10))).toBe(true);
    expect(pixel(raster, 5, 50)).toEqual(WHITE);
  });

  it('com ellipsis, o corte pela altura vale como maxLines: 2 linhas, a segunda termina em …', () => {
    const node = tall('top', { ellipsis: true }) as TextNode;
    const long: TextNode = {
      ...node,
      width: 100,
      text: 'aaaa bbbb cccc dddd eeee ffff gggg hhhh',
    };
    const lines = plainLines(long, approximateMeasurer, (text) => text.length * 5.5);
    expect(lines.lines).toHaveLength(2);
    expect(lines.lines[1]?.endsWith('…')).toBe(true);
  });

  it('uma caixa de 2,5 linhas também desenha 2', () => {
    const node = { ...(tall('top') as TextNode), height: 50 };
    const lines = plainLines(node, approximateMeasurer, (text) => text.length * 5.5);
    expect(lines.lines).toHaveLength(2);
  });

  it('com ellipsis e altura de linha 0, o medidor não recebe um maxLines infinito', () => {
    const node = tall('top', { ellipsis: true, lineHeight: 0 }) as TextNode;
    const seen: unknown[] = [];
    const spy: typeof approximateMeasurer = (text, font, width) => {
      seen.push((font as { maxLines?: number }).maxLines);
      return approximateMeasurer(text, font, width);
    };
    plainLines(node, spy, (text) => text.length * 5.5);
    expect(seen.length).toBeGreaterThan(0);
    for (const maxLines of seen)
      expect(maxLines === undefined || Number.isFinite(maxLines)).toBe(true);
  });

  it('sem altura (0), todas as linhas', () => {
    const node = { ...(tall('top') as TextNode), height: 0 };
    const lines = plainLines(node, approximateMeasurer, (text) => text.length * 5.5);
    expect(lines.lines).toHaveLength(3);
  });
});
