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

  it('releases the bitmaps on dispose, including the ones that arrive late', async () => {
    let resolveLate: (b: FakeBitmap) => void = () => undefined;
    const late = new FakeBitmap('late');
    const display = createDisplayImages(async (path: string) =>
      path === 'late'
        ? new Promise<FakeBitmap>((resolve) => (resolveLate = resolve))
        : new FakeBitmap(path),
    );

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

  it('invalidate of a ready path reloads in place and closes the old bitmap after the frame', async () => {
    const created: FakeBitmap[] = [];
    const load = vi.fn(async (path: string) => {
      const bitmap = new FakeBitmap(path);
      created.push(bitmap);
      return bitmap;
    });
    const display = createDisplayImages(load);
    display.ensure('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
    const old = created[0]!;

    display.invalidate('a');
    // The old bitmap keeps showing (no flash of the placeholder) until the new one arrives.
    expect(display.images.value.get('a')).toEqual({ status: 'ready', bitmap: old });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      const current = display.images.value.get('a');
      expect(current?.status === 'ready' && current.bitmap).toBe(created[1]);
    });
    await vi.waitFor(() => expect(old.closed).toBe(true));
    expect(created[1]!.closed).toBe(false);
  });

  it('invalidate during loading closes the first (stale) load and ends with the second', async () => {
    const resolvers: Array<(b: FakeBitmap) => void> = [];
    const display = createDisplayImages(
      () => new Promise<FakeBitmap>((resolve) => resolvers.push(resolve)),
    );
    display.ensure('a');
    display.invalidate('a');
    expect(resolvers).toHaveLength(2);
    const first = new FakeBitmap('first');
    const second = new FakeBitmap('second');
    resolvers[0]!(first);
    await vi.waitFor(() => expect(first.closed).toBe(true));
    expect(display.images.value.get('a')).toEqual({ status: 'loading' });
    resolvers[1]!(second);
    await vi.waitFor(() =>
      expect(display.images.value.get('a')).toEqual({ status: 'ready', bitmap: second }),
    );
    expect(second.closed).toBe(false);
  });

  it('invalidate of a missing path ends ready when the file is back', async () => {
    let present = false;
    const display = createDisplayImages(async (path: string) =>
      present ? new FakeBitmap(path) : null,
    );
    display.ensure('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('missing'));
    present = true;
    display.invalidate('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
  });

  it('a reload that returns null ends missing and closes the old bitmap', async () => {
    let present = true;
    const created: FakeBitmap[] = [];
    const display = createDisplayImages(async (path: string) => {
      if (!present) return null;
      const bitmap = new FakeBitmap(path);
      created.push(bitmap);
      return bitmap;
    });
    display.ensure('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
    present = false;
    display.invalidate('a');
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('missing'));
    await vi.waitFor(() => expect(created[0]!.closed).toBe(true));
  });

  it('invalidate of a path that is not in the map loads nothing', () => {
    const load = vi.fn(async (path: string) => new FakeBitmap(path));
    const display = createDisplayImages(load);
    display.invalidate('a');
    expect(load).not.toHaveBeenCalled();
    expect(display.images.value.size).toBe(0);
  });

  it('invalidate followed by retain without the path closes the arriving bitmap', async () => {
    const resolvers: Array<(b: FakeBitmap) => void> = [];
    const display = createDisplayImages(
      () => new Promise<FakeBitmap>((resolve) => resolvers.push(resolve)),
    );
    display.ensure('a');
    resolvers[0]!(new FakeBitmap('first'));
    await vi.waitFor(() => expect(display.images.value.get('a')?.status).toBe('ready'));
    display.invalidate('a');
    display.retain(new Set());
    const arriving = new FakeBitmap('second');
    resolvers[1]!(arriving);
    await vi.waitFor(() => expect(arriving.closed).toBe(true));
    expect(display.images.value.has('a')).toBe(false);
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
