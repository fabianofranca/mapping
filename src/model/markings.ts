import { fail } from './errors';
import {
  IDENTITY_PLACEMENT,
  MIN_MARKING_SIZE,
  bottom,
  clamp,
  containsRect,
  fromCanvasRect,
  imagePixelRect,
  isIntegerRect,
  right,
  translateRect,
  type Size,
} from './geometry';
import { descendantIds, descendantsOf } from './hierarchy';
import {
  markingCanvasRectOf,
  settleIf,
  spaceOf,
  type SettleOptions,
} from './hierarchySettle';
import { canDeleteMarking, canEditMarkingGeometry, requireUnlocked } from './locks';
import { findById, normalizeOptionalName, updateById } from './project';
import { projectIndex } from './projectIndex';
import { countBrokenRefs } from './refs';
import type { Marking, Project, Rect } from './types';

/**
 * Opções das operações que mudam o retângulo. `minSize` é o tamanho mínimo do componente que
 * desenha a marcação (etapa Biblioteca): quem chama o lê do catálogo e o passa aqui; o modelo
 * não conhece componentes. Sem a opção nada muda. `settle` e `minSizeOf` são do assentar
 * (`SettleOptions`): `settle: false` só nas prévias de gesto; `minSizeOf` dá o mínimo de
 * qualquer marcação (as descendentes que trocam de espaço junto) e, quando falta, a própria
 * marcação da operação usa `minSize`.
 */
export interface RectOptions extends SettleOptions {
  readonly minSize?: Size;
}

function checkRectShape(rect: Rect, options?: RectOptions): void {
  if (!isIntegerRect(rect)) fail('rect-not-integer');
  if (rect.width < MIN_MARKING_SIZE || rect.height < MIN_MARKING_SIZE)
    fail('rect-too-small');
  const min = options?.minSize;
  if (min && (rect.width < min.width || rect.height < min.height)) fail('rect-too-small');
}

/**
 * Assenta ao fim da operação (salvo `settle: false`). Sem `minSizeOf`, o `minSize` vale para a
 * marcação da operação; com `minSizeOf`, o `minSize` ainda vale para ela e o `minSizeOf` para
 * as demais.
 */
function settled(p: Project, markingId: string, options?: RectOptions): Project {
  const min = options?.minSize;
  if (min === undefined) return settleIf(p, options);
  const minSizeOf = options?.minSizeOf;
  return settleIf(p, {
    ...options,
    minSizeOf: (id) => (id === markingId ? min : (minSizeOf?.(id) ?? null)),
  });
}

/**
 * Limite onde a marcação pode ficar: o retângulo do container dela, em pixels dele; `null` na
 * marcação do canvas (sem limite). O pai não limita mais: o pai é derivado da geometria.
 */
export function markingBounds(p: Project, markingId: string): Rect | null {
  return spaceOf(p, findById(p.markings, markingId)).bounds;
}

export interface NewMarkingArgs {
  readonly id: string;
  /** Container da marcação (`rect` em pixels dele) ou `null`: marcação do canvas (unidades do canvas). */
  readonly containerId: string | null;
  readonly rect: Rect;
  readonly name?: string | null;
  /** Flutuante (v13): só no canvas (`containerId` nulo); padrão `false`. */
  readonly floating?: boolean;
}

/**
 * Cria uma marcação. Com container, o `rect` (pixels dele) precisa estar inteiro dentro dele;
 * no canvas, qualquer posição inteira serve. Não escolhe o pai nem confere o espaço: assenta
 * (o pai é a menor marcação do mesmo espaço que a contém, e um retângulo do canvas que cabe
 * inteiro num container passa a ser dele).
 */
export function createMarking(
  p: Project,
  args: NewMarkingArgs,
  options?: RectOptions,
): Project {
  if (p.markings.some((m) => m.id === args.id)) fail('duplicate-id', args.id);
  const floating = args.floating ?? false;
  if (floating && args.containerId !== null) fail('invalid-space', args.id);
  const container =
    args.containerId === null ? null : findById(p.containers, args.containerId);
  checkRectShape(args.rect, options);
  if (container && !containsRect(imagePixelRect(container), args.rect)) {
    fail('rect-out-of-image');
  }
  const marking: Marking = {
    id: args.id,
    containerId: args.containerId,
    parentId: null,
    name: normalizeOptionalName(args.name ?? null),
    rect: {
      x: args.rect.x,
      y: args.rect.y,
      width: args.rect.width,
      height: args.rect.height,
    },
    needsReview: false,
    locked: false,
    floating,
    source: null,
  };
  return settled({ ...p, markings: [...p.markings, marking] }, args.id, options);
}

export function renameMarking(
  p: Project,
  markingId: string,
  name: string | null,
): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, name: normalized })),
  };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Altera o retângulo (redimensionar ou ajuste fino). Redimensionar é livre e não move as
 * filhas: o que deixa de caber no retângulo deixa de ser membro ao assentar. Só o container
 * limita (marcação de container fica inteira dentro dele; no canvas, sem limite). O retângulo
 * atual não é mudança: devolve `p` como está, sem conferir a trava (a reexportação completa
 * de um item trancado passa).
 */
export function setMarkingRect(
  p: Project,
  markingId: string,
  rect: Rect,
  options?: RectOptions,
): Project {
  const marking = findById(p.markings, markingId);
  if (sameRect(marking.rect, rect)) return p;
  checkRectShape(rect, options);
  requireUnlocked(canEditMarkingGeometry(p, markingId));
  const bounds = markingBounds(p, markingId);
  if (bounds && !containsRect(bounds, rect)) fail('rect-out-of-image');
  const copy: Rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  return settled(
    {
      ...p,
      markings: updateById(p.markings, markingId, (m) => ({ ...m, rect: copy })),
    },
    markingId,
    options,
  );
}

/**
 * Move a marcação pelo deslocamento (inteiro). Dentro de um container, leva também todos os
 * descendentes (trancados inclusive: a posição relativa entre eles e a marcação não muda); no
 * canvas, a marcação é uma lente e se move sozinha (flutuante inclusive). Nada prende a
 * marcação ao container: ela pode sair dele, e o assentar decide o espaço novo, convertendo o
 * `rect` dela e o das descendentes. Deslocamento zero não é mudança: devolve `p` como está,
 * sem conferir a trava.
 */
export function moveMarking(
  p: Project,
  markingId: string,
  dx: number,
  dy: number,
  options?: RectOptions,
): Project {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) fail('rect-not-integer');
  const marking = findById(p.markings, markingId);
  if (dx === 0 && dy === 0) return p;
  requireUnlocked(canEditMarkingGeometry(p, markingId));
  const affected =
    marking.containerId === null ? new Set<string>() : descendantIds(p, markingId);
  affected.add(markingId);
  return settled(
    {
      ...p,
      markings: p.markings.map((m) =>
        affected.has(m.id) ? { ...m, rect: translateRect(m.rect, dx, dy) } : m,
      ),
    },
    markingId,
    options,
  );
}

/**
 * Ajuste fino de um campo do retângulo (painel de detalhes), com o valor limitado às regras em
 * vez de rejeitado: `x`/`y` movem a marcação (com os descendentes, dentro de um container,
 * como arrastar) e, numa marcação de container, param no limite do container (o painel não
 * ejeta; no canvas são livres); `width`/`height` redimensionam mantendo o canto superior
 * esquerdo, do tamanho mínimo ao limite do container (no canvas, sem máximo). Com
 * `options.minSize` (componente), o mínimo do componente também limita por baixo.
 */
export function adjustMarkingRect(
  p: Project,
  markingId: string,
  field: keyof Rect,
  value: number,
  options?: RectOptions,
): Project {
  if (!Number.isInteger(value)) fail('rect-not-integer');
  const { rect } = findById(p.markings, markingId);
  const bounds = markingBounds(p, markingId);
  if (field === 'x' || field === 'y') {
    const horizontal = field === 'x';
    const size = horizontal ? rect.width : rect.height;
    const low = bounds ? (horizontal ? bounds.x : bounds.y) : -Infinity;
    const high = bounds ? (horizontal ? right(bounds) : bottom(bounds)) - size : Infinity;
    const delta = clamp(value, low, high) - rect[field];
    if (delta === 0) return p;
    return moveMarking(
      p,
      markingId,
      horizontal ? delta : 0,
      horizontal ? 0 : delta,
      options,
    );
  }
  const minimum = Math.max(MIN_MARKING_SIZE, options?.minSize?.[field] ?? 0);
  const maximum = bounds
    ? field === 'width'
      ? right(bounds) - rect.x
      : bottom(bounds) - rect.y
    : Infinity;
  const size = clamp(value, minimum, maximum);
  if (size === rect[field]) return p;
  return setMarkingRect(p, markingId, { ...rect, [field]: size }, options);
}

/**
 * Liga ou desliga a marcação flutuante (v13): comentário sobre o canvas, fora da árvore de
 * pertencimento nos dois sentidos. Ligar tira a marcação do container (converte o `rect` para
 * unidades do canvas, como a pessoa a vê) e zera `containerId` e `parentId`; as filhas ficam
 * onde estão e o assentar as reparenta. Desligar só limpa a flag: o assentar a devolve ao
 * container que a contém inteira, se houver. É geometria: a trava impede nos dois sentidos.
 */
export function setMarkingFloating(
  p: Project,
  markingId: string,
  floating: boolean,
  options?: RectOptions,
): Project {
  const marking = findById(p.markings, markingId);
  if (marking.floating === floating) return p;
  requireUnlocked(canEditMarkingGeometry(p, markingId));
  let next: Marking;
  if (floating) {
    const min = options?.minSize ?? options?.minSizeOf?.(markingId) ?? null;
    next = {
      ...marking,
      containerId: null,
      parentId: null,
      floating: true,
      rect: fromCanvasRect(
        IDENTITY_PLACEMENT,
        markingCanvasRectOf(p, marking),
        null,
        min,
      ),
    };
  } else {
    next = { ...marking, floating: false };
  }
  return settled(
    { ...p, markings: updateById(p.markings, markingId, () => next) },
    markingId,
    options,
  );
}

/** Limpa a flag `needsReview` ("Confirmar posição"). */
export function confirmMarkingReview(p: Project, markingId: string): Project {
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, needsReview: false })),
  };
}

export function markingDeletionImpact(
  p: Project,
  markingId: string,
): {
  descendants: number;
  /** Quantos dos descendentes estão trancados (serão excluídos junto). */
  lockedDescendants: number;
  annotations: number;
  /** Containers que têm a marcação (ou uma descendente) como pai: ficam, passam ao pai dela. */
  containers: number;
  brokenRefs: number;
} {
  findById(p.markings, markingId);
  const ids = descendantIds(p, markingId);
  const descendants = ids.size;
  const lockedDescendants = descendantsOf(p, markingId).filter((m) => m.locked).length;
  ids.add(markingId);
  const byParent = projectIndex(p).containersByParent;
  let containers = 0;
  for (const id of ids) containers += byParent.get(id)?.length ?? 0;
  return {
    descendants,
    lockedDescendants,
    annotations: p.annotations.filter((a) => ids.has(a.markingId)).length,
    containers,
    brokenRefs: countBrokenRefs(p, cascadeRemove(p, markingId)),
  };
}

/**
 * Exclui a marcação, os descendentes (trancados ou não) e as anotações de todos eles; nunca um
 * container: os que estavam dentro dela passam ao pai dela, ou a nenhum (o assentar refaz).
 * Falha só se a própria marcação estiver trancada.
 */
export function removeMarking(
  p: Project,
  markingId: string,
  options?: SettleOptions,
): Project {
  findById(p.markings, markingId);
  requireUnlocked(canDeleteMarking(p, markingId));
  return settleIf(cascadeRemove(p, markingId), options);
}

/** A exclusão em si, sem a trava nem o assentar: também serve para contar o impacto. */
function cascadeRemove(p: Project, markingId: string): Project {
  const ids = descendantIds(p, markingId).add(markingId);
  return {
    ...p,
    markings: p.markings.filter((m) => !ids.has(m.id)),
    annotations: p.annotations.filter((a) => !ids.has(a.markingId)),
  };
}

// ---------------------------------------------------------------------------
// Ordem entre irmãs

/**
 * Irmãs da marcação (mesmo pai e mesmo espaço, ela inclusive), na ordem do array: o mesmo
 * `containerId`, e `null` com `null` (as do canvas, flutuantes inclusive).
 */
function siblingsOf(p: Project, marking: Marking): readonly Marking[] {
  const group = projectIndex(p).children.get(marking.parentId) ?? [];
  return group.filter((m) => m.containerId === marking.containerId);
}

/**
 * Posição da marcação entre as irmãs (0 = a primeira, desenhada por baixo) e quantas irmãs
 * existem, ela inclusive. A ordem é a do array `markings`.
 */
export function siblingPosition(
  p: Project,
  markingId: string,
): { index: number; count: number } {
  const marking = findById(p.markings, markingId);
  const siblings = siblingsOf(p, marking);
  return { index: siblings.findIndex((m) => m.id === markingId), count: siblings.length };
}

/**
 * Move a marcação para a posição `index` entre as irmãs (0 = por baixo, a última = por
 * cima). As irmãs ocupam as mesmas casas do array; as outras marcações não mudam de lugar.
 * Não é geometria: a trava não impede. Mesma posição devolve `p` como está; fora de
 * `[0, count - 1]` falha com `invalid-index`.
 */
export function reorderMarking(p: Project, markingId: string, index: number): Project {
  const marking = findById(p.markings, markingId);
  const siblings = siblingsOf(p, marking);
  if (!Number.isInteger(index) || index < 0 || index >= siblings.length) {
    fail('invalid-index');
  }
  const from = siblings.findIndex((m) => m.id === markingId);
  if (from === index) return p;
  const order = siblings.filter((m) => m.id !== markingId);
  order.splice(index, 0, marking);
  const slots = new Set(siblings.map((m) => m.id));
  let next = 0;
  return {
    ...p,
    markings: p.markings.map((m) => (slots.has(m.id) ? (order[next++] as Marking) : m)),
  };
}
