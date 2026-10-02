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

  it('retain libera os bitmaps fora do conjunto e recarrega sob demanda', async () => {
    const created: FakeBitmap[] = [];
    const display = createDisplayImages(async (path: string) => {
      const bitmap = new FakeBitmap(path);
      created.push(bitmap);
      return bitmap;
    });
    display.ensure('a');
    display.ensure('b');
    await vi.waitFor(() => expect(display.images.value.get('b')?.status).toBe('ready'));
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));

    display.retain(new Set(['b']));
    expect(created.map((b) => [b.path, b.closed])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect([...display.images.value.keys()]).toEqual(['b']);

    // O arquivo volta (desfazer): carrega de novo.
    display.ensure('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
    expect(created).toHaveLength(3);
    expect(created[2]?.closed).toBe(false);
  });

  it('retain descarta o carregamento em andamento: o bitmap que chega é fechado', async () => {
    let resolve: (b: FakeBitmap) => void = () => undefined;
    const late = new FakeBitmap('tarde');
    const display = createDisplayImages(
      () => new Promise<FakeBitmap>((r) => (resolve = r)),
    );
    display.ensure('tarde');
    display.retain(new Set());
    expect(display.images.value.has('tarde')).toBe(false);
    resolve(late);
    await vi.waitFor(() => expect(late.closed).toBe(true));
    expect(display.images.value.has('tarde')).toBe(false);
  });
});
