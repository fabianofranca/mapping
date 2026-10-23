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

/**
 * Um segmento do meio de uma seta `elbow` que a pessoa pode mover em paralelo ("pista"): `axis`
 * é a coordenada que ele fixa (`x` num segmento vertical, `y` num horizontal) e `value` o valor
 * dela, em unidades do canvas.
 */
export interface ElbowLane {
  readonly axis: 'x' | 'y';
  readonly value: number;
}

/** A polilinha da seta em unidades do canvas e os lados em que ela prende nas marcações. */
export interface ArrowRoute {
  /** Âncora de saída, pontos de passagem (já no canvas) e âncora de chegada. */
  readonly points: readonly ArrowPoint[];
  readonly fromSide: ArrowSide;
  readonly toSide: ArrowSide;
  /**
   * Só no `elbow`: os segmentos do meio, na ordem do traço. A pista `j` é o trecho entre
   * `points[j + 1]` e `points[j + 2]`. Vazio nos outros estilos e no canto de uma dobra só.
   */
  readonly lanes: readonly ElbowLane[];
}

function centerOf(rect: Rect): ArrowPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Trecho mínimo (unidades do canvas) que o canto percorre ao sair e ao chegar perpendicular ao lado. */
export const ELBOW_STUB = 16;

function sideNormal(side: ArrowSide): ArrowPoint {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

const transpose = (pt: ArrowPoint): ArrowPoint => ({ x: pt.y, y: pt.x });

/**
 * O roteador do canto (sem desvio de obstáculos): uma polilinha só de trechos horizontais e
 * verticais, em unidades do canvas.
 *
 * O traço é uma sequência de segmentos que alternam de direção. O primeiro sai da âncora `a`
 * perpendicular ao lado `fromSide` e o último chega na âncora `b` perpendicular ao `toSide`. Os
 * segmentos do meio ("pistas") são o que `points` controla: **cada ponto de passagem fixa um
 * segmento do meio**, na ordem do traço, e só conta a coordenada perpendicular ao segmento (o `x`
 * num segmento vertical, o `y` num horizontal; a outra é ignorada, e o gesto grava ali o meio do
 * segmento). Mover uma marcação então estica só o primeiro ou o último segmento.
 *
 * `points` só vale se a quantidade casa com os lados: ímpar quando o primeiro e o último segmento
 * são paralelos (os dois horizontais ou os dois verticais), par quando são perpendiculares. Do
 * contrário, e vazio, vale a rota padrão: a menor que sai e chega do lado certo, com um trecho
 * mínimo de `ELBOW_STUB` (uma pista no Z ou no C, nenhuma no L, três ou duas quando os lados não
 * deixam o caminho curto); ela segue as marcações.
 */
function elbowRoute(
  a: ArrowPoint,
  fromSide: ArrowSide,
  b: ArrowPoint,
  toSide: ArrowSide,
  given: readonly ArrowPoint[],
): { readonly points: ArrowPoint[]; readonly lanes: ElbowLane[] } {
  // Trabalha com o primeiro segmento horizontal (transpõe x e y quando ele é vertical).
  const swap = fromSide === 'top' || fromSide === 'bottom';
  const f = (pt: ArrowPoint): ArrowPoint => (swap ? transpose(pt) : pt);
  const A = f(a);
  const B = f(b);
  const sx = f(sideNormal(fromSide)).x;
  const nb = f(sideNormal(toSide));
  const parallel = nb.y === 0;
  const axisOf = (j: number): 'x' | 'y' => ((j % 2 === 0) !== swap ? 'x' : 'y');

  let values: number[];
  if (given.length > 0 && given.length % 2 === (parallel ? 1 : 0)) {
    values = given.map((pt, j) => pt[axisOf(j)]);
  } else if (parallel) {
    const tx = nb.x;
    if (sx === tx) {
      values = [
        sx > 0 ? Math.max(A.x, B.x) + ELBOW_STUB : Math.min(A.x, B.x) - ELBOW_STUB,
      ];
    } else if ((B.x - A.x) * sx >= 2 * ELBOW_STUB) {
      values = [(A.x + B.x) / 2];
    } else {
      values = [A.x + sx * ELBOW_STUB, (A.y + B.y) / 2, B.x + tx * ELBOW_STUB];
    }
  } else {
    const ty = nb.y;
    const direct = (B.x - A.x) * sx >= ELBOW_STUB && (A.y - B.y) * ty >= ELBOW_STUB;
    values = direct ? [] : [A.x + sx * ELBOW_STUB, B.y + ty * ELBOW_STUB];
  }

  // Segmento i (1 a n): horizontal nos ímpares, vertical nos pares; `fixed` é a coordenada que ele
  // fixa. Cada canto leva o `x` do vertical e o `y` do horizontal.
  const n = values.length + 2;
  const fixed = (i: number): number => {
    if (i === 1) return A.y;
    if (i === n) return parallel ? B.y : B.x;
    return values[i - 2] as number;
  };
  const corners: ArrowPoint[] = [];
  for (let i = 1; i < n; i++) {
    corners.push(
      i % 2 === 1 ? { x: fixed(i + 1), y: fixed(i) } : { x: fixed(i), y: fixed(i + 1) },
    );
  }
  return {
    points: [A, ...corners, B].map(f),
    lanes: values.map((value, j) => ({ axis: axisOf(j), value })),
  };
}

/**
 * A rota completa da seta, **em unidades do canvas**, para o desenho e o hit-test: âncora de
 * saída, pontos de passagem (convertidos do espaço deles, `arrowPointsSpace`) e âncora de
 * chegada. A âncora é o ponto médio do lado; o lado `null` (automático) é o da caixa voltado
 * para o ponto seguinte (o primeiro ponto de passagem, ou o centro da outra ponta; na chegada, o
 * último ponto de passagem ou o centro da origem). `null` se uma ponta não existe.
 *
 * `straight` e `curve` têm a mesma polilinha (a curva é só a suavização do desenho). O `elbow`
 * troca a polilinha pelo caminho ortogonal de `elbowRoute`, em que os pontos de passagem são
 * segmentos do meio; o lado automático dele olha só o centro da outra marcação (um ponto de
 * passagem fixa só uma coordenada, não aponta para lugar nenhum).
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
  const elbow = arrow.style === 'elbow';
  const fromSide =
    arrow.fromSide ?? autoArrowSide(fromRect, (!elbow && via[0]) || centerOf(toRect));
  const toSide =
    arrow.toSide ??
    autoArrowSide(toRect, (!elbow && via[via.length - 1]) || centerOf(fromRect));
  const a = sideAnchor(fromRect, fromSide);
  const b = sideAnchor(toRect, toSide);
  if (elbow) return { ...elbowRoute(a, fromSide, b, toSide, via), fromSide, toSide };
  return { points: [a, ...via, b], fromSide, toSide, lanes: [] };
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
