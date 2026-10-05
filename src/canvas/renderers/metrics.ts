// Medidas (px de tela) e utilitários compartilhados pelos renderers.
import type { Rect } from '../../model';

export const SELECTION_STROKE = 2;
/** Largura do halo de cada lado de uma linha (px de tela). */
export const HALO_WIDTH = 1;
export const REVIEW_BADGE_SIZE = 14;
/** Indicadores de camada: bolinhas (px de tela), no máximo `MAX_DOTS` e depois "+N". */
export const DOT_RADIUS = 4;
export const DOT_GAP = 3;
export const DOT_MARGIN = 3;
export const MAX_DOTS = 4;
/** Alerta de anotação incompleta, depois das bolinhas (px de tela). */
export const ALERT_GLYPH = '⚠';
export const ALERT_SIZE = 13;
/** Largura reservada para o "+N" depois das bolinhas (px de tela). */
export const MORE_WIDTH = 22;
export const ELLIPSIS = '…';
/** Emblema do cadeado: o traço ocupa esta fração do lado, a grade do ícone tem 16 unidades. */
export const LOCK_GLYPH_RATIO = 0.7;
export const LOCK_GLYPH_GRID = 16;
/** Vão entre o emblema do cadeado e a borda do item (px de tela). */
export const LOCK_BADGE_GAP = 2;

/** `fontStyle` do Konva para um peso numérico (os pesos 400 e 600 vêm de `--t-cv-*-weight`). */
export function fontStyle(weight: number, italic = false): string {
  const w = weight === 400 ? '' : String(weight);
  return [italic ? 'italic' : '', w].filter(Boolean).join(' ') || 'normal';
}

/** Mesmos itens (por referência) na mesma ordem. */
export function sameInputs(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  return a !== null && a.length === b.length && a.every((item, i) => item === b[i]);
}

export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
