// Design system fonts: FontFace from the bytes, no network; the registry belongs to whoever creates it.
import { describe, expect, it, vi } from 'vitest';
import type { LoadedFont } from '../../src/model/components/library';
import { createFontRegistry } from '../../src/storage/fonts';

const bytes = new Uint8Array([0, 1, 0, 0]).buffer;

class FakeFace {
  constructor(
    readonly family: string,
    readonly source: ArrayBuffer,
    readonly descriptors?: { weight?: string; style?: string },
  ) {}
  load = vi.fn(async () => {
    if (this.family === 'Bad') throw new Error('invalid format');
    return this;
  });
}

function fakeHost() {
  const added: unknown[] = [];
  const deleted: unknown[] = [];
  const host = {
    FontFace: FakeFace,
    fonts: {
      add: (f: unknown) => added.push(f),
      delete: (f: unknown) => deleted.push(f) > 0,
    },
  };
  return { host, added, deleted };
}

const font = (family: string, extra: Partial<LoadedFont> = {}): LoadedFont => ({
  family,
  weight: '400',
  style: 'normal',
  path: `fonts/${family}.ttf`,
  bytes,
  ...extra,
});

describe('font registry', () => {
  it('creates FontFace from the bytes, replaces the previous faces and reports missing ones and failures', async () => {
    const { host, added, deleted } = fakeHost();
    const registry = createFontRegistry(host);
    const first = await registry.register([
      font('Roboto'),
      font('Roboto', { weight: '500', path: 'fonts/b.ttf', bytes: undefined }),
      font('Bad', { style: 'italic' }),
    ]);
    expect(first.map((s) => s.status)).toEqual(['loaded', 'missing', 'failed']);
    expect(first[1]?.problem).toEqual({ code: 'missing', path: 'fonts/b.ttf' });
    expect(first[2]?.problem).toEqual({
      code: 'load-failed',
      message: 'invalid format',
    });
    expect(added).toHaveLength(1);
    expect((added[0] as FakeFace).descriptors).toEqual({
      weight: '400',
      style: 'normal',
    });

    const second = await registry.register([font('Inter')]);
    expect(second[0]?.status).toBe('loaded');
    expect(deleted).toEqual([added[0]]);
  });

  it('clear removes the faces of the registry and does not touch those of another registry', async () => {
    const { host, added, deleted } = fakeHost();
    const a = createFontRegistry(host);
    const b = createFontRegistry(host);
    await a.register([font('Roboto')]);
    await b.register([font('Inter')]);
    expect(added).toHaveLength(2);
    a.clear();
    expect(deleted).toEqual([added[0]]);
    a.clear();
    expect(deleted).toHaveLength(1);
    // Registering again in `b` removes only its own face.
    await b.register([]);
    expect(deleted).toEqual([added[0], added[1]]);
  });

  it('without FontFace in the environment, the status is "failed" with an explanation', async () => {
    const out = await createFontRegistry({}).register([font('Roboto')]);
    expect(out[0]).toMatchObject({ status: 'failed', problem: { code: 'no-fontface' } });
  });
});
