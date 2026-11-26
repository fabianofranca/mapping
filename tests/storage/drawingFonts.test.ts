import { describe, expect, it, vi } from 'vitest';
import { registerDrawingFonts } from '../../src/storage/drawingFonts';
import type { FontHost } from '../../src/storage/fonts';

// Stage #2825, decision 4: the four faces of the drawing font are added to `document.fonts` from bytes in memory.

interface Made {
  readonly family: string;
  readonly source: ArrayBuffer;
  readonly descriptors: { weight?: string; style?: string } | undefined;
}

function fakeHost(failLoad = false): { host: FontHost; made: Made[]; added: unknown[] } {
  const made: Made[] = [];
  const added: unknown[] = [];
  class FakeFace {
    constructor(
      readonly family: string,
      readonly source: ArrayBuffer,
      readonly descriptors?: { weight?: string; style?: string },
    ) {
      made.push({ family, source, descriptors });
    }
    load(): Promise<unknown> {
      return failLoad ? Promise.reject(new Error('bad font')) : Promise.resolve(this);
    }
  }
  const fonts = {
    add: (face: unknown) => added.push(face),
    delete: () => true,
  };
  return { host: { FontFace: FakeFace, fonts }, made, added };
}

describe('registerDrawingFonts', () => {
  it('adds the four faces: Mapping Sans and Mono, regular 1 599 and bold 600 1000, style normal', async () => {
    const { host, made, added } = fakeHost();
    await registerDrawingFonts(host);
    expect(added).toHaveLength(4);
    expect(made.map((m) => [m.family, m.descriptors])).toEqual([
      ['Mapping Sans', { weight: '1 599', style: 'normal' }],
      ['Mapping Sans', { weight: '600 1000', style: 'normal' }],
      ['Mapping Mono', { weight: '1 599', style: 'normal' }],
      ['Mapping Mono', { weight: '600 1000', style: 'normal' }],
    ]);
  });

  it('builds each face from an ArrayBuffer holding a WOFF 1.0 font', async () => {
    const { host, made } = fakeHost();
    await registerDrawingFonts(host);
    for (const face of made) {
      expect(face.source).toBeInstanceOf(ArrayBuffer);
      const bytes = new Uint8Array(face.source);
      expect(bytes.length).toBeGreaterThan(1000);
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('wOFF');
    }
  });

  it('a second call on the same document adds nothing and waits for the same loading', async () => {
    const { host, made, added } = fakeHost();
    const first = registerDrawingFonts(host);
    const second = registerDrawingFonts(host);
    expect(second).toBe(first);
    await first;
    expect(made).toHaveLength(4);
    expect(added).toHaveLength(4);
  });

  it('a failing load() is reported and does not throw', async () => {
    const { host } = fakeHost(true);
    const onError = vi.fn();
    await expect(registerDrawingFonts(host, onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(4);
    expect(String(onError.mock.calls[0]![0])).toContain('bad font');
  });

  it('without FontFace or document.fonts it does nothing and does not throw', async () => {
    await expect(registerDrawingFonts({}, vi.fn())).resolves.toBeUndefined();
  });
});
