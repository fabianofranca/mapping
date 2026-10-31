// O carregador de imagens remotas (RI3, decisões 6 e 17): estados, limites, cache e a única nova
// tentativa sem CORS, com `Image`, `createImageBitmap` e relógio falsos.
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
  it('pede com crossOrigin anônimo e sem Referer, e começa em loading', () => {
    const { loader, images } = setup();
    expect(loader.request(url(1), CORS)).toEqual({ state: 'loading' });
    expect(images).toHaveLength(1);
    expect(images[0]?.crossOrigin).toBe('anonymous');
    expect(images[0]?.referrerPolicy).toBe('no-referrer');
    expect(images[0]?.sources).toEqual([url(1)]);
    // O mesmo pedido de novo não cria outra imagem.
    loader.request(url(1), CORS);
    expect(images).toHaveLength(1);
  });

  it('carrega: loaded com o bitmap (sem redução quando cabe) e avisa quem assina', async () => {
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

  it('sem createImageBitmap usa o próprio elemento, com o tamanho natural', async () => {
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
      createBitmap: () => Promise.reject(new Error('sem memória')),
    });
    loader.request(url(1), CORS);
    images[0]?.load();
    await settle();
    expect(loader.request(url(1), CORS).image).toBe(images[0]);
  });

  it('recusa acima de 8192 px de lado e acima de 40 MP, sem decodificar', async () => {
    const { loader, images, bitmaps } = setup();
    loader.request(url(1), CORS);
    loader.request(url(2), CORS);
    images[0]!.naturalWidth = 8193;
    images[0]!.naturalHeight = 10;
    images[1]!.naturalWidth = 7000;
    images[1]!.naturalHeight = 6000; // 42 MP, cada lado dentro do limite
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

  it('imagem de tamanho zero é falha', async () => {
    const { loader, images } = setup();
    loader.request(url(1), CORS);
    images[0]!.naturalWidth = 0;
    images[0]?.load();
    await settle();
    expect(loader.request(url(1), CORS).state).toBe('failed');
  });

  it('no máximo 6 em paralelo; a fila anda quando uma termina', async () => {
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

  it('estoura o tempo limite de 20 s: failed com motivo timeout, libera a vaga e cancela', () => {
    const { loader, images, timers } = setup();
    for (let i = 0; i < 7; i += 1) loader.request(url(i), CORS);
    expect(images).toHaveLength(6);
    expect(timers).toHaveLength(6);
    expect(timers[0]?.ms).toBe(20_000);
    timers[0]?.callback();
    expect(loader.request(url(0), CORS)).toEqual({ state: 'failed', reason: 'timeout' });
    // A imagem abandonada não carrega mais e a sétima ocupou a vaga.
    expect(images[0]?.onload).toBeNull();
    expect(images[0]?.src).toBe('');
    expect(images).toHaveLength(7);
  });

  it('a falha não é repetida na sessão (um só pedido)', () => {
    const { loader, images } = setup();
    loader.request(url(1), CORS);
    images[0]?.fail();
    for (let i = 0; i < 3; i += 1) {
      expect(loader.request(url(1), CORS)).toEqual({ state: 'failed', reason: 'failed' });
    }
    expect(images).toHaveLength(1);
  });

  it('o relógio para quando a carga termina', async () => {
    const { loader, images, timers } = setup();
    loader.request(url(1), CORS);
    images[0]?.load();
    await settle();
    expect(timers[0]?.cleared).toBe(true);
  });

  describe('sem CORS (decisão 17)', () => {
    it('com o interruptor ligado tenta uma vez sem crossOrigin e termina opaque', async () => {
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

    it('a nova tentativa que também falha vira failed, sem terceira', () => {
      const { loader, images } = setup();
      loader.request(url(1), NO_CORS);
      images[0]?.fail();
      images[1]?.fail();
      expect(loader.request(url(1), NO_CORS).state).toBe('failed');
      expect(images).toHaveLength(2);
    });

    it('com o interruptor desligado fica failed e faz um só pedido', () => {
      const { loader, images } = setup();
      loader.request(url(1), CORS);
      images[0]?.fail();
      expect(loader.request(url(1), CORS).state).toBe('failed');
      expect(images).toHaveLength(1);
    });

    it('ligar o interruptor depois da falha permite a única nova tentativa', async () => {
      const { loader, images } = setup();
      loader.request(url(1), CORS);
      images[0]?.fail();
      expect(loader.request(url(1), NO_CORS).state).toBe('loading');
      expect(images).toHaveLength(2);
      expect(images[1]?.crossOrigin).toBeNull();
      images[1]?.fail();
      // Depois da tentativa, nem ligado nem desligado repete.
      loader.request(url(1), NO_CORS);
      loader.request(url(1), CORS);
      expect(images).toHaveLength(2);
    });

    it('timeout não dispara a tentativa sem CORS', () => {
      const { loader, images, timers } = setup();
      loader.request(url(1), NO_CORS);
      timers[0]?.callback();
      expect(loader.request(url(1), NO_CORS).state).toBe('failed');
      expect(images).toHaveLength(1);
    });

    it('imagem opaque some (failed) com o interruptor desligado e volta ao ligar, sem novo pedido', async () => {
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

  describe('cache em memória', () => {
    async function fill(count: number) {
      const ctx = setup();
      for (let i = 0; i < count; i += 1) {
        ctx.loader.request(url(i), CORS);
        ctx.images[i]?.load();
        await settle();
      }
      return ctx;
    }

    it('guarda até 64 e despeja a menos recente, avisando quem assina', async () => {
      const ctx = await fill(REMOTE_IMAGE_LIMITS.cacheEntries);
      const heard: string[] = [];
      ctx.loader.subscribe((u) => heard.push(u));
      // Reler a 0 a torna a mais recente: a 1 é despejada.
      expect(ctx.loader.request(url(0), CORS).state).toBe('loaded');
      ctx.loader.request(url(100), CORS);
      ctx.images.at(-1)?.load();
      await settle();
      expect(heard).toEqual([url(1), url(100)]);
      expect(ctx.loader.request(url(0), CORS).state).toBe('loaded');
      // A despejada volta a ser pedida (a falha é lembrada, o despejo não).
      const before = ctx.images.length;
      expect(ctx.loader.request(url(1), CORS).state).toBe('loading');
      expect(ctx.images).toHaveLength(before + 1);
    });

    it('o close() do bitmap despejado espera o quadro seguinte', async () => {
      const ctx = await fill(REMOTE_IMAGE_LIMITS.cacheEntries);
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
