// Container classes (stage #1901, CX1, decision 2): the pure resolver of the computed class. The
// container's width (or height) in units is its size in pixels divided by the effective density;
// the class is the first whose `below` is greater than that number, otherwise the last.
import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  computedClassOf,
  containerClassSets,
  createMarking,
  effectiveContainerClasses,
  isComputedSet,
  setContainerClass,
  setContainerDensity,
  undeclaredContainerClasses,
  unitsOf,
  type Project,
  type Spec,
  type SpecContainerClassSet,
} from '../../src/model';
import { emptyProject } from './fixtures';

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

// ---- Effective classes of a container (decisions 3, 4 and 12) ---------------------------------

const specWith = (id: string, containerClasses: SpecContainerClassSet[]): Spec => ({
  format: 'mapping-spec',
  formatVersion: 21,
  id,
  name: id,
  version: 1,
  layers: [],
  containerClasses,
});

/** An empty project with `specs` applied and a 1080 × 2400 background container `c1`. */
function projectWith(...specs: Spec[]): Project {
  const base = addBackgroundContainer(emptyProject(), {
    id: 'c1',
    width: 1080,
    height: 2400,
    background: '#FFFFFF',
  });
  return {
    ...base,
    specializations: specs.map((spec) => ({
      id: spec.id,
      version: spec.version,
      file: `specs/${spec.id}.json`,
      spec,
    })),
  };
}

describe('effectiveContainerClasses', () => {
  it('a computed set follows the width ÷ the density', () => {
    let p = projectWith(specWith('ds', [windowSet]));
    expect(effectiveContainerClasses(p, 'c1')).toEqual({ window: 'expanded' });
    p = setContainerDensity(p, 'c1', 3);
    expect(effectiveContainerClasses(p, 'c1')).toEqual({ window: 'compact' });
    p = setContainerDensity(p, 'c1', 1.5);
    expect(effectiveContainerClasses(p, 'c1')).toEqual({ window: 'medium' });
  });

  it('a computed set by height reads the container height', () => {
    const tall: SpecContainerClassSet = {
      id: 'tall',
      name: 'Tall',
      by: 'height',
      classes: [
        { id: 'short', name: 'Short', below: 1000 },
        { id: 'high', name: 'High' },
      ],
    };
    const p = projectWith(specWith('ds', [tall]));
    expect(effectiveContainerClasses(p, 'c1')).toEqual({ tall: 'high' });
    expect(effectiveContainerClasses(setContainerDensity(p, 'c1', 3), 'c1')).toEqual({
      tall: 'short',
    });
  });

  it('a chosen set is only the stored choice: with no choice there is no class', () => {
    let p = projectWith(specWith('ds', [platformSet]));
    expect(effectiveContainerClasses(p, 'c1')).toEqual({});
    p = setContainerClass(p, 'c1', 'platform', 'ios');
    expect(effectiveContainerClasses(p, 'c1')).toEqual({ platform: 'ios' });
    p = setContainerClass(p, 'c1', 'platform', null);
    expect(effectiveContainerClasses(p, 'c1')).toEqual({});
  });

  it('combines computed and chosen sets', () => {
    const p = setContainerClass(
      setContainerDensity(projectWith(specWith('ds', [windowSet, platformSet])), 'c1', 3),
      'c1',
      'platform',
      'android',
    );
    expect(effectiveContainerClasses(p, 'c1')).toEqual({
      window: 'compact',
      platform: 'android',
    });
  });

  it("a canvas marking's container is null: no class; an unknown container too", () => {
    let p = projectWith(specWith('ds', [windowSet]));
    p = createMarking(p, {
      id: 'free',
      containerId: null,
      rect: { x: -9000, y: -9000, width: 10, height: 10 },
    });
    expect(p.markings.find((m) => m.id === 'free')?.containerId).toBeNull();
    expect(effectiveContainerClasses(p, null)).toEqual({});
    expect(effectiveContainerClasses(p, 'nope')).toEqual({});
  });

  it('two specializations with the same chosen set id share the choice', () => {
    const a = specWith('a', [platformSet]);
    const b = specWith('b', [
      {
        id: 'platform',
        name: 'Platform',
        classes: [
          { id: 'ios', name: 'iOS' },
          { id: 'web', name: 'Web' },
        ],
      },
    ]);
    const p = setContainerClass(projectWith(a, b), 'c1', 'platform', 'web');
    // The choice is keyed by the set id; classes merge by id, in order of appearance.
    expect(effectiveContainerClasses(p, 'c1')).toEqual({ platform: 'web' });
    expect(undeclaredContainerClasses(p)).toEqual([]);
    const merged = containerClassSets(p).find((s) => s.id === 'platform');
    expect(merged?.classes.map((c) => c.id)).toEqual(['android', 'ios', 'web']);
  });

  it('an undeclared stored choice is kept, gives no class and is listed', () => {
    let p = projectWith(specWith('ds', [platformSet]));
    p = setContainerClass(p, 'c1', 'platform', 'tv'); // a class no set declares
    p = setContainerClass(p, 'c1', 'gone', 'x'); // a set no specialization declares
    expect(p.containers[0]?.classes).toEqual({ platform: 'tv', gone: 'x' });
    expect(effectiveContainerClasses(p, 'c1')).toEqual({});
    expect(undeclaredContainerClasses(p)).toEqual([
      { containerId: 'c1', set: 'platform', class: 'tv' },
      { containerId: 'c1', set: 'gone', class: 'x' },
    ]);
  });

  it('a choice stored in a computed set is undeclared (the set is not chosen)', () => {
    const p = setContainerClass(
      projectWith(specWith('ds', [windowSet])),
      'c1',
      'window',
      'compact',
    );
    expect(effectiveContainerClasses(p, 'c1')).toEqual({ window: 'expanded' });
    expect(undeclaredContainerClasses(p)).toEqual([
      { containerId: 'c1', set: 'window', class: 'compact' },
    ]);
  });
});

describe('containerClassSets', () => {
  it('is empty without a declaration and lists the chosen and computed sets with their kind', () => {
    expect(containerClassSets(projectWith())).toEqual([]);
    const sets = containerClassSets(
      projectWith(specWith('ds', [windowSet, platformSet])),
    );
    expect(sets.map((s) => [s.id, s.by ?? null])).toEqual([
      ['window', 'width'],
      ['platform', null],
    ]);
  });

  it('a specialization whose file is missing declares nothing', () => {
    const p = projectWith(specWith('ds', [platformSet]));
    const broken: Project = {
      ...p,
      specializations: p.specializations.map((s) => ({ ...s, spec: null })),
    };
    expect(containerClassSets(broken)).toEqual([]);
  });
});

describe('setContainerClass', () => {
  it('sets one set, keeps the others and null removes it (the key leaves with the last one)', () => {
    let p = projectWith(specWith('ds', [platformSet]));
    p = setContainerClass(p, 'c1', 'platform', 'android');
    p = setContainerClass(p, 'c1', 'form', 'phone');
    expect(p.containers[0]?.classes).toEqual({ platform: 'android', form: 'phone' });
    p = setContainerClass(p, 'c1', 'platform', null);
    expect(p.containers[0]?.classes).toEqual({ form: 'phone' });
    p = setContainerClass(p, 'c1', 'form', null);
    expect('classes' in (p.containers[0] ?? {})).toBe(false);
  });

  it('is the same project when nothing changes', () => {
    const p = setContainerClass(projectWith(), 'c1', 'platform', 'android');
    expect(setContainerClass(p, 'c1', 'platform', 'android')).toBe(p);
    expect(setContainerClass(p, 'c1', 'other', null)).toBe(p);
  });

  it('refuses an unknown container and a name outside [a-z0-9-]+', () => {
    const p = projectWith();
    expect(() => setContainerClass(p, 'nope', 'platform', 'android')).toThrowError(
      /not-found/,
    );
    expect(() => setContainerClass(p, 'c1', 'Platform', 'android')).toThrowError(
      /container-class/,
    );
    expect(() => setContainerClass(p, 'c1', 'platform', 'And roid')).toThrowError(
      /container-class/,
    );
  });
});
