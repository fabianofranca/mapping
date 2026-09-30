// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDisplayImages } from '../../src/store/displayImages';

class FakeBitmap {
  closed = false;
  constructor(readonly path: string) {}
  close() {
    this.closed = true;
  }
}

describe('bitmaps de exibição', () => {
  it('carrega uma vez, marca ausentes e erros', async () => {
    const load = vi.fn(async (path: string) => {
      if (path === 'ausente') return null;
      if (path === 'quebrada') throw new Error('decode');
      return new FakeBitmap(path);
    });
    const display = createDisplayImages(load);

    display.ensure('a');
    display.ensure('a');
    display.ensure('ausente');
    display.ensure('quebrada');
    expect(display.images.value.get('a')).toEqual({ status: 'loading' });
    await vi.waitFor(() =>
      expect(display.images.value.get('quebrada')?.status).toBe('error'),
    );

    expect(load).toHaveBeenCalledTimes(3);
    expect(display.images.value.get('a')?.status).toBe('ready');
    expect(display.images.value.get('ausente')).toEqual({ status: 'missing' });
  });

  it('libera os bitmaps ao invalidar e ao descartar, inclusive os que chegam tarde', async () => {
    let resolveLate: (b: FakeBitmap) => void = () => undefined;
    const late = new FakeBitmap('tarde');
    const display = createDisplayImages(async (path: string) =>
      path === 'tarde'
        ? new Promise<FakeBitmap>((resolve) => (resolveLate = resolve))
        : new FakeBitmap(path),
    );

    display.ensure('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
    const a = display.images.value.get('a');
    display.invalidate('a');
    expect(a?.status === 'ready' && a.bitmap.closed).toBe(true);
    expect(display.images.value.has('a')).toBe(false);

    display.ensure('b');
    display.ensure('tarde');
    await vi.waitFor(() => expect(display.images.value.get('b')?.status).toBe('ready'));
    const b = display.images.value.get('b');
    display.dispose();
    expect(b?.status === 'ready' && b.bitmap.closed).toBe(true);
    resolveLate(late);
    await vi.waitFor(() => expect(late.closed).toBe(true));
    expect(display.images.value.size).toBe(0);
  });
});
