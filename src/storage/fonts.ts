/**
 * Fontes do design system carregadas a partir dos **bytes** dos arquivos da pasta (ou do zip),
 * sem rede. A CSP da app bloqueia carregar fonte por URL, mas não uma `FontFace` construída de
 * um `ArrayBuffer` já em memória. Depois de carregadas, o canvas usa a família pelo nome; quem
 * chama precisa remedir os textos e redesenhar.
 *
 * Cada usuário cria o próprio registro (`createFontRegistry`): o registro lembra as faces que
 * ele adicionou ao documento, para tirá-las ao trocar de biblioteca. Não há estado de módulo.
 */
import type { LoadedFont } from '../model/components/library';

export interface FontStatus {
  readonly font: LoadedFont;
  readonly status: 'loaded' | 'missing' | 'failed';
  /** Por que a fonte não carregou; a interface monta o texto por `t()`. */
  readonly problem?: FontProblem;
}

/** Código e parâmetros do motivo (sem texto: o idioma é da interface). */
export type FontProblem =
  | { readonly code: 'missing'; readonly path: string }
  | { readonly code: 'no-fontface' }
  | { readonly code: 'load-failed'; readonly message: string };

/** `FontFace` e `document.fonts`, injetáveis nos testes (o jsdom não os tem). */
export interface FontHost {
  readonly FontFace?: new (
    family: string,
    source: ArrayBuffer,
    descriptors?: { weight?: string; style?: string },
  ) => { load(): Promise<unknown> };
  readonly fonts?: { add(face: unknown): unknown; delete(face: unknown): boolean };
}

const defaultHost = (): FontHost => ({
  FontFace: (globalThis as { FontFace?: FontHost['FontFace'] }).FontFace,
  fonts: typeof document !== 'undefined' ? document.fonts : undefined,
});

/** Registro de fontes: guarda as faces adicionadas ao documento para poder tirá-las. */
export interface FontRegistry {
  /**
   * Registra as fontes com bytes e devolve o status de cada declaração. As faces registradas
   * antes por este registro saem primeiro, para uma família com o mesmo nome não misturar
   * pesos de dois pacotes.
   */
  register(fonts: readonly LoadedFont[]): Promise<FontStatus[]>;
  /** Tira do documento as faces que este registro adicionou. */
  clear(): void;
}

export function createFontRegistry(host: FontHost = defaultHost()): FontRegistry {
  let registered: unknown[] = [];

  const clear = (): void => {
    const set = host.fonts;
    if (set) for (const face of registered) set.delete(face);
    registered = [];
  };

  const register = async (fonts: readonly LoadedFont[]): Promise<FontStatus[]> => {
    const { FontFace, fonts: set } = host;
    clear();
    const out: FontStatus[] = [];
    for (const font of fonts) {
      if (!font.bytes) {
        out.push({
          font,
          status: 'missing',
          problem: { code: 'missing', path: font.path },
        });
        continue;
      }
      if (!FontFace || !set) {
        out.push({ font, status: 'failed', problem: { code: 'no-fontface' } });
        continue;
      }
      try {
        const face = new FontFace(font.family, font.bytes, {
          weight: font.weight,
          style: font.style,
        });
        await face.load();
        set.add(face);
        registered.push(face);
        out.push({ font, status: 'loaded' });
      } catch (error) {
        out.push({
          font,
          status: 'failed',
          problem: {
            code: 'load-failed',
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    return out;
  };

  return { register, clear };
}
