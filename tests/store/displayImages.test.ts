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

describe('display bitmaps', () => {
  it('loads once, flags missing ones and errors', async () => {
    const load = vi.fn(async (path: string) => {
      if (path === 'missing') return null;
      if (path === 'broken') throw new Error('decode');
      return new FakeBitmap(path);
    });
    const display = createDisplayImages(load);

    display.ensure('a');
    display.ensure('a');
    display.ensure('missing');
    display.ensure('broken');
    expect(display.images.value.get('a')).toEqual({ status: 'loading' });
    await vi.waitFor(() =>
      expect(display.images.value.get('broken')?.status).toBe('error'),
    );

    expect(load).toHaveBeenCalledTimes(3);
    expect(display.images.value.get('a')?.status).toBe('ready');
    expect(display.images.value.get('missing')).toEqual({ status: 'missing' });
  });

  it('releases the bitmaps on invalidate and on dispose, including the ones that arrive late', async () => {
    let resolveLate: (b: FakeBitmap) => void = () => undefined;
    const late = new FakeBitmap('late');
    const display = createDisplayImages(async (path: string) =>
      path === 'late'
        ? new Promise<FakeBitmap>((resolve) => (resolveLate = resolve))
        : new FakeBitmap(path),
    );

    display.ensure('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
    const a = display.images.value.get('a');
    display.invalidate('a');
    expect(display.images.value.has('a')).toBe(false);
    await vi.waitFor(() => expect(a?.status === 'ready' && a.bitmap.closed).toBe(true));

    display.ensure('b');
    display.ensure('late');
    await vi.waitFor(() => expect(display.images.value.get('b')?.status).toBe('ready'));
    const b = display.images.value.get('b');
    display.dispose();
    await vi.waitFor(() => expect(b?.status === 'ready' && b.bitmap.closed).toBe(true));
    resolveLate(late);
    await vi.waitFor(() => expect(late.closed).toBe(true));
    expect(display.images.value.size).toBe(0);
  });

  it('retain releases the bitmaps outside the set and reloads on demand', async () => {
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
    // The map drops the bitmap right away; `close()` is left for the next frame, because the
    // canvas may still draw the frame that references it (finding 10).
    expect([...display.images.value.keys()]).toEqual(['b']);
    expect(created.map((b) => [b.path, b.closed])).toEqual([
      ['a', false],
      ['b', false],
    ]);
    await vi.waitFor(() =>
      expect(created.map((b) => [b.path, b.closed])).toEqual([
        ['a', true],
        ['b', false],
      ]),
    );

    // The file comes back (undo): loads again.
    display.ensure('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
    expect(created).toHaveLength(3);
    expect(created[2]?.closed).toBe(false);
  });

  it('retain discards the load in progress: the bitmap that arrives is closed', async () => {
    let resolve: (b: FakeBitmap) => void = () => undefined;
    const late = new FakeBitmap('late');
    const display = createDisplayImages(
      () => new Promise<FakeBitmap>((r) => (resolve = r)),
    );
    display.ensure('late');
    display.retain(new Set());
    expect(display.images.value.has('late')).toBe(false);
    resolve(late);
    await vi.waitFor(() => expect(late.closed).toBe(true));
    expect(display.images.value.has('late')).toBe(false);
  });
});
