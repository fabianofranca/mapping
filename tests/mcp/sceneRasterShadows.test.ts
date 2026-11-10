// MF2 no PNG do MCP: a lista de sombras (a primeira por cima), `shadow.spread` (forma, raios e
// negativo) e o contorno com vão arredondado (`stroke.gaps`).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { baseNode, type SceneNode, type Shadow } from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

const solid = (color: string) => ({ type: 'solid' as const, color });
const WHITE = [255, 255, 255, 255];

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}
const pixel = (r: Raster, x: number, y: number): number[] => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};

function paint(raster: Raster, root: SceneNode): void {
  paintScene(raster, [{ root }], approximateMeasurer, {
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    scaleX: 1,
    scaleY: 1,
  });
}

/** Um retângulo de 20×20 em (20,20), sem preenchimento: só a sombra aparece. */
const ghost = (effects: Shadow[], radius = 0): SceneNode => ({
  ...baseNode({ id: 'r', name: 'r', width: 20, height: 20, effects }),
  type: 'rect',
  cornerRadius: radius,
  transform: [1, 0, 0, 1, 20, 20],
});

const sharp = (color: string, spread?: number, x = 0, y = 0): Shadow => ({
  color,
  offset: { x, y },
  blur: 0,
  ...(spread === undefined ? {} : { spread }),
});

describe('shadow.spread no raster', () => {
  it('o spread cresce a forma da sombra em cada lado', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 4)]));
    expect(pixel(raster, 17, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 15, 30)).toEqual(WHITE);
    expect(pixel(raster, 43, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 45, 30)).toEqual(WHITE);
  });

  it('o raio do canto cresce com o spread (canto de raio 4 + 4 = 8)', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 4)], 4));
    // A forma da sombra vai de (16,16) a (44,44): o canto reto estaria em (16,16).
    expect(pixel(raster, 17, 17)).toEqual(WHITE);
    expect(pixel(raster, 24, 24)).toEqual([255, 0, 0, 255]);
  });

  it('o spread negativo encolhe a sombra', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', -4)]));
    expect(pixel(raster, 22, 30)).toEqual(WHITE);
    expect(pixel(raster, 25, 30)).toEqual([255, 0, 0, 255]);
  });

  it('sem spread a sombra é a forma do nó', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', undefined, 2, 0)]));
    expect(pixel(raster, 21, 30)).toEqual(WHITE);
    expect(pixel(raster, 23, 30)).toEqual([255, 0, 0, 255]);
  });
});

describe('lista de sombras no raster', () => {
  it('a primeira sombra da lista fica por cima da segunda', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 4), sharp('#0000ff', 4)]));
    expect(pixel(raster, 17, 30)).toEqual([255, 0, 0, 255]);
  });

  it('as duas aparecem onde não se cobrem', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 2), sharp('#0000ff', 6)]));
    expect(pixel(raster, 19, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 17, 30)).toEqual([0, 0, 255, 255]);
  });
});

describe('contorno com vão (stroke.gaps) no raster', () => {
  const outlined = (): SceneNode => ({
    ...baseNode({ id: 'o', name: 'o', width: 40, height: 24 }),
    type: 'rect',
    cornerRadius: 6,
    transform: [1, 0, 0, 1, 10, 10],
    stroke: {
      paints: [solid('#ff0000')],
      width: 2,
      align: 'center',
      gaps: [{ side: 'top', from: 16, to: 30 }],
    },
  });

  it('o lado de cima some no trecho do vão e fica fora dele', () => {
    const raster = canvas(60, 50);
    paint(raster, outlined());
    expect(pixel(raster, 10 + 22, 10)).toEqual(WHITE); // no vão
    expect(pixel(raster, 10 + 34, 10)).toEqual([255, 0, 0, 255]); // depois do vão
    expect(pixel(raster, 10 + 10, 10)).toEqual([255, 0, 0, 255]); // antes do vão
  });

  it('os quatro cantos seguem o raio e os outros lados ficam inteiros', () => {
    const raster = canvas(60, 50);
    paint(raster, outlined());
    expect(pixel(raster, 10, 10)).toEqual(WHITE); // o canto reto ficaria aqui
    const k = Math.round(6 * (1 - Math.SQRT1_2));
    expect(pixel(raster, 10 + k, 10 + k)[1]).toBeLessThan(200); // o arco passa por aqui
    expect(pixel(raster, 10, 22)).toEqual([255, 0, 0, 255]); // lado esquerdo
    expect(pixel(raster, 49, 22)).toEqual([255, 0, 0, 255]); // lado direito
    expect(pixel(raster, 30, 33)).toEqual([255, 0, 0, 255]); // embaixo
    expect(pixel(raster, 10 + 40 - k - 1, 10 + 24 - k - 1)[1]).toBeLessThan(200); // canto de baixo
  });
});
