// Embedded images (`data:`): the loader keeps the element per URL (limited cache), does not
// re-decode at every draw and notifies through an epoch when one finishes loading.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMBEDDED_IMAGE_CACHE_ENTRIES,
  cachedEmbeddedImage,
  clearEmbeddedImages,
  embeddedImageEpoch,
  loadEmbeddedImage,
} from '../../../src/canvas/components/imageLoader';

class FakeImage {
  static instances: FakeImage[] = [];
  naturalWidth = 80;
  naturalHeight = 40;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.instances.push(this);
  }
}

let original: typeof Image;
beforeEach(() => {
  original = globalThis.Image;
  FakeImage.instances = [];
  globalThis.Image = FakeImage as unknown as typeof Image;
  clearEmbeddedImages();
});
afterEach(() => {
  globalThis.Image = original;
});

const src = (n: number) => `data:image/png;base64,${n}`;

describe('loadEmbeddedImage', () => {
  it('only accepts data:', () => {
    expect(loadEmbeddedImage('https://x/a.png', { onLoad: () => undefined })).toBeNull();
    expect(FakeImage.instances).toHaveLength(0);
  });

  it('keeps the loaded image per URL: the second request does not create an Image', () => {
    const first: HTMLImageElement[] = [];
    loadEmbeddedImage(src(1), { onLoad: (el) => first.push(el) });
    expect(cachedEmbeddedImage(src(1))).toBeUndefined();
    FakeImage.instances[0]?.onload?.();
    expect(first).toHaveLength(1);
    expect(cachedEmbeddedImage(src(1))).toBe(first[0]);
    loadEmbeddedImage(src(1), { onLoad: () => undefined });
    expect(FakeImage.instances).toHaveLength(1);
  });

  it('requests while loading share the same Image and all are notified', () => {
    let heard = 0;
    loadEmbeddedImage(src(2), { onLoad: () => (heard += 1) });
    loadEmbeddedImage(src(2), { onLoad: () => (heard += 1) });
    expect(FakeImage.instances).toHaveLength(1);
    FakeImage.instances[0]?.onload?.();
    expect(heard).toBe(2);
  });

  it('the epoch goes up when an image finishes loading', () => {
    const before = embeddedImageEpoch.value;
    loadEmbeddedImage(src(3), { onLoad: () => undefined });
    expect(embeddedImageEpoch.value).toBe(before);
    FakeImage.instances[0]?.onload?.();
    expect(embeddedImageEpoch.value).toBe(before + 1);
  });

  it('an error notifies the requester and does not stay in the cache', () => {
    let failed = 0;
    loadEmbeddedImage(src(4), { onLoad: () => undefined, onError: () => (failed += 1) });
    FakeImage.instances[0]?.onerror?.();
    expect(failed).toBe(1);
    expect(cachedEmbeddedImage(src(4))).toBeUndefined();
  });

  it('the cache is limited: it evicts the least recent', () => {
    for (let i = 0; i <= EMBEDDED_IMAGE_CACHE_ENTRIES; i += 1) {
      loadEmbeddedImage(src(i), { onLoad: () => undefined });
      FakeImage.instances[i]?.onload?.();
    }
    expect(cachedEmbeddedImage(src(0))).toBeUndefined();
    expect(cachedEmbeddedImage(src(EMBEDDED_IMAGE_CACHE_ENTRIES))).toBeDefined();
  });
});
