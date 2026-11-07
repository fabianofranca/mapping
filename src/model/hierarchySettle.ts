import {
  IDENTITY_PLACEMENT,
  area,
  containsRect,
  containsRectApprox,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  toCanvasRect,
  type Size,
} from './geometry';
import { reconcilePerspectives } from './perspectiveReconcile';
import { projectIndex } from './projectIndex';
import type { Marking, Placement, Project, ProjectContainer, Rect } from './types';

// Pertencimento por geometria (regras em docs/ARCHITECTURE.md, "Espaços, pertencimento e gestos"
// e em docs/FORMAT.md, "Campos da v13 (pertencimento)"). Quem contém quem é decidido pela ferramenta e gravado no JSON: o agente lê
// `parentId` (da marcação e do container) e nunca calcula interseções. "Dentro" é sempre
// totalmente contido; a tolerância fica na interação (`src/canvas/`), nunca aqui.

/**
 * Opções das operações que mexem na geometria. `settle: false` só nas prévias de gesto
 * (pertencimento congelado enquanto o ponteiro se move); toda outra chamada assenta.
 * `minSizeOf` dá o tamanho mínimo do componente que desenha a marcação (o modelo não conhece
 * componentes): vale ao converter o `rect` para outro espaço. `before` é o projeto de antes da
 * operação: as perspectivas e as marcas de chegada são reconciliadas comparando os dois
 * (`reconcilePerspectives`); sem ele vale o projeto que entra no assentar.
 */
export interface SettleOptions {
  readonly settle?: boolean;
  readonly minSizeOf?: (markingId: string) => Size | null;
  readonly before?: Project;
}

/** Espaço de coordenadas de uma marcação: o container dela ou o canvas. */
export interface Space {
  /** `null` = o canvas. */
  readonly containerId: string | null;
  /** Do container, ou identidade no canvas. */
  readonly placement: Placement;
  /** Retângulo do container em pixels dele; `null` no canvas (sem limite). */
  readonly bounds: Rect | null;
}

export const CANVAS_SPACE: Space = {
  containerId: null,
  placement: IDENTITY_PLACEMENT,
  bounds: null,
};

/** Espaço do container. */
export function containerSpace(container: ProjectContainer): Space {
  return {
    containerId: container.id,
    placement: container.placement,
    bounds: imagePixelRect(container),
  };
}

/**
 * Espaço da marcação. Uma marcação de container inexistente (projeto inválido) cai no canvas,
 * para quem desenha não quebrar; o reparo é quem a resolve.
 */
export function spaceOf(p: Project, marking: Pick<Marking, 'containerId'>): Space {
  if (marking.containerId === null) return CANVAS_SPACE;
  const container = projectIndex(p).containers.get(marking.containerId);
  return container ? containerSpace(container) : CANVAS_SPACE;
}

/** Retângulo da marcação em unidades do canvas (decimal na marcação de container). */
export function markingCanvasRectOf(p: Project, marking: Marking): Rect {
  return toCanvasRect(spaceOf(p, marking).placement, marking.rect);
}

/**
 * O container que contém inteiro o retângulo `canvas` (unidades do canvas). Como os
 * containers não se sobrepõem, há no máximo um; `null` = nenhum (o espaço é o canvas).
 */
export function containerContaining(p: Project, canvas: Rect): ProjectContainer | null {
  for (const c of p.containers) {
    if (containsRectApprox(imageCanvasRect(c, c.placement), canvas)) return c;
  }
  return null;
}

/** Marcação de um espaço com o índice dela no array `markings`. */
interface Entry {
  readonly m: Marking;
  readonly i: number;
}

/**
 * Pode `outer` (posto `ro`) ser o pai de `inner` (posto `ri`)? Contém e é maior, ou é igual e
 * vem antes na ordem dos retângulos iguais (`equalRectRanks`). Uma ordem estrita: nunca há ciclo.
 */
function canContain(outer: Rect, ro: number, inner: Rect, ri: number): boolean {
  if (!containsRect(outer, inner)) return false;
  const ao = area(outer);
  const ai = area(inner);
  return ao > ai || (ao === ai && ro < ri);
}

const rectKey = (r: Rect): string => `${r.x},${r.y},${r.width},${r.height}`;

/** O pai atual de `e` é uma das marcações de `ids` que ainda não foi posta na ordem? */
function waitsForParent(e: Entry, ids: ReadonlySet<string>, done: ReadonlySet<string>) {
  const parent = e.m.parentId;
  return parent !== null && ids.has(parent) && !done.has(parent);
}

/**
 * Ordem de fora para dentro de um grupo de retângulos iguais (em ordem de array): a ordenação
 * topológica dos `parentId` atuais dentro do grupo (o pai antes do filho) e, entre as livres
 * ao mesmo tempo, a que vem antes no array. Quem não tem pai no grupo (nova, ou que chegou
 * agora ao retângulo) entra pelo array, como antes. `parentId` em ciclo (arquivo inválido) é
 * quebrado pela primeira do array. Total e sem ciclo.
 */
function chainOrder(bucket: readonly Entry[]): Entry[] {
  const ids = new Set(bucket.map((e) => e.m.id));
  const done = new Set<string>();
  const pending = [...bucket];
  const out: Entry[] = [];
  while (pending.length > 0) {
    const free = pending.findIndex((e) => !waitsForParent(e, ids, done));
    const [next] = pending.splice(Math.max(free, 0), 1) as [Entry];
    done.add(next.m.id);
    out.push(next);
  }
  return out;
}

/**
 * Posto de cada marcação de um espaço: o índice no array, salvo nos grupos de retângulos
 * iguais, onde as do grupo trocam de lugar entre si na ordem de `chainOrder`. Assim
 * reordenar irmãs (que só troca índices) não muda quem é a de fora.
 */
function equalRectRanks(group: readonly Entry[], ranks: Map<string, number>): void {
  const buckets = new Map<string, Entry[]>();
  for (const e of group) {
    ranks.set(e.m.id, e.i);
    const key = rectKey(e.m.rect);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(e);
    else buckets.set(key, [e]);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    chainOrder(bucket).forEach((e, k) => ranks.set(e.m.id, (bucket[k] as Entry).i));
  }
}

/**
 * As candidatas de menor área, com só a de dentro (maior posto) de cada grupo de retângulos
 * iguais.
 */
function innermostOfLeast(
  candidates: readonly Entry[],
  rankOf: (id: string) => number,
): Entry[] {
  let least = Infinity;
  for (const c of candidates) least = Math.min(least, area(c.m.rect));
  const innermost = new Map<string, Entry>();
  for (const c of candidates) {
    if (area(c.m.rect) !== least) continue;
    const key = rectKey(c.m.rect);
    const seen = innermost.get(key);
    if (!seen || rankOf(c.m.id) > rankOf(seen.m.id)) innermost.set(key, c);
  }
  return [...innermost.values()];
}

/**
 * Entre as candidatas que contêm (todas válidas pela geometria), o pai: das de menor área
 * (`innermostOfLeast`), o pai atual, se é uma delas; senão, a de maior posto (a que vem
 * depois no array).
 */
function pickParent(
  candidates: readonly Entry[],
  current: string | null,
  rankOf: (id: string) => number,
): string | null {
  let best: Entry | null = null;
  for (const c of innermostOfLeast(candidates, rankOf)) {
    if (c.m.id === current) return current;
    if (best === null || rankOf(c.m.id) > rankOf(best.m.id)) best = c;
  }
  return best?.m.id ?? null;
}

/**
 * O pai que o assentar escolheria entre as marcações `candidates` do espaço `containerId`
 * (todas já válidas pela geometria: contêm o que se quer pôr dentro): das de menor área, a de
 * dentro de cada cadeia de retângulos iguais (`equalRectRanks`), e o `current`, se é uma delas.
 * O Envolver usa isto para achar o pai atual do conjunto pela cadeia, nunca pelo array.
 */
export function enclosingAmong(
  p: Project,
  containerId: string | null,
  candidates: ReadonlySet<string>,
  current: string | null,
): string | null {
  const group: Entry[] = [];
  p.markings.forEach((m, i) => {
    if (!m.floating && m.containerId === containerId) group.push({ m, i });
  });
  const ranks = new Map<string, number>();
  equalRectRanks(group, ranks);
  const inside = group.filter((e) => candidates.has(e.m.id));
  return pickParent(inside, current, (id) => ranks.get(id) ?? -1);
}

/** O espaço e o `rect` que a geometria dá à marcação; ela mesma se nada muda. */
function settleSpace(
  p: Project,
  m: Marking,
  options: SettleOptions | undefined,
): Marking {
  let canvas: Rect;
  if (m.containerId === null) {
    canvas = m.rect;
  } else {
    const own = projectIndex(p).containers.get(m.containerId);
    // Container inexistente: projeto inválido; o reparo resolve, o assentar não inventa.
    if (!own) return m;
    if (!m.floating && containsRect(imagePixelRect(own), m.rect)) return m;
    canvas = toCanvasRect(own.placement, m.rect);
  }
  const target = m.floating ? null : containerContaining(p, canvas);
  if (target === null && m.containerId === null) return m;
  const min = options?.minSizeOf?.(m.id) ?? null;
  const space = target ? containerSpace(target) : CANVAS_SPACE;
  return {
    ...m,
    containerId: space.containerId,
    rect: fromCanvasRect(space.placement, canvas, space.bounds, min),
  };
}

/**
 * Assenta o pertencimento: para cada marcação não flutuante decide o espaço (o container que
 * contém inteiro o retângulo dela no canvas, senão o canvas) e, se mudou, converte o `rect`;
 * a flutuante vai sempre para o canvas. Depois recalcula o `parentId` de toda marcação (a
 * menor do mesmo espaço que a contém) e de todo container (a menor marcação do canvas que
 * contém o retângulo dele), com as flutuantes fora da relação nos dois sentidos.
 *
 * Desempate estável (etapa #549): nos empates vale a relação atual, e o array só decide empate
 * novo. Retângulos iguais seguem a cadeia atual dos `parentId` (`chainOrder`; quem não está
 * nela entra pelo array: a de antes é a de fora). Entre candidatas de mesma área, de cada grupo
 * de retângulos iguais conta a de dentro, e o pai atual fica se for uma delas; senão, a que vem
 * depois (`pickParent`). Por isso reordenar irmãs nunca muda pais, nem no assentar seguinte.
 * O resultado depende do `parentId` atual só nesses empates.
 *
 * Não muda a ordem dos arrays. As setas não entram na relação; só perdem os `points` quando uma
 * das pontas troca de espaço. No fim reconcilia as perspectivas e as marcas de chegada com o
 * resultado (`options.before` ?? `p` é o projeto de antes). Determinística e idempotente: nada a
 * mudar devolve `p` como está (o mesmo objeto).
 */
export function settleHierarchy(p: Project, options?: SettleOptions): Project {
  return reconcilePerspectives(options?.before ?? p, settleGeometry(p, options));
}

/** O assentar da geometria e do pertencimento, sem as perspectivas. */
function settleGeometry(p: Project, options?: SettleOptions): Project {
  let changed = false;
  // Marcações que trocaram de espaço: a seta presa a elas perde os pontos de passagem.
  const movedSpace = new Set<string>();
  const placed = p.markings.map((m) => {
    const next = settleSpace(p, m, options);
    if (next !== m) {
      changed = true;
      if (next.containerId !== m.containerId) movedSpace.add(m.id);
    }
    return next;
  });

  // Marcações por espaço, com o índice no array; o posto resolve o empate de retângulo igual.
  const bySpace = new Map<string | null, Entry[]>();
  placed.forEach((m, i) => {
    if (m.floating) return;
    const group = bySpace.get(m.containerId);
    if (group) group.push({ m, i });
    else bySpace.set(m.containerId, [{ m, i }]);
  });
  const ranks = new Map<string, number>();
  for (const group of bySpace.values()) equalRectRanks(group, ranks);
  const rankOf = (id: string) => ranks.get(id) ?? -1;

  const markings = placed.map((m) => {
    const group = m.floating ? [] : (bySpace.get(m.containerId) ?? []);
    const own = rankOf(m.id);
    const candidates = group.filter((c) =>
      canContain(c.m.rect, rankOf(c.m.id), m.rect, own),
    );
    const parentId = pickParent(candidates, m.parentId, rankOf);
    if (parentId === m.parentId) return m;
    changed = true;
    return { ...m, parentId };
  });

  // Pai de um container: a menor marcação do canvas (não flutuante) que contém o retângulo dele.
  const canvasGroup = bySpace.get(null) ?? [];
  const containers = p.containers.map((c) => {
    const rect = imageCanvasRect(c, c.placement);
    const candidates = canvasGroup.filter((e) => containsRectApprox(e.m.rect, rect));
    const parentId = pickParent(candidates, c.parentId, rankOf);
    if (parentId === c.parentId) return c;
    changed = true;
    return { ...c, parentId };
  });

  // Seta (v13): fora da árvore de pertencimento, o assentar a ignora, salvo numa coisa: se uma
  // ponta mudou de espaço, os `points` (que ficam no espaço das pontas) voltam à rota padrão.
  return changed ? clearArrowRoutes({ ...p, markings, containers }, movedSpace) : p;
}

/**
 * Apaga os pontos de passagem das setas presas a alguma das marcações de `markingIds`, que
 * trocaram de espaço (decisão (d): os `points` ficam no espaço das duas pontas, e a conversão
 * da rota não existe; a seta volta ao padrão borda a borda). Sem nada a apagar devolve `p`.
 */
export function clearArrowRoutes(p: Project, markingIds: ReadonlySet<string>): Project {
  if (markingIds.size === 0) return p;
  let cleared = false;
  const arrows = p.arrows.map((a) => {
    if (a.points.length === 0 || !(markingIds.has(a.from) || markingIds.has(a.to))) {
      return a;
    }
    cleared = true;
    return { ...a, points: [] };
  });
  return cleared ? { ...p, arrows } : p;
}

/** Assenta, a menos que a operação seja uma prévia de gesto (`settle: false`). */
export function settleIf(p: Project, options?: SettleOptions): Project {
  return options?.settle === false ? p : settleHierarchy(p, options);
}

/**
 * Assenta o resultado `next` de uma operação que partiu de `before` (salvo `settle: false`):
 * as perspectivas são reconciliadas com a diferença entre os dois. Um `options.before` explícito
 * (a operação chamada por outra, ou o fim de um gesto) vale mais que o `before` daqui.
 */
export function settleFrom(
  before: Project,
  next: Project,
  options?: SettleOptions,
): Project {
  return settleIf(next, { before, ...options });
}

/** Membros de uma marcação: as marcações e os containers cujo pai é ela, na ordem dos arrays. */
export function membersOf(
  p: Project,
  markingId: string,
): {
  readonly markings: readonly Marking[];
  readonly containers: readonly ProjectContainer[];
} {
  const index = projectIndex(p);
  return {
    markings: index.children.get(markingId) ?? [],
    containers: index.containersByParent.get(markingId) ?? [],
  };
}
