import type { Marking, Project, ProjectContainer } from './types';

// O que uma operação mexeu entre `before` e `next`, para o assentar recortado (#882, decisão 5).
// Compara objetos (`!==`), nunca valores: o projeto é imutável, e o que a operação não tocou continua
// sendo o mesmo objeto. Puro e sem API de navegador.

export interface SettleDelta {
  /** Índices em `next.markings` das marcações novas ou com outro objeto. */
  readonly changed: readonly number[];
  /** Marcações de `before` que foram apagadas ou trocadas por outro objeto. */
  readonly old: readonly Marking[];
  /**
   * Espaços (`null` = o canvas) a assentar inteiros: o de todo container novo, apagado ou trocado e o
   * canvas; o espaço cuja ordem relativa das marcações mudou; o canvas se uma marcação dele mudou.
   */
  readonly full: ReadonlySet<string | null>;
  /**
   * As marcações que não mudaram estão nas mesmas posições de antes (a operação só trocou objetos ou
   * acrescentou no fim): as posições do índice de `before` valem para `next`.
   */
  readonly stable: boolean;
}

interface MarkingDelta {
  readonly changed: number[];
  readonly old: Marking[];
  readonly reordered: Set<string | null>;
  stable: boolean;
}

/**
 * Compara `before` e `next`. `null` quando recortar não compensa (mais da metade das marcações mudou,
 * ou o projeto tem ids repetidos): assenta-se o projeto inteiro.
 */
export function settleDelta(before: Project, next: Project): SettleDelta | null {
  const markings = markingDelta(before.markings, next.markings);
  if (markings === null) return null;
  const full = new Set<string | null>(markings.reordered);
  addContainerSpaces(before.containers, next.containers, full);
  const touched = [...markings.old, ...markings.changed.map((i) => next.markings[i])];
  if (touched.some((m) => m?.containerId === null)) full.add(null);
  return { changed: markings.changed, old: markings.old, full, stable: markings.stable };
}

function markingDelta(
  was: readonly Marking[],
  now: readonly Marking[],
): MarkingDelta | null {
  const delta: MarkingDelta = {
    changed: [],
    old: [],
    reordered: new Set(),
    stable: true,
  };
  if (was === now) return delta;
  // Mesmas marcações na mesma ordem (a operação só trocou objetos): compara posição a posição.
  if (was.length === now.length && sameOrder(was, now)) {
    for (let i = 0; i < now.length; i++) {
      if (was[i] === now[i]) continue;
      delta.changed.push(i);
      delta.old.push(was[i] as Marking);
    }
  } else if (!diffMiddle(was, now, delta)) {
    return null;
  }
  return delta.changed.length + delta.old.length > now.length / 2 ? null : delta;
}

function sameOrder(was: readonly Marking[], now: readonly Marking[]): boolean {
  for (let i = 0; i < now.length; i++) {
    if ((was[i] as Marking).id !== (now[i] as Marking).id) return false;
  }
  return true;
}

/**
 * Criou, apagou ou reordenou: tira o prefixo e o sufixo de mesmos objetos e compara só o meio.
 * `false` se o meio passa da metade ou há id repetido (na dúvida, o projeto inteiro).
 */
function diffMiddle(
  was: readonly Marking[],
  now: readonly Marking[],
  delta: MarkingDelta,
): boolean {
  let start = 0;
  const shortest = Math.min(was.length, now.length);
  while (start < shortest && was[start] === now[start]) start++;
  let endWas = was.length;
  let endNow = now.length;
  while (endWas > start && endNow > start && was[endWas - 1] === now[endNow - 1]) {
    endWas--;
    endNow--;
  }
  // Só acrescentou no fim: o que já existia continua na mesma posição.
  delta.stable = start === was.length;
  const middleWas = was.slice(start, endWas);
  const middleNow = now.slice(start, endNow);
  if (middleWas.length + middleNow.length > now.length) return false;
  const byId = new Map(middleWas.map((m) => [m.id, m]));
  if (byId.size !== middleWas.length) return false;
  const unchanged = collectChanges(byId, middleNow, start, delta);
  if (unchanged === null) return false;
  delta.old.push(...byId.values());
  addReordered(middleWas, middleNow, unchanged, delta.reordered);
  return true;
}

/**
 * Registra as marcações novas ou trocadas do meio (e tira de `byId` as que continuam, sobrando só as
 * apagadas e as trocadas). Devolve os ids que continuam com o mesmo objeto, ou `null` com id repetido.
 */
function collectChanges(
  byId: Map<string, Marking>,
  middleNow: readonly Marking[],
  offset: number,
  delta: MarkingDelta,
): Set<string> | null {
  const unchanged = new Set<string>();
  const seen = new Set<string>();
  for (let j = 0; j < middleNow.length; j++) {
    const m = middleNow[j] as Marking;
    if (seen.has(m.id)) return null;
    seen.add(m.id);
    const old = byId.get(m.id);
    if (old === m) {
      unchanged.add(m.id);
      byId.delete(m.id);
      continue;
    }
    delta.changed.push(offset + j);
    // A trocada fica em `byId` até o fim: entra em `old` com as apagadas.
  }
  return unchanged;
}

/** Soma os espaços onde a sequência dos ids que não mudaram, no meio, não é a mesma de antes. */
function addReordered(
  was: readonly Marking[],
  now: readonly Marking[],
  unchanged: ReadonlySet<string>,
  spaces: Set<string | null>,
): void {
  const sequences = (list: readonly Marking[]) => {
    const bySpace = new Map<string | null, string[]>();
    for (const m of list) {
      if (!unchanged.has(m.id)) continue;
      const ids = bySpace.get(m.containerId);
      if (ids) ids.push(m.id);
      else bySpace.set(m.containerId, [m.id]);
    }
    return bySpace;
  };
  const after = sequences(now);
  for (const [space, ids] of sequences(was)) {
    if (after.get(space)?.join('\u0000') !== ids.join('\u0000')) spaces.add(space);
  }
}

/** Soma o espaço de cada container novo, apagado ou trocado, e o canvas (onde moram os pais deles). */
function addContainerSpaces(
  was: readonly ProjectContainer[],
  now: readonly ProjectContainer[],
  spaces: Set<string | null>,
): void {
  if (was === now) return;
  const byId = new Map(was.map((c) => [c.id, c]));
  const touch = (c: ProjectContainer) => {
    spaces.add(c.id);
    spaces.add(null);
  };
  for (const c of now) {
    if (byId.get(c.id) !== c) touch(c);
    byId.delete(c.id);
  }
  for (const c of byId.values()) touch(c);
  // Mesmos containers em outra ordem: o container de um retângulo do canvas pode mudar.
  if (
    was.length === now.length &&
    now.some((c, i) => (was[i] as ProjectContainer).id !== c.id)
  ) {
    spaces.add(null);
  }
}
