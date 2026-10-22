import { fail } from './errors';
import { right, bottom, toCanvasPoint } from './geometry';
import {
  CANVAS_SPACE,
  containerSpace,
  markingCanvasRectOf,
  type Space,
} from './hierarchySettle';
import { canEditArrow, requireUnlocked } from './locks';
import { findById, normalizeOptionalName, updateById } from './project';
import { projectIndex } from './projectIndex';
import { countBrokenRefs } from './refs';
import {
  ARROW_SIDES,
  ARROW_STYLES,
  DEFAULT_ARROW_STYLE,
  type Arrow,
  type ArrowPoint,
  type ArrowSide,
  type ArrowStyle,
  type Marking,
  type Project,
  type Rect,
} from './types';

// Setas (etapa Marcações espaciais, ME4; decisão 14): uma seta é uma marcação que aponta. Liga
// duas MARCAÇÕES (`from`, `to`; nunca outra seta nem um container), tem rota (`points`) e estilo
// próprios e pode ter anotações por camada (`annotations[].markingId` = id da seta; os ids das
// setas e os das marcações dividem o mesmo espaço). Fica fora da árvore de pertencimento: não
// tem `rect`, container nem pai, e nada a carrega num arrasto. Funções puras e imutáveis.

/** Ponta da seta: a origem (`from`) ou o destino (`to`). */
export type ArrowEnd = 'from' | 'to';

// ---------------------------------------------------------------------------
// Consultas

/**
 * Setas presas à marcação, na ordem do array: as que saem dela (`outgoing`, ela é a origem) e as
 * que chegam nela (`incoming`, ela é o destino).
 */
export function arrowsOf(
  p: Project,
  markingId: string,
): { readonly outgoing: Arrow[]; readonly incoming: Arrow[] } {
  const attached = projectIndex(p).arrowsByMarking.get(markingId) ?? [];
  return {
    outgoing: attached.filter((a) => a.from === markingId),
    incoming: attached.filter((a) => a.to === markingId),
  };
}

/**
 * Os dados do rótulo de uma seta, para a interface montar o texto traduzido: o `name` dela e as
 * marcações das pontas ("Origem → Destino" quando não há `name`). Ponta inexistente (projeto
 * inválido) vem `null`.
 */
export interface ArrowLabel {
  readonly name: string | null;
  readonly from: Marking | null;
  readonly to: Marking | null;
}

export function arrowLabel(
  p: Project,
  arrow: Pick<Arrow, 'name' | 'from' | 'to'>,
): ArrowLabel {
  const markings = projectIndex(p).markings;
  return {
    name: arrow.name,
    from: markings.get(arrow.from) ?? null,
    to: markings.get(arrow.to) ?? null,
  };
}

/**
 * Container onde a seta aparece na revisão e nas listas: o da marcação de origem; `null` = o
 * canvas (origem do canvas ou inexistente).
 */
export function arrowContainerId(p: Project, arrow: Pick<Arrow, 'from'>): string | null {
  return projectIndex(p).markings.get(arrow.from)?.containerId ?? null;
}

/**
 * Espaço dos `points` da seta, derivado das duas pontas e nunca gravado (decisão (d)): o do
 * container quando as duas marcações são do mesmo container; em qualquer outro caso (containers
 * diferentes, uma ponta do canvas ou flutuante, ponta inexistente), o canvas.
 */
export function arrowPointsSpace(p: Project, arrow: Pick<Arrow, 'from' | 'to'>): Space {
  const index = projectIndex(p);
  const from = index.markings.get(arrow.from);
  const to = index.markings.get(arrow.to);
  if (!from || !to || from.containerId === null || from.containerId !== to.containerId) {
    return CANVAS_SPACE;
  }
  const container = index.containers.get(from.containerId);
  return container ? containerSpace(container) : CANVAS_SPACE;
}

// ---------------------------------------------------------------------------
// Rota

/** Ponto médio do lado do retângulo. */
export function sideAnchor(rect: Rect, side: ArrowSide): ArrowPoint {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: bottom(rect) };
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case 'right':
      return { x: right(rect), y: rect.y + rect.height / 2 };
  }
}

/**
 * Lado automático: o da caixa voltado para `target`, pelo eixo dominante do vetor centro → alvo.
 * Empate (e alvo no centro) fica no eixo horizontal.
 */
export function autoArrowSide(rect: Rect, target: ArrowPoint): ArrowSide {
  const dx = target.x - (rect.x + rect.width / 2);
  const dy = target.y - (rect.y + rect.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** A polilinha da seta em unidades do canvas e os lados em que ela prende nas marcações. */
export interface ArrowRoute {
  /** Âncora de saída, pontos de passagem (já no canvas) e âncora de chegada. */
  readonly points: readonly ArrowPoint[];
  readonly fromSide: ArrowSide;
  readonly toSide: ArrowSide;
}

function centerOf(rect: Rect): ArrowPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * A rota completa da seta, **em unidades do canvas**, para o desenho e o hit-test: âncora de
 * saída, pontos de passagem (convertidos do espaço deles, `arrowPointsSpace`) e âncora de
 * chegada. A âncora é o ponto médio do lado; o lado `null` (automático) é o da caixa voltado
 * para o ponto seguinte (o primeiro ponto de passagem, ou o centro da outra ponta; na chegada, o
 * último ponto de passagem ou o centro da origem). `null` se uma ponta não existe.
 *
 * `straight` e `curve` têm a mesma polilinha (a curva é só a suavização do desenho). Para o
 * `elbow` devolve, por ora, a mesma polilinha: o roteador de canto (saída perpendicular ao lado
 * e uma ou duas dobras) entra aqui, trocando `points` pelo caminho com dobras.
 */
export function arrowRoute(p: Project, arrow: Arrow): ArrowRoute | null {
  const markings = projectIndex(p).markings;
  const from = markings.get(arrow.from);
  const to = markings.get(arrow.to);
  if (!from || !to) return null;
  const fromRect = markingCanvasRectOf(p, from);
  const toRect = markingCanvasRectOf(p, to);
  const { placement } = arrowPointsSpace(p, arrow);
  const via = arrow.points.map((pt) => toCanvasPoint(placement, pt));
  const fromSide = arrow.fromSide ?? autoArrowSide(fromRect, via[0] ?? centerOf(toRect));
  const toSide =
    arrow.toSide ?? autoArrowSide(toRect, via[via.length - 1] ?? centerOf(fromRect));
  return {
    points: [sideAnchor(fromRect, fromSide), ...via, sideAnchor(toRect, toSide)],
    fromSide,
    toSide,
  };
}

// ---------------------------------------------------------------------------
// Cascata (apagar marcação, container ou seleção leva as setas presas)

/** Ids das setas presas a alguma das marcações (como origem ou destino). */
export function arrowIdsAttachedTo(
  p: Project,
  markingIds: ReadonlySet<string>,
): Set<string> {
  const byMarking = projectIndex(p).arrowsByMarking;
  const ids = new Set<string>();
  for (const id of markingIds) {
    for (const arrow of byMarking.get(id) ?? []) ids.add(arrow.id);
  }
  return ids;
}

/** O projeto sem as setas de `arrowIds` e sem as anotações delas. Não confere a trava. */
export function withoutArrows(p: Project, arrowIds: ReadonlySet<string>): Project {
  if (arrowIds.size === 0) return p;
  return {
    ...p,
    arrows: p.arrows.filter((a) => !arrowIds.has(a.id)),
    annotations: p.annotations.filter((a) => !arrowIds.has(a.markingId)),
  };
}

// ---------------------------------------------------------------------------
// Operações

/**
 * A dona de uma anotação existe: uma marcação ou uma seta (v13; os ids dividem o espaço).
 * Falha com `not-found`.
 */
export function requireAnnotationOwner(p: Project, ownerId: string): void {
  const index = projectIndex(p);
  if (!index.markings.has(ownerId) && !index.arrows.has(ownerId)) {
    fail('not-found', ownerId);
  }
}

function checkEndpoint(p: Project, id: string): void {
  const index = projectIndex(p);
  if (index.markings.has(id)) return;
  if (index.arrows.has(id)) fail('arrow-endpoint', id);
  fail('not-found', id);
}

function checkSide(side: ArrowSide | null): void {
  if (side !== null && !ARROW_SIDES.includes(side)) fail('invalid-value', String(side));
}

function checkStyle(style: ArrowStyle): void {
  if (!ARROW_STYLES.includes(style)) fail('invalid-value', String(style));
}

export interface NewArrowArgs {
  readonly id: string;
  /** Marcação de origem. */
  readonly from: string;
  /** Marcação de destino, diferente da origem. */
  readonly to: string;
  /** Padrão: `curve`. */
  readonly style?: ArrowStyle;
  readonly name?: string | null;
  /** `null` ou ausente = lado automático. */
  readonly fromSide?: ArrowSide | null;
  readonly toSide?: ArrowSide | null;
}

/**
 * Cria a seta entre duas marcações. As pontas precisam existir e ser marcações (nem outra
 * seta, `arrow-endpoint`; nem um container, que não está entre as marcações) e ser diferentes
 * (`arrow-self`); o id não pode repetir o de uma marcação nem o de outra seta. Nasce com a rota
 * padrão (`points: []`, só a pessoa traça pontos de passagem), destrancada. Duas setas iguais
 * são permitidas.
 */
export function createArrow(p: Project, args: NewArrowArgs): Project {
  const index = projectIndex(p);
  if (index.markings.has(args.id) || index.arrows.has(args.id)) {
    fail('duplicate-id', args.id);
  }
  checkEndpoint(p, args.from);
  checkEndpoint(p, args.to);
  if (args.from === args.to) fail('arrow-self', args.from);
  const style = args.style ?? DEFAULT_ARROW_STYLE;
  const fromSide = args.fromSide ?? null;
  const toSide = args.toSide ?? null;
  checkStyle(style);
  checkSide(fromSide);
  checkSide(toSide);
  const arrow: Arrow = {
    id: args.id,
    from: args.from,
    to: args.to,
    fromSide,
    toSide,
    points: [],
    style,
    name: normalizeOptionalName(args.name ?? null),
    locked: false,
  };
  return { ...p, arrows: [...p.arrows, arrow] };
}

/**
 * Exclui a seta e as anotações dela (as vinculadas por `parentAnnotationId` são da mesma dona e
 * saem juntas). Falha com `locked` se a seta está trancada.
 */
export function removeArrow(p: Project, arrowId: string): Project {
  findById(p.arrows, arrowId);
  requireUnlocked(canEditArrow(p, arrowId));
  return withoutArrows(p, new Set([arrowId]));
}

/** O que sai junto com a seta: as anotações dela e as referências de outras que quebrariam. */
export function arrowDeletionImpact(
  p: Project,
  arrowId: string,
): { annotations: number; brokenRefs: number } {
  findById(p.arrows, arrowId);
  return {
    annotations: (projectIndex(p).annotationsByMarking.get(arrowId) ?? []).length,
    brokenRefs: countBrokenRefs(p, withoutArrows(p, new Set([arrowId]))),
  };
}

/**
 * Troca a marcação de uma ponta e/ou o lado dela (`side` `null` = automático). Se o espaço dos
 * pontos de passagem muda com a troca (`arrowPointsSpace`), a rota padrão volta (`points`
 * apagado); a marcação nova não pode ser outra seta nem a outra ponta. Sem mudança devolve `p`
 * como está, sem conferir a trava; trancada, falha com `locked`.
 */
export function setArrowEndpoint(
  p: Project,
  arrowId: string,
  end: ArrowEnd,
  markingId: string,
  side: ArrowSide | null,
): Project {
  const arrow = findById(p.arrows, arrowId);
  checkEndpoint(p, markingId);
  checkSide(side);
  const current = end === 'from' ? arrow.from : arrow.to;
  const currentSide = end === 'from' ? arrow.fromSide : arrow.toSide;
  if (current === markingId && currentSide === side) return p;
  requireUnlocked(canEditArrow(p, arrowId));
  if (markingId === (end === 'from' ? arrow.to : arrow.from))
    fail('arrow-self', markingId);
  const moved: Arrow =
    end === 'from'
      ? { ...arrow, from: markingId, fromSide: side }
      : { ...arrow, to: markingId, toSide: side };
  const spaceChanged =
    arrowPointsSpace(p, moved).containerId !== arrowPointsSpace(p, arrow).containerId;
  const next = spaceChanged && moved.points.length > 0 ? { ...moved, points: [] } : moved;
  return { ...p, arrows: updateById(p.arrows, arrowId, () => next) };
}

function samePoints(a: readonly ArrowPoint[], b: readonly ArrowPoint[]): boolean {
  return (
    a.length === b.length && a.every((pt, i) => pt.x === b[i]?.x && pt.y === b[i]?.y)
  );
}

/**
 * Define os pontos de passagem (no espaço de `arrowPointsSpace`; `[]` volta à rota padrão).
 * Coordenadas finitas. Sem mudança devolve `p` como está, sem conferir a trava; trancada, falha
 * com `locked`.
 */
export function setArrowRoute(
  p: Project,
  arrowId: string,
  points: readonly ArrowPoint[],
): Project {
  const arrow = findById(p.arrows, arrowId);
  if (!points.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))) {
    fail('invalid-arrow-route', arrowId);
  }
  const copy = points.map((pt) => ({ x: pt.x, y: pt.y }));
  if (samePoints(arrow.points, copy)) return p;
  requireUnlocked(canEditArrow(p, arrowId));
  return {
    ...p,
    arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, points: copy })),
  };
}

/** Estilo do traço (`straight`, `curve` ou `elbow`). Sem mudança devolve `p`; trancada, `locked`. */
export function setArrowStyle(p: Project, arrowId: string, style: ArrowStyle): Project {
  const arrow = findById(p.arrows, arrowId);
  checkStyle(style);
  if (arrow.style === style) return p;
  requireUnlocked(canEditArrow(p, arrowId));
  return { ...p, arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, style })) };
}

/**
 * Rótulo da seta; vazio vira `null`, como em `renameMarking`. Renomear não é geometria: a trava
 * não impede (selecionar, renomear e anotar seguem livres).
 */
export function setArrowName(p: Project, arrowId: string, name: string | null): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, name: normalized })),
  };
}

/** Tranca ou destranca a seta (só a dela: a trava não vem das pontas). */
export function setArrowLocked(p: Project, arrowId: string, locked: boolean): Project {
  if (findById(p.arrows, arrowId).locked === locked) return p;
  return { ...p, arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, locked })) };
}
