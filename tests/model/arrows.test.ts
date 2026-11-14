import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addTypedAnnotation,
  arrowDeletionImpact,
  arrowLinksOf,
  arrowPointsSpace,
  arrowRoute,
  arrowsOf,
  autoArrowSide,
  canEditArrow,
  createArrow,
  createMarking,
  projectIssues,
  projectIndex,
  removeArrow,
  setArrowEndpoint,
  setArrowLocked,
  setArrowName,
  setArrowRoute,
  setArrowStyle,
  setContainerPlacement,
  setMarkingLocked,
  sideAnchor,
  validateProject,
  type Arrow,
  type Project,
} from '../../src/model';
import { arrowBase, arrowProject, withArrow } from './arrowFixtures';
import { expectValid } from './fixtures';
import { cadastroProject } from './specFixtures';

// Arrows (ME4, decision 14): a marking that points. Fixture: tests/model/arrowFixtures.ts.

const arrow = (p: Project, id: string): Arrow => {
  const found = p.arrows.find((a) => a.id === id);
  if (!found) throw new Error(`arrow ${id} not found`);
  return found;
};

describe('createArrow', () => {
  it('creates with the defaults: curve, no route, no sides, no name, unlocked', () => {
    const p = arrowBase();
    const next = expectValid(createArrow(p, { id: 'r1', from: 'a1', to: 'b1' }));
    expect(next.arrows).toEqual([
      {
        id: 'r1',
        from: 'a1',
        to: 'b1',
        fromSide: null,
        toSide: null,
        points: [],
        style: 'curve',
        name: null,
        locked: false,
      },
    ]);
    // Immutable: the previous project stays as it was.
    expect(p.arrows).toEqual([]);
    expect(next.markings).toBe(p.markings);
  });

  it('accepts style, sides and name (the name is trimmed; empty becomes null)', () => {
    const p = arrowBase();
    const next = createArrow(p, {
      id: 'r1',
      from: 'a1',
      to: 'b1',
      style: 'elbow',
      fromSide: 'bottom',
      toSide: 'left',
      name: '  opens the menu  ',
    });
    expect(arrow(next, 'r1')).toMatchObject({
      style: 'elbow',
      fromSide: 'bottom',
      toSide: 'left',
      name: 'opens the menu',
    });
    expect(
      arrow(createArrow(p, { id: 'r2', from: 'a1', to: 'b1', name: '  ' }), 'r2').name,
    ).toBeNull();
  });

  it('links markings of any space, floating and canvas included', () => {
    let p = arrowBase();
    p = createArrow(p, { id: 'r1', from: 'N', to: 'a1' });
    p = createArrow(p, { id: 'r2', from: 'G', to: 'H' });
    p = createArrow(p, { id: 'r3', from: 'a1', to: 'c1' });
    expectValid(p);
    expect(p.arrows.map((a) => a.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('two identical arrows are allowed', () => {
    let p = arrowBase();
    p = createArrow(p, { id: 'r1', from: 'a1', to: 'a3' });
    p = createArrow(p, { id: 'r2', from: 'a1', to: 'a3' });
    expect(expectValid(p).arrows).toHaveLength(2);
  });

  it('rejects an endpoint that does not exist, that is an arrow or that is a container', () => {
    const p = arrowProject();
    expect(() => createArrow(p, { id: 'x', from: 'zz', to: 'a1' })).toThrow('not-found');
    expect(() => createArrow(p, { id: 'x', from: 'a1', to: 'zz' })).toThrow('not-found');
    // An arrow never links another arrow.
    expect(() => createArrow(p, { id: 'x', from: 'r1', to: 'a1' })).toThrow(
      'arrow-endpoint',
    );
    expect(() => createArrow(p, { id: 'x', from: 'a1', to: 'r1' })).toThrow(
      'arrow-endpoint',
    );
    // Nor a container: pointing at a screen is pointing at a marking of it.
    expect(() => createArrow(p, { id: 'x', from: 'a1', to: 'A' })).toThrow('not-found');
  });

  it('rejects equal origin and destination', () => {
    expect(() => createArrow(arrowBase(), { id: 'x', from: 'a1', to: 'a1' })).toThrow(
      'arrow-self',
    );
  });

  it('the id shares the markings space: repeating the id of a marking or of another arrow fails', () => {
    const p = arrowProject();
    expect(() => createArrow(p, { id: 'a1', from: 'a1', to: 'a3' })).toThrow(
      'duplicate-id',
    );
    expect(() => createArrow(p, { id: 'r1', from: 'a1', to: 'a3' })).toThrow(
      'duplicate-id',
    );
    // And the reverse: a new marking cannot repeat the id of an arrow.
    expect(() =>
      createMarking(p, {
        id: 'r1',
        containerId: 'A',
        rect: { x: 700, y: 100, width: 50, height: 50 },
      }),
    ).toThrow('duplicate-id');
  });

  it('side or style outside the format fail', () => {
    const p = arrowBase();
    expect(() =>
      createArrow(p, {
        id: 'x',
        from: 'a1',
        to: 'a3',
        fromSide: 'diagonal' as unknown as 'top',
      }),
    ).toThrow('invalid-value');
    expect(() =>
      createArrow(p, {
        id: 'x',
        from: 'a1',
        to: 'a3',
        style: 'zigzag' as unknown as 'curve',
      }),
    ).toThrow('invalid-value');
  });
});

describe('annotations on an arrow', () => {
  it('the arrow owns annotations like a marking; a nonexistent owner fails', () => {
    const p = arrowProject();
    expect(
      projectIndex(p)
        .annotationsByMarking.get('r1')
        ?.map((a) => a.id),
    ).toEqual(['ra1', 'ra2']);
    expect(validateProject(p)).toEqual([]);
    expect(() => addAnnotation(p, { id: 'x', markingId: 'zz', layerId: 'L1' })).toThrow(
      'not-found',
    );
    // The container does not own annotations.
    expect(() => addAnnotation(p, { id: 'x', markingId: 'A', layerId: 'L1' })).toThrow(
      'not-found',
    );
  });
});

/** The SDUI `text` type with the given `appliesTo` (the example SDUI only applies it to the marking). */
function withTextOn(p: Project, appliesTo: ('marking' | 'arrow')[]): Project {
  return {
    ...p,
    specializations: p.specializations.map((s) => ({
      ...s,
      spec: s.spec && {
        ...s.spec,
        layers: s.spec.layers.map((l) => ({
          ...l,
          annotationTypes: l.annotationTypes.map((t) =>
            t.id === 'text' ? { ...t, appliesTo } : t,
          ),
        })),
      },
    })),
  };
}

describe('typed annotation on an arrow', () => {
  it('enforced appliesTo: a marking-only type does not fit the arrow, and an arrow type does not fit the marking', () => {
    const base = createArrow(cadastroProject(), { id: 'R1', from: 'MN', to: 'MC' });
    const layerId = base.layers.find((l) => l.spec?.layerId === 'componentes')!.id;
    const args = (markingId: string) => ({
      id: 'AX',
      markingId,
      layerId,
      type: { specId: 'sdui', typeId: 'text' },
    });
    expect(() => addTypedAnnotation(base, args('R1'))).toThrow('type-not-applicable');
    expect(() => addTypedAnnotation(base, args('MN'))).not.toThrow();
    const onlyArrow = createArrow(withTextOn(cadastroProject(), ['arrow']), {
      id: 'R1',
      from: 'MN',
      to: 'MC',
    });
    expect(() => addTypedAnnotation(onlyArrow, args('MN'))).toThrow(
      'type-not-applicable',
    );
    expect(() => addTypedAnnotation(onlyArrow, args('R1'))).not.toThrow();
  });

  it('an existing annotation that stopped applying becomes a pending item, not an error', () => {
    let p = createArrow(withTextOn(cadastroProject(), ['marking', 'arrow']), {
      id: 'R1',
      from: 'MN',
      to: 'MC',
    });
    const layerId = p.layers.find((l) => l.spec?.layerId === 'componentes')!.id;
    p = addTypedAnnotation(p, {
      id: 'AX',
      markingId: 'R1',
      layerId,
      type: { specId: 'sdui', typeId: 'text' },
    });
    expect(projectIssues(p).get('AX')).not.toContainEqual({
      code: 'type-not-applicable',
    });
    const narrowed = withTextOn(p, ['marking']);
    expect(validateProject(narrowed)).toEqual([]);
    expect(projectIssues(narrowed).get('AX')).toContainEqual({
      code: 'type-not-applicable',
    });
  });

  it('is created on the type layer and enters the pending items like one of a marking', () => {
    let p = createArrow(withTextOn(cadastroProject(), ['marking', 'arrow']), {
      id: 'R1',
      from: 'MN',
      to: 'MC',
    });
    const layer = p.layers.find(
      (l) => l.spec?.specId === 'sdui' && l.spec.layerId === 'componentes',
    );
    if (!layer) throw new Error('fixture');
    p = addTypedAnnotation(p, {
      id: 'AX',
      markingId: 'R1',
      layerId: layer.id,
      type: { specId: 'sdui', typeId: 'text' },
    });
    expect(validateProject(p)).toEqual([]);
    expect(
      projectIndex(p)
        .annotationsByMarking.get('R1')
        ?.map((a) => a.id),
    ).toEqual(['AX']);
    // The empty required fields of Text are pending items of the arrow annotation.
    expect(projectIssues(p).get('AX')).toEqual(
      expect.arrayContaining([{ code: 'required-empty', key: 'conteudo' }]),
    );
    // A nonexistent owner keeps failing.
    expect(() =>
      addTypedAnnotation(p, {
        id: 'AY',
        markingId: 'R9',
        layerId: layer.id,
        type: { specId: 'sdui', typeId: 'text' },
      }),
    ).toThrow('not-found');
  });
});

describe('removeArrow', () => {
  it('deletes the arrow and its annotations, linked ones included, and leaves the rest', () => {
    let p = arrowProject();
    p = withArrow(p, 'r2', 'a1', 'b1');
    p = addAnnotation(p, { id: 'rb', markingId: 'r2', layerId: 'L1' });
    p = addAnnotation(p, { id: 'ma', markingId: 'a1', layerId: 'L1' });
    expect(arrowDeletionImpact(p, 'r1')).toEqual({ annotations: 2, brokenRefs: 0 });
    const next = expectValid(removeArrow(p, 'r1'));
    expect(next.arrows.map((a) => a.id)).toEqual(['r2']);
    expect(next.annotations.map((a) => a.id)).toEqual(['rb', 'ma']);
    expect(next.markings).toBe(p.markings);
  });

  it('a locked arrow refuses; a nonexistent one fails', () => {
    const p = setArrowLocked(arrowProject(), 'r1', true);
    expect(() => removeArrow(p, 'r1')).toThrow('locked');
    expect(() => removeArrow(p, 'zz')).toThrow('not-found');
  });
});

describe('setArrowEndpoint', () => {
  it('swaps the marking of an endpoint, keeping the route when the points space is the same', () => {
    let p = arrowProject();
    p = setArrowRoute(p, 'r1', [{ x: 500, y: 100 }]);
    // a1 → a3 (both in container A); a2 is also in A: the points space does not change.
    const next = expectValid(setArrowEndpoint(p, 'r1', 'to', 'a2', null));
    expect(arrow(next, 'r1')).toMatchObject({
      from: 'a1',
      to: 'a2',
      points: [{ x: 500, y: 100 }],
    });
    const back = setArrowEndpoint(next, 'r1', 'from', 'a3', null);
    expect(arrow(back, 'r1')).toMatchObject({ from: 'a3', to: 'a2' });
    expect(arrow(back, 'r1').points).toHaveLength(1);
  });

  it('deletes the points when their space changes', () => {
    let p = arrowProject();
    p = setArrowRoute(p, 'r1', [{ x: 500, y: 100 }]);
    // b1 is in container B: the points stop being in container A (they become canvas ones).
    const toOther = setArrowEndpoint(p, 'r1', 'to', 'b1', null);
    expect(arrow(toOther, 'r1')).toMatchObject({ to: 'b1', points: [] });
    // To the canvas too.
    expect(arrow(setArrowEndpoint(p, 'r1', 'from', 'H', null), 'r1').points).toEqual([]);
  });

  it('deletes the points when going from canvas to container', () => {
    let p = withArrow(arrowBase(), 'rc', 'a1', 'c1');
    p = setArrowRoute(p, 'rc', [{ x: 2000, y: 50 }]);
    // a1 (A) and c1 (C): points on the canvas. Swapping c1 for a3 joins both endpoints in A.
    expect(arrow(setArrowEndpoint(p, 'rc', 'to', 'a3', null), 'rc').points).toEqual([]);
  });

  it('swaps only the side, or the side and the marking, and returns to automatic with null', () => {
    const p = arrowProject();
    const side = setArrowEndpoint(p, 'r1', 'from', 'a1', 'bottom');
    expect(arrow(side, 'r1')).toMatchObject({ from: 'a1', fromSide: 'bottom' });
    const both = setArrowEndpoint(side, 'r1', 'to', 'a2', 'top');
    expect(arrow(both, 'r1')).toMatchObject({
      to: 'a2',
      toSide: 'top',
      fromSide: 'bottom',
    });
    expect(
      arrow(setArrowEndpoint(both, 'r1', 'from', 'a1', null), 'r1').fromSide,
    ).toBeNull();
  });

  it('rejects the other endpoint, an arrow, what does not exist and an invalid side', () => {
    const p = arrowProject();
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'a1', null)).toThrow('arrow-self');
    expect(() => setArrowEndpoint(p, 'r1', 'from', 'a3', null)).toThrow('arrow-self');
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'r1', null)).toThrow('arrow-endpoint');
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'zz', null)).toThrow('not-found');
    expect(() => setArrowEndpoint(p, 'zz', 'to', 'a2', null)).toThrow('not-found');
    expect(() =>
      setArrowEndpoint(p, 'r1', 'to', 'a2', 'middle' as unknown as 'top'),
    ).toThrow('invalid-value');
  });

  it('no change returns the same project; a locked arrow refuses only the change', () => {
    const p = setArrowLocked(arrowProject(), 'r1', true);
    expect(setArrowEndpoint(p, 'r1', 'to', 'a3', null)).toBe(p);
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'a2', null)).toThrow('locked');
    expect(() => setArrowEndpoint(p, 'r1', 'from', 'a1', 'top')).toThrow('locked');
  });
});

describe('setArrowRoute, setArrowStyle, setArrowName, setArrowLocked', () => {
  it('the route keeps a copy of the points; [] returns to the default', () => {
    const p = arrowProject();
    const points = [
      { x: 10, y: 20 },
      { x: 30.5, y: 40 },
    ];
    const next = setArrowRoute(p, 'r1', points);
    expect(arrow(next, 'r1').points).toEqual(points);
    expect(arrow(next, 'r1').points[0]).not.toBe(points[0]);
    expect(arrow(setArrowRoute(next, 'r1', []), 'r1').points).toEqual([]);
    expect(setArrowRoute(next, 'r1', points)).toBe(next);
  });

  it('the route rejects a coordinate that is not finite', () => {
    const p = arrowProject();
    expect(() => setArrowRoute(p, 'r1', [{ x: Number.NaN, y: 0 }])).toThrow(
      'invalid-arrow-route',
    );
    expect(() => setArrowRoute(p, 'r1', [{ x: 0, y: Infinity }])).toThrow(
      'invalid-arrow-route',
    );
  });

  it('the style switches among the three; the same one returns the project; invalid fails', () => {
    const p = arrowProject();
    expect(arrow(p, 'r1').style).toBe('curve');
    expect(arrow(setArrowStyle(p, 'r1', 'straight'), 'r1').style).toBe('straight');
    expect(arrow(setArrowStyle(p, 'r1', 'elbow'), 'r1').style).toBe('elbow');
    expect(setArrowStyle(p, 'r1', 'curve')).toBe(p);
    expect(() => setArrowStyle(p, 'r1', 'zigzag' as unknown as 'curve')).toThrow(
      'invalid-value',
    );
  });

  it('an empty name becomes null, like the marking one', () => {
    const p = arrowProject();
    const named = setArrowName(p, 'r1', '  opens the menu ');
    expect(arrow(named, 'r1').name).toBe('opens the menu');
    expect(arrow(setArrowName(named, 'r1', ''), 'r1').name).toBeNull();
    expect(arrow(setArrowName(named, 'r1', null), 'r1').name).toBeNull();
    expect(() => setArrowName(p, 'zz', 'x')).toThrow('not-found');
  });

  it('a locked arrow refuses route, endpoints, sides and style; the name stays free', () => {
    const p = setArrowLocked(arrowProject(), 'r1', true);
    expect(canEditArrow(p, 'r1')).toBe(false);
    expect(() => setArrowRoute(p, 'r1', [{ x: 1, y: 1 }])).toThrow('locked');
    expect(() => setArrowStyle(p, 'r1', 'elbow')).toThrow('locked');
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'a2', null)).toThrow('locked');
    expect(arrow(setArrowName(p, 'r1', 'ok'), 'r1').name).toBe('ok');
    // Unlocking restores editing; the same value returns the project.
    const open = setArrowLocked(p, 'r1', false);
    expect(canEditArrow(open, 'r1')).toBe(true);
    expect(setArrowLocked(open, 'r1', false)).toBe(open);
    expect(() => setArrowLocked(p, 'zz', true)).toThrow('not-found');
  });

  it('the lock belongs to the arrow only: the endpoints lock does not lock it, nor does its lock lock the endpoints', () => {
    let p = arrowProject();
    p = setMarkingLocked(p, 'a1', true);
    p = setMarkingLocked(p, 'a3', true);
    expect(canEditArrow(p, 'r1')).toBe(true);
    expect(arrow(setArrowStyle(p, 'r1', 'straight'), 'r1').style).toBe('straight');
    const locked = setArrowLocked(arrowProject(), 'r1', true);
    expect(locked.markings.every((m) => !m.locked)).toBe(true);
    expect(canEditArrow(setMarkingLocked(locked, 'a1', false), 'r1')).toBe(false);
  });
});

describe('arrowsOf', () => {
  it('separates the ones leaving from the ones arriving, in array order', () => {
    let p = arrowProject();
    p = withArrow(p, 'r2', 'a3', 'a1');
    p = withArrow(p, 'r3', 'a1', 'b1');
    const a1 = arrowsOf(p, 'a1');
    expect(a1.outgoing.map((a) => a.id)).toEqual(['r1', 'r3']);
    expect(a1.incoming.map((a) => a.id)).toEqual(['r2']);
    expect(arrowsOf(p, 'a3').incoming.map((a) => a.id)).toEqual(['r1']);
    expect(arrowsOf(p, 'a2')).toEqual({ outgoing: [], incoming: [] });
    expect(arrowsOf(p, 'zz')).toEqual({ outgoing: [], incoming: [] });
  });
});

describe('arrowPointsSpace: derived from the two endpoints, never saved', () => {
  it('the container when both endpoints are in the same container', () => {
    const p = arrowProject();
    const space = arrowPointsSpace(p, arrow(p, 'r1'));
    expect(space.containerId).toBe('A');
    expect(space.placement).toEqual({ x: 0, y: 0, scale: 1 });
    expect(space.bounds).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it('the canvas in any other case', () => {
    let p = arrowBase();
    p = withArrow(p, 'cc', 'a1', 'c1'); // different containers
    p = withArrow(p, 'cv', 'a1', 'H'); // one canvas endpoint
    p = withArrow(p, 'fl', 'N', 'a1'); // one floating endpoint
    p = withArrow(p, 'kk', 'G', 'H'); // both on the canvas
    for (const id of ['cc', 'cv', 'fl', 'kk']) {
      const space = arrowPointsSpace(p, arrow(p, id));
      expect(space.containerId).toBeNull();
      expect(space.placement).toEqual({ x: 0, y: 0, scale: 1 });
      expect(space.bounds).toBeNull();
    }
    // Nonexistent endpoint (invalid project): the canvas.
    expect(arrowPointsSpace(p, { from: 'zz', to: 'a1' }).containerId).toBeNull();
  });

  it('the container with scale: the placement is its own', () => {
    const p = withArrow(arrowBase(), 'rb', 'b1', 'b2');
    expect(arrowPointsSpace(p, arrow(p, 'rb')).placement).toEqual({
      x: 2000,
      y: 0,
      scale: 2,
    });
  });
});

describe('sideAnchor and autoArrowSide', () => {
  const rect = { x: 100, y: 200, width: 40, height: 20 };

  it('the anchor is the midpoint of the side', () => {
    expect(sideAnchor(rect, 'top')).toEqual({ x: 120, y: 200 });
    expect(sideAnchor(rect, 'bottom')).toEqual({ x: 120, y: 220 });
    expect(sideAnchor(rect, 'left')).toEqual({ x: 100, y: 210 });
    expect(sideAnchor(rect, 'right')).toEqual({ x: 140, y: 210 });
  });

  it('the automatic side is that of the dominant axis of the center → target vector', () => {
    expect(autoArrowSide(rect, { x: 500, y: 215 })).toBe('right');
    expect(autoArrowSide(rect, { x: -300, y: 215 })).toBe('left');
    expect(autoArrowSide(rect, { x: 125, y: 900 })).toBe('bottom');
    expect(autoArrowSide(rect, { x: 125, y: -900 })).toBe('top');
  });

  it('a tie stays on the horizontal axis; a target at the center, to the right', () => {
    expect(autoArrowSide(rect, { x: 220, y: 310 })).toBe('right');
    expect(autoArrowSide(rect, { x: 20, y: 110 })).toBe('left');
    expect(autoArrowSide(rect, { x: 120, y: 210 })).toBe('right');
  });
});

describe('arrowRoute: the polyline in canvas units', () => {
  it('automatic sides: the side facing the other endpoint, anchor at the middle of the side', () => {
    const p = arrowProject();
    // a1 (100,100,300,300) and a3 (600,600,200,200): centers (250,250) and (700,700), tie →
    // horizontal on both endpoints.
    expect(arrowRoute(p, arrow(p, 'r1'))).toEqual({
      points: [
        { x: 400, y: 250 },
        { x: 600, y: 700 },
      ],
      fromSide: 'right',
      toSide: 'left',
      lanes: [],
    });
  });

  it('dominant vertical axis and canvas endpoint', () => {
    const p = withArrow(arrowBase(), 'rh', 'a1', 'H');
    // a1 center (250,250); H (400,1300,200,100) center (500,1350): dy dominates.
    expect(arrowRoute(p, arrow(p, 'rh'))).toEqual({
      points: [
        { x: 250, y: 400 },
        { x: 500, y: 1300 },
      ],
      fromSide: 'bottom',
      toSide: 'top',
      lanes: [],
    });
  });

  it('the marking of a scaled container enters through its rectangle on the canvas', () => {
    const p = withArrow(arrowBase(), 'rb', 'b1', 'b2');
    // b1 → (2100,100,200,200); b2 → (2600,600,200,200).
    expect(arrowRoute(p, arrow(p, 'rb'))).toEqual({
      points: [
        { x: 2300, y: 200 },
        { x: 2600, y: 700 },
      ],
      fromSide: 'right',
      toSide: 'left',
      lanes: [],
    });
  });

  it('explicit sides win over the automatic one, each endpoint on its own', () => {
    const p = withArrow(arrowBase(), 'r2', 'a1', 'a3', {
      fromSide: 'top',
      toSide: 'right',
    });
    expect(arrowRoute(p, arrow(p, 'r2'))).toEqual({
      points: [
        { x: 250, y: 100 },
        { x: 800, y: 700 },
      ],
      fromSide: 'top',
      toSide: 'right',
      lanes: [],
    });
    const half = withArrow(arrowBase(), 'r3', 'a1', 'a3', { toSide: 'bottom' });
    expect(arrowRoute(half, arrow(half, 'r3'))).toMatchObject({
      fromSide: 'right',
      toSide: 'bottom',
      lanes: [],
    });
  });

  it('the waypoints in container pixels are converted to the canvas', () => {
    const p = withArrow(arrowBase(), 'rb', 'b1', 'b2', {
      points: [{ x: 200, y: 100 }],
    });
    // B space: x = 2000 + 2·200, y = 0 + 2·100 → (2400,200). The first point defines the exit side
    // (b1 center (2200,200) → point (2400,200): right) and the last one, the arrival side
    // (b2 center (2700,700) → point (2400,200): dx −300, dy −500: top).
    expect(arrowRoute(p, arrow(p, 'rb'))).toEqual({
      points: [
        { x: 2300, y: 200 },
        { x: 2400, y: 200 },
        { x: 2700, y: 600 },
      ],
      fromSide: 'right',
      toSide: 'top',
      lanes: [],
    });
  });

  it('the points already in canvas units stay as they are', () => {
    const p = withArrow(arrowBase(), 'rc', 'a1', 'c1', {
      points: [
        { x: 1500, y: 50 },
        { x: 3000, y: 50 },
      ],
    });
    const route = arrowRoute(p, arrow(p, 'rc'));
    expect(route?.points.slice(1, 3)).toEqual([
      { x: 1500, y: 50 },
      { x: 3000, y: 50 },
    ]);
    // a1 (100,100,300,300) center (250,250) → first point (1500,50): right.
    expect(route?.fromSide).toBe('right');
    // c1 (4900,900,100,100) center (4950,950) → last point (3000,50): left.
    expect(route?.toSide).toBe('left');
    expect(route?.points[0]).toEqual({ x: 400, y: 250 });
    expect(route?.points[3]).toEqual({ x: 4900, y: 950 });
  });

  it('the route of container points follows the moved or resized container', () => {
    let p = withArrow(arrowBase(), 'rb', 'b1', 'b2', { points: [{ x: 200, y: 100 }] });
    const before = arrowRoute(p, arrow(p, 'rb'));
    p = setContainerPlacement(p, 'B', { x: 2100, y: 50, scale: 2 });
    const after = arrowRoute(p, arrow(p, 'rb'));
    // Everything (markings and point) moved (100, 50); the route was not recalculated.
    expect(after?.points).toEqual(
      before?.points.map((pt) => ({ x: pt.x + 100, y: pt.y + 50 })),
    );
    expect(arrow(p, 'rb').points).toEqual([{ x: 200, y: 100 }]);
  });

  it('straight and curve have the same polyline (the curve is only the drawing smoothing)', () => {
    const base = withArrow(arrowBase(), 'r2', 'a1', 'a3', {
      points: [{ x: 500, y: 100 }],
    });
    const curve = arrowRoute(base, arrow(base, 'r2'));
    const straightProject = setArrowStyle(base, 'r2', 'straight');
    expect(arrowRoute(straightProject, arrow(straightProject, 'r2'))).toEqual(curve);
  });

  it('is null when an endpoint does not exist', () => {
    const p = arrowProject();
    const broken: Arrow = { ...arrow(p, 'r1'), to: 'zz' };
    expect(arrowRoute(p, broken)).toBeNull();
    expect(arrowRoute(p, { ...broken, to: 'a3', from: 'zz' })).toBeNull();
  });
});

describe('arrowLinksOf ("Linked by arrow" section)', () => {
  it('lists first the ones leaving, then the ones arriving, each group in project order', () => {
    let p = withArrow(arrowBase(), 'x1', 'a1', 'a3');
    p = withArrow(p, 'x2', 'a3', 'a1');
    p = withArrow(p, 'x3', 'a1', 'b2');
    const links = arrowLinksOf(p, 'a1');
    expect(links.map((l) => [l.arrow.id, l.direction, l.otherId])).toEqual([
      ['x1', 'out', 'a3'],
      ['x3', 'out', 'b2'],
      ['x2', 'in', 'a3'],
    ]);
  });

  it('a marking without an arrow returns an empty list', () => {
    expect(arrowLinksOf(arrowBase(), 'a1')).toEqual([]);
  });
});
