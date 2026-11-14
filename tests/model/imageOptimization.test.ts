import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_SIDE,
  addContainer,
  chooseOutputFormat,
  createProject,
  extensionForMime,
  isJpegSource,
  isPngSource,
  pastedFileName,
  placementNear,
  planOutputSize,
  shouldUseEncoded,
  withExtension,
} from '../../src/model';

describe('planOutputSize', () => {
  it('reduces the longer side to 2560 keeping the aspect ratio', () => {
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
  it('never enlarges and does not mark as reduced at the limit', () => {
    expect(planOutputSize({ width: 800, height: 600 }).resized).toBe(false);
    expect(planOutputSize({ width: MAX_IMAGE_SIDE, height: 10 })).toEqual({
      width: MAX_IMAGE_SIDE,
      height: 10,
      resized: false,
    });
  });
  it('keeps at least 1 px', () => {
    expect(planOutputSize({ width: 100000, height: 1 }).height).toBe(1);
  });
});

describe('chooseOutputFormat', () => {
  it('photo: lossy WebP, or JPEG without WebP', () => {
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
  it('PNG: lossless WebP, or PNG without WebP', () => {
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
  it('reduced: always uses the re-encoded one', () => {
    expect(shouldUseEncoded({ ...base, resized: true, encodedBytes: 500 })).toBe(true);
  });
  it('without reduction: only if it ends up smaller', () => {
    expect(shouldUseEncoded({ ...base, encodedBytes: 99 })).toBe(true);
    expect(shouldUseEncoded({ ...base, encodedBytes: 100 })).toBe(false);
    expect(shouldUseEncoded({ ...base, encodedBytes: 150 })).toBe(false);
  });
  it('photo that needs rotating (EXIF): uses the re-encoded one even if larger', () => {
    expect(shouldUseEncoded({ ...base, needsRotation: true, encodedBytes: 150 })).toBe(
      true,
    );
  });
});

describe('file names', () => {
  it('img-YYYYMMDD-HHMMSS.ext', () => {
    expect(pastedFileName(new Date(2026, 8, 30, 12, 29, 15), 'webp')).toBe(
      'img-20260930-122915.webp',
    );
    expect(pastedFileName(new Date(2026, 0, 2, 3, 4, 5), 'png')).toBe(
      'img-20260102-030405.png',
    );
  });
  it('extension by MIME type', () => {
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
    addContainer(project(), {
      id: 'I1',
      file: 'images/a.png',
      width: 1000,
      height: 1000,
    });

  it('uses the requested point when it is free', () => {
    const p = withImage();
    const placement = placementNear(p, { width: 100, height: 100 }, 1, {
      x: 2000,
      y: 300,
    });
    expect(placement).toEqual({ x: 1950, y: 250, scale: 1 });
  });
  it('when overlapping, goes to the nearest free space', () => {
    const p = withImage(); // takes 0..1000
    const placement = placementNear(p, { width: 200, height: 200 }, 1, {
      x: 900,
      y: 500,
    });
    // Requested center inside the image: the nearest fit is to its right.
    expect(placement.x).toBeGreaterThanOrEqual(1000);
    expect(placement.x >= 1000 || placement.y >= 1000 || placement.x + 200 <= 0).toBe(
      true,
    );
  });
  it('addImage with center positions without overlapping', () => {
    const p = addContainer(withImage(), {
      id: 'I2',
      file: 'images/b.png',
      width: 500,
      height: 500,
      center: { x: 500, y: 500 },
    });
    const [a, b] = p.containers;
    const overlap =
      a!.placement.x < b!.placement.x + 500 * b!.placement.scale &&
      b!.placement.x < a!.placement.x + 1000 * a!.placement.scale &&
      a!.placement.y < b!.placement.y + 500 * b!.placement.scale &&
      b!.placement.y < a!.placement.y + 1000 * a!.placement.scale;
    expect(overlap).toBe(false);
  });
});

describe('file names and source', () => {
  it('withExtension replaces or adds the extension', () => {
    expect(withExtension('photo.png', 'webp')).toBe('photo.webp');
    expect(withExtension('a.b.jpeg', 'webp')).toBe('a.b.webp');
    expect(withExtension('noextension', 'webp')).toBe('noextension.webp');
    expect(withExtension('.hidden', 'png')).toBe('.hidden.png');
  });

  it('isPngSource and isJpegSource look at the MIME type and the extension', () => {
    expect(isPngSource({ type: 'image/png', name: 'x' })).toBe(true);
    expect(isPngSource({ type: '', name: 'Print.PNG' })).toBe(true);
    expect(isPngSource({ type: 'image/jpeg', name: 'x.jpg' })).toBe(false);
    expect(isJpegSource({ type: 'image/jpeg', name: 'x' })).toBe(true);
    expect(isJpegSource({ type: '', name: 'photo.JPEG' })).toBe(true);
    expect(isJpegSource({ type: '', name: 'photo.jpg' })).toBe(true);
    expect(isJpegSource({ type: 'image/png', name: 'x.png' })).toBe(false);
  });
});
