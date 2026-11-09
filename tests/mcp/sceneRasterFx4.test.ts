// FX4 no PNG do MCP: stroke.offset, wrap "none" cortado por pixel e quatro sides (decisões 17, 19 e 21).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import {
  baseNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

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
  it('é o contorno inteiro com raio, igual ao sides ausente', () => {
    const all = canvas(40, 40);
    paint(
      all,
      rect(
        {
          paints: [solid(INK)],
          width: 2,
          align: 'inside',
          sides: ['top', 'right', 'bottom', 'left'],
        },
        8,
      ),
    );
    const none = canvas(40, 40);
    paint(none, rect({ paints: [solid(INK)], width: 2, align: 'inside' }, 8));
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
