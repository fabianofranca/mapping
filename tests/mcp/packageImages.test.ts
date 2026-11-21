import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_TOTAL_BYTES,
  MAX_IMAGE_SIDE,
} from '../../src/model/libraryImages';
import { encodeImage } from '../../mcp/image/codecs';
import {
  PackageImageCache,
  loadPackageImages,
  type PackageImageFile,
} from '../../mcp/image/packageImages';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { encodeJpegWithExif, encodePng, pixelAt, quadrants } from './images';

// DX4 (stage #1903, decision 17): the package images the MCP raster draws. They are decoded with
// the codecs of the server (EXIF orientation applied), cached by stamp (path, size, `mtime`) and
// refused beyond the limits of decision 12, with the placeholder in place and no exception.

let dir: string;
const stamps = new Map<string, number>();

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mapping-package-images-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => stamps.clear());

/** Writes `bytes` to `name` and returns its file stamp as the loader of the project builds it. */
function put(name: string, bytes: Uint8Array, size = bytes.length): PackageImageFile {
  const real = join(dir, name);
  writeFileSync(real, bytes);
  const version = (stamps.get(real) ?? 0) + 1;
  stamps.set(real, version);
  return { real, size, stamp: `${real}:${size}:${version}` };
}

const solid = (width: number, height: number, rgb: number[]): Raster => {
  const raster = createRaster(width, height);
  for (let i = 0; i < width * height; i++) raster.data.set([...rgb, 255], i * 4);
  return raster;
};

describe('PackageImageCache: decoding', () => {
  it('decodes PNG, JPEG and WebP into a raster of the image size', async () => {
    const source = quadrants(16, 8);
    const cache = new PackageImageCache();
    const png = await cache.load(put('a.png', await encodePng(source)), 'a.png');
    const jpeg = await cache.load(
      put('b.jpg', await encodeJpegWithExif(source)),
      'b.jpg',
    );
    const webp = await cache.load(
      put('c.webp', await encodeImage(source, 'webp', { lossless: true })),
      'c.webp',
    );
    for (const result of [png, jpeg, webp]) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect([result.raster.width, result.raster.height]).toEqual([16, 8]);
    }
    if (png.ok) expect(pixelAt(png.raster, 2, 2)).toEqual([255, 0, 0]);
    if (webp.ok) expect(pixelAt(webp.raster, 14, 6)).toEqual([255, 255, 0]);
    if (jpeg.ok) {
      const [r = 0, g = 0, b = 0] = pixelAt(jpeg.raster, 14, 2);
      expect(g).toBeGreaterThan(200);
      expect(r + b).toBeLessThan(60);
    }
  });

  it('applies the EXIF orientation of a JPEG', async () => {
    // 40×20 stored, orientation 6 (rotate 90° clockwise): it is seen as 20×40.
    const bytes = await encodeJpegWithExif(quadrants(40, 20), 6);
    const result = await new PackageImageCache().load(put('r.jpg', bytes), 'r.jpg');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.raster.width, result.raster.height]).toEqual([20, 40]);
    // The stored top-left (red) goes to the top-right after the rotation.
    const [r = 0, g = 255] = pixelAt(result.raster, 18, 2);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
  });

  it('accepts the extension in any case', async () => {
    const file = put('upper.PNG', await encodePng(solid(2, 2, [1, 2, 3])));
    expect((await new PackageImageCache().load(file, 'upper.PNG')).ok).toBe(true);
  });
});

describe('PackageImageCache: cache by stamp', () => {
  it('returns the same decoded image while the stamp holds', async () => {
    const cache = new PackageImageCache();
    const file = put('same.png', await encodePng(solid(4, 4, [10, 20, 30])));
    const first = await cache.load(file, 'same.png');
    // Even if the file changes on disk, the same stamp is the same image.
    writeFileSync(file.real, await encodePng(solid(4, 4, [200, 0, 0])));
    const second = await cache.load(file, 'same.png');
    expect(second).toBe(first);
  });

  it('drops an image whose stamp changes and decodes the new file', async () => {
    const cache = new PackageImageCache();
    const before = put('swap.png', await encodePng(solid(4, 4, [10, 20, 30])));
    const first = await cache.load(before, 'swap.png');
    const after = put('swap.png', await encodePng(solid(4, 4, [200, 0, 0])));
    expect(after.stamp).not.toBe(before.stamp);
    const second = await cache.load(after, 'swap.png');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(pixelAt(first.raster, 0, 0)).toEqual([10, 20, 30]);
    expect(pixelAt(second.raster, 0, 0)).toEqual([200, 0, 0]);
    // The old stamp's entry left the cache: its decoded bytes are not held twice.
    expect(cache.entries).toBe(1);
  });

  it('keeps the decoded bytes bounded, the oldest image leaving first', async () => {
    // Each 16×16 image is 1,024 decoded bytes: the cache holds two of them.
    const cache = new PackageImageCache(2 * 16 * 16 * 4);
    const files = await Promise.all(
      [0, 1, 2].map(async (i) =>
        put(`lru${i}.png`, await encodePng(solid(16, 16, [i, 0, 0]))),
      ),
    );
    for (const [i, file] of files.entries()) await cache.load(file, `lru${i}.png`);
    expect(cache.entries).toBe(2);
    expect(cache.bytes).toBeLessThanOrEqual(2 * 16 * 16 * 4);
    const again = await cache.load(files[2]!, 'lru2.png');
    expect(again.ok).toBe(true);
    expect(cache.entries).toBe(2);
  });
});

describe('PackageImageCache: what it refuses (the placeholder, never an exception)', () => {
  it('refuses a corrupt file', async () => {
    const file = put('corrupt.png', Buffer.from('this is not a png at all'));
    const result = await new PackageImageCache().load(file, 'corrupt.png');
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('PNG') });
  });

  it('refuses a truncated file whose header is valid', async () => {
    const png = await encodePng(solid(32, 32, [9, 9, 9]));
    const file = put('cut.png', png.subarray(0, 40));
    const result = await new PackageImageCache().load(file, 'cut.png');
    expect(result.ok).toBe(false);
  });

  it('refuses a file whose content is not the format of its extension', async () => {
    const file = put('png-as.jpg', await encodePng(solid(2, 2, [0, 0, 0])));
    const result = await new PackageImageCache().load(file, 'png-as.jpg');
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('JPEG') });
  });

  it('refuses a file larger than 1 MB by its size, without reading it', async () => {
    const file: PackageImageFile = {
      real: join(dir, 'does-not-exist.png'),
      size: MAX_IMAGE_BYTES + 1,
      stamp: 'big',
    };
    const result = await new PackageImageCache().load(file, 'big.png');
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('1 MB') });
  });

  it('refuses an image larger than 2048 px on a side, by the header', async () => {
    const wide = createRaster(MAX_IMAGE_SIDE + 1, 1);
    const file = put('wide.png', await encodePng(wide));
    const result = await new PackageImageCache().load(file, 'wide.png');
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('2048') });
  });

  it('refuses a file that cannot be read', async () => {
    const file: PackageImageFile = {
      real: join(dir, 'gone.png'),
      size: 10,
      stamp: 'gone',
    };
    const result = await new PackageImageCache().load(file, 'gone.png');
    expect(result.ok).toBe(false);
  });

  it('remembers a refusal by stamp', async () => {
    const cache = new PackageImageCache();
    const file = put('again.png', Buffer.from('nope'));
    const first = await cache.load(file, 'again.png');
    const second = await cache.load(file, 'again.png');
    expect(second).toBe(first);
  });
});

describe('loadPackageImages', () => {
  it('hands the decoded images by specialization and path, and the placeholder for the rest', async () => {
    const cache = new PackageImageCache();
    const good = put('ok.png', await encodePng(solid(3, 3, [5, 6, 7])));
    const bad = put('bad.png', Buffer.from('broken'));
    const images = await loadPackageImages(
      [
        { specId: 'lib', asset: 'images/ok.png', file: good },
        { specId: 'lib', asset: 'images/bad.png', file: bad },
        { specId: 'lib', asset: 'images/missing.png', file: null },
      ],
      cache,
    );
    expect(images.get('lib', 'images/ok.png')?.width).toBe(3);
    expect(images.get('lib', 'images/bad.png')).toBeUndefined();
    expect(images.get('lib', 'images/missing.png')).toBeUndefined();
    expect(images.get('other', 'images/ok.png')).toBeUndefined();
    expect(images.notes).toHaveLength(2);
    expect(images.notes.join('\n')).toContain('images/bad.png');
    expect(images.notes.join('\n')).toContain('images/missing.png');
  });

  it('decodes a file cited by two specializations once per path', async () => {
    const cache = new PackageImageCache();
    const file = put('shared.png', await encodePng(solid(2, 2, [1, 1, 1])));
    const images = await loadPackageImages(
      [
        { specId: 'a', asset: 'shared.png', file },
        { specId: 'b', asset: 'shared.png', file },
      ],
      cache,
    );
    expect(images.get('a', 'shared.png')).toBe(images.get('b', 'shared.png'));
    expect(cache.entries).toBe(1);
  });

  it('refuses the images beyond 8 MB in all, in the order they are cited', async () => {
    const cache = new PackageImageCache();
    const tiny = await encodePng(solid(1, 1, [1, 2, 3]));
    // Eight files of 1,000,000 bytes (as the stat says) fit in 8 MiB; the ninth does not.
    const per = 1_000_000;
    expect(per * 8).toBeLessThanOrEqual(MAX_IMAGES_TOTAL_BYTES);
    expect(per * 9).toBeGreaterThan(MAX_IMAGES_TOTAL_BYTES);
    const needs = Array.from({ length: 9 }, (_, i) => ({
      specId: 'lib',
      asset: `images/${i}.png`,
      file: put(`total${i}.png`, tiny, per),
    }));
    const images = await loadPackageImages(needs, cache);
    for (let i = 0; i < 8; i++)
      expect(images.get('lib', `images/${i}.png`)).toBeDefined();
    expect(images.get('lib', 'images/8.png')).toBeUndefined();
    expect(images.notes.join('\n')).toContain('8 MB');
  });

  it('counts the bytes of a file cited many times once', async () => {
    const cache = new PackageImageCache();
    const tiny = await encodePng(solid(1, 1, [1, 2, 3]));
    const file = put('once.png', tiny, 1_000_000);
    // Nine paths of one file: 9,000,000 bytes if each citation counted, 1,000,000 once.
    const needs = Array.from({ length: 9 }, (_, i) => ({
      specId: 'lib',
      asset: `images/alias${i}.png`,
      file,
    }));
    const images = await loadPackageImages(needs, cache);
    expect(images.notes).toEqual([]);
    expect(images.get('lib', 'images/alias8.png')).toBeDefined();
  });
});
