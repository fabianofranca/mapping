// Medidas (px de tela) e utilitários compartilhados pelos renderers.
import type { Rect } from '../../model';

export const SELECTION_STROKE = 2;
/** Opacidade total (sem esmaecer): não é valor de design, só o oposto das opacidades do tema. */
export const OPAQUE = 1;
/** Largura do halo de cada lado de uma linha (px de tela). */
export const HALO_WIDTH = 1;
export const REVIEW_BADGE_SIZE = 14;
/** Risco do nome da removida na revisão (px de tela): espessura e altura na caixa do texto (0 = topo, 1 = base). */
export const STRIKE_WIDTH = 1.5;
export const STRIKE_HEIGHT = 0.55;
/** Margem do canto superior esquerdo da marcação, onde ficam o selo "a revisar" e o alerta (px de tela). */
export const CORNER_MARGIN = 3;
/** Alerta de anotação incompleta, no canto depois do selo "a revisar" (px de tela). */
export const ALERT_GLYPH = '⚠';
export const ALERT_SIZE = 13;
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
