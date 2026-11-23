import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CROP_MAX_SIDE, cropToPng } from '../../src/storage/imageCrop';

// `createImageBitmap` and the canvas do not exist in jsdom: both are mocked, and the test reads
// the size the crop asked the canvas for.

let sizes: { width: number; height: number }[];

beforeEach(() => {
  sizes = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close: vi.fn() })),
  );
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return create(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn(), imageSmoothingQuality: 'low' }),
      toBlob: (cb: (b: Blob | null) => void) => {
        sizes.push({ width: canvas.width, height: canvas.height });
        cb(new Blob(['png'], { type: 'image/png' }));
      },
    };
    return canvas as unknown as HTMLCanvasElement;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const rect = { x: 0, y: 0, width: 3000, height: 1500 };

describe('cropToPng', () => {
  it('reduces to CROP_MAX_SIDE by default', async () => {
    await cropToPng(new Blob(['x']), rect);
    expect(sizes).toEqual([{ width: CROP_MAX_SIDE, height: 1024 }]);
  });

  it('null keeps the full size of the rect', async () => {
    await cropToPng(new Blob(['x']), rect, null);
    expect(sizes).toEqual([{ width: 3000, height: 1500 }]);
  });

  it('a number is the longer side limit', async () => {
    await cropToPng(new Blob(['x']), rect, 1000);
    expect(sizes).toEqual([{ width: 1000, height: 500 }]);
  });
});
