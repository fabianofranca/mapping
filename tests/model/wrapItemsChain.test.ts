import { describe, expect, it } from 'vitest';
import {
  createMarking,
  reorderMarking,
  setMarkingRect,
  settleHierarchy,
  siblingPosition,
  wrapItems,
  type Marking,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Envolver depois de reordenar marcações de mesmo retângulo (etapa #549, DE3, achado 1): o pai
// atual do conjunto sai da cadeia (os `parentId`), nunca do último do array. A nova vira filha
// do pai que as selecionadas tinham e mãe direta delas.

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function container(id: string, size: number): ProjectContainer {
  return {
    id,
    name: null,
    file: null,
    width: size,
    height: size,
    placement: { x: 0, y: 0, scale: 1 },
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  };
}

function build(size: number, items: readonly [string, Rect][]): Project {
  let p: Project = { ...emptyProject(), containers: [container('C', size)] };
  for (const [id, r] of items) p = createMarking(p, { id, containerId: 'C', rect: r });
  return p;
}

const parentOf = (p: Project, id: string) =>
  (p.markings.find((m) => m.id === id) as Marking).parentId;
const ids = (p: Project) => p.markings.map((m) => m.id);
const wrap = (p: Project, items: readonly string[]) =>
  wrapItems(p, { id: 'W', items: items.map((id) => ({ kind: 'marking' as const, id })) });

describe('Envolver na cadeia de retângulos iguais depois de reordenar', () => {
  it('caso A: a nova entra entre o pai atual e a selecionada', () => {
    let p = build(200, [
      ['M', rect(0, 0, 50, 50)],
      ['O1', rect(0, 0, 100, 100)],
      ['O2', rect(0, 0, 100, 100)],
      ['U', rect(150, 0, 20, 20)],
    ]);
    expect(parentOf(p, 'M')).toBe('O2');
    expect(parentOf(p, 'O2')).toBe('O1');
    p = setMarkingRect(p, 'M', rect(0, 0, 100, 100));
    p = reorderMarking(p, 'O1', 1);
    expect(ids(p)).toEqual(['M', 'U', 'O2', 'O1']);
    expect([parentOf(p, 'M'), parentOf(p, 'O2'), parentOf(p, 'O1')]).toEqual([
      'O2',
      'O1',
      null,
    ]);
    const orders = ['O1', 'O2', 'U'].map((id) => siblingPosition(p, id));
    const w = wrap(p, ['M']);
    expect(parentOf(w, 'W')).toBe('O2');
    expect(parentOf(w, 'M')).toBe('W');
    expect(parentOf(w, 'O2')).toBe('O1');
    expect(parentOf(w, 'O1')).toBe(null);
    expect(['O1', 'O2', 'U'].map((id) => siblingPosition(w, id))).toEqual(orders);
  });

  it('caso B: a nova é filha do pai de dentro da cadeia, não do último do array', () => {
    let p = build(200, [
      ['S', rect(4, 4, 92, 92)],
      ['E1', rect(0, 0, 100, 100)],
      ['E2', rect(0, 0, 100, 100)],
      ['X', rect(150, 0, 20, 20)],
    ]);
    expect(parentOf(p, 'S')).toBe('E2');
    expect(parentOf(p, 'E2')).toBe('E1');
    p = reorderMarking(p, 'E1', 1);
    expect(ids(p)).toEqual(['S', 'X', 'E2', 'E1']);
    const w = wrap(p, ['S']);
    expect(parentOf(w, 'W')).toBe('E2');
    expect(parentOf(w, 'S')).toBe('W');
    expect(parentOf(w, 'E2')).toBe('E1');
  });
});

/** Gerador congruencial com semente fixa: o teste é reprodutível. */
function rng(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

/** Projeto assentado com retângulos de uma grade pequena (força empates dos dois tipos). */
function randomProject(next: (n: number) => number): Project {
  const items: [string, Rect][] = [];
  const count = 3 + next(5);
  for (let k = 0; k < count; k++) {
    const x = next(3) * 20;
    const y = next(3) * 20;
    const width = (1 + next(3 - x / 20)) * 20;
    const height = (1 + next(3 - y / 20)) * 20;
    items.push([`K${k}`, rect(x, y, width, height)]);
  }
  return settleHierarchy(build(60, items));
}

function shuffleOrder(p: Project, next: (n: number) => number): Project {
  let out = p;
  const steps = next(6);
  for (let k = 0; k < steps; k++) {
    const m = out.markings[next(out.markings.length)] as Marking;
    const siblings = out.markings.filter(
      (x) => x.containerId === m.containerId && x.parentId === m.parentId,
    ).length;
    out = reorderMarking(out, m.id, next(siblings));
  }
  return out;
}

describe('Envolver depois de reordenar: propriedade (semente fixa)', () => {
  it('a nova fica filha do pai que as selecionadas tinham e mãe direta delas', () => {
    const next = rng(549635);
    let checked = 0;
    for (let round = 0; round < 400; round++) {
      const p = shuffleOrder(randomProject(next), next);
      // Selecionadas de topo com o mesmo pai: uma ou duas irmãs.
      const first = p.markings[next(p.markings.length)] as Marking;
      const siblings = p.markings.filter(
        (m) => m.parentId === first.parentId && m.id !== first.id,
      );
      const chosen = [first];
      if (siblings.length > 0 && next(2) === 1) {
        chosen.push(siblings[next(siblings.length)] as Marking);
      }
      let w: Project;
      try {
        w = wrap(
          p,
          chosen.map((m) => m.id),
        );
      } catch {
        continue; // retângulo pequeno demais ou fora: não é o que este teste confere
      }
      checked++;
      const ctx = `rodada ${round}: ${JSON.stringify(p.markings.map((m) => [m.id, m.rect, m.parentId]))}`;
      expect(parentOf(w, 'W'), ctx).toBe(first.parentId);
      for (const m of chosen) expect(parentOf(w, m.id), ctx).toBe('W');
    }
    expect(checked).toBeGreaterThan(200);
  });
});
