import { describe, expect, it } from 'vitest';
import {
  createMarking,
  reorderMarking,
  settleHierarchy,
  wrapItems,
  type Marking,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Desempate estável (etapa #549, decisões 1 e 2): nos empates o assentar mantém a relação
// atual (o pai atual entre as candidatas de mesma área; a cadeia atual entre retângulos
// iguais), e a ordem do array só decide empate novo. Por isso reordenar irmãs nunca muda pais,
// nem no assentar seguinte.

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function container(id: string, size: number, placement: Placement): ProjectContainer {
  return {
    id,
    name: null,
    file: null,
    width: size,
    height: size,
    placement,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  };
}

function mk(id: string, containerId: string | null, r: Rect): Marking {
  return {
    id,
    containerId,
    parentId: null,
    name: null,
    rect: r,
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
  };
}

function project(containers: ProjectContainer[], markings: Marking[]): Project {
  return settleHierarchy({ ...emptyProject(), containers, markings });
}

const parents = (p: Project) =>
  Object.fromEntries(p.markings.map((m) => [m.id, m.parentId]));
const containerParents = (p: Project) =>
  Object.fromEntries(p.containers.map((c) => [c.id, c.parentId]));

/** Índice da marcação entre as irmãs (mesmo espaço e mesmo pai), na ordem do array. */
function siblingCount(p: Project, id: string): number {
  const m = p.markings.find((x) => x.id === id) as Marking;
  return p.markings.filter(
    (x) =>
      !x.floating &&
      !m.floating &&
      x.containerId === m.containerId &&
      x.parentId === m.parentId,
  ).length;
}

const C = container('C', 100, { x: 0, y: 0, scale: 1 });

describe('desempate estável: reordenar não muda pais', () => {
  it('retângulos iguais: a de fora continua a de fora depois de reordenar e assentar', () => {
    const start = project(
      [C],
      [
        mk('A', 'C', rect(0, 0, 50, 100)),
        mk('B', 'C', rect(0, 0, 50, 100)),
        mk('D', 'C', rect(50, 0, 50, 100)),
      ],
    );
    expect(parents(start)).toEqual({ A: null, B: 'A', D: null });
    const reordered = reorderMarking(start, 'A', 1);
    expect(reordered.markings.map((m) => m.id)).toEqual(['D', 'B', 'A']);
    expect(parents(settleHierarchy(reordered))).toEqual({ A: null, B: 'A', D: null });
  });

  it('candidatas de mesma área: reordenar as duas não troca o pai da pequena', () => {
    const start = project(
      [C],
      [
        mk('N0', 'C', rect(0, 0, 50, 100)),
        mk('N2', 'C', rect(0, 0, 100, 50)),
        mk('N3', 'C', rect(0, 0, 50, 50)),
      ],
    );
    const before = parents(start);
    expect(before).toEqual({ N0: null, N2: null, N3: 'N2' });
    const reordered = reorderMarking(start, 'N2', 0);
    expect(parents(settleHierarchy(reordered))).toEqual(before);
  });

  it('pai do container: reordenar duas marcações do canvas de mesma área não troca o pai dele', () => {
    const inner = container('I', 100, { x: 100, y: 100, scale: 1 });
    const start = project(
      [inner],
      [mk('H', null, rect(0, 100, 300, 100)), mk('V', null, rect(100, 0, 100, 300))],
    );
    expect(containerParents(start)).toEqual({ I: 'V' });
    const reordered = reorderMarking(start, 'V', 0);
    expect(reordered.markings.map((m) => m.id)).toEqual(['V', 'H']);
    expect(containerParents(settleHierarchy(reordered))).toEqual({ I: 'V' });
  });

  it('empate novo continua pelo array: o Envolver de quem preenche o container dá a nova como mãe', () => {
    let p = project([C], []);
    p = createMarking(p, { id: 'M1', containerId: 'C', rect: rect(0, 0, 50, 50) });
    p = createMarking(p, { id: 'M2', containerId: 'C', rect: rect(0, 0, 100, 100) });
    p = wrapItems(p, { id: 'W', items: [{ kind: 'marking', id: 'M2' }] });
    expect(parents(p)).toMatchObject({ W: null, M2: 'W', M1: 'M2' });
  });

  it('Envolver a de dentro de um par igual reordenado: a nova fica entre as duas', () => {
    let p = project([C], []);
    p = createMarking(p, { id: 'O', containerId: 'C', rect: rect(0, 0, 50, 100) });
    p = createMarking(p, { id: 'M', containerId: 'C', rect: rect(0, 0, 50, 100) });
    p = createMarking(p, { id: 'D', containerId: 'C', rect: rect(50, 0, 50, 100) });
    // A de fora (O) passa para depois da de dentro (M) no array; os pais não mudam.
    p = reorderMarking(p, 'O', 1);
    expect(parents(p)).toEqual({ D: null, M: 'O', O: null });
    p = wrapItems(p, { id: 'W', items: [{ kind: 'marking', id: 'M' }] });
    expect(parents(p)).toEqual({ D: null, W: 'O', M: 'W', O: null });
  });

  it('uma marcação nova com o mesmo retângulo de uma cadeia entra no lugar que o array dá', () => {
    // Cadeia A › B › D (mesmo retângulo), com A depois de B no array por uma reordenação.
    const chain = project(
      [C],
      [
        mk('A', 'C', rect(0, 0, 50, 50)),
        mk('B', 'C', rect(0, 0, 50, 50)),
        mk('D', 'C', rect(0, 0, 50, 50)),
      ],
    );
    expect(parents(chain)).toEqual({ A: null, B: 'A', D: 'B' });
    const moved: Project = {
      ...chain,
      markings: [chain.markings[1], chain.markings[0], chain.markings[2]] as Marking[],
    };
    // N entra entre B e D no array: livres ao mesmo tempo que D só depois de B.
    const withNew: Project = {
      ...moved,
      markings: [
        moved.markings[0],
        moved.markings[1],
        mk('N', 'C', rect(0, 0, 50, 50)),
        moved.markings[2],
      ] as Marking[],
    };
    const settled = settleHierarchy(withNew);
    expect(parents(settled)).toEqual({ A: null, B: 'A', N: 'B', D: 'N' });
    // N antes de todas no array: vira a de fora.
    const first: Project = {
      ...moved,
      markings: [mk('N', 'C', rect(0, 0, 50, 50)), ...moved.markings],
    };
    expect(parents(settleHierarchy(first))).toEqual({ N: null, A: 'N', B: 'A', D: 'B' });
  });

  it('parentId em ciclo (arquivo inválido) vira uma cadeia sem ciclo', () => {
    const a = { ...mk('A', 'C', rect(0, 0, 50, 50)), parentId: 'B' };
    const b = { ...mk('B', 'C', rect(0, 0, 50, 50)), parentId: 'A' };
    const settled = settleHierarchy({
      ...emptyProject(),
      containers: [C],
      markings: [a, b],
    });
    expect(parents(settled)).toEqual({ A: null, B: 'A' });
  });
});

// ---------------------------------------------------------------------------
// Propriedade (decisão 2): retângulos de uma grade pequena forçam os dois tipos de empate.

/** Gerador congruente linear: semente fixa, resultado repetível. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T =>
  xs[Math.floor(r() * xs.length)] as T;

/** Container 100×100 em (100, 100) no canvas, com marcações dentro e do canvas em volta. */
function randomProject(r: () => number, id: number): Project {
  const space = container('C', 100, { x: 100, y: 100, scale: 1 });
  const markings: Marking[] = [];
  const count = 3 + Math.floor(r() * 7);
  for (let k = 0; k < count; k++) {
    if (r() < 0.7) {
      const w = pick(r, [50, 100]);
      const h = pick(r, [50, 100]);
      const x = w === 100 ? 0 : pick(r, [0, 50]);
      const y = h === 100 ? 0 : pick(r, [0, 50]);
      markings.push(mk(`m${id}-${k}`, 'C', rect(x, y, w, h)));
    } else {
      const w = pick(r, [100, 200, 300]);
      const h = pick(r, [100, 200, 300]);
      const x = pick(r, [0, 100]);
      const y = pick(r, [0, 100]);
      markings.push(mk(`m${id}-${k}`, null, rect(x, y, w, h)));
    }
  }
  return settleHierarchy({ ...emptyProject(), containers: [space], markings });
}

function hasCycle(p: Project): boolean {
  const parentOf = new Map(p.markings.map((m) => [m.id, m.parentId]));
  for (const m of p.markings) {
    const seen = new Set<string>();
    let at: string | null | undefined = m.id;
    while (at) {
      if (seen.has(at)) return true;
      seen.add(at);
      at = parentOf.get(at);
    }
  }
  return false;
}

describe('desempate estável: propriedade com semente fixa', () => {
  it('qualquer sequência de reorderMarking seguida de settleHierarchy dá os mesmos pais', () => {
    const r = rng(549);
    for (let n = 0; n < 400; n++) {
      const start = randomProject(r, n);
      expect(hasCycle(start)).toBe(false);
      expect(settleHierarchy(start)).toBe(start);
      let p = start;
      const steps = 1 + Math.floor(r() * 6);
      for (let s = 0; s < steps; s++) {
        const target = pick(r, p.markings);
        const index = Math.floor(r() * siblingCount(p, target.id));
        p = reorderMarking(p, target.id, index);
        if (r() < 0.3) p = settleHierarchy(p);
      }
      const settled = settleHierarchy(p);
      expect(parents(settled), `caso ${n}`).toEqual(parents(start));
      expect(containerParents(settled), `caso ${n}`).toEqual(containerParents(start));
      expect(settleHierarchy(settled)).toBe(settled);
      expect(hasCycle(settled)).toBe(false);
    }
  });
});
