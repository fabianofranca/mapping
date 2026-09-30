import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_SIDE,
  addImage,
  chooseOutputFormat,
  createProject,
  extensionForMime,
  pastedFileName,
  placementNear,
  planOutputSize,
  shouldUseEncoded,
} from '../../src/model';

describe('planOutputSize', () => {
  it('reduz o lado maior para 2560 mantendo a proporção', () => {
    expect(planOutputSize({ width: 4000, height: 3000 })).toEqual({
      width: 2560,
      height: 1920,
      resized: true,
    });
    expect(planOutputSize({ width: 3000, height: 6000 })).toEqual({
      width: 1280,
      height: 2560,
      resized: true,
    });
  });
  it('nunca amplia e não marca como reduzida no limite', () => {
    expect(planOutputSize({ width: 800, height: 600 }).resized).toBe(false);
    expect(planOutputSize({ width: MAX_IMAGE_SIDE, height: 10 })).toEqual({
      width: MAX_IMAGE_SIDE,
      height: 10,
      resized: false,
    });
  });
  it('mantém pelo menos 1 px', () => {
    expect(planOutputSize({ width: 100000, height: 1 }).height).toBe(1);
  });
});

describe('chooseOutputFormat', () => {
  it('foto: WebP com perdas, ou JPEG sem WebP', () => {
    expect(chooseOutputFormat({ isPng: false }, true)).toMatchObject({
      mime: 'image/webp',
      quality: 0.85,
      extension: 'webp',
    });
    expect(chooseOutputFormat({ isPng: false }, false)).toMatchObject({
      mime: 'image/jpeg',
      extension: 'jpg',
    });
  });
  it('PNG: WebP sem perdas, ou PNG sem WebP', () => {
    expect(chooseOutputFormat({ isPng: true }, true)).toMatchObject({
      mime: 'image/webp',
      quality: 1,
    });
    expect(chooseOutputFormat({ isPng: true }, false)).toMatchObject({
      mime: 'image/png',
      extension: 'png',
    });
  });
});

describe('shouldUseEncoded', () => {
  const base = { resized: false, needsRotation: false, originalBytes: 100 };
  it('reduzida: sempre usa o recodificado', () => {
    expect(shouldUseEncoded({ ...base, resized: true, encodedBytes: 500 })).toBe(true);
  });
  it('sem redução: só se ficar menor', () => {
    expect(shouldUseEncoded({ ...base, encodedBytes: 99 })).toBe(true);
    expect(shouldUseEncoded({ ...base, encodedBytes: 100 })).toBe(false);
    expect(shouldUseEncoded({ ...base, encodedBytes: 150 })).toBe(false);
  });
  it('foto que precisa girar (EXIF): usa o recodificado mesmo maior', () => {
    expect(shouldUseEncoded({ ...base, needsRotation: true, encodedBytes: 150 })).toBe(
      true,
    );
  });
});

describe('nomes de arquivo', () => {
  it('img-AAAAMMDD-HHMMSS.ext', () => {
    expect(pastedFileName(new Date(2026, 8, 30, 12, 29, 15), 'webp')).toBe(
      'img-20260930-122915.webp',
    );
    expect(pastedFileName(new Date(2026, 0, 2, 3, 4, 5), 'png')).toBe(
      'img-20260102-030405.png',
    );
  });
  it('extensão pelo tipo MIME', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/webp')).toBe('webp');
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('')).toBe('png');
  });
});

describe('placementNear', () => {
  const project = () =>
    createProject({
      name: 'p',
      now: '2026-01-01T00:00:00.000Z',
      firstLayer: { id: 'L', name: 'L', color: '#000' },
    });
  const withImage = () =>
    addImage(project(), { id: 'I1', file: 'images/a.png', width: 1000, height: 1000 });

  it('usa o ponto pedido quando está livre', () => {
    const p = withImage();
    const placement = placementNear(p, { width: 100, height: 100 }, 1, {
      x: 2000,
      y: 300,
    });
    expect(placement).toEqual({ x: 1950, y: 250, scale: 1 });
  });
  it('sobrepondo, vai para o espaço livre mais próximo', () => {
    const p = withImage(); // ocupa 0..1000
    const placement = placementNear(p, { width: 200, height: 200 }, 1, {
      x: 900,
      y: 500,
    });
    // Centro pedido dentro da imagem: o encaixe mais próximo é à direita dela.
    expect(placement.x).toBeGreaterThanOrEqual(1000);
    expect(placement.x >= 1000 || placement.y >= 1000 || placement.x + 200 <= 0).toBe(
      true,
    );
  });
  it('addImage com center posiciona sem sobrepor', () => {
    const p = addImage(withImage(), {
      id: 'I2',
      file: 'images/b.png',
      width: 500,
      height: 500,
      center: { x: 500, y: 500 },
    });
    const [a, b] = p.images;
    const overlap =
      a!.placement.x < b!.placement.x + 500 * b!.placement.scale &&
      b!.placement.x < a!.placement.x + 1000 * a!.placement.scale &&
      a!.placement.y < b!.placement.y + 500 * b!.placement.scale &&
      b!.placement.y < a!.placement.y + 1000 * a!.placement.scale;
    expect(overlap).toBe(false);
  });
});
