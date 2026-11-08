import type { Rect } from './types';

// Índice espacial de um espaço (#882, decisão 4): dado um retângulo, devolve sem varrer o espaço
// inteiro as marcações que podem contê-lo. Puro (sem API de navegador), para o modelo e o MCP.
//
// Estrutura: grade de resolução própria por tamanho. Cada retângulo `R` cai numa classe `(ex, ey)`
// pelas potências de dois `2^ex ≥ largura` e `2^ey ≥ altura`, e numa célula `(cx, cy)` pelo canto
// superior esquerdo (`floor(x / 2^ex)`). Quem contém um retângulo `r` contém o ponto `(r.x, r.y)`,
// e a largura de `R` cabe numa célula, então `cx` fica entre `floor(r.x / 2^ex) - 1` e `floor(r.x / 2^ex)`:
// por classe se olham poucas células (de 2 a 4 por eixo). O custo de uma consulta é o número de classes
// de tamanho presentes mais o das marcações que dividem essas células com o ponto.
//
// Caso degenerado (continua quadrático, e é dito de propósito): muitas marcações enormes que cobrem
// todas as outras, ou retângulos que não cabem na grade (largura ou altura ≤ 0, não finita, ou
// minúscula demais), vão para a lista "solta", que toda consulta percorre inteira.

const MIN_EXP = -10;
const MAX_EXP = 40;
/** Coordenadas de célula com módulo menor que isto cabem na chave numérica; o resto vai para a lista solta. */
const CELL_LIMIT = 2 ** 24;
const CELL_SHIFT = 2 ** 25;
const CELL_STRIDE = 2 ** 26;

interface SizeClass {
  readonly sx: number;
  readonly sy: number;
  /** Chave da célula → posições dos itens (em ordem crescente). */
  readonly cells: Map<number, number[]>;
}

export interface RectIndex<T> {
  /**
   * Um superconjunto, na ordem em que foram dados, dos itens cujo retângulo contém `inner` com a
   * folga `slack` (`containsRect` com `slack` 0, `containsRectApprox` com a folga dele). Quem chama
   * confere o predicado exato; o índice só poda quem está longe.
   */
  readonly containing: (inner: Rect, slack?: number) => T[];
}

const cellKey = (cx: number, cy: number): number =>
  (cx + CELL_SHIFT) * CELL_STRIDE + (cy + CELL_SHIFT);

/** Menor expoente `e` com `2^e ≥ size`, ou `null` se `size` não cabe na grade. */
function exponentOf(size: number): number | null {
  if (!(size > 0) || !Number.isFinite(size)) return null;
  let e = Math.ceil(Math.log2(size));
  if (2 ** e < size) e++;
  return e >= MIN_EXP && e <= MAX_EXP ? e : null;
}

/** A classe e a célula de `r`, ou `null` (vai para a lista solta). */
function placeOf(r: Rect): { ex: number; ey: number; cx: number; cy: number } | null {
  const ex = exponentOf(r.width);
  const ey = exponentOf(r.height);
  if (ex === null || ey === null) return null;
  const cx = Math.floor(r.x / 2 ** ex);
  const cy = Math.floor(r.y / 2 ** ey);
  const fits = Math.abs(cx) < CELL_LIMIT && Math.abs(cy) < CELL_LIMIT;
  return fits ? { ex, ey, cx, cy } : null;
}

/** Monta o índice de `items`; a posição em `items` é a ordem das respostas. */
export function buildRectIndex<T>(
  items: readonly T[],
  rectOf: (item: T) => Rect,
): RectIndex<T> {
  const classes = new Map<number, SizeClass>();
  const loose: number[] = [];
  items.forEach((item, pos) => {
    const place = placeOf(rectOf(item));
    if (place === null) {
      loose.push(pos);
      return;
    }
    const id = place.ex * 128 + place.ey;
    let cls = classes.get(id);
    if (!cls) {
      cls = { sx: 2 ** place.ex, sy: 2 ** place.ey, cells: new Map() };
      classes.set(id, cls);
    }
    const key = cellKey(place.cx, place.cy);
    const cell = cls.cells.get(key);
    if (cell) cell.push(pos);
    else cls.cells.set(key, [pos]);
  });
  const sizeClasses = [...classes.values()];

  const containing = (inner: Rect, slack = 0): T[] => {
    // Retângulo inválido (largura ou altura negativa, NaN): sem poda possível.
    if (
      !(inner.width >= 0) ||
      !(inner.height >= 0) ||
      !Number.isFinite(inner.x + inner.y)
    ) {
      return items.slice();
    }
    const found = [...loose];
    const padX = slack + 1e-9 * (1 + Math.abs(inner.x));
    const padY = slack + 1e-9 * (1 + Math.abs(inner.y));
    for (const cls of sizeClasses) collectCells(cls, inner, padX, padY, found);
    // As soltas e as das classes vêm em posições diferentes: restaura a ordem de `items`.
    if (found.length > 1) found.sort((a, b) => a - b);
    return found.map((pos) => items[pos] as T);
  };
  return { containing };
}

/** Junta em `out` as posições das células da classe que podem conter o ponto de `inner`. */
function collectCells(
  cls: SizeClass,
  inner: Rect,
  padX: number,
  padY: number,
  out: number[],
): void {
  const x0 = Math.floor((inner.x - padX) / cls.sx) - 1;
  const x1 = Math.floor((inner.x + padX) / cls.sx);
  const y0 = Math.floor((inner.y - padY) / cls.sy) - 1;
  const y1 = Math.floor((inner.y + padY) / cls.sy);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const cell = cls.cells.get(cellKey(cx, cy));
      if (cell) for (const pos of cell) out.push(pos);
    }
  }
}
