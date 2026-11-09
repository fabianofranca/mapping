import { describe, expect, it } from 'vitest';
import { createProject, imageCanvasRect } from '../../src/model';
import type { Arrow, Marking, Project, ProjectContainer, Rect } from '../../src/model';
import type { Size } from '../../src/model/geometry';
import {
  enclosingAmong,
  settleHierarchy,
  type SettleOptions,
} from '../../src/model/hierarchySettle';
import {
  referenceEnclosingAmong,
  referenceSettleHierarchy,
} from '../support/settleReference';

// Equivalência por sorteio (#882, decisão 1): `settleHierarchy` e `enclosingAmong` têm de dar
// EXATAMENTE o mesmo resultado que a referência congelada (`tests/support/settleReference.ts`,
// o assentar de antes do índice espacial), empates e identidade do objeto incluídos. Os projetos
// vêm de um gerador determinístico (mulberry32) com a semente abaixo; a falha mostra a semente e
// o índice do caso, e cada caso se reproduz sozinho (`makeRng(SEED + índice * PASSO)`).

const SEED = 20261108;
const CASES = 500;
const SEED_STEP = 7919;

// ---------------------------------------------------------------------------------------------
// Gerador pseudoaleatório
// ---------------------------------------------------------------------------------------------

interface Rng {
  float(): number;
  /** Inteiro em [lo, hi]; `lo` se `hi < lo`. */
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const float = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number =>
    hi < lo ? lo : lo + Math.floor(float() * (hi - lo + 1));
  return {
    float,
    int,
    chance: (p) => float() < p,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
  };
}

// ---------------------------------------------------------------------------------------------
// Retângulos
// ---------------------------------------------------------------------------------------------

type RectKind = 'nested' | 'equal' | 'swap' | 'random' | 'inside' | 'over' | 'overflow';

interface SpaceCtx {
  readonly rng: Rng;
  readonly pool: Rect[];
  readonly area: Rect;
  readonly maxSize: number;
  /** Retângulos de container no canvas (só no espaço do canvas). */
  readonly targets: readonly Rect[];
  readonly kinds: readonly RectKind[];
}

const CANVAS_KINDS: readonly RectKind[] = [
  'nested',
  'nested',
  'equal',
  'swap',
  'random',
  'inside',
  'inside',
  'over',
];
const CONTAINER_KINDS: readonly RectKind[] = [
  'nested',
  'nested',
  'equal',
  'swap',
  'random',
  'overflow',
];

function randomRect(c: SpaceCtx): Rect {
  const width = c.rng.int(4, Math.max(4, Math.min(c.maxSize, c.area.width)));
  const height = c.rng.int(4, Math.max(4, Math.min(c.maxSize, c.area.height)));
  return {
    x: c.rng.int(c.area.x, c.area.x + c.area.width - width),
    y: c.rng.int(c.area.y, c.area.y + c.area.height - height),
    width,
    height,
  };
}

const baseRect = (c: SpaceCtx): Rect =>
  c.pool.length > 0 ? c.rng.pick(c.pool) : randomRect(c);

function nestedRect(c: SpaceCtx): Rect {
  const b = baseRect(c);
  const dx1 = c.rng.int(0, Math.floor(b.width / 3));
  const dx2 = c.rng.int(0, Math.floor(b.width / 3));
  const dy1 = c.rng.int(0, Math.floor(b.height / 3));
  const dy2 = c.rng.int(0, Math.floor(b.height / 3));
  return {
    x: b.x + dx1,
    y: b.y + dy1,
    width: b.width - dx1 - dx2,
    height: b.height - dy1 - dy2,
  };
}

function swapRect(c: SpaceCtx): Rect {
  const b = baseRect(c);
  return { x: b.x, y: b.y, width: b.height, height: b.width };
}

/** Um retângulo inteiro dentro de `t` (que pode ter coordenadas decimais). */
function insideOf(c: SpaceCtx, t: Rect): Rect {
  const x0 = Math.ceil(t.x);
  const y0 = Math.ceil(t.y);
  const x1 = Math.floor(t.x + t.width);
  const y1 = Math.floor(t.y + t.height);
  const width = c.rng.int(1, Math.max(1, x1 - x0));
  const height = c.rng.int(1, Math.max(1, y1 - y0));
  return {
    x: c.rng.int(x0, x1 - width),
    y: c.rng.int(y0, y1 - height),
    width,
    height,
  };
}

function insideRect(c: SpaceCtx): Rect {
  return c.targets.length > 0 ? insideOf(c, c.rng.pick(c.targets)) : randomRect(c);
}

function overRect(c: SpaceCtx): Rect {
  if (c.targets.length === 0) return randomRect(c);
  const t = c.rng.pick(c.targets);
  const m = c.rng.pick([0, 5, 40]);
  const x = Math.floor(t.x) - m;
  const y = Math.floor(t.y) - m;
  return {
    x,
    y,
    width: Math.ceil(t.x + t.width) + m - x,
    height: Math.ceil(t.y + t.height) + m - y,
  };
}

/** Sai pela borda direita do espaço (marcação de container que deixa o container). */
function overflowRect(c: SpaceCtx): Rect {
  const width = c.rng.int(10, 80);
  const height = c.rng.int(10, 60);
  return {
    x: c.area.x + c.area.width - c.rng.int(1, width - 1),
    y: c.rng.int(c.area.y, c.area.y + c.area.height - height),
    width,
    height,
  };
}

const RECT_MAKERS: Record<RectKind, (c: SpaceCtx) => Rect> = {
  nested: nestedRect,
  equal: (c) => ({ ...baseRect(c) }),
  swap: swapRect,
  random: randomRect,
  inside: insideRect,
  over: overRect,
  overflow: overflowRect,
};

function nextRect(c: SpaceCtx): Rect {
  const rect = RECT_MAKERS[c.rng.pick(c.kinds)](c);
  c.pool.push(rect);
  return rect;
}

// ---------------------------------------------------------------------------------------------
// Containers, espaços e marcações
// ---------------------------------------------------------------------------------------------

const MISSING_CONTAINER = 'CX';

function genContainers(rng: Rng, count: number): ProjectContainer[] {
  return Array.from({ length: count }, (_, k) => ({
    id: `C${k}`,
    name: null,
    file: null,
    width: rng.int(120, 300),
    height: rng.int(100, 240),
    // Cada container tem 1000 unidades de canvas só para ele: nunca se sobrepõem.
    placement: {
      x: k * 1000 + rng.int(0, 100),
      y: rng.int(0, 200),
      scale: rng.pick([0.5, 1, 2]),
    },
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  }));
}

function buildSpaces(
  rng: Rng,
  containers: readonly ProjectContainer[],
): Map<string | null, SpaceCtx> {
  const spaces = new Map<string | null, SpaceCtx>();
  spaces.set(null, {
    rng,
    pool: [],
    area: { x: -200, y: -100, width: 5200, height: 1000 },
    maxSize: 700,
    targets: containers.map((c) => imageCanvasRect(c, c.placement)),
    kinds: CANVAS_KINDS,
  });
  const ids = [...containers.map((c) => c.id), MISSING_CONTAINER];
  for (const id of ids) {
    const own = containers.find((c) => c.id === id);
    const area = { x: 0, y: 0, width: own?.width ?? 200, height: own?.height ?? 150 };
    spaces.set(id, {
      rng,
      pool: [],
      area,
      maxSize: 200,
      targets: [],
      kinds: CONTAINER_KINDS,
    });
  }
  return spaces;
}

function genMarking(
  rng: Rng,
  i: number,
  keys: readonly (string | null)[],
  spaces: ReadonlyMap<string | null, SpaceCtx>,
): Marking {
  const containerId = rng.pick(keys);
  const ctx = spaces.get(containerId) as SpaceCtx;
  return {
    id: `M${i}`,
    containerId,
    parentId: null,
    name: null,
    rect: nextRect(ctx),
    needsReview: false,
    locked: false,
    floating: rng.chance(0.1),
    source: null,
  };
}

const rectKey = (m: Marking): string =>
  `${m.containerId}|${m.rect.x},${m.rect.y},${m.rect.width},${m.rect.height}`;

/** Marcações de retângulo igual no mesmo espaço, em grupos de 2 ou mais. */
function equalBuckets(markings: readonly Marking[]): Marking[][] {
  const buckets = new Map<string, Marking[]>();
  for (const m of markings) {
    const list = buckets.get(rectKey(m));
    if (list) list.push(m);
    else buckets.set(rectKey(m), [m]);
  }
  return [...buckets.values()].filter((b) => b.length >= 2);
}

function randomParent(
  rng: Rng,
  markings: readonly Marking[],
  self: string,
): string | null {
  const roll = rng.float();
  if (roll < 0.4) return null;
  if (roll < 0.5) return `ghost-${rng.int(0, 9)}`;
  const other = rng.pick(markings);
  return other.id === self ? null : other.id;
}

/** `parentId` atuais sorteados: nulos, válidos ou não, de outro espaço, inexistentes. */
function assignParents(rng: Rng, markings: readonly Marking[]): Marking[] {
  const parents = new Map<string, string | null>();
  for (const m of markings) parents.set(m.id, randomParent(rng, markings, m.id));
  for (const bucket of equalBuckets(markings)) applyChain(rng, bucket, parents);
  return markings.map((m) => ({ ...m, parentId: parents.get(m.id) ?? null }));
}

/** Cadeia (o pai antes) ou ciclo dentro de um grupo de retângulos iguais, ou nada. */
function applyChain(
  rng: Rng,
  bucket: readonly Marking[],
  parents: Map<string, string | null>,
): void {
  const roll = rng.float();
  if (roll > 0.8) return;
  const order = roll < 0.3 ? [...bucket].reverse() : bucket;
  order.forEach((m, k) => {
    const previous = order[k - 1];
    parents.set(m.id, previous ? previous.id : null);
  });
  if (roll >= 0.45) return;
  // ciclo: o primeiro da cadeia passa a ter como pai o último
  const first = order[0] as Marking;
  const last = order[order.length - 1] as Marking;
  parents.set(first.id, last.id);
}

function containerParent(rng: Rng, markings: readonly Marking[]): string | null {
  const roll = rng.float();
  if (roll < 0.35) return null;
  if (roll < 0.45) return `ghost-${rng.int(0, 9)}`;
  const canvas = markings.filter((m) => m.containerId === null);
  return canvas.length > 0 ? rng.pick(canvas).id : null;
}

function genArrows(rng: Rng, markings: readonly Marking[]): Arrow[] {
  if (markings.length < 2) return [];
  return Array.from({ length: rng.int(0, 3) }, (_, k) => {
    const from = rng.pick(markings);
    const to = rng.pick(markings.filter((m) => m.id !== from.id));
    return {
      id: `R${k}`,
      from: from.id,
      to: to.id,
      fromSide: rng.pick([null, 'top' as const, 'left' as const]),
      toSide: rng.pick([null, 'bottom' as const, 'right' as const]),
      points: rng.chance(0.85)
        ? Array.from({ length: rng.int(1, 2) }, () => ({
            x: rng.int(0, 500),
            y: rng.int(0, 500),
          }))
        : [],
      style: 'curve',
      name: null,
      locked: false,
    };
  });
}

function genProject(rng: Rng): Project {
  const containers = genContainers(rng, rng.int(0, 4));
  const keys: (string | null)[] = [null, null, ...containers.map((c) => c.id)];
  if (rng.chance(0.1)) keys.push(MISSING_CONTAINER);
  const spaces = buildSpaces(rng, containers);
  const raw = Array.from({ length: rng.int(3, 40) }, (_, i) =>
    genMarking(rng, i, keys, spaces),
  );
  const markings = assignParents(rng, raw);
  const base = createProject({
    id: 'equivalence',
    name: 'Equivalência',
    now: '2026-11-08T00:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Camada', color: '#E53935' },
  });
  return {
    ...base,
    containers: containers.map((c) => ({
      ...c,
      parentId: containerParent(rng, markings),
    })),
    markings,
    arrows: genArrows(rng, markings),
  };
}

// ---------------------------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------------------------

interface Case {
  readonly index: number;
  readonly project: Project;
  readonly minSizeOf: (id: string) => Size | null;
  readonly before: Project;
  readonly enclosing: readonly EnclosingQuery[];
}

interface EnclosingQuery {
  readonly containerId: string | null;
  readonly candidates: ReadonlySet<string>;
  readonly current: string | null;
}

/** Tamanho mínimo sorteado por marcação (`null` = sem mínimo), estável entre as chamadas. */
function genMinSizes(rng: Rng, p: Project): (id: string) => Size | null {
  const sizes = new Map<string, Size | null>();
  for (const m of p.markings) {
    sizes.set(
      m.id,
      rng.chance(0.5) ? { width: rng.int(1, 30), height: rng.int(1, 30) } : null,
    );
  }
  return (id) => sizes.get(id) ?? null;
}

/** Um `before` diferente do projeto: sem alguns pais e sem algumas marcações. */
function genBefore(rng: Rng, p: Project): Project {
  return {
    ...p,
    markings: p.markings
      .filter(() => rng.chance(0.9))
      .map((m) => (rng.chance(0.3) ? { ...m, parentId: null } : m)),
  };
}

function genEnclosingQuery(rng: Rng, p: Project): EnclosingQuery {
  const containerId = rng.pick<string | null>([
    null,
    null,
    ...p.containers.map((c) => c.id),
    MISSING_CONTAINER,
  ]);
  const inSpace = p.markings.filter((m) => m.containerId === containerId);
  const pool = inSpace.length > 0 && rng.chance(0.8) ? inSpace : p.markings;
  const candidates = new Set(pool.filter(() => rng.chance(0.5)).map((m) => m.id));
  if (rng.chance(0.1)) candidates.add('ghost-0');
  const currentRoll = rng.float();
  let current: string | null = null;
  if (currentRoll < 0.1) current = 'ghost-1';
  else if (currentRoll < 0.7 && pool.length > 0) current = rng.pick(pool).id;
  return { containerId, candidates, current };
}

function buildCase(index: number): Case {
  const rng = makeRng(SEED + index * SEED_STEP);
  let project = genProject(rng);
  // Parte dos casos já vem assentada: o "nada muda devolve o mesmo objeto" tem de aparecer.
  if (rng.chance(0.15)) project = referenceSettleHierarchy(project);
  return {
    index,
    project,
    minSizeOf: genMinSizes(rng, project),
    before: genBefore(rng, project),
    enclosing: [genEnclosingQuery(rng, project), genEnclosingQuery(rng, project)],
  };
}

let cached: readonly Case[] | null = null;
function allCases(): readonly Case[] {
  cached ??= Array.from({ length: CASES }, (_, i) => buildCase(i));
  return cached;
}

// ---------------------------------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------------------------------

function expectSameSettle(p: Project, options: SettleOptions | undefined, label: string) {
  const got = settleHierarchy(p, options);
  const want = referenceSettleHierarchy(p, options);
  expect(got, label).toStrictEqual(want);
  expect(Object.is(got, p), `${label} (identidade)`).toBe(Object.is(want, p));
  // Idempotente: assentar o resultado devolve o mesmo objeto.
  expect(settleHierarchy(got), `${label} (idempotência)`).toBe(got);
}

function expectSameCase(c: Case): void {
  const label = `semente ${SEED} caso ${c.index}`;
  expectSameSettle(c.project, undefined, `${label} sem opções`);
  expectSameSettle(c.project, { minSizeOf: c.minSizeOf }, `${label} com minSizeOf`);
  expectSameSettle(c.project, { before: c.before }, `${label} com before`);
  expectSameSettle(
    c.project,
    { minSizeOf: c.minSizeOf, before: c.before },
    `${label} com minSizeOf e before`,
  );
  c.enclosing.forEach((q, k) => {
    const got = enclosingAmong(c.project, q.containerId, q.candidates, q.current);
    const want = referenceEnclosingAmong(
      c.project,
      q.containerId,
      q.candidates,
      q.current,
    );
    expect(got, `${label} enclosingAmong ${k}`).toBe(want);
  });
}

// ---------------------------------------------------------------------------------------------
// Sanidade: o gerador exercita de fato as categorias
// ---------------------------------------------------------------------------------------------

type Category =
  | 'mudou'
  | 'nadaMudou'
  | 'trocouDeEspaco'
  | 'rectConvertido'
  | 'retangulosIguais'
  | 'cadeiaDeIguais'
  | 'cicloDeParentId'
  | 'mesmaAreaOutroRect'
  | 'flutuante'
  | 'paiDeContainerDecidido'
  | 'paiDeMarcacaoMudou'
  | 'setaLimpa'
  | 'containerInexistente'
  | 'paiInexistente'
  | 'saiDoContainer'
  | 'enclosingComResposta';

const rectsEqual = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function hasParentCycle(p: Project): boolean {
  const parentOf = new Map(p.markings.map((m) => [m.id, m.parentId]));
  return p.markings.some((m) => {
    const seen = new Set<string>();
    let id: string | null = m.id;
    while (id !== null && !seen.has(id)) {
      seen.add(id);
      id = parentOf.get(id) ?? null;
    }
    return id !== null;
  });
}

function hasSameAreaDifferentRect(p: Project): boolean {
  return p.markings.some((a) =>
    p.markings.some(
      (b) =>
        a.id < b.id &&
        a.containerId === b.containerId &&
        a.rect.width * a.rect.height === b.rect.width * b.rect.height &&
        !rectsEqual(a.rect, b.rect),
    ),
  );
}

function spaceCategories(p: Project, settled: Project): Category[] {
  const out: Category[] = [];
  const ids = new Set(p.markings.map((m) => m.id));
  const containerIds = new Set(p.containers.map((c) => c.id));
  const pairs = p.markings.map((m, i) => [m, settled.markings[i] as Marking] as const);
  if (pairs.some(([a, b]) => a.containerId !== b.containerId)) out.push('trocouDeEspaco');
  if (
    pairs.some(([a, b]) => a.containerId !== b.containerId && !rectsEqual(a.rect, b.rect))
  ) {
    out.push('rectConvertido');
  }
  if (
    p.markings.some((m) => m.containerId !== null && !containerIds.has(m.containerId))
  ) {
    out.push('containerInexistente');
  }
  if (p.markings.some((m) => m.parentId !== null && !ids.has(m.parentId))) {
    out.push('paiInexistente');
  }
  if (pairs.some(([a, b]) => a.parentId !== b.parentId)) out.push('paiDeMarcacaoMudou');
  return out;
}

function categoriesOf(c: Case): Category[] {
  const p = c.project;
  const settled = settleHierarchy(p);
  const out = spaceCategories(p, settled);
  out.push(settled === p ? 'nadaMudou' : 'mudou');
  const buckets = equalBuckets(p.markings.filter((m) => !m.floating));
  if (buckets.length > 0) out.push('retangulosIguais');
  if (buckets.some((b) => b.some((m) => b.some((o) => o.id === m.parentId)))) {
    out.push('cadeiaDeIguais');
  }
  if (hasParentCycle(p)) out.push('cicloDeParentId');
  if (hasSameAreaDifferentRect(p)) out.push('mesmaAreaOutroRect');
  if (p.markings.some((m) => m.floating)) out.push('flutuante');
  if (
    p.containers.some(
      (x, i) => x.parentId !== (settled.containers[i] as typeof x).parentId,
    )
  ) {
    out.push('paiDeContainerDecidido');
  }
  const cleared = p.arrows.some(
    (a, i) => a.points.length > 0 && (settled.arrows[i] as Arrow).points.length === 0,
  );
  if (cleared) out.push('setaLimpa');
  const byId = new Map(p.containers.map((x) => [x.id, x]));
  const leaves = p.markings.some((m) => {
    const own = m.containerId === null ? undefined : byId.get(m.containerId);
    return (
      own !== undefined &&
      (m.rect.x + m.rect.width > own.width || m.rect.y + m.rect.height > own.height)
    );
  });
  if (leaves) out.push('saiDoContainer');
  const answered = c.enclosing.some(
    (q) => enclosingAmong(p, q.containerId, q.candidates, q.current) !== null,
  );
  if (answered) out.push('enclosingComResposta');
  return out;
}

function countCategories(): Map<Category, number> {
  const counts = new Map<Category, number>();
  for (const c of allCases()) {
    for (const cat of categoriesOf(c)) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return counts;
}

const REQUIRED: readonly Category[] = [
  'mudou',
  'nadaMudou',
  'trocouDeEspaco',
  'rectConvertido',
  'retangulosIguais',
  'cadeiaDeIguais',
  'cicloDeParentId',
  'mesmaAreaOutroRect',
  'flutuante',
  'paiDeContainerDecidido',
  'paiDeMarcacaoMudou',
  'setaLimpa',
  'containerInexistente',
  'paiInexistente',
  'saiDoContainer',
  'enclosingComResposta',
];

describe('equivalência do assentar com a referência congelada', () => {
  it('settleHierarchy e enclosingAmong dão o mesmo resultado em centenas de projetos sorteados', () => {
    for (const c of allCases()) expectSameCase(c);
  });

  it('o gerador exercita de fato cada categoria (o teste não passa vazio)', () => {
    const counts = countCategories();
    const summary = Object.fromEntries(
      REQUIRED.map((cat) => [cat, counts.get(cat) ?? 0]),
    );
    for (const cat of REQUIRED) {
      expect(
        counts.get(cat) ?? 0,
        `${cat}: ${JSON.stringify(summary)}`,
      ).toBeGreaterThanOrEqual(10);
    }
    expect(allCases()).toHaveLength(CASES);
  });
});
