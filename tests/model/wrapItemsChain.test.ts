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

// Wrap after reordering markings with the same rectangle (stage #549, DE3, finding 1): the current
// parent of the set comes from the chain (the `parentId`s), never from the last of the array. The new one becomes a child
// of the parent the selected ones had and their direct parent.

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

describe('Wrap in the chain of equal rectangles after reordering', () => {
  it('case A: the new one enters between the current parent and the selected one', () => {
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

  it('case B: the new one is a child of the inner parent of the chain, not of the last of the array', () => {
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

/** Congruential generator with a fixed seed: the test is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

/** Settled project with rectangles from a small grid (forces ties of both kinds). */
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

describe('Wrap after reordering: property (fixed seed)', () => {
  it('the new one becomes a child of the parent the selected ones had and their direct parent', () => {
    const next = rng(549635);
    let checked = 0;
    for (let round = 0; round < 400; round++) {
      const p = shuffleOrder(randomProject(next), next);
      // Top-level selected ones with the same parent: one or two siblings.
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
        continue; // rectangle too small or outside: not what this test checks
      }
      checked++;
      const ctx = `round ${round}: ${JSON.stringify(p.markings.map((m) => [m.id, m.rect, m.parentId]))}`;
      expect(parentOf(w, 'W'), ctx).toBe(first.parentId);
      for (const m of chosen) expect(parentOf(w, m.id), ctx).toBe('W');
    }
    expect(checked).toBeGreaterThan(200);
  });
});
