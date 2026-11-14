import { describe, expect, it } from 'vitest';
import { settleHierarchy, validateProject } from '../../../src/model';
import { buildScaleProject } from '../../model/scaleProject';

describe.each([1250, 5000])('scale fixture with %i markings', (markings) => {
  const p = buildScaleProject({ markings });

  it('has proportional counts', () => {
    expect(p.markings).toHaveLength(markings);
    expect(p.arrows).toHaveLength(markings * 0.4);
    expect(p.containers).toHaveLength(markings / 25);
    expect(p.layers.length).toBeGreaterThanOrEqual(2);
    expect(p.perspectives).toHaveLength(2);
    // 2-level hierarchy, floating markings, canvas markings and nested containers
    expect(p.markings.some((m) => m.parentId !== null && m.containerId !== null)).toBe(
      true,
    );
    expect(p.markings.filter((m) => m.floating)).toHaveLength(markings / 25);
    expect(p.markings.filter((m) => m.containerId === null && !m.floating).length).toBe(
      (markings / 25) * 3,
    );
    expect(p.containers.every((c) => c.parentId !== null)).toBe(true);
    // annotations in 2 layers, half of them typed, with references
    const typed = p.annotations.filter((a) => a.type !== null);
    expect(typed.length).toBeGreaterThan(p.annotations.length * 0.3);
    expect(new Set(p.annotations.map((a) => a.layerId)).size).toBeGreaterThanOrEqual(2);
    // the two perspectives split the roots, without repeating any
    const [a, b] = p.perspectives;
    const roots = new Set(a!.items.map((i) => i.root));
    expect(b!.items.every((i) => !roots.has(i.root))).toBe(true);
    expect(a!.items.length + b!.items.length).toBe((markings / 25) * 3);
  });

  it('is valid and already settled', () => {
    expect(validateProject(p)).toEqual([]);
    expect(settleHierarchy(p)).toBe(p);
  });
});

describe('buildScaleProject', () => {
  it('only accepts multiples of 25 markings', () => {
    expect(() => buildScaleProject({ markings: 30 })).toThrow(RangeError);
  });
});
