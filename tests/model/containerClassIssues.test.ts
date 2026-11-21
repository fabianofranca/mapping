// Pending item `outside-container-class` (stage #1901, CX3, decisions 7 and 9): a marking whose
// container has a class outside the type's `appliesIn` is incomplete.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  getAnnotationIssues,
  parseSpec,
  projectIssues,
  setContainerClass,
  setContainerDensity,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';
import { v11Json, type Json } from './specV11Fixtures';

const SETS = [
  {
    id: 'window',
    name: 'Window',
    by: 'width',
    classes: [
      { id: 'compact', name: 'Compact', below: 600 },
      { id: 'medium', name: 'Medium', below: 840 },
      { id: 'expanded', name: 'Expanded' },
    ],
  },
  {
    id: 'platform',
    name: 'Platform',
    classes: [
      { id: 'android', name: 'Android' },
      { id: 'ios', name: 'iOS' },
      { id: 'web', name: 'Web' },
    ],
  },
];

function spec(edit?: (types: Json[]) => void) {
  const json = v11Json((s) => {
    s.containerClasses = SETS;
    const types = s.layers[0].annotationTypes as Json[];
    types.find((t) => t.id === 'button')!.appliesIn = {
      window: ['compact', 'medium'],
    };
    types.find((t) => t.id === 'image')!.appliesIn = {
      platform: ['android', 'ios'],
    };
    types.find((t) => t.id === 'text')!.appliesIn = {
      window: ['compact'],
      platform: ['ios'],
    };
    edit?.(types);
  }, 21);
  const result = parseSpec(json);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

/** One container of `width` px (density 1) with the markings `M1` (type `typeId`) in it. */
function project(typeId: string, width = 900): Project {
  let p = applySpecialization(emptyProject(), spec(), { newId: idGen('SL') });
  p = addContainer(p, { id: 'I1', file: 'a.png', width, height: 800 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 0, y: 0, width: 50, height: 50 },
    name: 'M',
  });
  return addTypedAnnotation(p, {
    id: 'A1',
    markingId: 'M1',
    layerId: layerOf(p, 's', 'componentes'),
    type: { specId: 's', typeId },
  });
}

const outside = (p: Project, id = 'A1') =>
  getAnnotationIssues(p, id).filter((i) => i.code === 'outside-container-class');

describe('outside-container-class', () => {
  it('a marking in a class outside appliesIn gets the item, with set, class and allowed', () => {
    expect(outside(project('button'))).toEqual([
      {
        code: 'outside-container-class',
        set: { id: 'window', name: 'Window' },
        class: { id: 'expanded', name: 'Expanded' },
        allowed: [
          { id: 'compact', name: 'Compact' },
          { id: 'medium', name: 'Medium' },
        ],
      },
    ]);
  });

  it('a marking in an allowed class has no item', () => {
    expect(outside(project('button', 500))).toEqual([]);
  });

  it('the class follows the density (units, not pixels)', () => {
    const p = setContainerDensity(project('button', 1800), 'I1', 3);
    expect(outside(p)).toEqual([]);
  });

  it('a chosen set with no choice checks nothing; with a choice, it checks', () => {
    const p = project('image');
    expect(outside(p)).toEqual([]);
    expect(outside(setContainerClass(p, 'I1', 'platform', 'ios'))).toEqual([]);
    const web = outside(setContainerClass(p, 'I1', 'platform', 'web'));
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({
      set: { id: 'platform', name: 'Platform' },
      class: { id: 'web', name: 'Web' },
      allowed: [
        { id: 'android', name: 'Android' },
        { id: 'ios', name: 'iOS' },
      ],
    });
  });

  it('with two listed sets, each failing set gives its own item', () => {
    let p = project('text');
    p = setContainerClass(p, 'I1', 'platform', 'web');
    const items = outside(p);
    expect(items.map((i) => i.set?.id)).toEqual(['window', 'platform']);
    expect(items[1]?.allowed).toEqual([{ id: 'ios', name: 'iOS' }]);
    // fixing one leaves the other
    expect(
      outside(setContainerClass(p, 'I1', 'platform', 'ios')).map((i) => i.set?.id),
    ).toEqual(['window']);
  });

  it('a canvas marking and a floating marking get nothing', () => {
    let p = project('button');
    p = createMarking(p, {
      id: 'M2',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 50, height: 50 },
      name: 'canvas',
    });
    p = addTypedAnnotation(p, {
      id: 'A2',
      markingId: 'M2',
      layerId: layerOf(p, 's', 'componentes'),
      type: { specId: 's', typeId: 'button' },
    });
    expect(outside(p, 'A2')).toEqual([]);
    const floating = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M1' ? { ...m, floating: true } : m)),
    };
    expect(outside(floating)).toEqual([]);
  });

  it('a type with no appliesIn gets nothing', () => {
    let p = project('button');
    p = addTypedAnnotation(p, {
      id: 'A3',
      markingId: 'M1',
      layerId: layerOf(p, 's', 'eventos'),
      type: { specId: 's', typeId: 'onHold' },
    });
    expect(outside(p, 'A3')).toEqual([]);
  });

  it('counts in the incomplete list (projectIssues)', () => {
    const p = project('button');
    expect(
      projectIssues(p)
        .get('A1')
        ?.map((i) => i.code),
    ).toContain('outside-container-class');
  });
});
