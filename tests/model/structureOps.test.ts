// The operations of the stored structure (stage #3087 MS2, decisions 6 to 10): setting the parent, the
// creation rule, the nature changes, moving the stored subtree, Wrap and the clipboard. Fixture: the
// `slots` library (`bar` with the slots `navigationIcon` and `actions`, `rounded-bar` with a single slot
// `content`, `pin` with none) on a 1000 × 800 container `I1`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addComponentMarking,
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  approximateMeasurer,
  convertAnnotationToFree,
  createMarking,
  loadSpecComponents,
  moveItems,
  moveMarking,
  nudgeItems,
  parseSpec,
  removeAnnotation,
  removeSpecialization,
  setMarkingFloating,
  slotReader,
  setMarkingParent,
  settleHierarchy,
  updateSpecialization,
  wrapItems,
  adjustMarkingRect,
  creationParent,
  duplicateMarking,
  itemClipboardData,
  pasteMarking,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC_FILE = 'specs/slots/slots.spec.json';
const SPEC_ID = 'slots';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function specOf() {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

function catalogOf(): ComponentCatalog {
  const texts = new Map(
    ['bar', 'pin', 'rounded-bar'].map((id) => [
      `specs/slots/components/${id}.json`,
      read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(specOf(), SPEC_FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

const catalog = catalogOf();

function baseProject(): Project {
  let n = 0;
  const p = applySpecialization(emptyProject(), specOf(), {
    newId: () => `LS${++n}`,
    packageSpecName: 'slots.spec.json',
  });
  return addContainer(p, {
    id: 'I1',
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
}

const rc = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

/** A component marking; `parentId` and `slot` are the stored ones (or the creation rule's without them). */
function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** A bare (observation) marking. */
function bare(p: Project, id: string, rect: Rect, containerId: string | null = 'I1') {
  return createMarking(p, { id, containerId, rect });
}

function get(p: Project, id: string) {
  const m = p.markings.find((x) => x.id === id);
  if (!m) throw new Error(`no marking ${id}`);
  return m;
}

function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

/** `scene()` plus a second container `I2` (beside `I1`) with a bar `B2`. */
function twoSpaces(): Project {
  const p = addContainer(scene(), {
    id: 'I2',
    file: 'images/other.png',
    width: 1000,
    height: 800,
    beside: 'I1',
  });
  return add(p, 'B2', 'bar', { containerId: 'I2', rect: rc(100, 100, 360, 56) });
}

const set = (
  p: Project,
  id: string,
  target: Parameters<typeof setMarkingParent>[4],
  options?: Parameters<typeof setMarkingParent>[5],
): Project => setMarkingParent(p, catalog, approximateMeasurer, id, target, options);

/** A bar `B` (360 × 56 at 100,100), two loose pins and a bare marking `O` far from both. */
function scene(): Project {
  let p = baseProject();
  p = bare(p, 'O', rc(40, 300, 500, 300));
  p = add(p, 'B', 'bar', { rect: rc(100, 100, 360, 56) });
  p = add(p, 'P1', 'pin', { rect: rc(600, 700, 24, 24) });
  p = add(p, 'P2', 'pin', { rect: rc(700, 700, 24, 24) });
  return p;
}

describe('setMarkingParent', () => {
  it('into a named slot of a materialized marking: the parent and the slot are stored', () => {
    const next = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    expect(get(next, 'P1')).toMatchObject({ parentId: 'B', slot: 'actions' });
    // Stored: a later settle keeps it, wherever the rect is.
    expect(get(settleHierarchy(next), 'P1')).toMatchObject({
      parentId: 'B',
      slot: 'actions',
    });
  });

  it('into an observation marking: the parent is stored, with no slot', () => {
    const next = set(scene(), 'P1', { parentId: 'O' });
    expect(get(next, 'P1').parentId).toBe('O');
    expect(get(next, 'P1').slot).toBeUndefined();
    // The rect did not move: the observation parent does not contain it, and it still is the parent.
    expect(get(next, 'P1').rect).toEqual(rc(600, 700, 24, 24));
  });

  it('with an index: its position among the children of that slot (the array order)', () => {
    let p = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    p = add(p, 'P3', 'pin', { rect: rc(800, 700, 24, 24) });
    p = set(p, 'P3', { parentId: 'B', slot: 'actions' });
    p = set(p, 'P2', { parentId: 'B', slot: 'actions', index: 1 });
    const order = p.markings.filter((m) => m.parentId === 'B').map((m) => m.id);
    expect(order).toEqual(['P1', 'P2', 'P3']);
    const first = set(p, 'P3', { parentId: 'B', slot: 'actions', index: 0 });
    expect(first.markings.filter((m) => m.parentId === 'B').map((m) => m.id)).toEqual([
      'P3',
      'P1',
      'P2',
    ]);
  });

  it('after the last child by default', () => {
    let p = set(scene(), 'P2', { parentId: 'B', slot: 'actions' });
    p = set(p, 'P1', { parentId: 'B', slot: 'actions' });
    expect(p.markings.filter((m) => m.parentId === 'B').map((m) => m.id)).toEqual([
      'P2',
      'P1',
    ]);
  });

  it('an index past the end goes last; a negative or fractional one is `invalid-index`', () => {
    let p = set(scene(), 'P2', { parentId: 'B', slot: 'actions' });
    p = set(p, 'P1', { parentId: 'B', slot: 'actions', index: 99 });
    expect(p.markings.filter((m) => m.parentId === 'B').map((m) => m.id)).toEqual([
      'P2',
      'P1',
    ]);
    expect(
      codeOf(() => set(p, 'P1', { parentId: 'B', slot: 'actions', index: -1 })),
    ).toBe('invalid-index');
    expect(
      codeOf(() => set(p, 'P1', { parentId: 'B', slot: 'actions', index: 0.5 })),
    ).toBe('invalid-index');
  });

  it('`null` makes it loose and the slot goes away; the rect stays', () => {
    const inSlot = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    const loose = set(inSlot, 'P1', null);
    expect(get(loose, 'P1').parentId).toBeNull();
    expect('slot' in get(loose, 'P1')).toBe(false);
    expect(get(loose, 'P1').rect).toEqual(get(inSlot, 'P1').rect);
    // A loose materialized marking stays loose, even where an observation marking contains it.
    const inside = set(
      add(scene(), 'P4', 'pin', { rect: rc(60, 320, 24, 24) }),
      'P4',
      null,
    );
    expect(get(settleHierarchy(inside), 'P4').parentId).toBeNull();
  });

  it('the same structure is not a change: it returns the project as is', () => {
    const inSlot = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    expect(set(inSlot, 'P1', { parentId: 'B', slot: 'actions', index: 0 })).toBe(inSlot);
    const loose = scene();
    expect(set(loose, 'P1', null)).toBe(loose);
  });

  describe('errors', () => {
    it('`parent-by-geometry` on an observation marking: its parent comes from the geometry', () => {
      const p = scene();
      expect(codeOf(() => set(p, 'O', { parentId: 'B', slot: 'actions' }))).toBe(
        'parent-by-geometry',
      );
      expect(codeOf(() => set(p, 'O', null))).toBe('parent-by-geometry');
    });

    it('`slot-missing`: a slot is required when the parent has several, and must exist', () => {
      const p = scene();
      expect(codeOf(() => set(p, 'P1', { parentId: 'B' }))).toBe('slot-missing');
      expect(codeOf(() => set(p, 'P1', { parentId: 'B', slot: 'nope' }))).toBe(
        'slot-missing',
      );
    });

    it('`slot-missing`: an observation parent with a slot, and a parent with no slot', () => {
      const p = scene();
      expect(codeOf(() => set(p, 'P1', { parentId: 'O', slot: 'actions' }))).toBe(
        'slot-missing',
      );
      expect(codeOf(() => set(p, 'P1', { parentId: 'P2' }))).toBe('slot-missing');
    });

    it('a parent with a single slot takes the child without naming it, and never stores it', () => {
      let p = add(scene(), 'R', 'rounded-bar', { rect: rc(100, 400, 200, 80) });
      p = set(p, 'P1', { parentId: 'R' });
      expect(get(p, 'P1').parentId).toBe('R');
      expect(get(p, 'P1').slot).toBeUndefined();
      expect(codeOf(() => set(p, 'P2', { parentId: 'R', slot: 'nope' }))).toBe(
        'slot-missing',
      );
      // Naming the only slot is accepted, and still not stored.
      const named = set(p, 'P2', { parentId: 'R', slot: 'content' });
      expect(get(named, 'P2').slot).toBeUndefined();
    });

    it('`invalid-parent`: a floating or decorative marking, itself, a descendant', () => {
      let p = scene();
      p = add(p, 'F', 'pin', { rect: rc(0, 0, 24, 24), containerId: null });
      p = setMarkingFloating(p, 'F', true);
      expect(codeOf(() => set(p, 'P1', { parentId: 'F' }))).toBe('invalid-parent');
      const deco = add(scene(), 'D', 'pin', {
        rect: rc(300, 650, 24, 24),
        decorative: true,
      });
      expect(codeOf(() => set(deco, 'P1', { parentId: 'D' }))).toBe('invalid-parent');
      expect(codeOf(() => set(p, 'P1', { parentId: 'P1' }))).toBe('invalid-parent');
      // A descendant: R holds the rounded bar R2, which holds R3; R cannot go inside R3.
      let tree = add(scene(), 'R', 'rounded-bar', { rect: rc(100, 400, 200, 80) });
      tree = add(tree, 'R2', 'rounded-bar', { rect: rc(400, 400, 200, 80) });
      tree = add(tree, 'R3', 'rounded-bar', { rect: rc(700, 400, 200, 80) });
      tree = set(tree, 'R2', { parentId: 'R' });
      tree = set(tree, 'R3', { parentId: 'R2' });
      expect(codeOf(() => set(tree, 'R', { parentId: 'R3' }))).toBe('invalid-parent');
      expect(codeOf(() => set(tree, 'R', { parentId: 'R2' }))).toBe('invalid-parent');
    });

    it('a floating marking cannot take a parent', () => {
      let p = scene();
      p = add(p, 'F', 'pin', { rect: rc(0, 0, 24, 24), containerId: null });
      p = setMarkingFloating(p, 'F', true);
      expect(codeOf(() => set(p, 'F', { parentId: 'B', slot: 'actions' }))).toBe(
        'invalid-parent',
      );
    });

    it('a missing marking is `not-found`', () => {
      expect(codeOf(() => set(scene(), 'ghost', null))).toBe('not-found');
      expect(codeOf(() => set(scene(), 'P1', { parentId: 'ghost', slot: 'x' }))).toBe(
        'not-found',
      );
    });
  });

  describe('a parent in another space', () => {
    const origin = (p: Project, id: string) => {
      const c = p.containers.find((x) => x.id === id);
      if (!c) throw new Error(`no container ${id}`);
      return c.placement;
    };

    it('moves the child into the parent space, with the rect converted and kept inside it', () => {
      const p = twoSpaces();
      const next = set(p, 'P1', { parentId: 'B2', slot: 'actions' });
      const moved = get(next, 'P1');
      expect(moved).toMatchObject({ containerId: 'I2', parentId: 'B2', slot: 'actions' });
      // Where it was on the canvas is outside `I2`, so it lands at the nearest place inside it.
      expect(moved.rect.x).toBeGreaterThanOrEqual(0);
      expect(moved.rect.x + moved.rect.width).toBeLessThanOrEqual(1000);
      expect(moved.rect.width).toBe(24);
      expect(origin(p, 'I2').scale).toBe(1);
    });

    it('carries the stored subtree along', () => {
      let p = twoSpaces();
      p = add(p, 'R', 'rounded-bar', { rect: rc(100, 400, 200, 80) });
      p = set(p, 'P1', { parentId: 'R' });
      const next = set(p, 'R', { parentId: 'B2', slot: 'actions' });
      expect(get(next, 'R').containerId).toBe('I2');
      expect(get(next, 'P1')).toMatchObject({ containerId: 'I2', parentId: 'R' });
    });

    it('keeps the units of a materialized marking when the density differs', () => {
      let p = twoSpaces();
      p = {
        ...p,
        containers: p.containers.map((c) => (c.id === 'I2' ? { ...c, density: 2 } : c)),
      };
      const moved = get(set(p, 'P1', { parentId: 'B2', slot: 'actions' }), 'P1');
      // The pin draws a component: it keeps its size in component units, so twice the pixels at density 2.
      expect(moved.rect.width).toBe(48);
      expect(moved.rect.height).toBe(48);
    });

    it('with the rect given: the marking lands there', () => {
      const next = set(
        twoSpaces(),
        'P1',
        { parentId: 'B2', slot: 'actions' },
        { rect: rc(50, 50, 30, 30) },
      );
      expect(get(next, 'P1')).toMatchObject({
        containerId: 'I2',
        rect: rc(50, 50, 30, 30),
      });
    });
  });

  describe('the lock', () => {
    const lock = (p: Project, id: string): Project => ({
      ...p,
      markings: p.markings.map((m) => (m.id === id ? { ...m, locked: true } : m)),
    });

    it('a locked marking changes parent in the same space: it is not geometry', () => {
      const p = lock(scene(), 'P1');
      expect(get(set(p, 'P1', { parentId: 'B', slot: 'actions' }), 'P1').parentId).toBe(
        'B',
      );
    });

    it('fails with `locked` when the rect or the space changes', () => {
      const p = lock(twoSpaces(), 'P1');
      expect(codeOf(() => set(p, 'P1', { parentId: 'B2', slot: 'actions' }))).toBe(
        'locked',
      );
      expect(
        codeOf(() =>
          set(p, 'P1', { parentId: 'B', slot: 'actions' }, { rect: rc(0, 0, 24, 24) }),
        ),
      ).toBe('locked');
    });
  });

  it('one call is one project change: the result is a settled project', () => {
    const next = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    expect(settleHierarchy(next)).toBe(next);
  });
});

describe('the creation rule (decision 7)', () => {
  it('a component created without a parent takes the parent the geometry gives, of either nature', () => {
    let p = scene();
    // Inside the observation marking `O`.
    p = add(p, 'IN', 'pin', { rect: rc(60, 320, 24, 24) });
    expect(get(p, 'IN').parentId).toBe('O');
    // Inside a materialized bar's rectangle: the bar is the parent, in the slot the geometry gives.
    p = add(p, 'PB', 'pin', { rect: rc(110, 110, 24, 24) });
    expect(get(p, 'PB')).toMatchObject({ parentId: 'B', slot: 'navigationIcon' });
  });

  it('with no container around it, it is loose', () => {
    expect(
      get(add(scene(), 'FREE', 'pin', { rect: rc(900, 100, 24, 24) }), 'FREE').parentId,
    ).toBeNull();
  });

  it('an explicit parent is stored with its slot, and the rect no longer has to be inside it', () => {
    const p = add(scene(), 'FAR', 'pin', {
      parentId: 'B',
      slot: 'actions',
      rect: rc(800, 500, 24, 24),
    });
    expect(get(p, 'FAR')).toMatchObject({ parentId: 'B', slot: 'actions' });
    expect(get(settleHierarchy(p), 'FAR').parentId).toBe('B');
  });

  it('the creation rule picks the smallest marking that contains the new one', () => {
    let p = scene();
    p = bare(p, 'Inner', rc(50, 310, 200, 100));
    p = add(p, 'X', 'pin', { rect: rc(60, 320, 24, 24) });
    expect(get(p, 'X').parentId).toBe('Inner');
  });

  describe('a bare marking becomes materialized', () => {
    it('drawn inside a slot, then typed with a component type: the bar becomes its parent, in the slot', () => {
      let p = scene();
      p = bare(p, 'N', rc(110, 110, 24, 24));
      // Bare, it is an observation marking: the bar is never its parent.
      expect(get(p, 'N').parentId).toBeNull();
      p = addTypedAnnotation(
        p,
        {
          id: 'AN',
          markingId: 'N',
          layerId: 'LS1',
          type: { specId: SPEC_ID, typeId: 'pin' },
        },
        { slotOf: slotReader(catalog, approximateMeasurer) },
      );
      expect(get(p, 'N')).toMatchObject({ parentId: 'B', slot: 'navigationIcon' });
    });

    it('without the catalog at hand the parent is stored and the slot reads from the geometry', () => {
      let p = scene();
      p = bare(p, 'N', rc(110, 110, 24, 24));
      p = addTypedAnnotation(p, {
        id: 'AN',
        markingId: 'N',
        layerId: 'LS1',
        type: { specId: SPEC_ID, typeId: 'pin' },
      });
      expect(get(p, 'N').parentId).toBe('B');
      expect(get(p, 'N').slot).toBeUndefined();
    });

    it('outside every marking it stays loose', () => {
      let p = scene();
      p = bare(p, 'N', rc(900, 100, 24, 24));
      p = addTypedAnnotation(p, {
        id: 'AN',
        markingId: 'N',
        layerId: 'LS1',
        type: { specId: SPEC_ID, typeId: 'pin' },
      });
      expect(get(p, 'N').parentId).toBeNull();
    });

    it('the markings it contained stop being its children: an observation marking takes them by geometry', () => {
      let p = scene();
      p = bare(p, 'Outer', rc(500, 300, 400, 300));
      p = bare(p, 'Kid', rc(520, 320, 40, 40));
      expect(get(p, 'Kid').parentId).toBe('Outer');
      p = addTypedAnnotation(p, {
        id: 'AOuter',
        markingId: 'Outer',
        layerId: 'LS1',
        type: { specId: SPEC_ID, typeId: 'rounded-bar' },
      });
      // `Outer` is materialized now: `Kid` (observation) is no longer its child by geometry.
      expect(get(p, 'Kid').parentId).toBeNull();
    });
  });

  describe('a materialized marking becomes an observation marking', () => {
    function inSlot(): Project {
      return set(
        scene(),
        'P1',
        { parentId: 'B', slot: 'actions' },
        { rect: rc(130, 110, 24, 24) },
      );
    }

    it('removing the annotation drops the slot, and the parent comes from the geometry', () => {
      const next = removeAnnotation(inSlot(), 'A_P1');
      expect(get(next, 'P1').slot).toBeUndefined();
      // The bar is materialized and never a parent by geometry: it is loose, since nothing observation contains it.
      expect(get(next, 'P1').parentId).toBeNull();
    });

    it('inside an observation marking it becomes its child', () => {
      let p = set(scene(), 'P1', { parentId: 'O' }, { rect: rc(60, 320, 24, 24) });
      p = removeAnnotation(p, 'A_P1');
      expect(get(p, 'P1')).toMatchObject({ parentId: 'O' });
      expect(get(p, 'P1').slot).toBeUndefined();
    });

    it('converting the annotation to free does the same', () => {
      const next = convertAnnotationToFree(inSlot(), 'A_P1');
      expect(get(next, 'P1').slot).toBeUndefined();
      expect(get(next, 'P1').parentId).toBeNull();
    });

    it('its stored children stay its children: an observation parent is allowed', () => {
      let p = scene();
      p = add(p, 'R', 'rounded-bar', { rect: rc(100, 400, 200, 80) });
      p = set(p, 'P1', { parentId: 'R' });
      p = removeAnnotation(p, 'A_R');
      expect(get(p, 'P1').parentId).toBe('R');
    });
  });

  describe('a library update gives or takes a component', () => {
    it('removing the component of a type turns its markings into observation markings', () => {
      const p = set(
        scene(),
        'P1',
        { parentId: 'B', slot: 'actions' },
        { rect: rc(130, 110, 24, 24) },
      );
      const spec = specOf();
      const without = {
        ...spec,
        version: spec.version + 1,
        layers: spec.layers.map((layer) => ({
          ...layer,
          annotationTypes: layer.annotationTypes.map((t) => {
            if (t.id !== 'pin') return t;
            const { component, ...rest } = t;
            void component;
            return rest;
          }),
        })),
      };
      const next = updateSpecialization(p, without);
      expect(get(next, 'P1').slot).toBeUndefined();
      expect(get(next, 'P1').parentId).toBeNull();
    });

    it('removing the specialization (convert) turns every marking into an observation marking', () => {
      const p = set(
        scene(),
        'P1',
        { parentId: 'B', slot: 'actions' },
        { rect: rc(130, 110, 24, 24) },
      );
      const next = removeSpecialization(p, SPEC_ID, 'convert');
      expect(next.markings.every((m) => m.slot === undefined)).toBe(true);
      expect(get(next, 'P1').parentId).toBe('B');
    });
  });
});

describe('creationParent', () => {
  it('is the smallest non-floating, non-decorative marking of the space that contains it', () => {
    let p = scene();
    p = bare(p, 'Inner', rc(50, 310, 200, 100));
    p = bare(p, 'Q', rc(60, 320, 20, 20));
    expect(creationParent(p, 'Q')).toBe('Inner');
    expect(creationParent(p, 'O')).toBeNull();
    expect(creationParent(p, 'Inner')).toBe('O');
  });

  it('counts a materialized marking as a candidate', () => {
    let p = scene();
    p = bare(p, 'Q', rc(110, 110, 20, 20));
    expect(creationParent(p, 'Q')).toBe('B');
  });
});

describe('moving carries the stored subtree (decision 8)', () => {
  /** On the canvas: a bar with a stored pin that sits far from it, and a bare marking with a bare child. */
  function canvasScene(): Project {
    let p = baseProject();
    p = add(p, 'CB', 'bar', { containerId: null, rect: rc(2000, 100, 360, 56) });
    p = add(p, 'CP', 'pin', { containerId: null, rect: rc(2100, 100, 24, 24) });
    p = set(
      p,
      'CP',
      { parentId: 'CB', slot: 'actions' },
      { rect: rc(2900, 900, 24, 24) },
    );
    p = bare(p, 'CO', rc(2000, 400, 400, 300), null);
    p = bare(p, 'CK', rc(2020, 420, 40, 40), null);
    return p;
  }

  it('on the canvas, moving a parent carries its stored children, even far from it', () => {
    const p = canvasScene();
    expect(get(p, 'CP').parentId).toBe('CB');
    const next = moveMarking(p, 'CB', 30, 40);
    expect(get(next, 'CB').rect).toEqual(rc(2030, 140, 360, 56));
    expect(get(next, 'CP').rect).toEqual(rc(2930, 940, 24, 24));
    expect(get(next, 'CP').parentId).toBe('CB');
  });

  it("and their children's: the whole stored subtree", () => {
    let p = canvasScene();
    p = add(p, 'CR', 'rounded-bar', { containerId: null, rect: rc(3000, 1000, 100, 60) });
    // `CP` is a pin: it has no slot. A rounded bar `CS` under `CB`, then `CR` under `CS`.
    p = add(p, 'CS', 'rounded-bar', { containerId: null, rect: rc(3200, 1200, 100, 60) });
    p = set(p, 'CS', { parentId: 'CB', slot: 'actions' });
    p = set(p, 'CR', { parentId: 'CS' });
    const next = moveMarking(p, 'CB', 10, 10);
    expect(get(next, 'CS').rect.x).toBe(3210);
    expect(get(next, 'CR').rect.x).toBe(3010);
  });

  it("an observation marking's geometric children keep today's rule: redone on the canvas", () => {
    const next = moveMarking(canvasScene(), 'CO', 500, 0);
    expect(get(next, 'CO').rect.x).toBe(2500);
    // The child did not move with it: it is no longer inside, so it has no parent.
    expect(get(next, 'CK').rect.x).toBe(2020);
    expect(get(next, 'CK').parentId).toBeNull();
  });

  it('an observation parent carries its stored materialized child', () => {
    let p = canvasScene();
    p = set(p, 'CP', { parentId: 'CO' }, { rect: rc(2100, 500, 24, 24) });
    const next = moveMarking(p, 'CO', 100, 0);
    expect(get(next, 'CP').rect.x).toBe(2200);
    expect(get(next, 'CP').parentId).toBe('CO');
  });

  it('moveItems and nudgeItems carry it too', () => {
    const p = canvasScene();
    const moved = moveItems(p, [{ kind: 'marking', id: 'CB' }], 20, 0);
    expect(get(moved, 'CP').rect.x).toBe(2920);
    const nudged = nudgeItems(p, [{ kind: 'marking', id: 'CB' }], 5, 5);
    expect(get(nudged, 'CP').rect).toEqual(rc(2905, 905, 24, 24));
  });

  it("Details' x and y carry it too", () => {
    const next = adjustMarkingRect(canvasScene(), 'CB', 'x', 2100);
    expect(get(next, 'CP').rect.x).toBe(3000);
  });

  it('in a container it carries the descendants, as before', () => {
    const p = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    const next = moveMarking(p, 'B', 10, 10);
    expect(get(next, 'P1').rect).toEqual(rc(610, 710, 24, 24));
  });

  it('resizing a parent moves no child', () => {
    const p = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    const next = adjustMarkingRect(p, 'B', 'width', 200);
    expect(get(next, 'P1').rect).toEqual(rc(600, 700, 24, 24));
    expect(get(next, 'P1').parentId).toBe('B');
  });
});

describe('Wrap (decision 9)', () => {
  const marks = (...ids: string[]) => ids.map((id) => ({ kind: 'marking' as const, id }));

  it('the new observation marking becomes the stored parent of the selected loose materialized markings', () => {
    const p = wrapItems(scene(), { id: 'W', items: marks('P1', 'P2') });
    expect(get(p, 'P1').parentId).toBe('W');
    expect(get(p, 'P2').parentId).toBe('W');
    expect(get(p, 'P1').slot).toBeUndefined();
    // Stored: it does not depend on where the rect is.
    expect(get(settleHierarchy(p), 'P1').parentId).toBe('W');
  });

  it('also when their parent is an observation marking', () => {
    let p = set(scene(), 'P1', { parentId: 'O' });
    p = wrapItems(p, { id: 'W', items: marks('P1') });
    expect(get(p, 'P1').parentId).toBe('W');
  });

  it('a child of a materialized slot fails with `invalid-parent`', () => {
    const p = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    expect(codeOf(() => wrapItems(p, { id: 'W', items: marks('P1', 'P2') }))).toBe(
      'invalid-parent',
    );
  });

  it('a selected materialized marking whose stored parent is selected too keeps it', () => {
    const p0 = set(scene(), 'P1', { parentId: 'B', slot: 'actions' });
    const p = wrapItems(p0, { id: 'W', items: marks('B', 'P1') });
    expect(get(p, 'P1').parentId).toBe('B');
    expect(get(p, 'B').parentId).toBe('W');
  });

  it('an observation marking is wrapped as before, by geometry', () => {
    const p = wrapItems(scene(), { id: 'W', items: marks('O') });
    expect(get(p, 'O').parentId).toBe('W');
  });
});

describe('Duplicate and paste (decision 10)', () => {
  const ids = () => {
    let n = 0;
    return { newId: () => `copy${++n}` };
  };
  const inActions = () =>
    set(
      scene(),
      'P1',
      { parentId: 'B', slot: 'actions' },
      { rect: rc(130, 110, 24, 24) },
    );
  const copyOf = (p: Project) => p.markings.find((m) => m.id.startsWith('copy'));
  const childrenOfB = (p: Project) =>
    p.markings.filter((m) => m.parentId === 'B').map((m) => m.id);

  it('a duplicate keeps the parent and the slot, and sits right after the original among its siblings', () => {
    let p = inActions();
    p = add(p, 'P3', 'pin', { rect: rc(800, 700, 24, 24) });
    p = set(p, 'P3', { parentId: 'B', slot: 'actions' });
    const next = duplicateMarking(p, 'P1', ids(), { dx: 40, dy: 0 });
    const copy = copyOf(next);
    expect(copy).toMatchObject({ parentId: 'B', slot: 'actions' });
    expect(copy?.rect).toEqual(rc(170, 110, 24, 24));
    expect(childrenOfB(next)).toEqual(['P1', copy?.id, 'P3']);
    // The annotation is copied with its own id.
    const own = next.annotations.filter((a) => a.markingId === copy?.id);
    expect(own).toHaveLength(1);
    expect(own[0]?.id).not.toBe('A_P1');
    expect(own[0]?.type).toEqual({ specId: SPEC_ID, typeId: 'pin' });
  });

  it('a duplicate keeps the stored parent even far from it', () => {
    const next = duplicateMarking(inActions(), 'P1', ids(), { dx: 700, dy: 500 });
    expect(copyOf(next)).toMatchObject({ parentId: 'B', slot: 'actions' });
    expect(copyOf(settleHierarchy(next))?.parentId).toBe('B');
  });

  it('a duplicate carries the stored subtree, with the structure between the copies', () => {
    let p = add(scene(), 'R', 'rounded-bar', { rect: rc(100, 400, 200, 80) });
    p = set(p, 'P1', { parentId: 'R' }, { rect: rc(120, 420, 24, 24) });
    const next = duplicateMarking(p, 'R', ids(), { dx: 300, dy: 0 });
    const copies = next.markings.filter((m) => m.id.startsWith('copy'));
    expect(copies).toHaveLength(2);
    const [root, kid] = copies.sort((a) => (a.parentId === null ? -1 : 1));
    expect(kid?.parentId).toBe(root?.id);
    expect(kid?.rect).toEqual(rc(420, 420, 24, 24));
  });

  it('a paste in the same space keeps the parent and the slot', () => {
    const p = inActions();
    const data = itemClipboardData(p, 'm', 'P1', {
      project: 'x',
      ref: 'mapping://x/m/P1',
    });
    const next = pasteMarking(
      p,
      data,
      { containerId: 'I1', at: { x: 400, y: 600 } },
      ids(),
    );
    expect(copyOf(next)).toMatchObject({ parentId: 'B', slot: 'actions' });
    expect(copyOf(next)?.rect).toEqual(rc(400, 600, 24, 24));
    // After its siblings: it is the last child of the bar.
    expect(childrenOfB(next)).toEqual(['P1', copyOf(next)?.id]);
  });

  it('a paste into another space uses the creation rule', () => {
    const p = twoSpaces();
    const data = itemClipboardData(inActionsOf(p), 'm', 'P1', {
      project: 'x',
      ref: 'mapping://x/m/P1',
    });
    // Inside the bar `B2` of the other container: the smallest marking that contains it, of either nature.
    const inside = pasteMarking(
      inActionsOf(p),
      data,
      { containerId: 'I2', at: { x: 110, y: 110 } },
      ids(),
      { slotOf: slotReader(catalog, approximateMeasurer) },
    );
    expect(copyOf(inside)).toMatchObject({ containerId: 'I2', parentId: 'B2' });
    expect(copyOf(inside)?.slot).toBe('navigationIcon');
    // Outside every marking: loose.
    const outside = pasteMarking(
      inActionsOf(p),
      data,
      { containerId: 'I2', at: { x: 700, y: 600 } },
      ids(),
    );
    expect(copyOf(outside)).toMatchObject({ containerId: 'I2', parentId: null });
    expect(copyOf(outside)?.slot).toBeUndefined();
  });

  function inActionsOf(p: Project): Project {
    return set(
      p,
      'P1',
      { parentId: 'B', slot: 'actions' },
      { rect: rc(130, 110, 24, 24) },
    );
  }

  it('a paste whose parent is gone uses the creation rule too', () => {
    const p = inActions();
    const data = itemClipboardData(p, 'm', 'P1', {
      project: 'x',
      ref: 'mapping://x/m/P1',
    });
    const without = {
      ...p,
      markings: p.markings.filter((m) => m.id !== 'B' && m.id !== 'P1'),
    };
    const next = pasteMarking(
      without,
      data,
      { containerId: 'I1', at: { x: 400, y: 600 } },
      ids(),
    );
    expect(copyOf(next)?.parentId).toBeNull();
  });

  it('an observation marking is copied and its parent comes from the geometry', () => {
    const p = bare(scene(), 'Q', rc(60, 320, 20, 20));
    expect(get(p, 'Q').parentId).toBe('O');
    const next = duplicateMarking(p, 'Q', ids(), { dx: 30, dy: 0 });
    expect(copyOf(next)).toMatchObject({ parentId: 'O' });
    const away = duplicateMarking(p, 'Q', ids(), { dx: 700, dy: 400 });
    expect(copyOf(away)?.parentId).toBeNull();
  });
});
