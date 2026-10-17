/**
 * Visualizador embutível: funções do HOSPEDEIRO (carga da biblioteca por URL e registro das
 * fontes). Ficam fora do núcleo (`createViewer` não faz rede nem registra fonte) e as páginas
 * do laboratório NÃO as usam: a CSP delas bloqueia requisição de rede (`connect-src 'none'`).
 * Existem para o site que instala o pacote, onde a pasta da biblioteca é servida por URL.
 */
import { registerFonts } from '../components/fonts';
import type { FontHost, FontStatus } from '../components/fonts';
import { loadLibrary, resolvePath } from '../components/library';
import type { Library, TextFile } from '../components/library';

export type { FontHost, FontStatus } from '../components/fonts';

export interface LoadFromUrlOptions {
  /** Padrão: o `fetch` global. Passe um quando o ambiente não tem (ou para autenticar). */
  readonly fetch?: typeof fetch;
  /** Buscar também as fontes declaradas em `fonts` (padrão `true`). */
  readonly fonts?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Referências relativas da especialização: `component` dos tipos e `file` das fontes. */
function collectRefs(spec: unknown): { components: string[]; fonts: string[] } {
  const components: string[] = [];
  const fonts: string[] = [];
  if (!isRecord(spec)) return { components, fonts };
  if (Array.isArray(spec.layers)) {
    for (const layer of spec.layers) {
      if (!isRecord(layer) || !Array.isArray(layer.annotationTypes)) continue;
      for (const type of layer.annotationTypes) {
        if (isRecord(type) && typeof type.component === 'string') {
          components.push(type.component);
        }
      }
    }
  }
  if (Array.isArray(spec.fonts)) {
    for (const font of spec.fonts) {
      if (isRecord(font) && typeof font.file === 'string') fonts.push(font.file);
    }
  }
  return { components, fonts };
}

/** Nome do arquivo sem a codificação da URL (`my%20spec.json` → `my spec.json`). */
function decodeName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * Carrega a biblioteca a partir da URL da especialização: busca o JSON, os componentes que ele
 * aponta (texto) e, salvo `fonts: false`, as fontes (bytes), todos relativos à URL da
 * especialização, e entrega a lista de arquivos ao `loadLibrary`. Um componente ou uma fonte
 * que não vem (resposta não-ok ou erro de rede) fica de fora, e o `loadLibrary` relata (em
 * `problems` ou no status das fontes). Lança se a especialização não vier ou se não houver
 * `fetch`.
 */
export async function loadLibraryFromUrl(
  specUrl: string,
  options: LoadFromUrlOptions = {},
): Promise<Library> {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error(
      'loadLibraryFromUrl: este ambiente não tem fetch; o hospedeiro precisa fornecer options.fetch.',
    );
  }
  const specResponse = await doFetch(specUrl);
  if (!specResponse.ok) {
    throw new Error(
      `Não foi possível carregar a especialização ${specUrl} (HTTP ${specResponse.status}).`,
    );
  }
  const specText = await specResponse.text();
  // URL absoluta (a especialização pode vir relativa à página do hospedeiro).
  const base = new URL(specUrl, globalThis.location?.href ?? 'http://localhost/');
  const specName = decodeName(base.pathname.slice(base.pathname.lastIndexOf('/') + 1));
  const files: TextFile[] = [{ path: specName, text: specText }];

  let spec: unknown;
  try {
    spec = JSON.parse(specText);
  } catch {
    // JSON inválido: o loadLibrary relata o problema e lança por falta de especialização.
    return loadLibrary(files);
  }
  const refs = collectRefs(spec);

  const get = async <T>(
    ref: string,
    read: (response: Response) => Promise<T>,
  ): Promise<T | undefined> => {
    try {
      const response = await doFetch(new URL(ref, base).href);
      return response.ok ? await read(response) : undefined;
    } catch {
      return undefined;
    }
  };

  const [components, fonts] = await Promise.all([
    Promise.all(refs.components.map((ref) => get(ref, (r) => r.text()))),
    options.fonts === false
      ? Promise.resolve([])
      : Promise.all(refs.fonts.map((ref) => get(ref, (r) => r.arrayBuffer()))),
  ]);
  refs.components.forEach((ref, index) => {
    const text = components[index];
    if (text !== undefined) files.push({ path: resolvePath(specName, ref), text });
  });
  refs.fonts.forEach((ref, index) => {
    const bytes = fonts[index];
    if (bytes !== undefined) files.push({ path: resolvePath(specName, ref), bytes });
  });
  return loadLibrary(files);
}

/**
 * Registra as fontes da biblioteca (as que vieram com bytes) no documento do hospedeiro e
 * devolve o status de cada uma. Depois, `viewer.redraw()` (ou mudar `fontsVersion` no
 * invólucro React) para remedir os textos. `host` existe para os testes e para ambientes sem
 * `document.fonts`.
 */
export async function registerLibraryFonts(
  library: Library,
  host?: FontHost,
): Promise<FontStatus[]> {
  return registerFonts(library.fonts, host);
}
