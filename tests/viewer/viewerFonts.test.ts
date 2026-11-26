import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadViewerFonts, viewerHostFonts } from '../../viewer/hostFonts';

// Stage #2825, decision 4: the viewer registers the four Mapping faces once per document, with nothing passed by the
// host, and its default font is the model's (Mapping Sans and Mono).

describe('the viewer drawing font', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'fonts');
  });

  it('the default host fonts are the model defaults: nothing is passed', () => {
    expect(viewerHostFonts()).toEqual({});
  });

  it('registers the four faces once per document, and every call waits for the same loading', async () => {
    const added: unknown[] = [];
    class Face {
      constructor(
        readonly family: string,
        readonly source: ArrayBuffer,
      ) {}
      load = () => Promise.resolve(this);
    }
    vi.stubGlobal('FontFace', Face);
    Object.defineProperty(document, 'fonts', {
      value: { add: (face: unknown) => added.push(face), delete: () => true },
      configurable: true,
    });
    const first = loadViewerFonts();
    const second = loadViewerFonts();
    expect(second).toBe(first);
    await first;
    expect(added).toHaveLength(4);
    expect(added.map((face) => (face as Face).family)).toEqual([
      'Mapping Sans',
      'Mapping Sans',
      'Mapping Mono',
      'Mapping Mono',
    ]);
  });
});
