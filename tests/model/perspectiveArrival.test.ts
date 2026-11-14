import { describe, expect, it } from 'vitest';
import {
  IMAGE_GAP,
  ModelError,
  addBackgroundContainer,
  arriveInPrincipal,
  arrivalArea,
  arrivalHasReference,
  createArrow,
  createMarking,
  dismissArrival,
  moveContainer,
  perspectiveView,
  placeRootIn,
  rectsOverlap,
  rootFootprint,
  setContainerPlacement,
  validateProject,
  type Perspective,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Arrival and place search of perspectives (v16, decision 8). The tests' world (Main):
//
//   S1 (0,0)   S2 (600,0)   S3 (1200,0)     500×500 containers, scale 1
//   T  (0,700)                                500×500 container
//   m1 in S1, m2 in S2 (50,50,100,100), mT in T; arrow r0 from m1 to m2
//
// Roots created "inside" a perspective (X, Y, F…) enter the Main one far from everything; the
// arrival takes them to the right place.

function container(p: Project, id: string, x: number, y: number, size = 500): Project {
  const added = addBackgroundContainer(p, {
    id,
    width: size,
    height: size,
    background: '#FFFFFF',
  });
  return setContainerPlacement(added, id, { x, y, scale: 1 });
}

function mark(p: Project, id: string, containerId: string): Project {
  return createMarking(p, {
    id,
    containerId,
    rect: { x: 50, y: 50, width: 100, height: 100 },
  });
}

function world(): Project {
  let p = emptyProject();
  p = container(p, 'S1', 0, 0);
  p = container(p, 'S2', 600, 0);
  p = container(p, 'S3', 1200, 0);
  p = container(p, 'T', 0, 700);
  p = mark(mark(mark(p, 'm1', 'S1'), 'm2', 'S2'), 'mT', 'T');
  return createArrow(p, { id: 'r0', from: 'm1', to: 'm2' });
}

/** Creates the container `id` far from everything, with the marking `${id}m` and an arrow from it to `to`. */
function withLinkedContainer(p: Project, id: string, to: string | null): Project {
  let next = mark(container(p, id, 9000, 9000), `${id}m`, id);
  if (to !== null) next = createArrow(next, { id: `ar-${id}`, from: `${id}m`, to });
  return next;
}

function perspective(
  items: [string, number, number][],
  id = 'P',
  name = 'Flow',
): Perspective {
  return {
    id,
    name,
    hiddenLayers: [],
    items: items.map(([root, x, y]) => ({ root, x, y })),
  };
}

const at = (p: Project, id: string) => rootFootprint(p, id) as Rect;
const free = (p: Project, rect: Rect, ...ignore: string[]) =>
  [
    ...p.containers.map((c) => c.id),
    ...p.markings.filter((m) => m.containerId === null).map((m) => m.id),
  ]
    .filter((id) => !ignore.includes(id))
    .every((id) => !rectsOverlap(rect, at(p, id)));

describe('placeRootIn: near the reference', () => {
  // X sits below S2 in the perspective (700 below), with an arrow from X to m2.
  const base = withLinkedContainer(world(), 'X', 'm2');
  const from = perspective([
    ['S1', 1000, 1000],
    ['S2', 1600, 1000],
    ['X', 1600, 1700],
  ]);

  it('near the reference, at the same distance it had from it', () => {
    const place = placeRootIn(base, perspectiveView(base, from), 'X');
    expect(place).toEqual({ x: 600, y: 700, kind: 'near', referenceId: 'S2' });
  });

  it('no floating-point noise in the computed position', () => {
    // 3000.1 + 2000.3 - 2000.4 = 2999.9999999999995 in floating point: the place comes out clean.
    const far = setContainerPlacement(base, 'S2', { x: 3000.1, y: 0, scale: 1 });
    const noisy = perspective([
      ['S2', 2000.4, 1000],
      ['X', 2000.3, 1700],
    ]);
    const place = placeRootIn(far, perspectiveView(far, noisy), 'X');
    expect(place).toEqual({ x: 3000, y: 700, kind: 'near', referenceId: 'S2' });
  });

  it('occupied: goes to the nearest free spot, overlapping nothing', () => {
    const busy = container(base, 'B', 550, 650);
    const place = placeRootIn(busy, perspectiveView(busy, from), 'X');
    expect(place.kind).toBe('occupied');
    expect(place.referenceId).toBe('S2');
    expect(free(busy, { x: place.x, y: place.y, width: 500, height: 500 }, 'X')).toBe(
      true,
    );
  });

  it('never inside a canvas marking', () => {
    const frame = createMarking(base, {
      id: 'K',
      containerId: null,
      rect: { x: 580, y: 680, width: 700, height: 700 },
    });
    const place = placeRootIn(frame, perspectiveView(frame, from), 'X');
    expect(place.kind).toBe('occupied');
    expect(
      rectsOverlap({ x: place.x, y: place.y, width: 500, height: 500 }, at(frame, 'K')),
    ).toBe(false);
  });

  it('the first arrow (in array order) is the reference', () => {
    const two = createArrow(base, { id: 'ar-S1', from: 'Xm', to: 'm1' });
    const place = placeRootIn(two, perspectiveView(two, from), 'X');
    expect(place.referenceId).toBe('S2');
  });

  it('occupied floating: the margin of the target's container, overlapping no other floating ones', () => {
    let p = world();
    p = createMarking(p, {
      id: 'F',
      containerId: null,
      rect: { x: 9000, y: 9000, width: 200, height: 50 },
      floating: true,
    });
    p = createArrow(p, { id: 'ar-F', from: 'F', to: 'm2' });
    const source = perspective([
      ['S1', 1000, 1000],
      ['S2', 1600, 1000],
      ['F', 1600, 1600],
    ]);
    const near = placeRootIn(p, perspectiveView(p, source), 'F');
    expect(near).toEqual({ x: 600, y: 600, kind: 'near', referenceId: 'S2' });

    const busy = createMarking(p, {
      id: 'F2',
      containerId: null,
      rect: { x: near.x, y: near.y, width: 200, height: 50 },
      floating: true,
    });
    const place = placeRootIn(busy, perspectiveView(busy, source), 'F');
    expect(place.kind).toBe('occupied');
    expect(Number.isInteger(place.x) && Number.isInteger(place.y)).toBe(true);
    expect(
      rectsOverlap({ x: place.x, y: place.y, width: 200, height: 50 }, at(busy, 'F2')),
    ).toBe(false);
    expect(free(busy, { x: place.x, y: place.y, width: 200, height: 50 }, 'F')).toBe(
      true,
    );
  });
});

describe('placeRootIn: arrival area', () => {
  it('no reference: column to the right of everything, from the top', () => {
    const p = withLinkedContainer(world(), 'Y', null);
    const source = perspective([['Y', 50, 50]]);
    const place = placeRootIn(p, perspectiveView(p, source), 'Y', { arrivalsFrom: 'P' });
    expect(place).toEqual({
      x: 1700 + IMAGE_GAP,
      y: 0,
      kind: 'arrival-area',
      referenceId: null,
    });
  });

  it('an arrow to a root that is not in both views is not a reference', () => {
    const p = withLinkedContainer(world(), 'Y', 'mT');
    const source = perspective([['Y', 50, 50]]); // T is not in the perspective
    const place = placeRootIn(p, perspectiveView(p, source), 'Y', { arrivalsFrom: 'P' });
    expect(place.kind).toBe('arrival-area');
  });

  it('the destination is a view: column to the right of its roots', () => {
    const p = withLinkedContainer(world(), 'Y', null);
    const target = perspectiveView(p, perspective([['S1', 0, 0]]));
    const source = perspectiveView(p, perspective([['Y', 50, 50]]));
    const place = placeRootIn(target, source, 'Y');
    expect(place).toEqual({
      x: 500 + IMAGE_GAP,
      y: 0,
      kind: 'arrival-area',
      referenceId: null,
    });
  });
});

describe('arriveInPrincipal', () => {
  const from = perspective([
    ['S1', 1000, 1000],
    ['S2', 1600, 1000],
    ['X', 1600, 1700],
    ['Y', 50, 50],
    ['Y2', 50, 700],
  ]);

  it('takes the root to the place, settles and puts the "Came from…" mark afterwards', () => {
    const p = withLinkedContainer(world(), 'X', 'm2');
    const r = arriveInPrincipal(p, 'X', from);
    expect(r.kind).toBe('near');
    expect(r.referenceId).toBe('S2');
    expect(at(r.project, 'X')).toMatchObject({ x: 600, y: 700 });
    expect(r.project.arrivals).toEqual([{ root: 'X', from: 'P', fromName: 'Flow' }]);
    expect(validateProject(r.project)).toEqual([]);
  });

  it('no reference, groups by origin: the same origin stacks, another opens a new column', () => {
    let p = withLinkedContainer(world(), 'Y', null);
    p = arriveInPrincipal(p, 'Y', from).project;
    expect(at(p, 'Y')).toMatchObject({ x: 1750, y: 0 });

    p = withLinkedContainer(p, 'Y2', null);
    const second = arriveInPrincipal(p, 'Y2', from);
    expect(second.kind).toBe('arrival-area');
    expect(at(second.project, 'Y2')).toMatchObject({ x: 1750, y: 500 + IMAGE_GAP });

    p = withLinkedContainer(second.project, 'Z', null);
    const other = perspective([['Z', 0, 0]], 'Q', 'Other');
    const third = arriveInPrincipal(p, 'Z', other);
    expect(at(third.project, 'Z')).toMatchObject({ x: 1750 + 500 + IMAGE_GAP, y: 0 });
    expect(third.project.arrivals.map((a) => [a.root, a.from])).toEqual([
      ['Y', 'P'],
      ['Y2', 'P'],
      ['Z', 'Q'],
    ]);
    expect(validateProject(third.project)).toEqual([]);
  });

  it('a flutuante vai por rect, inteiro', () => {
    let p = world();
    p = createMarking(p, {
      id: 'F',
      containerId: null,
      rect: { x: 9000, y: 9000, width: 200, height: 50 },
      floating: true,
    });
    p = createArrow(p, { id: 'ar-F', from: 'F', to: 'm2' });
    const source = perspective([
      ['S1', 1000, 1000],
      ['S2', 1600, 1000],
      ['F', 1600, 1600],
    ]);
    const r = arriveInPrincipal(p, 'F', source);
    const f = r.project.markings.find((m) => m.id === 'F');
    expect(f?.floating).toBe(true);
    expect(Number.isInteger(f?.rect.x) && Number.isInteger(f?.rect.y)).toBe(true);
    expect(r.project.arrivals.map((a) => a.root)).toEqual(['F']);
    expect(validateProject(r.project)).toEqual([]);
  });

  it('a previous mark of the same root is replaced', () => {
    let p = withLinkedContainer(world(), 'Y', null);
    p = arriveInPrincipal(p, 'Y', from).project;
    const again = arriveInPrincipal(p, 'Y', perspective([['Y', 0, 0]], 'Q', 'Other'));
    expect(again.project.arrivals).toEqual([{ root: 'Y', from: 'Q', fromName: 'Other' }]);
  });

  it('refuses what is not a root or is not in the source perspective', () => {
    const p = withLinkedContainer(world(), 'X', 'm2');
    expect(() => arriveInPrincipal(p, 'm1', from)).toThrow(ModelError);
    expect(() => arriveInPrincipal(p, 'zzz', from)).toThrow(ModelError);
    expect(() => arriveInPrincipal(p, 'X', perspective([['S1', 0, 0]]))).toThrow(
      ModelError,
    );
  });
});

describe('marca de chegada', () => {
  const from = perspective([['Y', 0, 0]]);
  const arrived = () =>
    arriveInPrincipal(withLinkedContainer(world(), 'Y', null), 'Y', from).project;

  it('moving the root in the Main one removes the mark', () => {
    expect(moveContainer(arrived(), 'Y', 3000, 3000).arrivals).toEqual([]);
  });

  it('dismissing removes the mark; dismissing with no mark returns the same project', () => {
    const p = arrived();
    expect(dismissArrival(p, 'Y').arrivals).toEqual([]);
    const clean = dismissArrival(p, 'Y');
    expect(dismissArrival(clean, 'Y')).toBe(clean);
  });

  it('arrivalArea: the box of the marked roots; with no mark, nothing', () => {
    const p = arrived();
    expect(arrivalArea(world())).toBeNull();
    expect(arrivalArea(p)).toEqual({ x: 1750, y: 0, width: 500, height: 500 });
  });
});

describe('arrivalHasReference (stage #764, AP1: the arrival deduced from the arrows)', () => {
  it('a root with no arrow to another root has no reference', () => {
    const p = withLinkedContainer(world(), 'Y', null);
    expect(arrivalHasReference(p, 'Y')).toBe(false);
  });

  it('an arrow from a member of the root to a member of another root: has a reference', () => {
    const p = withLinkedContainer(world(), 'X', 'm2');
    expect(arrivalHasReference(p, 'X')).toBe(true);
  });

  it('the arrow that arrives at the root (the other end is the one pointing) also counts', () => {
    let p = withLinkedContainer(world(), 'X', null);
    p = createArrow(p, { id: 'in', from: 'm2', to: 'Xm' });
    expect(arrivalHasReference(p, 'X')).toBe(true);
  });

  it('an arrow between two members of the root itself does not count', () => {
    let p = withLinkedContainer(world(), 'X', null);
    p = mark(p, 'Xm2', 'X');
    p = createArrow(p, { id: 'self', from: 'Xm', to: 'Xm2' });
    expect(arrivalHasReference(p, 'X')).toBe(false);
  });

  it('an arrow created or deleted afterwards changes the result', () => {
    const p = withLinkedContainer(world(), 'X', 'm2');
    const without = { ...p, arrows: p.arrows.filter((a) => a.id !== 'ar-X') };
    expect(arrivalHasReference(without, 'X')).toBe(false);
  });
});
