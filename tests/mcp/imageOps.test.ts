import { describe, expect, it } from 'vitest';
import { decodeImage, encodeImage } from '../../mcp/image/codecs';
import { compose } from '../../mcp/image/compose';
import { detectFormat, readSize } from '../../mcp/image/formats';
import {
  clampRect,
  createRaster,
  crop,
  fitSize,
  flattenOnWhite,
  outlineRect,
  resize,
  type Raster,
} from '../../mcp/image/raster';
import { distance, patternRaster, pixel } from './imageFixtures';

function solid(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Raster {
  const r = createRaster(width, height);
  for (let i = 0; i < r.data.length; i += 4) r.data.set(rgba, i);
  return r;
}

describe('raster', () => {
  it('clampRect limita às bordas e devolve null fora da imagem', () => {
    const bounds = { width: 100, height: 50 };
    expect(clampRect({ x: -10, y: -5, width: 30, height: 20 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 15,
    });
    expect(clampRect({ x: 90, y: 40, width: 50, height: 50 }, bounds)).toEqual({
      x: 90,
      y: 40,
      width: 10,
      height: 10,
    });
    expect(clampRect({ x: 0.5, y: 0.5, width: 1, height: 1 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(clampRect({ x: 100, y: 0, width: 10, height: 10 }, bounds)).toBeNull();
  });

  it('fitSize reduz o lado maior, nunca amplia e nunca zera um lado', () => {
    expect(fitSize(3000, 2000, 1500)).toEqual({ width: 1500, height: 1000, scale: 0.5 });
    expect(fitSize(100, 50, 1568)).toEqual({ width: 100, height: 50, scale: 1 });
    expect(fitSize(4000, 2, 100)).toMatchObject({ width: 100, height: 1 });
  });

  it('crop copia exatamente a região', () => {
    const source = patternRaster(20, 10, []);
    const cut = crop(source, { x: 5, y: 3, width: 4, height: 2 });
    expect([cut.width, cut.height]).toEqual([4, 2]);
    expect(pixel(cut, 0, 0)).toEqual(pixel(source, 5, 3));
    expect(pixel(cut, 3, 1)).toEqual(pixel(source, 8, 4));
  });

  it('resize faz a média da área (cor sólida continua sólida; 2×2 → 1×1 é a média)', () => {
    const flat = resize(solid(37, 23, [10, 200, 30, 255]), 11, 7);
    expect([flat.width, flat.height]).toEqual([11, 7]);
    for (const [x, y] of [
      [0, 0],
      [10, 6],
      [5, 3],
    ] as const) {
      expect(pixel(flat, x, y)).toEqual([10, 200, 30, 255]);
    }
    const four = createRaster(2, 2);
    four.data.set([
      0, 0, 0, 255, 100, 100, 100, 255, 100, 100, 100, 255, 200, 200, 200, 255,
    ]);
    expect(pixel(resize(four, 1, 1), 0, 0)).toEqual([100, 100, 100, 255]);
  });

  it('resize pondera a cor pela opacidade (transparente não escurece a borda)', () => {
    const two = createRaster(2, 1);
    two.data.set([255, 0, 0, 255, 0, 0, 0, 0]);
    const one = resize(two, 1, 1);
    // Metade vermelho opaco, metade transparente: vermelho com ~50% de opacidade.
    expect(pixel(one, 0, 0)).toEqual([255, 0, 0, 128]);
  });

  it('resize com razões não inteiras cobre a imagem toda', () => {
    const r = resize(patternRaster(100, 100, []), 33, 33);
    expect(pixel(r, 0, 0)[0]).toBeLessThan(5);
    expect(pixel(r, 32, 0)[0]).toBeGreaterThan(250);
    expect(pixel(r, 0, 32)[1]).toBeGreaterThan(250);
  });

  it('outlineRect desenha a linha por dentro, com halo escuro, e recorta nas bordas', () => {
    const r = solid(20, 20, [255, 255, 255, 255]);
    outlineRect(r, { x: 5, y: 5, width: 10, height: 10 }, [255, 0, 0], 2);
    expect(pixel(r, 5, 10)).toEqual([255, 0, 0, 255]);
    expect(pixel(r, 6, 10)).toEqual([255, 0, 0, 255]);
    expect(pixel(r, 4, 10)).toEqual([0, 0, 0, 255]); // halo por fora
    expect(pixel(r, 7, 10)).toEqual([0, 0, 0, 255]); // halo por dentro
    expect(pixel(r, 10, 10)).toEqual([255, 255, 255, 255]); // miolo intacto
    // Contorno que passa das bordas não estoura o raster.
    expect(() =>
      outlineRect(r, { x: -3, y: -3, width: 40, height: 40 }, [0, 255, 0]),
    ).not.toThrow();
  });

  it('flattenOnWhite funde a transparência sobre branco', () => {
    const r = createRaster(1, 1);
    r.data.set([0, 0, 0, 0]);
    expect(pixel(flattenOnWhite(r), 0, 0)).toEqual([255, 255, 255, 255]);
  });
});

describe('compose', () => {
  it('não altera o raster de origem ao desenhar contornos', () => {
    const source = solid(50, 50, [9, 9, 9, 255]);
    const before = new Uint8ClampedArray(source.data);
    compose(
      source,
      { x: 0, y: 0, width: 50, height: 50 },
      [{ rect: { x: 5, y: 5, width: 20, height: 20 }, color: '#FF0000' }],
      1000,
    );
    expect(source.data).toEqual(before);
  });

  it('mapeia os contornos para a escala da saída', () => {
    const source = solid(400, 200, [9, 9, 9, 255]);
    const out = compose(
      source,
      { x: 100, y: 50, width: 200, height: 100 },
      [{ rect: { x: 100, y: 50, width: 200, height: 100 }, color: '#00FF00' }],
      100,
    );
    expect(out.scale).toBe(0.5);
    expect([out.raster.width, out.raster.height]).toEqual([100, 50]);
    expect(out.outlines[0]!.output).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('recusa região fora da imagem', () => {
    expect(() =>
      compose(
        solid(10, 10, [0, 0, 0, 255]),
        { x: 20, y: 20, width: 5, height: 5 },
        [],
        100,
      ),
    ).toThrow();
  });
});

describe('formatos e codecs', () => {
  it('detecta o formato pelos primeiros bytes', async () => {
    const raster = patternRaster(30, 20, []);
    expect(detectFormat(await encodeImage(raster, 'png'))).toBe('png');
    expect(detectFormat(await encodeImage(raster, 'jpeg'))).toBe('jpeg');
    expect(detectFormat(await encodeImage(raster, 'webp'))).toBe('webp');
    expect(detectFormat(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(detectFormat(new Uint8Array(0))).toBeNull();
  });

  it.each(['png', 'jpeg', 'webp'] as const)(
    'lê as dimensões de %s pelo cabeçalho, sem decodificar',
    async (format) => {
      for (const [w, h] of [
        [30, 20],
        [1, 1],
        [257, 129],
      ] as const) {
        const bytes = await encodeImage(patternRaster(w, h, []), format);
        expect(readSize(bytes, format)).toEqual({ width: w, height: h });
      }
    },
  );

  it('cabeçalhos truncados ou inválidos viram null', () => {
    expect(readSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'png')).toBeNull();
    expect(readSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'jpeg')).toBeNull();
    expect(readSize(new Uint8Array(40), 'webp')).toBeNull();
  });

  it('PNG e WebP sem perdas preservam os pixels (inclusive a transparência)', async () => {
    const r = patternRaster(16, 16, []);
    r.data.set([12, 34, 56, 128], 0);
    const png = (await decodeImage(await encodeImage(r, 'png'))).raster;
    expect(pixel(png, 0, 0)).toEqual([12, 34, 56, 128]);
    expect(pixel(png, 7, 9)).toEqual(pixel(r, 7, 9));
    const webp = (await decodeImage(await encodeImage(r, 'webp', { lossless: true })))
      .raster;
    expect(distance(pixel(webp, 7, 9), pixel(r, 7, 9))).toBe(0);
    expect(pixel(webp, 0, 0)[3]).toBe(128);
  });

  it('JPEG perde pouco e funde a transparência sobre branco', async () => {
    const clear = solid(16, 16, [0, 0, 0, 0]);
    const decoded = (await decodeImage(await encodeImage(clear, 'jpeg'))).raster;
    expect(distance(pixel(decoded, 8, 8), [255, 255, 255])).toBeLessThanOrEqual(2);
  });

  it('decodeImage recusa o que não é imagem, arquivo truncado e pixels demais', async () => {
    await expect(
      decodeImage(new TextEncoder().encode('texto qualquer')),
    ).rejects.toMatchObject({ code: 'unsupported-image' });
    const png = await encodeImage(patternRaster(40, 40, []), 'png');
    await expect(decodeImage(png.slice(0, 40))).rejects.toMatchObject({
      code: 'invalid-image',
    });
    const huge = png.slice();
    new DataView(huge.buffer).setUint32(16, 20_000);
    new DataView(huge.buffer).setUint32(20, 20_000);
    await expect(decodeImage(huge)).rejects.toMatchObject({ code: 'image-too-large' });
  });
});
