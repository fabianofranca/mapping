// The drawing and Arrange read the stored slot (stage #3087, MS3, decision 11): a child with a `slot` is drawn in that
// slot whatever its rectangle; one without goes by geometry as before; a stored slot the component lacks (or a
// parent with no slot at all) gives the pending item `slot-missing` and the child goes by geometry. Arrange keeps a
// child inside its stored parent without clamping it into the parent's rectangle (only into the image): a `strip`
// with four tiles keeps the fourth past the right edge, still its child, with `component-overflow`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  createDrawingCache,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type ComponentDrawing,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { emptyProject } from './fixtures';

const DIR = 'tests/fixtures/structure';
const SPEC_ID = 'structure';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');
const IDS = ['panel', 'strip', 'tile'];

function catalogOf(): { catalog: ComponentCatalog; project: Project } {
  const parsed = parseSpec(JSON.parse(read('structure.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const texts = new Map(
    IDS.map((id) => [
      `specs/${SPEC_ID}/components/${id}.json`,
      read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(
    parsed.spec,
    `specs/${SPEC_ID}/structure.spec.json`,
    1,
    (path) => texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  let n = 0;
  const applied = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'structure.spec.json',
  });
  const project = addContainer(applied, {
    id: 'I1',
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
  return { catalog: new Map([[SPEC_ID, loaded]]), project };
}

const { catalog, project: base } = catalogOf();

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

const draw = (
  p: Project,
  cache = createDrawingCache(),
): ReadonlyMap<string, ComponentDrawing> => cache(p, catalog, approximateMeasurer, 0);

const slotBox = (d: ComponentDrawing, slot: string): Rect =>
  d.slots.find((s) => s.id === slot)!.box;

/** The marking with `slot` set (or removed, when `undefined`), by hand: the way a library update or an edit leaves it. */
function withSlot(p: Project, id: string, slot: string | undefined): Project {
  return {
    ...p,
    markings: p.markings.map((m) => {
      if (m.id !== id) return m;
      const { slot: dropped, ...rest } = m;
      void dropped;
      return slot === undefined ? rest : { ...rest, slot };
    }),
  };
}

const rectOf = (p: Project, id: string): Rect =>
  p.markings.find((m) => m.id === id)!.rect;

/** A panel at (100, 100) with a tile whose rectangle lies over the `right` slot. */
function panelWithTile(): { p: Project; over: Rect } {
  let p = add(base, 'P', 'panel', {
    rect: { x: 100, y: 100, width: 300, height: 100 },
  });
  const over = {
    x: slotBox(draw(p).get('P')!, 'right').x + 10,
    y: slotBox(draw(p).get('P')!, 'right').y + 10,
    width: 80,
    height: 40,
  };
  p = add(p, 'T', 'tile', { parentId: 'P', slot: 'left', rect: over });
  return { p, over };
}

describe('the structure fixture library', () => {
  it('validates with no error and no warning, three types', () => {
    const components = readdirSync(join(DIR, 'components')).map((name) => ({
      path: `components/${name}`,
      text: read(`components/${name}`),
    }));
    const report = validateLibrary({
      files: [
        { path: 'structure.spec.json', text: read('structure.spec.json') },
        ...components,
      ],
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.summary.types).toBe(3);
  });
});

describe('a child with a stored slot is drawn in it', () => {
  it('goes in the stored slot even when its rectangle lies over the other one', () => {
    const { p, over } = panelWithTile();
    expect(p.markings.find((m) => m.id === 'T')).toMatchObject({
      parentId: 'P',
      slot: 'left',
      rect: over,
    });
    const drawing = draw(p).get('P')!;
    expect(drawing.slotOf.get('T')).toBe('left');
    expect(drawing.slots.find((s) => s.id === 'left')!.children).toEqual(['T']);
    expect(drawing.slots.find((s) => s.id === 'right')!.children).toEqual([]);
    expect(drawing.slotIssues).toEqual([]);
  });

  it('without a stored slot the child is drawn as today: the slot of greatest intersection', () => {
    const { p } = panelWithTile();
    const drawing = draw(withSlot(p, 'T', undefined)).get('P')!;
    expect(drawing.slotOf.get('T')).toBe('right');
    expect(drawing.slotIssues).toEqual([]);
  });

  it('the cache sees a slot change with the rectangle untouched', () => {
    const { p } = panelWithTile();
    const cache = createDrawingCache();
    expect(draw(p, cache).get('P')!.slotOf.get('T')).toBe('left');
    const moved = withSlot(p, 'T', 'right');
    expect(draw(moved, cache).get('P')!.slotOf.get('T')).toBe('right');
    expect(
      draw(withSlot(moved, 'T', 'left'), cache)
        .get('P')!
        .slotOf.get('T'),
    ).toBe('left');
  });
});

describe('slot-missing', () => {
  it('a stored slot the component lacks: the child goes by geometry and gets the pending item', () => {
    const { p } = panelWithTile();
    const drawing = draw(withSlot(p, 'T', 'gone')).get('P')!;
    expect(drawing.slotOf.get('T')).toBe('right');
    expect(drawing.slotIssues).toEqual([
      {
        annotationId: 'A_T',
        code: 'slot-missing',
        slot: { id: 'gone', name: 'gone' },
        owner: 'Panel',
      },
    ]);
  });

  it('a materialized parent with no slot at all: the child with a stored slot gets the pending item', () => {
    let p = add(base, 'B', 'tile', { rect: { x: 100, y: 100, width: 80, height: 40 } });
    p = add(p, 'C', 'tile', { rect: { x: 110, y: 105, width: 20, height: 20 } });
    p = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'C' ? { ...m, parentId: 'B', slot: 'left' } : m,
      ),
    };
    expect(draw(p).get('B')!.slotIssues).toEqual([
      {
        annotationId: 'A_C',
        code: 'slot-missing',
        slot: { id: 'left', name: 'left' },
        owner: 'Tile',
      },
    ]);
  });

  it('a child without a stored slot never gets it', () => {
    const { p } = panelWithTile();
    expect(draw(withSlot(p, 'T', undefined)).get('P')!.slotIssues).toEqual([]);
  });
});

describe('Arrange keeps a child in its stored parent without clamping it into the parent', () => {
  /** A strip (200 × 60) with four 80 × 40 tiles, all lying over the slot's start. */
  function stripWithTiles(): Project {
    let p = add(base, 'S', 'strip', {
      rect: { x: 100, y: 100, width: 200, height: 60 },
    });
    for (const id of ['T1', 'T2', 'T3', 'T4']) {
      p = add(p, id, 'tile', {
        parentId: 'S',
        rect: { x: 104, y: 110, width: 80, height: 40 },
      });
    }
    return p;
  }

  it('the fourth tile stays past the right edge, still its child, drawn cut with component-overflow', () => {
    const { project } = arrangeMarking(
      stripWithTiles(),
      catalog,
      'S',
      approximateMeasurer,
    );
    const strip = rectOf(project, 'S');
    const fourth = rectOf(project, 'T4');
    expect(strip).toEqual({ x: 100, y: 100, width: 200, height: 60 });
    // 4 + 3 × (80 + 4) = 256 from the slot's start: wholly past the strip's right edge (x = 300).
    expect(fourth.x).toBe(356);
    expect(fourth.x).toBeGreaterThanOrEqual(strip.x + strip.width);
    expect(project.markings.find((m) => m.id === 'T4')!.parentId).toBe('S');
    expect(project.markings.find((m) => m.id === 'T4')!.containerId).toBe('I1');
    const drawing = draw(project).get('S')!;
    expect(drawing.slotOf.get('T4')).toBe('items');
    expect(drawing.overflow).toBe(true);
  });

  it('a child that the layout puts past the image edge is still clamped into the image', () => {
    let p = add(base, 'S', 'strip', {
      rect: { x: 800, y: 100, width: 200, height: 60 },
    });
    for (const id of ['T1', 'T2', 'T3', 'T4']) {
      p = add(p, id, 'tile', {
        parentId: 'S',
        rect: { x: 804, y: 110, width: 80, height: 40 },
      });
    }
    const { project } = arrangeMarking(p, catalog, 'S', approximateMeasurer);
    for (const id of ['T1', 'T2', 'T3', 'T4']) {
      const r = rectOf(project, id);
      expect(r.x + r.width).toBeLessThanOrEqual(1000);
    }
  });

  it('Arrange of a panel follows the stored slots, not the rectangles', () => {
    let p = add(base, 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    const drawing = draw(p).get('P')!;
    const left = slotBox(drawing, 'left');
    const right = slotBox(drawing, 'right');
    // A is stored in `left` but lies over `right`; B the other way round.
    p = add(p, 'A', 'tile', {
      parentId: 'P',
      slot: 'left',
      rect: { x: right.x + 5, y: right.y + 5, width: 40, height: 30 },
    });
    p = add(p, 'B', 'tile', {
      parentId: 'P',
      slot: 'right',
      rect: { x: left.x + 5, y: left.y + 5, width: 40, height: 30 },
    });
    const { project } = arrangeMarking(p, catalog, 'P', approximateMeasurer);
    const a = rectOf(project, 'A');
    const b = rectOf(project, 'B');
    expect(a.x).toBeLessThan(right.x);
    expect(b.x).toBeGreaterThanOrEqual(right.x);
    for (const id of ['A', 'B']) {
      const m = project.markings.find((x) => x.id === id)!;
      expect(m.parentId).toBe('P');
    }
    expect(project.markings.find((m) => m.id === 'A')!.slot).toBe('left');
    expect(project.markings.find((m) => m.id === 'B')!.slot).toBe('right');
  });
});
