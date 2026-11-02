// Visualizador embutível: carga da biblioteca por URL e registro de fontes (funções do hospedeiro).
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_FILES } from '../../../lab/components/samples';
import { M3_FILES } from '../../../lab/components/samplesMaterial3';
import { loadLibrary } from '../../../src/model/components/library';
import { loadLibraryFromUrl, registerLibraryFonts } from '../../../lab/viewer/host';

const BASE = 'https://exemplo.test/ds/';
const SPEC_URL = `${BASE}lab-components.spec.json`;
const fontBytes = new Uint8Array([0, 1, 0, 0]).buffer;

type Body = string | ArrayBuffer;

/** `fetch` falso: URL → corpo (ausente = 404). Guarda as URLs pedidas. */
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

/** Especialização de exemplo com duas fontes declaradas. */
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

describe('loadLibraryFromUrl', () => {
  it('carrega a especialização e os componentes por URL, igual ao loadLibrary com os arquivos', async () => {
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

  it('resolve referências com ../ e ./ relativas à URL da especialização', async () => {
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

  it('o Material 3 por URL também carrega (pasta com componentes)', async () => {
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

  it('componente ausente (404) vira problema da biblioteca, sem derrubar o resto', async () => {
    const bodies = sampleBodies();
    bodies.delete(`${BASE}components/button.json`);
    const { fetch } = fakeFetch(bodies);
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    expect(library.problems).toHaveLength(1);
    expect(library.problems[0]).toContain('arquivo do componente não encontrado');
    expect(library.problems[0]).toContain('components/button.json');
    expect(library.types.find((t) => t.id === 'button')?.component).toBeUndefined();
    expect(library.types.find((t) => t.id === 'card')?.component).toBeDefined();
  });

  it('erro de rede num componente também o deixa de fora', async () => {
    const { fetch: inner } = fakeFetch(sampleBodies());
    const fetch = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('components/card.json')) throw new TypeError('offline');
      return inner(input);
    }) as typeof globalThis.fetch;
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch });
    expect(library.problems).toHaveLength(1);
    expect(library.problems[0]).toContain('components/card.json');
  });

  it('especialização 404 lança com a URL e o status', async () => {
    const { fetch } = fakeFetch(new Map());
    await expect(loadLibraryFromUrl(SPEC_URL, { fetch })).rejects.toThrow(
      new RegExp(`${SPEC_URL.replace(/\./g, '\\.')}.*404`),
    );
  });

  it('sem fetch no ambiente nem nas opções, lança pedindo o fetch do hospedeiro', async () => {
    vi.stubGlobal('fetch', undefined);
    try {
      await expect(loadLibraryFromUrl(SPEC_URL)).rejects.toThrow(/fetch/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('usa o fetch global quando as opções não trazem um', async () => {
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

  it('busca as fontes como bytes; a que não vem fica sem bytes', async () => {
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

  it('fonts: false não busca fontes', async () => {
    const { fetch, calls } = fakeFetch(withFonts());
    const library = await loadLibraryFromUrl(SPEC_URL, { fetch, fonts: false });
    expect(calls.some((url) => url.includes('/fonts/'))).toBe(false);
    expect(library.fonts).toHaveLength(2);
    expect(library.fonts.every((f) => f.bytes === undefined)).toBe(true);
  });
});

describe('registerLibraryFonts', () => {
  it('delega a registerFonts com o host dado e devolve o status de cada fonte', async () => {
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
    expect(status[1]?.detail).toContain('fonts/Roboto-Medium.ttf');
    expect(added).toHaveLength(1);
    expect((added[0] as FakeFace).family).toBe('Roboto');
    expect((added[0] as FakeFace).source).toBe(fontBytes);
  });

  it('biblioteca sem fontes: lista vazia', async () => {
    expect(await registerLibraryFonts(loadLibrary(SAMPLE_FILES), {})).toEqual([]);
  });
});
