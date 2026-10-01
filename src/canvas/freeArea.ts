// Maior área retangular livre dentro de uma marcação, fora das filhas diretas.
// Função pura (sem DOM): as coordenadas podem ser as da imagem ou as do canvas.
import type { Rect } from '../model';

export interface FreeAreaOptions {
  /** Tamanho mínimo desejado: entre as áreas que cabem nele, vence a maior. */
  readonly minWidth?: number;
  readonly minHeight?: number;
}

/**
 * Maior retângulo dentro de `outer` que não cobre nenhum de `blocks` (as filhas).
 * As bordas de `outer` e das filhas formam uma grade de candidatos; cada célula
 * está livre ou coberta, e a busca testa cada faixa de linhas contíguas com as
 * colunas livres nela inteira: O(linhas² × colunas), com poucas filhas por marcação.
 *
 * Com `minWidth`/`minHeight`, prefere a maior área que cabe nesse tamanho (uma
 * faixa fina e comprida pode ter mais área e não caber texto); se nenhuma couber,
 * devolve a maior de todas. Sem área livre, `null`.
 */
export function largestFreeRect(
  outer: Rect,
  blocks: readonly Rect[],
  options: FreeAreaOptions = {},
): Rect | null {
  const x0 = outer.x;
  const y0 = outer.y;
  const x1 = outer.x + outer.width;
  const y1 = outer.y + outer.height;
  if (outer.width <= 0 || outer.height <= 0) return null;
  const clampX = (v: number) => Math.min(Math.max(v, x0), x1);
  const clampY = (v: number) => Math.min(Math.max(v, y0), y1);
  const inside = blocks
    .map((b) => ({
      x0: clampX(b.x),
      y0: clampY(b.y),
      x1: clampX(b.x + b.width),
      y1: clampY(b.y + b.height),
    }))
    .filter((b) => b.x1 > b.x0 && b.y1 > b.y0);

  const xs = uniqueSorted([x0, x1, ...inside.flatMap((b) => [b.x0, b.x1])]);
  const ys = uniqueSorted([y0, y1, ...inside.flatMap((b) => [b.y0, b.y1])]);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  // Célula (linha, coluna) coberta por alguma filha.
  const covered: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const cy = ((ys[r] as number) + (ys[r + 1] as number)) / 2;
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      const cx = ((xs[c] as number) + (xs[c + 1] as number)) / 2;
      row.push(inside.some((b) => cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1));
    }
    covered.push(row);
  }

  const minWidth = options.minWidth ?? 0;
  const minHeight = options.minHeight ?? 0;
  let best: Rect | null = null;
  let bestFits = false;
  const consider = (candidate: Rect) => {
    const fits = candidate.width >= minWidth && candidate.height >= minHeight;
    const larger =
      best === null || candidate.width * candidate.height > best.width * best.height;
    if ((fits && !bestFits) || (fits === bestFits && larger)) {
      best = candidate;
      bestFits = fits;
    }
  };

  for (let top = 0; top < rows; top++) {
    // Coluna livre em todas as linhas de `top` até `bottom`.
    const free = new Array<boolean>(cols).fill(true);
    for (let bottom = top; bottom < rows; bottom++) {
      const coveredRow = covered[bottom] as boolean[];
      for (let c = 0; c < cols; c++) if (coveredRow[c]) free[c] = false;
      const y = ys[top] as number;
      const height = (ys[bottom + 1] as number) - y;
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        if (c < cols && free[c]) {
          if (start < 0) start = c;
          continue;
        }
        if (start >= 0) {
          const x = xs[start] as number;
          consider({ x, y, width: (xs[c] as number) - x, height });
          start = -1;
        }
      }
    }
  }
  return best;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
