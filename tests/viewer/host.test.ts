// Embeddable viewer: loading the library by URL and registering fonts (host functions).
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_FILES } from '../../viewer/samples/samples';
import { M3_FILES } from '../../viewer/samples/samplesMaterial3';
import { loadLibrary } from '../../src/model/components/library';
import { loadLibraryFromUrl, registerLibraryFonts } from '../../viewer/host';

const BASE = 'https://example.test/ds/';
const SPEC_URL = `${BASE}lab-components.spec.json`;
const fontBytes = new Uint8Array([0, 1, 0, 0]).buffer;

type Body = string | ArrayBuffer;

/** Fake `fetch`: URL → body (missing = 404). Keeps the requested URLs. */
function fakeFetch(bodies: Map<string, Body>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const body = bodies.get(url);
    if (body === undefined) return { ok: false, status: 404 } as Response;
    return {
      ok: true,
      status: 200,
      text: async () => (typeof body === 'string' ? body : ''),
      arrayBuffer: async () => (typeof body === 'string' ? new ArrayBuffer(0) : body),
    } as Response;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function sampleBodies(): Map<string, Body> {
  return new Map<string, Body>(
    SAMPLE_FILES.map((f) => [`${BASE}${f.path}`, f.text] as const),
  );
}

/** Sample specialization with two declared fonts. */
function withFonts(): Map<string, Body> {
  const bodies = sampleBodies();
  const spec = JSON.parse(SAMPLE_FILES[0]!.text) as Record<string, unknown>;
  spec.fonts = [
    { family: 'Roboto', file: 'fonts/Roboto-Regular.ttf', weight: 400 },
    { family: 'Roboto', file: 'fonts/Roboto-Medium.ttf', weight: 500 },
  ];
  bodies.set(SPEC_URL, JSON.stringify(spec));
  bodies.set(`${BASE}fonts/Roboto-Regular.ttf`, fontBytes);
  return bodies;
}

/** Sample specialization with `icons` at the root and the icon file served. */
function withIcons(): Map<string, Body> {
  const bodies = sampleBodies();
  const spec = JSON.parse(SAMPLE_FILES[0]!.text) as Record<string, unknown>;
  spec.icons = 'icons/set.json';
  bodies.set(SPEC_URL, JSON.stringify(spec));
  bodies.set(
    `${BASE}icons/set.json`,
    JSON.stringify({
      format: 'mapping-icons',
      formatVersion: 1,
      viewBox: [24, 24],
      icons: {
        star: { paths: [{ d: 'M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z' }] },
      },
    }),
  );
  return bodies;
}

describe('loadLibraryFromUrl', () => {
  it('loads the specialization and the components by URL, the same as loadLibrary with the files', async () => {
    const { fetch, calls } = fakeFetch(sampleBodies());
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    const expected = loadLibrary(SAMPLE_FILES);
    expect(library.problems).toEqual([]);
    expect(library.specPath).toBe('lab-components.spec.json');
    expect(library.types.map((t) => [t.id, t.componentPath])).toEqual(
      expected.types.map((t) => [t.id, t.componentPath]),
    );
    expect(library.types.every((t) => t.component?.id === t.id)).toBe(true);
    expect(calls[0]).toBe(SPEC_URL);
    expect(calls).toContain(`${BASE}components/button.json`);
  });

  it('resolves references with ../ and ./ relative to the specialization URL', async () => {
    const spec = JSON.parse(SAMPLE_FILES[0]!.text) as {
      layers: { annotationTypes: { component?: string }[] }[];
    };
    const bodies = sampleBodies();
    for (const layer of spec.layers) {
      for (const type of layer.annotationTypes) {
        type.component = type.component?.replace('components/', '../shared/');
      }
    }
    const url = `${BASE}specs/ds.spec.json`;
    bodies.set(url, JSON.stringify(spec));
    for (const f of SAMPLE_FILES.slice(1)) {
      bodies.set(`${BASE}${f.path.replace('components/', 'shared/')}`, f.text);
    }
    const { fetch } = fakeFetch(bodies);
    const library = await loadLibraryFromUrl(url, { fetch });
    expect(library.problems).toEqual([]);
    expect(library.types.every((t) => t.component !== undefined)).toBe(true);
  });

  it('Material 3 by URL also loads (folder with components)', async () => {
    const bodies = new Map<string, Body>(
      M3_FILES.map((f) => [`${BASE}${f.path}`, f.text] as const),
    );
    const { fetch } = fakeFetch(bodies);
    const library = await loadLibraryFromUrl(`${BASE}material3.spec.json`, {
      fetch,
      fonts: false,
    });
    expect(library.problems).toEqual([]);
    expect(library.types.length).toBeGreaterThan(10);
  });

  it('a missing component (404) becomes a library problem, without bringing down the rest', async () => {
    const bodies = sampleBodies();
    bodies.delete(`${BASE}components/button.json`);
    const { fetch } = fakeFetch(bodies);
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    expect(library.problems).toHaveLength(1);
    expect(library.problems[0]).toContain('component file not found');
    expect(library.problems[0]).toContain('components/button.json');
    expect(library.types.find((t) => t.id === 'button')?.component).toBeUndefined();
    expect(library.types.find((t) => t.id === 'card')?.component).toBeDefined();
  });

  it('a network error on a component also leaves it out', async () => {
    const { fetch: inner } = fakeFetch(sampleBodies());
    const fetch = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('components/card.json')) throw new TypeError('offline');
      return inner(input);
    }) as typeof globalThis.fetch;
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    expect(library.problems).toHaveLength(1);
    expect(library.problems[0]).toContain('components/card.json');
  });

  it('downloads the specialization icon file (icons at the root)', async () => {
    const bodies = withIcons();
    const { fetch, calls } = fakeFetch(bodies);
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    expect(calls).toContain(`${BASE}icons/set.json`);
    expect(library.problems).toEqual([]);
    expect(library.icons?.icons.star).toBeDefined();
  });

  it('icons that do not come (404 or network error) become a problem, without bringing down the rest', async () => {
    const missing = withIcons();
    missing.delete(`${BASE}icons/set.json`);
    const first = await loadLibraryFromUrl(SPEC_URL, {
      fetch: fakeFetch(missing).fetch,
    });
    expect(first.icons).toBeUndefined();
    expect(first.problems).toHaveLength(1);
    expect(first.problems[0]).toContain('icon file not found');
    expect(first.types.find((t) => t.id === 'card')?.component).toBeDefined();

    const { fetch: inner } = fakeFetch(withIcons());
    const offline = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('icons/set.json')) throw new TypeError('offline');
      return inner(input);
    }) as typeof globalThis.fetch;
    const second = await loadLibraryFromUrl(SPEC_URL, { fetch: offline });
    expect(second.problems).toHaveLength(1);
    expect(second.problems[0]).toContain('icon file not found');
  });

  it('with fonts: false the icons are still requested', async () => {
    const { fetch, calls } = fakeFetch(withIcons());
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch, fonts: false });
    expect(calls).toContain(`${BASE}icons/set.json`);
    expect(library.icons?.icons.star).toBeDefined();
  });

  it('a 404 specialization throws with the URL and the status', async () => {
    const { fetch } = fakeFetch(new Map());
    await expect(loadLibraryFromUrl(SPEC_URL, { fetch })).rejects.toThrow(
      new RegExp(`${SPEC_URL.replace(/\./g, '\\.')}.*404`),
    );
  });

  it('without fetch in the environment or in the options, throws asking for the host fetch', async () => {
    vi.stubGlobal('fetch', undefined);
    try {
      await expect(loadLibraryFromUrl(SPEC_URL)).rejects.toThrow(/fetch/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the global fetch when the options bring none', async () => {
    const { fetch, calls } = fakeFetch(sampleBodies());
    vi.stubGlobal('fetch', fetch);
    try {
      const library = await loadLibraryFromUrl(SPEC_URL);
      expect(library.problems).toEqual([]);
      expect(calls[0]).toBe(SPEC_URL);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fetches the fonts as bytes; the one that does not come is left without bytes', async () => {
    const { fetch, calls } = fakeFetch(withFonts());
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    expect(calls).toContain(`${BASE}fonts/Roboto-Regular.ttf`);
    expect(calls).toContain(`${BASE}fonts/Roboto-Medium.ttf`);
    expect(library.fonts).toHaveLength(2);
    expect(library.fonts[0]).toMatchObject({ path: 'fonts/Roboto-Regular.ttf' });
    expect(library.fonts[0]?.bytes).toBe(fontBytes);
    expect(library.fonts[1]?.bytes).toBeUndefined();
    expect(library.problems).toEqual([]);
  });

  it('fonts: false does not fetch fonts', async () => {
    const { fetch, calls } = fakeFetch(withFonts());
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch, fonts: false });
    expect(calls.some((url) => url.includes('/fonts/'))).toBe(false);
    expect(library.fonts).toHaveLength(2);
    expect(library.fonts.every((f) => f.bytes === undefined)).toBe(true);
  });
});

describe('registerLibraryFonts', () => {
  it('delegates to registerFonts with the given host and returns the status of each font', async () => {
    const { fetch } = fakeFetch(withFonts());
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    const added: unknown[] = [];
    class FakeFace {
      constructor(
        readonly family: string,
        readonly source: ArrayBuffer,
        readonly descriptors?: { weight?: string; style?: string },
      ) {}
      load = vi.fn(async () => this);
    }
    const status = await registerLibraryFonts(library, {
      FontFace: FakeFace,
      fonts: { add: (f) => added.push(f), delete: () => true },
    });
    expect(status.map((s) => s.status)).toEqual(['loaded', 'missing']);
    expect(status[1]?.problem).toEqual({
      code: 'missing',
      path: expect.stringContaining('fonts/Roboto-Medium.ttf'),
    });
    expect(added).toHaveLength(1);
    expect((added[0] as FakeFace).family).toBe('Roboto');
    expect((added[0] as FakeFace).source).toBe(fontBytes);
  });

  it('library without fonts: empty list', async () => {
    expect(await registerLibraryFonts(loadLibrary(SAMPLE_FILES), {})).toEqual([]);
  });
});

describe('loadLibraryFromUrl: requests', () => {
  /** Specialization with `distinct` distinct components (the same file served by all) and the repeated types. */
  function manyComponents(distinct: number, repeats: number): Map<string, Body> {
    const bodies = sampleBodies();
    const spec = JSON.parse(SAMPLE_FILES[0]!.text) as {
      layers: { annotationTypes: Record<string, unknown>[] }[];
    };
    const template = SAMPLE_FILES[1]!.text;
    const types: Record<string, unknown>[] = [];
    for (let i = 0; i < distinct; i += 1) {
      for (let r = 0; r < repeats; r += 1) {
        types.push({
          id: `t${i}-${r}`,
          name: `T${i}-${r}`,
          component: `components/c${i}.json`,
        });
      }
      bodies.set(`${BASE}components/c${i}.json`, template);
    }
    spec.layers = [{ ...spec.layers[0]!, annotationTypes: types }];
    bodies.set(SPEC_URL, JSON.stringify(spec));
    return bodies;
  }

  it('equal references are requested only once', async () => {
    const { fetch, calls } = fakeFetch(manyComponents(3, 4));
    await loadLibraryFromUrl(SPEC_URL, { fetch });
    const component = calls.filter((url) => url.includes('/components/'));
    expect(component).toHaveLength(3);
    expect(new Set(component).size).toBe(3);
  });

  it('limits the simultaneous requests', async () => {
    const bodies = manyComponents(30, 1);
    let inFlight = 0;
    let peak = 0;
    const slow = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      const body = bodies.get(String(input));
      if (body === undefined) return { ok: false, status: 404 } as Response;
      return {
        ok: true,
        status: 200,
        text: async () => (typeof body === 'string' ? body : ''),
        arrayBuffer: async () => (typeof body === 'string' ? new ArrayBuffer(0) : body),
      } as Response;
    });
    await loadLibraryFromUrl(SPEC_URL, { fetch: slow as unknown as typeof fetch });
    expect(slow.mock.calls.length).toBeGreaterThan(30);
    expect(peak).toBeLessThanOrEqual(6);
  });
});
