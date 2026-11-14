// The remote image loader (RI3, decisions 6 and 17): states, limits, cache and the single new
// attempt without CORS, with a fake `Image`, `createImageBitmap` and clock.
import { describe, expect, it, vi } from 'vitest';
import {
  REMOTE_IMAGE_LIMITS,
  RemoteImageLoader,
  type RemoteImageLoaderDeps,
} from '../../../src/canvas/components/imageLoader';

class FakeImage {
  crossOrigin: string | null = null;
  referrerPolicy = '';
  naturalWidth = 100;
  naturalHeight = 50;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private source = '';
  readonly sources: string[] = [];
  get src(): string {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    this.sources.push(value);
  }
  /** Os testes disparam o fim da carga. */
  load(): void {
    this.onload?.();
  }
  fail(): void {
    this.onerror?.();
  }
}

interface FakeBitmap {
  width: number;
  height: number;
  closed: boolean;
  close(): void;
}

function setup(overrides: Partial<RemoteImageLoaderDeps> = {}) {
  const images: FakeImage[] = [];
  const bitmaps: FakeBitmap[] = [];
  const bitmapCalls: Array<{ options?: ImageBitmapOptions }> = [];
  const timers: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
  const frames: Array<() => void> = [];
  const deps: RemoteImageLoaderDeps = {
    createImage: () => {
      const image = new FakeImage();
      images.push(image);
      return image as unknown as HTMLImageElement;
    },
    createBitmap: (image, options) => {
      bitmapCalls.push({ ...(options ? { options } : {}) });
      const source = image as unknown as FakeImage;
      const width = options?.resizeWidth ?? source.naturalWidth;
      const height = options?.resizeHeight ?? source.naturalHeight;
      const bitmap: FakeBitmap = {
        width,
        height,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      bitmaps.push(bitmap);
      return Promise.resolve(bitmap as unknown as ImageBitmap);
    },
    setTimeout: (callback, ms) => {
      const timer = { callback, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    requestFrame: (callback) => {
      frames.push(callback);
    },
    ...overrides,
  };
  const loader = new RemoteImageLoader(deps);
  const flushFrames = () => {
    for (const frame of frames.splice(0)) frame();
  };
  return { loader, images, bitmaps, bitmapCalls, timers, flushFrames };
}

/** Deixa as promessas do bitmap resolverem. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const CORS = { allowNoCors: false };
const NO_CORS = { allowNoCors: true };
const url = (n: number) => `https://img.test/${n}.png`;

describe('RemoteImageLoader', () => {
  it('requests with anonymous crossOrigin and without Referer, and starts in loading', () => {
    const { loader, images } = setup();
    expect(loader.request(url(1), CORS)).toEqual({ state: 'loading' });
    expect(images).toHaveLength(1);
    expect(images[0]?.crossOrigin).toBe('anonymous');
    expect(images[0]?.referrerPolicy).toBe('no-referrer');
    expect(images[0]?.sources).toEqual([url(1)]);
    // The same request again does not create another image.
    loader.request(url(1), CORS);
    expect(images).toHaveLength(1);
  });

  it('loads: loaded with the bitmap (without reduction when it fits) and notifies the subscriber', async () => {
    const { loader, images, bitmapCalls } = setup();
    const heard: string[] = [];
    loader.subscribe((u) => heard.push(u));
    const epoch = loader.epoch.peek();
    loader.request(url(1), CORS);
    images[0]?.load();
    await settle();
    const view = loader.request(url(1), CORS);
    expect(view.state).toBe('loaded');
    expect(view.width).toBe(100);
    expect(view.height).toBe(50);
    expect(view.image).toBeDefined();
    expect(bitmapCalls[0]?.options).toBeUndefined();
    expect(heard).toEqual([url(1)]);
    expect(loader.epoch.peek()).toBe(epoch + 1);
  });

  it('reduz a 2048 px no lado maior com alta qualidade', async () => {
    const { loader, images, bitmapCalls } = setup();
    loader.request(url(1), CORS);
    const image = images[0]!;
    image.naturalWidth = 4096;
    image.naturalHeight = 2048;
    image.load();
    await settle();
    expect(bitmapCalls[0]?.options).toEqual({
      resizeWidth: 2048,
      resizeHeight: 1024,
      resizeQuality: 'high',
    });
    const view = loader.request(url(1), CORS);
    expect(view.width).toBe(2048);
    expect(view.height).toBe(1024);
  });

  it('without createImageBitmap it uses the element itself, with the natural size', async () => {
    const { loader, images } = setup({ createBitmap: undefined });
    loader.request(url(1), CORS);
    images[0]?.load();
    await settle();
    const view = loader.request(url(1), CORS);
    expect(view.state).toBe('loaded');
    expect(view.image).toBe(images[0]);
    expect(view.width).toBe(100);
  });

  it('se o bitmap falhar, o elemento carregado serve', async () => {
    const { loader, images } = setup({
      createBitmap: () => Promise.reject(new Error('out of memory')),
    });
    loader.request(url(1), CORS);
    images[0]?.load();
    await settle();
    expect(loader.request(url(1), CORS).image).toBe(images[0]);
  });

  it('refuses above 8192 px per side and above 40 MP, without decoding', async () => {
    const { loader, images, bitmaps } = setup();
    loader.request(url(1), CORS);
    loader.request(url(2), CORS);
    images[0]!.naturalWidth = 8193;
    images[0]!.naturalHeight = 10;
    images[1]!.naturalWidth = 7000;
    images[1]!.naturalHeight = 6000; // 42 MP, each side within the limit
    images[0]?.load();
    images[1]?.load();
    await settle();
    expect(loader.request(url(1), CORS).state).toBe('too-large');
    expect(loader.request(url(2), CORS).state).toBe('too-large');
    expect(bitmaps).toHaveLength(0);
    // Exatamente nos limites passa.
    loader.request(url(3), CORS);
    images[2]!.naturalWidth = 8192;
    images[2]!.naturalHeight = 4880; // 39,98 MP
    images[2]?.load();
    await settle();
    expect(loader.request(url(3), CORS).state).toBe('loaded');
  });

  it('a zero-size image is a failure', async () => {
    const { loader, images } = setup();
    loader.request(url(1), CORS);
    images[0]!.naturalWidth = 0;
    images[0]?.load();
    await settle();
    expect(loader.request(url(1), CORS).state).toBe('failed');
  });

  it('at most 6 in parallel; the queue advances when one finishes', async () => {
    const { loader, images } = setup();
    for (let i = 0; i < 8; i += 1) loader.request(url(i), CORS);
    expect(images).toHaveLength(REMOTE_IMAGE_LIMITS.parallel);
    images[0]?.load();
    expect(images).toHaveLength(7);
    images[1]?.fail();
    expect(images).toHaveLength(8);
    await settle();
    expect(loader.request(url(0), CORS).state).toBe('loaded');
    expect(loader.request(url(1), CORS).state).toBe('failed');
  });

  it('hits the 20 s timeout: failed with reason timeout, frees the slot and cancels', () => {
    const { loader, images, timers } = setup();
    for (let i = 0; i < 7; i += 1) loader.request(url(i), CORS);
    expect(images).toHaveLength(6);
    expect(timers).toHaveLength(6);
    expect(timers[0]?.ms).toBe(20_000);
    timers[0]?.callback();
    expect(loader.request(url(0), CORS)).toEqual({ state: 'failed', reason: 'timeout' });
    // The abandoned image no longer loads and the seventh took the slot.
    expect(images[0]?.onload).toBeNull();
    expect(images[0]?.src).toBe('');
    expect(images).toHaveLength(7);
  });

  it('the failure is not repeated in the session (a single request)', () => {
    const { loader, images } = setup();
    loader.request(url(1), CORS);
    images[0]?.fail();
    for (let i = 0; i < 3; i += 1) {
      expect(loader.request(url(1), CORS)).toEqual({ state: 'failed', reason: 'failed' });
    }
    expect(images).toHaveLength(1);
  });

  it('the clock stops when the load finishes', async () => {
    const { loader, images, timers } = setup();
    loader.request(url(1), CORS);
    images[0]?.load();
    await settle();
    expect(timers[0]?.cleared).toBe(true);
  });

  describe('without CORS (decision 17)', () => {
    it('with the switch on it tries once without crossOrigin and ends opaque', async () => {
      const { loader, images } = setup();
      expect(loader.request(url(1), NO_CORS).state).toBe('loading');
      images[0]?.fail();
      expect(images).toHaveLength(2);
      expect(images[1]?.crossOrigin).toBeNull();
      expect(images[1]?.referrerPolicy).toBe('no-referrer');
      expect(loader.request(url(1), NO_CORS).state).toBe('loading');
      images[1]?.load();
      await settle();
      const view = loader.request(url(1), NO_CORS);
      expect(view.state).toBe('opaque');
      expect(view.image).toBeDefined();
    });

    it('the new attempt that also fails becomes failed, without a third', () => {
      const { loader, images } = setup();
      loader.request(url(1), NO_CORS);
      images[0]?.fail();
      images[1]?.fail();
      expect(loader.request(url(1), NO_CORS).state).toBe('failed');
      expect(images).toHaveLength(2);
    });

    it('with the switch off it stays failed and makes a single request', () => {
      const { loader, images } = setup();
      loader.request(url(1), CORS);
      images[0]?.fail();
      expect(loader.request(url(1), CORS).state).toBe('failed');
      expect(images).toHaveLength(1);
    });

    it('turning the switch on after the failure allows the single new attempt', async () => {
      const { loader, images } = setup();
      loader.request(url(1), CORS);
      images[0]?.fail();
      expect(loader.request(url(1), NO_CORS).state).toBe('loading');
      expect(images).toHaveLength(2);
      expect(images[1]?.crossOrigin).toBeNull();
      images[1]?.fail();
      // After the attempt, neither on nor off repeats.
      loader.request(url(1), NO_CORS);
      loader.request(url(1), CORS);
      expect(images).toHaveLength(2);
    });

    it('timeout does not trigger the attempt without CORS', () => {
      const { loader, images, timers } = setup();
      loader.request(url(1), NO_CORS);
      timers[0]?.callback();
      expect(loader.request(url(1), NO_CORS).state).toBe('failed');
      expect(images).toHaveLength(1);
    });

    it('an opaque image disappears (failed) with the switch off and comes back when turned on, without a new request', async () => {
      const { loader, images } = setup();
      loader.request(url(1), NO_CORS);
      images[0]?.fail();
      images[1]?.load();
      await settle();
      expect(loader.request(url(1), CORS).state).toBe('failed');
      expect(loader.request(url(1), NO_CORS).state).toBe('opaque');
      expect(images).toHaveLength(2);
    });
  });

  describe('in-memory cache', () => {
    async function fill(count: number) {
      const ctx = setup();
      for (let i = 0; i < count; i += 1) {
        ctx.loader.request(url(i), CORS);
        ctx.images[i]?.load();
        await settle();
      }
      return ctx;
    }

    it('keeps up to 64 and evicts the least recent, notifying the subscriber', async () => {
      const ctx = await fill(REMOTE_IMAGE_LIMITS.cacheEntries);
      const heard: string[] = [];
      ctx.loader.subscribe((u) => heard.push(u));
      // Two frames pass: no URL counts as "in view" anymore.
      ctx.flushFrames();
      ctx.flushFrames();
      // Reading 0 again makes it the most recent: 1 is evicted.
      expect(ctx.loader.request(url(0), CORS).state).toBe('loaded');
      ctx.loader.request(url(100), CORS);
      ctx.images.at(-1)?.load();
      await settle();
      expect(heard).toEqual([url(1), url(100)]);
      expect(ctx.loader.request(url(0), CORS).state).toBe('loaded');
      // The evicted one is requested again (the failure is remembered, the eviction is not).
      const before = ctx.images.length;
      expect(ctx.loader.request(url(1), CORS).state).toBe('loading');
      expect(ctx.images).toHaveLength(before + 1);
    });

    it('with more URLs in view than the limit, none is reloaded in a cycle (65 URLs, 65 loads)', async () => {
      const total = REMOTE_IMAGE_LIMITS.cacheEntries + 1;
      const ctx = setup();
      // All the URLs stay in view: each "frame" requests all of them again.
      const frame = () => {
        for (let i = 0; i < total; i += 1) ctx.loader.request(url(i), CORS);
      };
      frame();
      for (let i = 0; i < total; i += 1) {
        ctx.images[i]?.load();
        await settle();
      }
      for (let round = 0; round < 3; round += 1) {
        ctx.flushFrames();
        frame();
        await settle();
      }
      expect(ctx.images).toHaveLength(total);
      for (let i = 0; i < total; i += 1) {
        expect(ctx.loader.request(url(i), CORS).state).toBe('loaded');
      }
    });

    it('the URL that left the view is evicted when the cache goes over the limit', async () => {
      const total = REMOTE_IMAGE_LIMITS.cacheEntries + 1;
      const ctx = setup();
      for (let i = 0; i < total; i += 1) ctx.loader.request(url(i), CORS);
      for (let i = 0; i < total; i += 1) {
        ctx.images[i]?.load();
        await settle();
      }
      // Two frames without requesting anything: everything left the view; the next load evicts the oldest.
      ctx.flushFrames();
      ctx.flushFrames();
      ctx.loader.request(url(500), CORS);
      ctx.images.at(-1)?.load();
      await settle();
      expect(ctx.loader.request(url(0), CORS).state).toBe('loading');
    });

    it('o close() do bitmap despejado espera o quadro seguinte', async () => {
      const ctx = await fill(REMOTE_IMAGE_LIMITS.cacheEntries);
      ctx.flushFrames();
      ctx.flushFrames();
      ctx.loader.request(url(100), CORS);
      ctx.images.at(-1)?.load();
      await settle();
      const evicted = ctx.bitmaps[0]!;
      expect(evicted.closed).toBe(false);
      ctx.flushFrames();
      expect(evicted.closed).toBe(true);
      expect(ctx.bitmaps.filter((b) => b.closed)).toHaveLength(1);
    });

    it('dispose fecha os bitmaps (no quadro seguinte) e esquece tudo', async () => {
      const ctx = await fill(2);
      ctx.loader.dispose();
      expect(ctx.bitmaps.every((b) => !b.closed)).toBe(true);
      ctx.flushFrames();
      expect(ctx.bitmaps.every((b) => b.closed)).toBe(true);
      const before = ctx.images.length;
      expect(ctx.loader.request(url(0), CORS).state).toBe('loading');
      expect(ctx.images).toHaveLength(before + 1);
    });
  });

  it('cancelar a assinatura para os avisos', async () => {
    const { loader, images } = setup();
    const listener = vi.fn();
    const off = loader.subscribe(listener);
    off();
    loader.request(url(1), CORS);
    images[0]?.fail();
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });
});
