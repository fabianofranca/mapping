import { describe, expect, it } from 'vitest';
import { decodeImage } from '../../mcp/image/codecs';
import { detectFormat } from '../../mcp/image/formats';
import { prepareImage } from '../../mcp/imagePrepare';
import { orient } from '../../mcp/image/orientation';
import { ToolError } from '../../mcp/errors';
import {
  encodeJpegWithExif,
  encodePng,
  encodeWebpFixture,
  pixelAt,
  quadrants,
  webpSize,
} from './images';

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];

describe('orientação EXIF', () => {
  it('orient aplica as 8 orientações EXIF (cantos da imagem de quadrantes)', () => {
    // Original 4×2: vermelho e verde em cima, azul e amarelo embaixo.
    const source = quadrants(4, 2);
    const corners = (o: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => {
      const p = orient(source, o);
      return {
        size: [p.width, p.height],
        topLeft: pixelAt(p, 0, 0),
        topRight: pixelAt(p, p.width - 1, 0),
        bottomLeft: pixelAt(p, 0, p.height - 1),
      };
    };
    expect(corners(1)).toEqual({
      size: [4, 2],
      topLeft: RED,
      topRight: GREEN,
      bottomLeft: BLUE,
    });
    expect(corners(2)).toEqual({
      size: [4, 2],
      topLeft: GREEN,
      topRight: RED,
      bottomLeft: YELLOW,
    });
    expect(corners(3)).toEqual({
      size: [4, 2],
      topLeft: YELLOW,
      topRight: BLUE,
      bottomLeft: GREEN,
    });
    expect(corners(4)).toEqual({
      size: [4, 2],
      topLeft: BLUE,
      topRight: YELLOW,
      bottomLeft: RED,
    });
    expect(corners(5)).toEqual({
      size: [2, 4],
      topLeft: RED,
      topRight: BLUE,
      bottomLeft: GREEN,
    });
    // 6: girar 90° no sentido horário.
    expect(corners(6)).toEqual({
      size: [2, 4],
      topLeft: BLUE,
      topRight: RED,
      bottomLeft: YELLOW,
    });
    expect(corners(7)).toEqual({
      size: [2, 4],
      topLeft: YELLOW,
      topRight: GREEN,
      bottomLeft: BLUE,
    });
    // 8: girar 90° no sentido anti-horário.
    expect(corners(8)).toEqual({
      size: [2, 4],
      topLeft: GREEN,
      topRight: YELLOW,
      bottomLeft: RED,
    });
  });
});

describe('decodeImage', () => {
  it('aplica a orientação EXIF do JPEG (as coordenadas das marcações são da imagem girada)', async () => {
    const plain = await decodeImage(await encodeJpegWithExif(quadrants(300, 200)));
    expect([plain.raster.width, plain.raster.height, plain.orientation]).toEqual([
      300, 200, 1,
    ]);
    const rotated = await decodeImage(await encodeJpegWithExif(quadrants(300, 200), 6));
    expect([rotated.raster.width, rotated.raster.height, rotated.orientation]).toEqual([
      200, 300, 6,
    ]);
    // Girada no sentido horário: o canto de cima à esquerda era o de baixo à esquerda (azul).
    const [r, g, b] = pixelAt(rotated.raster, 10, 10);
    expect(b).toBeGreaterThan(200);
    expect(r! + g!).toBeLessThan(60);
  });

  it('lê um Buffer do pool do Node (o slice de um Buffer não copia)', async () => {
    const png = await encodePng(quadrants(8, 8));
    // Buffer pequeno: fica no pool compartilhado, com outros bytes antes e depois.
    const pooled = Buffer.from(png);
    expect(pooled.buffer.byteLength).toBeGreaterThan(pooled.byteLength);
    const { raster } = await decodeImage(pooled);
    expect([raster.width, raster.height]).toEqual([8, 8]);
  });
});

describe('prepareImage (as decisões de otimização da app)', () => {
  it('PNG vira WebP sem perdas com os mesmos pixels', async () => {
    const source = quadrants(64, 32);
    const result = await prepareImage(await encodePng(source), 'tela.png');
    expect(result).toMatchObject({
      name: 'tela.webp',
      width: 64,
      height: 32,
      optimized: true,
    });
    expect(detectFormat(result.data)).toBe('webp');
    const { raster: back } = await decodeImage(result.data);
    expect(Buffer.from(back.data).equals(Buffer.from(source.data))).toBe(true);
  });

  it('reduz o lado maior a 2560 px', async () => {
    const result = await prepareImage(
      await encodePng(quadrants(3000, 1000)),
      'larga.png',
    );
    expect([result.width, result.height]).toEqual([2560, 853]);
    expect(result.original).toEqual({ width: 3000, height: 1000 });
    expect(webpSize(result.data)).toEqual({ width: 2560, height: 853 });
  });

  it('JPEG com orientação EXIF 6 é girado (largura e altura trocam) e recodificado', async () => {
    const jpeg = await encodeJpegWithExif(quadrants(300, 200), 6);
    const result = await prepareImage(jpeg, 'foto.jpg');
    expect(result).toMatchObject({
      name: 'foto.webp',
      width: 200,
      height: 300,
      optimized: true,
    });
    const { raster: back } = await decodeImage(result.data);
    // Girada no sentido horário: o canto de cima à esquerda era o de baixo à esquerda (azul).
    const [r, g, b] = pixelAt(back, 10, 10);
    expect(b).toBeGreaterThan(200);
    expect(r! + g!).toBeLessThan(60);
  });

  it('sem redução nem rotação, guarda o original se o WebP não ficar menor', async () => {
    const tiny = await encodeWebpFixture(quadrants(16, 16), 0.1);
    const result = await prepareImage(tiny, 'mini.webp');
    if (result.optimized) {
      expect(result.data.byteLength).toBeLessThan(tiny.byteLength);
    } else {
      expect(result).toMatchObject({ name: 'mini.webp', width: 16, height: 16 });
      expect(Buffer.from(result.data).equals(tiny)).toBe(true);
    }
  });

  it('recusa o que não é PNG, JPEG nem WebP', async () => {
    const gif = Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'binary');
    await expect(prepareImage(gif, 'a.gif')).rejects.toBeInstanceOf(ToolError);
    await expect(prepareImage(gif, 'a.gif')).rejects.toMatchObject({
      code: 'unsupported-image',
    });
    const broken = (await encodePng(quadrants(4, 4))).subarray(0, 40);
    await expect(prepareImage(broken, 'quebrado.png')).rejects.toMatchObject({
      code: 'invalid-image',
    });
  });
});
