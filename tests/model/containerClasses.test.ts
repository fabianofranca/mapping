// Container classes (stage #1901, CX1, decision 2): the pure resolver of the computed class. The
// container's width (or height) in units is its size in pixels divided by the effective density;
// the class is the first whose `below` is greater than that number, otherwise the last.
import { describe, expect, it } from 'vitest';
import {
  computedClassOf,
  isComputedSet,
  unitsOf,
  type SpecContainerClassSet,
} from '../../src/model';

const windowSet: SpecContainerClassSet = {
  id: 'window',
  name: 'Window',
  by: 'width',
  classes: [
    { id: 'compact', name: 'Compact', below: 600 },
    { id: 'medium', name: 'Medium', below: 840 },
    { id: 'expanded', name: 'Expanded' },
  ],
};

const platformSet: SpecContainerClassSet = {
  id: 'platform',
  name: 'Platform',
  classes: [
    { id: 'android', name: 'Android' },
    { id: 'ios', name: 'iOS' },
  ],
};

describe('unitsOf', () => {
  it('divides the pixels by the density', () => {
    expect(unitsOf(1080, 3)).toBe(360);
    expect(unitsOf(900, 1)).toBe(900);
    expect(unitsOf(1000, 2)).toBe(500);
  });
});

describe('computedClassOf (decision 2)', () => {
  it('1080 px at density 3 is 360 units and compact', () => {
    const units = unitsOf(1080, 3);
    expect(units).toBe(360);
    expect(computedClassOf(windowSet, units)?.id).toBe('compact');
  });

  it('picks the first class whose below is greater than the units', () => {
    expect(computedClassOf(windowSet, 0)?.id).toBe('compact');
    expect(computedClassOf(windowSet, 599.9)?.id).toBe('compact');
    expect(computedClassOf(windowSet, 700)?.id).toBe('medium');
    expect(computedClassOf(windowSet, 839)?.id).toBe('medium');
  });

  it('exactly on below is the next class', () => {
    expect(computedClassOf(windowSet, 600)?.id).toBe('medium');
    expect(computedClassOf(windowSet, 840)?.id).toBe('expanded');
  });

  it('past the last below is the last class', () => {
    expect(computedClassOf(windowSet, 841)?.id).toBe('expanded');
    expect(computedClassOf(windowSet, 100000)?.id).toBe('expanded');
  });

  it('works by height too: the set decides the axis, the units come from the caller', () => {
    const height: SpecContainerClassSet = {
      id: 'tall',
      name: 'Tall',
      by: 'height',
      classes: [
        { id: 'short', name: 'Short', below: 480 },
        { id: 'tall', name: 'Tall' },
      ],
    };
    expect(isComputedSet(height)).toBe(true);
    expect(computedClassOf(height, unitsOf(1380, 3))?.id).toBe('short');
    expect(computedClassOf(height, unitsOf(1440, 2))?.id).toBe('tall');
  });

  it('a single-class computed set always gives that class', () => {
    const single: SpecContainerClassSet = {
      id: 'only',
      name: 'Only',
      by: 'width',
      classes: [{ id: 'all', name: 'All' }],
    };
    expect(computedClassOf(single, 1)?.id).toBe('all');
    expect(computedClassOf(single, 5000)?.id).toBe('all');
  });

  it('a chosen set has no computed class', () => {
    expect(isComputedSet(platformSet)).toBe(false);
    expect(isComputedSet(windowSet)).toBe(true);
    expect(computedClassOf(platformSet, 360)).toBeUndefined();
  });
});
