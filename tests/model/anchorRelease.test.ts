// Anchor released when, at the end of settling, the marking and the target end up in different spaces
// (the rule "anchor requires the same space"). Covers `settleHierarchy` and the clipped `settleFrom`.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  moveContainer,
  moveMarking,
  setMarkingAnchor,
  setMarkingSpace,
  settleFrom,
  settleHierarchy,
  validateProject,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

const anchor = (to: string) => ({ to, side: 'end' as const, align: 'start' as const });

function base(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  const make = (id: string, containerId: string | null, x: number, y: number) =>
    (p = createMarking(p, { id, containerId, rect: { x, y, width: 100, height: 50 } }));
  make('T', 'I1', 100, 100);
  make('B', 'I1', 400, 100);
  make('C', 'I1', 700, 100);
  make('F', null, -500, -500);
  make('G', null, -300, -500);
  p = setMarkingAnchor(p, 'B', anchor('T'));
  p = setMarkingAnchor(p, 'C', anchor('B'));
  p = setMarkingAnchor(p, 'F', anchor('G'));
  return p;
}

const get = (p: Project, id: string) => p.markings.find((m) => m.id === id)!;
const anchorErrors = (p: Project) =>
  validateProject(p).filter((e) => e.code.startsWith('anchor'));

describe('releasing the anchor that ended up in another space', () => {
  it('moving the anchored marking out of the container releases the relation (and only it)', () => {
    const p = moveMarking(base(), 'B', 5000, 5000);
    expect(get(p, 'B').containerId).toBeNull();
    expect(get(p, 'B').anchor ?? null).toBeNull();
    expect(get(p, 'C').anchor?.to).toBe('B');
    expect(get(p, 'B').parentId).toBeNull();
    expect(anchorErrors(p)).toEqual([]);
  });

  it('setMarkingSpace to the canvas releases the relation', () => {
    const p = setMarkingSpace(base(), 'B', null, {
      x: 9000,
      y: 9000,
      width: 100,
      height: 50,
    });
    expect(get(p, 'B').anchor ?? null).toBeNull();
    expect(anchorErrors(p)).toEqual([]);
  });

  it('the container now covers only one of the two canvas markings: releases', () => {
    const p = moveContainer(base(), 'I1', -1400, -600);
    expect(get(p, 'F').containerId).toBe('I1');
    expect(get(p, 'G').containerId).toBeNull();
    expect(get(p, 'F').anchor ?? null).toBeNull();
    expect(anchorErrors(p)).toEqual([]);
  });

  it('the target leaves the space without the anchored marking (settleHierarchy): releases the anchored marking', () => {
    const p0 = base();
    const moved = {
      ...p0,
      markings: p0.markings.map((m) =>
        m.id === 'T' ? { ...m, containerId: null, rect: { ...m.rect, x: 9000 } } : m,
      ),
    };
    const p = settleHierarchy(moved);
    expect(get(p, 'B').anchor ?? null).toBeNull();
    expect(anchorErrors(p)).toEqual([]);
  });

  it('clipped settleFrom gives the same result as the full settle', () => {
    const before = base();
    const next = {
      ...before,
      markings: before.markings.map((m) =>
        m.id === 'B' ? { ...m, containerId: null, rect: { ...m.rect, x: 7000 } } : m,
      ),
    };
    const cut = settleFrom(before, next);
    expect(cut).toStrictEqual(settleHierarchy(next));
    expect(get(cut, 'B').anchor ?? null).toBeNull();
    const moved = moveContainer(before, 'I1', -1400, -600);
    expect(moved).toStrictEqual(
      settleHierarchy({
        ...before,
        containers: before.containers.map((c) =>
          c.id === 'I1' ? { ...c, placement: { ...c.placement, x: -1400, y: -600 } } : c,
        ),
      }),
    );
  });

  it('with nothing to release returns the same object', () => {
    const p = base();
    expect(settleHierarchy(p)).toBe(p);
    expect(settleFrom(p, p)).toBe(p);
  });
});
