import type { SettleDelta } from './settleDelta';
import type { Marking, Rect } from './types';

// Posições (índices em `markings`) e caixas das marcações de cada espaço, guardadas por array de
// marcações assentado (#882): o assentar recortado varre só o espaço que a operação mexeu, em números
// contíguos, sem olhar o projeto inteiro nem cada objeto. A tabela é parcial e enche sob demanda: um
// espaço sem entrada é desconhecido (não vazio) e é achado varrendo uma vez. A tabela de uma operação
// sai da anterior quando ela só acrescentou no fim ou trocou objetos (`SettleDelta.stable`); nos demais
// casos a próxima enche de novo. Puro.

/**
 * As marcações (não flutuantes) de um espaço. Os vetores são compartilhados entre as versões de um
 * espaço que só cresce no fim: cada entrada enxerga os primeiros `count` itens, e acrescentar não
 * copia nada (só quem está na ponta acrescenta no lugar; quem não está, copia).
 */
export interface SpaceEntry {
  /** Quantas marcações a entrada enxerga. */
  readonly count: number;
  /** Posições crescentes no array `markings`; vale o prefixo de `count`. */
  readonly positions: number[];
  /** `x, y, x2, y2` de cada uma, na mesma ordem; vale o prefixo de `4 × count`. */
  readonly boxes: Float64Array;
}

/** Entradas de alguns espaços: o id do container ou `null` para o canvas. */
export type PositionTable = ReadonlyMap<string | null, SpaceEntry>;

const tables = new WeakMap<readonly Marking[], PositionTable>();

/** A tabela do array, se alguém a guardou. */
export function knownPositions(markings: readonly Marking[]): PositionTable | undefined {
  return tables.get(markings);
}

/** Guarda a tabela do array. */
export function rememberPositions(
  markings: readonly Marking[],
  table: PositionTable,
): void {
  tables.set(markings, table);
}

function boxOf(rect: Rect): [number, number, number, number] {
  return [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
}

/** Varre o array e monta a entrada do espaço (com folga para crescer). */
export function scanSpaceEntry(
  list: readonly Marking[],
  space: string | null,
): SpaceEntry {
  const positions: number[] = [];
  const found: Rect[] = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i] as Marking;
    if (m.containerId !== space || m.floating) continue;
    positions.push(i);
    found.push(m.rect);
  }
  const boxes = new Float64Array(Math.max(64, found.length * 8));
  found.forEach((rect, k) => boxes.set(boxOf(rect), k * 4));
  return { count: found.length, positions, boxes };
}

/** A entrada com mais uma marcação no fim. */
function appended(entry: SpaceEntry, i: number, rect: Rect): SpaceEntry {
  const { count } = entry;
  let { positions, boxes } = entry;
  if (positions.length !== count) {
    // Outro ramo (desfazer e refazer) já acrescentou depois de `count`: cópia própria.
    positions = positions.slice(0, count);
    boxes = boxes.slice(0, count * 4);
  }
  if (boxes.length < (count + 1) * 4) {
    const bigger = new Float64Array(Math.max(64, boxes.length * 2));
    bigger.set(boxes.subarray(0, count * 4));
    boxes = bigger;
  }
  positions.push(i);
  boxes.set(boxOf(rect), count * 4);
  return { count: count + 1, positions, boxes };
}

/**
 * A tabela de `now` a partir da de `was` (a operação só acrescentou no fim ou trocou objetos de lugar),
 * só com os espaços que `known` já tinha: o espaço de uma marcação trocada sai da tabela (volta a ser
 * desconhecido) e as acrescentadas entram no fim da entrada do espaço delas.
 */
export function advancePositions(
  known: PositionTable,
  delta: SettleDelta,
  was: readonly Marking[],
  now: readonly Marking[],
): PositionTable {
  const table = new Map(known);
  for (const i of delta.changed) {
    const m = now[i] as Marking;
    if (i < was.length) {
      table.delete((was[i] as Marking).containerId);
      table.delete(m.containerId);
      continue;
    }
    const entry = table.get(m.containerId);
    if (entry && !m.floating) table.set(m.containerId, appended(entry, i, m.rect));
  }
  return table;
}
