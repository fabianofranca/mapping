// Package images in the app (stage #1903, decision 18): the bytes of a cited file are decoded with
// `createImageBitmap(new Blob([bytes]))`, with no URL and no `<img>`; a bounded LRU cache keeps the
// decoded bitmaps and the limits of decision 12 hold on what is read.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PACKAGE_IMAGE_LIMITS,
  createPackageImages,
  packageImageKey,
  type DecodedPackageImage,
  type PackageImageView,
} from '../../src/storage/packageImages';
import { padTo, pngBytes } from '../support/imageBytes';

const buffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

interface Fake {
  readonly width: number;
  readonly height: number;
  close: ReturnType<typeof vi.fn>;
}

const fake = (width: number, height: number): Fake => ({
  width,
  height,
  close: vi.fn(),
});
const asImage = (bitmap: Fake): DecodedPackageImage =>
  bitmap as unknown as DecodedPackageImage;

/** Resolves once the reads and decodes in flight have finished. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const PNG = buffer(pngBytes(8, 4));

function setup(
  options: {
    files?: Record<string, ArrayBuffer | null>;
    cacheBytes?: number;
    concurrency?: number;
  } = {},
) {
  const files = options.files ?? { 'images/logo.png': PNG };
  const read = vi.fn((_spec: string, asset: string) =>
    Promise.resolve(files[asset] ?? null),
  );
  const decode = vi.fn(() => Promise.resolve(asImage(fake(8, 4))));
  const images = createPackageImages({
    read,
    decode,
    ...(options.cacheBytes === undefined ? {} : { cacheBytes: options.cacheBytes }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
  return { images, read, decode };
}

const ready = (view: PackageImageView) => {
  if (view.state !== 'ready') throw new Error(`not ready: ${view.state}`);
  return view;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createPackageImages', () => {
  it('is loading at first, then ready with the decoded size; it notifies the key once', async () => {
    const { images, read, decode } = setup();
    const heard: string[] = [];
    images.subscribe((key) => heard.push(key));
    expect(images.resolve('lib', 'images/logo.png')).toEqual({ state: 'loading' });
    expect(images.resolve('lib', 'images/logo.png')).toEqual({ state: 'loading' });
    await settle();
    const view = ready(images.resolve('lib', 'images/logo.png'));
    expect([view.width, view.height]).toEqual([8, 4]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([packageImageKey('lib', 'images/logo.png')]);
  });

  it('decodes with createImageBitmap(new Blob([bytes]), { imageOrientation: "from-image" }) and no URL', async () => {
    const bitmap = fake(8, 4);
    const create = vi.fn(() => Promise.resolve(bitmap));
    vi.stubGlobal('createImageBitmap', create);
    const objectUrl = vi.fn(() => 'blob:x');
    vi.spyOn(URL, 'createObjectURL').mockImplementation(objectUrl);
    const images = createPackageImages({
      read: () => Promise.resolve(PNG),
    });
    images.resolve('lib', 'images/logo.png');
    await settle();
    expect(create).toHaveBeenCalledTimes(1);
    const [source, init] = create.mock.calls[0] as unknown as [
      unknown,
      { imageOrientation: string },
    ];
    expect(source).toBeInstanceOf(Blob);
    expect(init).toEqual({ imageOrientation: 'from-image' });
    expect(objectUrl).not.toHaveBeenCalled();
    expect(ready(images.resolve('lib', 'images/logo.png')).image).toBe(bitmap);
  });

  it('a missing file is a failure, and so is one the decoder rejects', async () => {
    const { images, decode } = setup({ files: { 'images/logo.png': null } });
    images.resolve('lib', 'images/logo.png');
    await settle();
    expect(images.resolve('lib', 'images/logo.png')).toEqual({
      state: 'failed',
      reason: 'missing',
    });
    expect(decode).not.toHaveBeenCalled();

    const broken = setup();
    broken.decode.mockRejectedValue(new Error('bad data'));
    broken.images.resolve('lib', 'images/logo.png');
    await settle();
    expect(broken.images.resolve('lib', 'images/logo.png')).toEqual({
      state: 'failed',
      reason: 'decode',
    });
  });

  it('refuses, without decoding, what the validator refuses: size, dimensions, content', async () => {
    const { images, decode } = setup({
      files: {
        'images/heavy.png': buffer(pngBytes(8, 4, 1024 * 1024 + 1)),
        'images/wide.png': buffer(pngBytes(2049, 10)),
        'images/fake.png': buffer(padTo(Uint8Array.from([1, 2, 3, 4]), 64)),
      },
    });
    for (const asset of ['images/heavy.png', 'images/wide.png', 'images/fake.png']) {
      images.resolve('lib', asset);
    }
    await settle();
    for (const asset of ['images/heavy.png', 'images/wide.png', 'images/fake.png']) {
      expect(images.resolve('lib', asset)).toEqual({
        state: 'failed',
        reason: 'refused',
      });
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it('keeps the decoded bytes under the limit: the least recently used leaves first', async () => {
    // Each bitmap is 8 x 4 x 4 = 128 bytes; the cache holds two.
    const files = Object.fromEntries(
      ['a', 'b', 'c'].map((n) => [`images/${n}.png`, PNG] as const),
    );
    const { images, read } = setup({ files, cacheBytes: 300 });
    for (const n of ['a', 'b']) images.resolve('lib', `images/${n}.png`);
    await settle();
    expect(images.size).toBe(2);
    // `a` is used again: `b` is now the oldest.
    ready(images.resolve('lib', 'images/a.png'));
    images.resolve('lib', 'images/c.png');
    await settle();
    expect(images.size).toBe(2);
    expect(images.bytes).toBe(256);
    expect(images.resolve('lib', 'images/a.png').state).toBe('ready');
    expect(images.resolve('lib', 'images/b.png').state).toBe('loading');
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('reads and decodes at most `concurrency` files at a time', async () => {
    let running = 0;
    let peak = 0;
    const read = vi.fn(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return PNG;
    });
    const images = createPackageImages({
      read,
      decode: () => Promise.resolve(asImage(fake(8, 4))),
      concurrency: 2,
    });
    for (let i = 0; i < 6; i++) images.resolve('lib', `images/${i}.png`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(read).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
    expect(PACKAGE_IMAGE_LIMITS.concurrency).toBeGreaterThan(1);
  });

  it('drop(spec) frees that library bitmaps (without closing what a drawing may hold) and keeps the others', async () => {
    const bitmaps: Fake[] = [];
    const read = vi.fn(() => Promise.resolve(PNG));
    const decode = vi.fn(() => {
      const bitmap = fake(8, 4);
      bitmaps.push(bitmap);
      return Promise.resolve(asImage(bitmap));
    });
    const images = createPackageImages({ read, decode });
    images.resolve('one', 'images/logo.png');
    images.resolve('two', 'images/logo.png');
    await settle();
    expect(images.size).toBe(2);
    images.drop('one');
    expect(images.size).toBe(1);
    expect(bitmaps[0]?.close).not.toHaveBeenCalled();
    expect(bitmaps[1]?.close).not.toHaveBeenCalled();
    expect(images.resolve('one', 'images/logo.png')).toEqual({ state: 'loading' });
    images.clear();
    expect(images.size).toBe(0);
    expect(bitmaps[1]?.close).not.toHaveBeenCalled();
  });

  it('never closes a bitmap it handed out: a mounted drawing may hold it for as long as it lives', async () => {
    const bitmap = fake(8, 4);
    const images = createPackageImages({
      read: () => Promise.resolve(PNG),
      decode: () => Promise.resolve(asImage(bitmap)),
    });
    images.resolve('lib', 'images/logo.png');
    await settle();
    vi.useFakeTimers();
    images.clear();
    vi.advanceTimersByTime(60_000);
    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it('trim keeps an image that is still loading: its result must reach the drawing', async () => {
    // `a` and `b` are ready and fill the cache; `c` is still reading when `b` finishes a second
    // image over the limit, which must not take `c` (nothing to free) out from under its load.
    let finishSlow: (value: ArrayBuffer) => void = () => undefined;
    const read = vi.fn((_spec: string, asset: string) =>
      asset === 'images/slow.png'
        ? new Promise<ArrayBuffer>((resolve) => (finishSlow = resolve))
        : Promise.resolve(PNG),
    );
    const images = createPackageImages({
      read,
      decode: () => Promise.resolve(asImage(fake(8, 4))),
      cacheBytes: 100,
      concurrency: 4,
    });
    const heard = vi.fn();
    images.subscribe(heard);
    images.resolve('lib', 'images/slow.png');
    images.resolve('lib', 'images/a.png');
    await settle();
    // `a` is over the limit by itself (128 > 100) and only `slow` (loading) is older than it.
    expect(images.resolve('lib', 'images/slow.png')).toEqual({ state: 'loading' });
    finishSlow(PNG);
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(heard).toHaveBeenCalledWith(packageImageKey('lib', 'images/slow.png'));
    expect(images.resolve('lib', 'images/slow.png').state).toBe('ready');
  });

  it('a result that arrives after the library was dropped is discarded and closed', async () => {
    let finish: (value: ArrayBuffer) => void = () => undefined;
    const bitmap = fake(8, 4);
    const images = createPackageImages({
      read: () => new Promise<ArrayBuffer>((resolve) => (finish = resolve)),
      decode: () => Promise.resolve(asImage(bitmap)),
    });
    const heard = vi.fn();
    images.subscribe(heard);
    images.resolve('lib', 'images/logo.png');
    images.drop('lib');
    finish(PNG);
    await settle();
    expect(images.size).toBe(0);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(heard).not.toHaveBeenCalled();
  });
});
