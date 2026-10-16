/**
 * Laboratório "Componentes": fontes do design system carregadas a partir dos **bytes** dos
 * arquivos da pasta (ou do zip), sem rede. A CSP da app bloqueia carregar fonte por URL, mas
 * não uma `FontFace` construída de um `ArrayBuffer` já em memória. Depois de carregadas, o
 * canvas usa a família pelo nome; quem chama precisa remedir os textos e redesenhar.
 */
import type { LoadedFont } from './library';

export interface FontStatus {
  readonly font: LoadedFont;
  readonly status: 'loaded' | 'missing' | 'failed';
  readonly detail?: string;
}

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

/** Faces que o laboratório registrou, para tirar ao trocar de biblioteca. */
let registered: unknown[] = [];

/**
 * Registra as fontes com bytes e devolve o status de cada declaração. As faces da biblioteca
 * anterior saem antes, para uma família com o mesmo nome não misturar pesos de dois DS.
 */
export async function registerFonts(
  fonts: readonly LoadedFont[],
  host: FontHost = defaultHost(),
): Promise<FontStatus[]> {
  const { FontFace, fonts: set } = host;
  if (set) for (const face of registered) set.delete(face);
  registered = [];
  const out: FontStatus[] = [];
  for (const font of fonts) {
    if (!font.bytes) {
      out.push({
        font,
        status: 'missing',
        detail: `arquivo não encontrado: ${font.path}`,
      });
      continue;
    }
    if (!FontFace || !set) {
      out.push({ font, status: 'failed', detail: 'este navegador não tem FontFace' });
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
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return out;
}

export function describeFont(font: LoadedFont): string {
  const style = font.style === 'italic' ? ' itálico' : '';
  return `${font.family} ${font.weight}${style}`;
}
