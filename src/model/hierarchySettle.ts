import { releaseStrandedAnchors } from './anchorRelease';
import {
  EPSILON,
  IDENTITY_PLACEMENT,
  containsRect,
  containsRectApprox,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  toCanvasRect,
  type Size,
} from './geometry';
import { reconcilePerspectives, reconcilePerspectivesFrom } from './perspectiveReconcile';
import { projectIndex } from './projectIndex';
import { settleDelta, type SettleDelta } from './settleDelta';
import { localParents, type Dirty } from './settleLocal';
import { canContain, equalRectRanks, pickParent, type Entry } from './settleParent';
import {
  advancePositions,
  knownPositions,
  rememberPositions,
  scanSpaceEntry,
  type PositionTable,
  type SpaceEntry,
} from './settlePositions';
import { buildRectIndex, type RectIndex } from './spaceIndex';
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

type ContainerLookup = (id: string) => ProjectContainer | undefined;

/** Reconcilia as perspectivas só com o que mudou entre `reference` e `settled`; na dúvida, com tudo. */
function reconcileSettled(reference: Project, settled: Project): Project {
  const delta = reference === settled ? null : settleDelta(reference, settled);
  return delta
    ? reconcilePerspectivesFrom(reference, settled, delta)
    : reconcilePerspectives(reference, settled);
}

/**
 * Guarda as posições por espaço do resultado, para a próxima operação não varrer o projeto: as que o
 * assentar montou, ou as de antes acrescidas do que a operação criou (`advancePositions`).
 */
function rememberTable(
  before: Project,
  settled: Project,
  delta: SettleDelta | null,
  table: TableHolder,
): void {
  if (delta === null || !delta.stable) return;
  const advanced =
    table.known &&
    !table.moved &&
    advancePositions(table.known, delta, before.markings, settled.markings);
  if (!advanced && table.built.size === 0) return;
  rememberPositions(settled.markings, new Map([...(advanced || []), ...table.built]));
}

/** O espaço e o `rect` que a geometria dá à marcação; ela mesma se nada muda. */
function settleSpace(
  p: Project,
  m: Marking,
  containerOf: ContainerLookup,
  options: SettleOptions | undefined,
): Marking {
  let canvas: Rect;
  if (m.containerId === null) {
    canvas = m.rect;
  } else {
    const own = containerOf(m.containerId);
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
 *
 * Custo (#882): o pai vem de um índice espacial por espaço (`spaceIndex.ts`), não de uma varredura
 * do espaço; k marcações bem distribuídas custam ~O(k). Continua quadrático só no caso degenerado de
 * muitas marcações enormes cobrindo todas as outras (o índice não poda quem cobre tudo), de muitos
 * retângulos iguais (`chainOrder`) e de retângulos fora da grade (largura ou altura nula ou minúscula).
 */
export function settleHierarchy(p: Project, options?: SettleOptions): Project {
  const settled = releaseStrandedAnchors(settleGeometry(p, options, null), null, p);
  return reconcilePerspectives(options?.before ?? p, settled);
}

/** As marcações do assentar: a lista só é copiada na primeira troca (quase nunca muda tudo). */
interface MarkingList {
  readonly items: () => readonly Marking[];
  readonly at: (i: number) => Marking;
  readonly set: (i: number, m: Marking) => void;
  readonly copied: () => boolean;
}

function markingList(source: readonly Marking[]): MarkingList {
  let copy: Marking[] | null = null;
  return {
    items: () => copy ?? source,
    at: (i) => (copy ?? source)[i] as Marking,
    set: (i, m) => {
      copy ??= [...source];
      copy[i] = m;
    },
    copied: () => copy !== null,
  };
}

/** O estado de um assentar. */
interface Work {
  readonly p: Project;
  readonly options: SettleOptions | undefined;
  readonly list: MarkingList;
  /** Marcações que trocaram de espaço: a seta presa a elas perde os pontos de passagem. */
  readonly moved: Set<string>;
  /** Índices das que trocaram de espaço (o espaço novo precisa saber que elas chegaram). */
  readonly landed: number[];
  /** Espaços assentados inteiros; `null` = todos. */
  readonly full: Set<string | null> | null;
  /** O que mudou em cada espaço assentado só no que a mudança toca. */
  readonly dirty: Map<string | null, Dirty>;
  /** As posições e caixas das marcações de cada espaço (`settlePositions.ts`). */
  readonly table: TableHolder;
  /** Posições (crescentes) das marcações que a operação mexeu: a caixa guardada delas não vale. */
  touched: readonly number[];
}

/** A tabela de posições de `before`, quando vale para `next`, e os espaços que o assentar achou varrendo. */
interface TableHolder {
  readonly known: PositionTable | undefined;
  readonly built: Map<string | null, SpaceEntry>;
  /** Alguma marcação trocou de espaço no assentar: a tabela de antes não vale mais para o resultado. */
  moved?: boolean;
  /** Posições das marcações que a operação mexeu (mudaram ou trocaram de espaço), do recorte. */
  touched?: readonly number[];
}

/**
 * O assentar da geometria e do pertencimento, sem as perspectivas. Com `delta` (`settleFrom`),
 * só o que a operação tocou: os espaços inteiros que `delta.full` lista e, nos demais, as marcações
 * que cabem num retângulo que mudou (`settleLocal`); o resto fica com os mesmos objetos. Sem `delta`,
 * o projeto inteiro.
 */
function settleGeometry(
  p: Project,
  options: SettleOptions | undefined,
  delta: SettleDelta | null,
  table: TableHolder = { known: undefined, built: new Map() },
): Project {
  if (delta !== null && delta.changed.length + delta.old.length + delta.full.size === 0) {
    return p;
  }
  const w: Work = {
    p,
    options,
    list: markingList(p.markings),
    moved: new Set(),
    landed: [],
    full: delta === null ? null : new Set(delta.full),
    dirty: new Map(),
    table,
    touched: [],
  };
  moveToSpaces(w, delta);
  if (delta !== null) {
    collectDirty(w, delta);
    table.touched = w.touched;
  }
  const containers = settleParents(w);
  if (!w.list.copied() && containers === p.containers) return p;
  const markings = w.list.items() as Marking[];
  return clearArrowRoutes({ ...p, markings, containers }, w.moved);
}

/** Índices das marcações que precisam do espaço conferido: as que mudaram e as dos espaços inteiros. */
function spaceCandidates(w: Work, delta: SettleDelta | null): Iterable<number> {
  const list = w.list.items();
  if (delta === null) return list.keys();
  const out = new Set(delta.changed);
  if (delta.full.size > 0) {
    list.forEach((m, i) => {
      if (delta.full.has(m.containerId)) out.add(i);
    });
  }
  return out;
}

/** Leva cada marcação ao espaço que a geometria dá a ela (o container que a contém, senão o canvas). */
function moveToSpaces(w: Work, delta: SettleDelta | null): void {
  const lookup = containerLookup(w.p.containers, delta === null);
  for (const i of spaceCandidates(w, delta)) {
    const m = w.list.at(i);
    const next = settleSpace(w.p, m, lookup, w.options);
    if (next === m) continue;
    w.list.set(i, next);
    if (next.containerId === m.containerId) continue;
    w.moved.add(m.id);
    w.landed.push(i);
    w.table.moved = true;
    // As do canvas moram no espaço que é assentado inteiro por causa dos pais dos containers.
    if (next.containerId === null) w.full?.add(null);
  }
}

/**
 * Quem acha o container pelo id. O projeto inteiro consulta uma vez por marcação (mapa); o recorte,
 * poucas vezes (busca linear, que não monta um mapa a cada operação).
 */
function containerLookup(
  list: readonly ProjectContainer[],
  many: boolean,
): ContainerLookup {
  if (!many) return (id) => list.find((c) => c.id === id);
  // Com ids repetidos (projeto inválido) vale o primeiro, como no índice do projeto.
  const byId = new Map<string, ProjectContainer>();
  for (const c of list) if (!byId.has(c.id)) byId.set(c.id, c);
  return (id) => byId.get(id);
}

/** Guarda, por espaço que se assenta só em parte, o que mudou nele (retângulos de antes e de depois). */
function collectDirty(w: Work, delta: SettleDelta): void {
  const dirtyOf = (m: Marking): Dirty | null => {
    if (m.floating || w.full?.has(m.containerId)) return null;
    let dirty = w.dirty.get(m.containerId);
    if (!dirty) w.dirty.set(m.containerId, (dirty = { rects: [], seeds: [] }));
    return dirty;
  };
  w.touched = [...new Set([...delta.changed, ...w.landed])].sort((a, b) => a - b);
  for (const m of delta.old) dirtyOf(m)?.rects.push(m.rect);
  for (const i of w.touched) {
    const m = w.list.at(i);
    const dirty = dirtyOf(m);
    dirty?.rects.push(m.rect);
    dirty?.seeds.push(i);
  }
}

/** Decide os pais: os espaços inteiros (e o dos containers, se o canvas é um deles) e o resto só no que tocou. */
function settleParents(w: Work): readonly ProjectContainer[] {
  if (w.full === null) return settleFullSpaces(w, null);
  const full = new Set(w.full);
  for (const [space, dirty] of w.dirty) {
    if (!settleLocal(w, space, dirty)) full.add(space);
  }
  return settleFullSpaces(w, full);
}

/**
 * Assenta inteiros os espaços de `spaces` (`null` = todos): o pai de cada marcação vem do índice
 * espacial do espaço, e, se o canvas é um deles, o pai de cada container também. A flutuante nunca
 * tem pai.
 */
function settleFullSpaces(
  w: Work,
  spaces: ReadonlySet<string | null> | null,
): readonly ProjectContainer[] {
  if (spaces !== null && spaces.size === 0) return w.p.containers;
  const inSpaces = (id: string | null) => spaces === null || spaces.has(id);
  const list = w.list.items();
  // Marcações por espaço, com o índice no array; o posto resolve o empate de retângulo igual.
  const bySpace = new Map<string | null, Entry[]>();
  const patches: Entry[] = [];
  list.forEach((m, i) => {
    if (!inSpaces(m.containerId)) return;
    if (m.floating) {
      if (m.parentId !== null) patches.push({ m: { ...m, parentId: null }, i });
      return;
    }
    const group = bySpace.get(m.containerId);
    if (group) group.push({ m, i });
    else bySpace.set(m.containerId, [{ m, i }]);
  });
  const ranks = new Map<string, number>();
  for (const group of bySpace.values()) equalRectRanks(group, ranks);
  const rankOf = (id: string) => ranks.get(id) ?? -1;

  // Índice espacial de cada espaço, montado quando alguém pergunta (`docs/ARCHITECTURE.md`).
  const indexes = new Map<string | null, RectIndex<Entry>>();
  const indexOf = (containerId: string | null): RectIndex<Entry> => {
    let index = indexes.get(containerId);
    if (!index) {
      index = buildRectIndex(bySpace.get(containerId) ?? [], (e) => e.m.rect);
      indexes.set(containerId, index);
    }
    return index;
  };
  for (const [space, group] of bySpace) {
    for (const e of group) {
      const parentId = markingParent(indexOf(space), e.m, rankOf);
      if (parentId !== e.m.parentId) patches.push({ m: { ...e.m, parentId }, i: e.i });
    }
  }
  const containers = inSpaces(null)
    ? settleContainerParents(w.p.containers, indexOf(null), rankOf)
    : w.p.containers;
  for (const e of patches) w.list.set(e.i, e.m);
  return containers;
}

/** Pai de um container: a menor marcação do canvas (não flutuante) que contém o retângulo dele. */
function settleContainerParents(
  list: readonly ProjectContainer[],
  canvasIndex: RectIndex<Entry>,
  rankOf: (id: string) => number,
): readonly ProjectContainer[] {
  let changed = false;
  const out = list.map((c) => {
    const rect = imageCanvasRect(c, c.placement);
    const candidates = canvasIndex
      .containing(rect, EPSILON)
      .filter((e) => containsRectApprox(e.m.rect, rect));
    const parentId = pickParent(candidates, c.parentId, rankOf);
    if (parentId === c.parentId) return c;
    changed = true;
    return { ...c, parentId };
  });
  return changed ? out : list;
}

/**
 * Assenta só as marcações do espaço `space` que cabem num retângulo que mudou (`localParents`).
 * Devolve `false`, sem tocar em nada, quando são muitas: o espaço é então assentado inteiro.
 */
function settleLocal(w: Work, space: string | null, dirty: Dirty): boolean {
  const patches = localParents(w.list.items(), entryOf(w, space), dirty, w.touched);
  if (patches === null) return false;
  for (const e of patches) w.list.set(e.i, e.m);
  return true;
}

/** O que se sabe do espaço: o de antes, se vale, ou uma varredura (feita uma vez por assentar). */
function entryOf(w: Work, space: string | null): SpaceEntry {
  const hit = w.table.known?.get(space) ?? w.table.built.get(space);
  if (hit) return hit;
  const entry = scanSpaceEntry(w.list.items(), space);
  w.table.built.set(space, entry);
  return entry;
}

/** O pai de `m` entre as marcações do espaço dele (o índice dá as que podem contê-la). */
function markingParent(
  index: RectIndex<Entry>,
  m: Marking,
  rankOf: (id: string) => number,
): string | null {
  const own = rankOf(m.id);
  const candidates = index
    .containing(m.rect)
    .filter((c) => canContain(c.m.rect, rankOf(c.m.id), m.rect, own));
  return pickParent(candidates, m.parentId, rankOf);
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
 *
 * Só os espaços que a operação afetou são assentados (`affectedSpaces`, #882): o resto do projeto
 * fica com os mesmos objetos. O resultado é o do assentar inteiro (`settleHierarchy(next)`) de um
 * `before` já assentado, que é o que toda operação do modelo recebe.
 */
export function settleFrom(
  before: Project,
  next: Project,
  options?: SettleOptions,
): Project {
  if (options?.settle === false) return next;
  const merged = { before, ...options };
  const delta = settleDelta(before, next);
  const table: TableHolder = {
    known: delta?.stable ? knownPositions(before.markings) : undefined,
    built: new Map(),
  };
  const geometry = settleGeometry(next, merged, delta, table);
  rememberTable(before, geometry, delta, table);
  const touched = delta === null ? null : (table.touched ?? []);
  const settled = releaseStrandedAnchors(geometry, touched, before);
  return reconcileSettled(merged.before ?? next, settled);
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
