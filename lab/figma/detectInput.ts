/**
 * Laboratório "Figma somente leitura": reconhece o que foi colado, solto ou aberto.
 *
 * - "Copiar como SVG" no Figma põe o SVG em `text/plain`;
 * - Ctrl+C comum no Figma põe em `text/html` um `<span data-metadata="<!--(figmeta)…-->">`
 *   e um `data-buffer="<!--(figma)…-->"`: é o formato binário interno (fig-kiwi, comprimido),
 *   não documentado; o laboratório só o detecta e explica;
 * - um JSON é a resposta da API REST (`/v1/files/:key/nodes`) ou um nó solto.
 */
import { figmaJsonToScene } from './figmaJsonToScene';
import type { Scene } from './scene';
import { svgToScene } from './svgToScene';

export type InputKind = 'svg' | 'json' | 'figma-native' | 'unknown';

export interface ClipboardLike {
  readonly text?: string;
  readonly html?: string;
}

export interface DetectedInput {
  readonly kind: InputKind;
  /** O texto a converter (SVG ou JSON); vazio nos outros casos. */
  readonly payload: string;
}

const FIGMA_NATIVE = /data-metadata="<!--\(figmeta\)/;

export function detectInput(data: ClipboardLike): DetectedInput {
  const text = (data.text ?? '').trim();
  const kind = classifyText(text);
  if (kind !== 'unknown') return { kind, payload: text };
  if (data.html && FIGMA_NATIVE.test(data.html))
    return { kind: 'figma-native', payload: '' };
  return { kind: 'unknown', payload: text };
}

export function classifyText(text: string): InputKind {
  const head = text.trimStart().slice(0, 200);
  if (/^<\?xml[\s\S]*?<svg\b/.test(head) || /^<svg\b/.test(head)) return 'svg';
  if (/^[[{]/.test(head)) return 'json';
  return 'unknown';
}

/** Converte conforme o tipo; lança `Error` com mensagem em pt-BR quando não dá. */
export function toScene(kind: InputKind, payload: string): Scene {
  switch (kind) {
    case 'svg':
      return svgToScene(payload);
    case 'json': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch (error) {
        throw new Error(
          `JSON inválido: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      return figmaJsonToScene(parsed);
    }
    case 'figma-native':
      throw new Error(
        'Isto é a cópia nativa do Figma (formato binário interno, não documentado). ' +
          'No Figma, use o botão direito › Copy/Paste as › Copy as SVG, ou cole o JSON da API REST.',
      );
    case 'unknown':
      throw new Error(
        'Não reconheci o conteúdo: cole um SVG ou um JSON da API do Figma.',
      );
  }
}
