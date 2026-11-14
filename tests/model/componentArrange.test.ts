import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  modelMessage,
  canArrange,
  canFit,
  createMarking,
  fitMarking,
  arrangesByFit,
  loadSpecComponents,
  parseSpecText,
  setContainerDrawingMode,
  setFieldValue,
  setProjectDrawingMode,
  setMarkingLocked,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import {
  COMPONENTS,
  SPEC_ID,
  componentProject,
  testCatalog,
  tokenSlotCatalog,
} from './componentFixtures';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';
import { emptyProject, expectValid, marking } from './fixtures';

const catalog = testCatalog();

function add(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  parentId: string | null = null,
  extra: Partial<NewComponentArgs> = {},
  cat: ComponentCatalog = catalog,
  specId = SPEC_ID,
): Project {
  return addComponentMarking(
    p,
    cat,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId,
      specId,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;
const arrange = (p: Project, id: string, cat: ComponentCatalog = catalog) =>
  arrangeMarking(p, cat, id, approximateMeasurer);

/** Container `typeId` at `rect` with `text` children in the given rectangles (inside it, out of order). */
function withKids(typeId: string, rect: Rect, kids: Rect[], padding?: number): Project {
  let p = add(componentProject(), 'C', typeId, rect, null, { name: 'Row' });
  if (padding !== undefined) p = setFieldValue(p, 'A_C', 'padding', padding);
  kids.forEach((kid, i) => {
    p = add(p, `T${i + 1}`, 'text', kid, 'C', { name: `T${i + 1}` });
  });
  return p;
}

describe('canArrange and not-arrangeable', () => {
  it('only a row/column container with children', () => {
    let p = withKids('row', box(100, 100, 300, 100), [box(100, 100, 100, 40)]);
    expect(canArrange(p, catalog, 'C')).toBe(true);
    // Leaf, plain child and nonexistent.
    expect(canArrange(p, catalog, 'T1')).toBe(false);
    expect(canArrange(p, catalog, 'nothing')).toBe(false);
    // Container without children.
    p = add(p, 'E', 'row', box(500, 500, 300, 100));
    expect(canArrange(p, catalog, 'E')).toBe(false);
    // Container without a layout in the slot.
    p = add(p, 'B', 'box', box(500, 300, 300, 100));
    p = add(p, 'BT', 'text', box(500, 300, 100, 40), 'B');
    expect(canArrange(p, catalog, 'B')).toBe(false);
    // Plain marking.
    p = createMarking(p, { id: 'P', containerId: 'I1', rect: box(0, 0, 50, 50) });
    expect(canArrange(p, catalog, 'P')).toBe(false);
  });

  it('arrangeMarking throws not-arrangeable', () => {
    const p = withKids('box', box(100, 100, 300, 100), [box(100, 100, 100, 40)]);
    expect(() => arrange(p, 'C')).toThrow('not-arrangeable');
    expect(() => arrange(p, 'T1')).toThrow('not-arrangeable');
    expect(() => arrangeMarking(p, catalog, 'C', approximateMeasurer)).toThrow(
      'not-arrangeable',
    );
  });
});

describe('arrangeMarking: row and column', () => {
  it('row: the children line up in array order, with the gap', () => {
    const p = withKids('row', box(100, 100, 300, 100), [
      box(150, 150, 100, 40),
      box(300, 120, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 100, 40));
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 300, 100));
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('the slot padding shifts the content', () => {
    const p = withKids(
      'row',
      box(100, 100, 300, 100),
      [box(150, 150, 100, 40), box(300, 120, 100, 40)],
      4,
    );
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(104, 104, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(212, 104, 100, 40));
  });

  it('the spacing comes from the field', () => {
    let p = withKids('row', box(100, 100, 300, 100), [
      box(100, 100, 100, 40),
      box(200, 100, 100, 40),
    ]);
    p = setFieldValue(p, 'A_C', 'spacing', 20);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T2').x).toBe(220);
  });

  it('column: the children stack', () => {
    const p = withKids('column', box(50, 50, 300, 300), [
      box(120, 200, 100, 40),
      box(60, 60, 100, 40),
    ]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(50, 50, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(50, 98, 100, 40));
    expectValid(project);
  });

  it('align stretch stretches the cross axis and keeps the main one', () => {
    const p = withKids('rowstretch', box(100, 100, 300, 100), [
      box(120, 120, 100, 40),
      box(250, 130, 80, 30),
    ]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 100));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 80, 100));
  });

  it('justify space-between distributes the slack', () => {
    const p = withKids('rowbetween', box(100, 100, 300, 100), [
      box(120, 120, 100, 40),
      box(250, 130, 100, 40),
    ]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1').x).toBe(100);
    expect(rectOf(project, 'T2').x).toBe(300);
  });

  it('justify and align center', () => {
    const p = withKids('rowcenter', box(100, 100, 300, 100), [box(120, 120, 100, 40)]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(200, 130, 100, 40));
  });

  it('moving a child takes its descendants along', () => {
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 200), null, {
      name: 'Row',
    });
    p = add(p, 'B', 'box', box(150, 150, 100, 100), 'C');
    p = add(p, 'BT', 'text', box(160, 160, 80, 30), 'B');
    p = createMarking(p, { id: 'Deep', containerId: 'I1', rect: box(170, 200, 20, 20) });
    expect(marking(p, 'Deep').parentId).toBe('B');
    const { project } = arrange(p, 'C');
    // B goes to the start of the slot (100,100): offset (-50,-50).
    expect(rectOf(project, 'B')).toEqual(box(100, 100, 100, 100));
    expect(rectOf(project, 'BT')).toEqual(box(110, 110, 80, 30));
    expect(rectOf(project, 'Deep')).toEqual(box(120, 150, 20, 20));
    expectValid(project);
  });
});

describe('arrangeMarking: hug', () => {
  it('the hug container fits the content and the position stays', () => {
    const p = withKids('rowhug', box(100, 100, 200, 60), [
      box(110, 110, 100, 40),
      box(120, 120, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 100, 40));
    // 100 + 8 + 100 of width; the tallest height is 40.
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 208, 40));
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('the padding is part of the measure', () => {
    const p = withKids(
      'rowhug',
      box(100, 100, 220, 80),
      [box(110, 110, 100, 40), box(120, 120, 100, 40)],
      10,
    );
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 228, 60));
    expect(rectOf(project, 'T1')).toEqual(box(110, 110, 100, 40));
  });

  it('never below the minSize', () => {
    let p = add(componentProject(), 'C', 'rowhug', box(100, 100, 200, 60));
    p = createMarking(p, { id: 'Small', containerId: 'I1', rect: box(105, 105, 10, 10) });
    expect(marking(p, 'Small').parentId).toBe('C');
    const { project } = arrange(p, 'C');
    // minSize 40×20 of the component.
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 40, 20));
    expect(rectOf(project, 'Small')).toEqual(box(100, 100, 10, 10));
  });

  it('a fixed axis does not change: warns when the content does not fit', () => {
    const p = withKids('row', box(100, 100, 300, 100), [
      box(100, 100, 100, 40),
      box(110, 100, 100, 40),
      box(120, 100, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 300, 100));
    expect(warnings.map((w) => w.text)).toContain(
      'Row: content is larger than the container',
    );
    // The third would go past 400: it is pushed inside the container, with a warning.
    expect(rectOf(project, 'T3')).toEqual(box(300, 100, 100, 40));
    expect(warnings.map((w) => w.text)).toContain('T3: does not fit in Row');
    expect(warnings).toContainEqual(
      modelMessage(
        'arrange.outside',
        { label: 'T3', where: 'Row' },
        'T3: does not fit in Row',
      ),
    );
    expectValid(project);
  });

  it('a container that would grow past the image is clamped, with a warning, and the children fit in', () => {
    const p = withKids('rowhug', box(900, 100, 100, 60), [
      box(900, 100, 100, 40),
      box(900, 110, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    // Requested width 208 from 900: clamped at 1000.
    expect(rectOf(project, 'C')).toEqual(box(900, 100, 100, 40));
    expect(rectOf(project, 'T1')).toEqual(box(900, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(900, 100, 100, 40));
    expect(warnings.map((w) => w.text)).toContain('Row: does not fit in I1');
    expect(warnings.map((w) => w.text)).toContain('T2: does not fit in Row');
    expectValid(project);
  });

  it('a container that would grow past its parent is clamped to the parent', () => {
    let p = add(componentProject(), 'Outer', 'box', box(100, 100, 150, 100), null, {
      name: 'Parent',
    });
    p = add(p, 'C', 'rowhug', box(100, 100, 100, 60), 'Outer', { name: 'Row' });
    // Different rectangles: the parent is derived from the geometry (if equal, the second would be a child of the first).
    p = add(p, 'T1', 'text', box(100, 100, 100, 40), 'C');
    p = add(p, 'T2', 'text', box(100, 110, 100, 40), 'C');
    expect(marking(p, 'T2').parentId).toBe('C');
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 150, 40));
    expect(warnings.map((w) => w.text)).toContain('Row: does not fit in Parent');
    expectValid(project);
  });
});

describe('arrangeMarking: on the canvas and settling', () => {
  /** Hug row on the canvas (null containerId), far from the I1 image (which spans 0–1000 × 0–800). */
  function onCanvas(): Project {
    let p = add(componentProject(), 'C', 'rowhug', box(3000, 100, 100, 60), null, {
      name: 'Row',
      containerId: null,
    });
    p = add(p, 'T1', 'text', box(3000, 100, 100, 40), 'C', { containerId: null });
    p = add(p, 'T2', 'text', box(3000, 110, 100, 40), 'C', { containerId: null });
    return p;
  }

  it('the canvas root has no limit: it grows past any edge, with no "does not fit" warning', () => {
    const p = onCanvas();
    expect(marking(p, 'C').containerId).toBeNull();
    expect(marking(p, 'T2').parentId).toBe('C');
    const { project, warnings } = arrange(p, 'C');
    // 2 × 100 + gap 8, from x = 3000; the same width the test inside the image would ask for.
    expect(rectOf(project, 'C')).toEqual(box(3000, 100, 208, 40));
    expect(warnings.some((w) => w.text.includes('larger than'))).toBe(false);
    expectValid(project);
  });

  it('the children remain children of the row after arranging (the parent is rebuilt from the geometry)', () => {
    const { project } = arrange(onCanvas(), 'C');
    expect(marking(project, 'T1').parentId).toBe('C');
    expect(marking(project, 'T2').parentId).toBe('C');
    expect(rectOf(project, 'T2')).toEqual(box(3108, 100, 100, 40));
  });

  it('settle: false (preview) arranges the same, without settling', () => {
    const preview = arrangeMarking(onCanvas(), catalog, 'C', approximateMeasurer, {
      settle: false,
    });
    expect(rectOf(preview.project, 'C')).toEqual(box(3000, 100, 208, 40));
  });
});

describe('arrangeMarking: nested', () => {
  /** Hug column › [hug row › [T1, T2], T3]. */
  function nested(): Project {
    let p = add(componentProject(), 'Outer', 'columnhug', box(50, 50, 200, 200));
    p = add(p, 'Inner', 'rowhug', box(80, 80, 160, 60), 'Outer');
    p = add(p, 'T1', 'text', box(90, 85, 100, 40), 'Inner');
    p = add(p, 'T2', 'text', box(180, 90, 60, 30), 'Inner');
    p = add(p, 'T3', 'text', box(100, 180, 100, 40), 'Outer');
    return p;
  }

  it('deepest first: the inner one fits the content and the outer one fits the inner one', () => {
    const { project, warnings } = arrange(nested(), 'Outer');
    expect(rectOf(project, 'T1')).toEqual(box(50, 50, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(158, 50, 60, 30));
    expect(rectOf(project, 'Inner')).toEqual(box(50, 50, 168, 40));
    expect(rectOf(project, 'T3')).toEqual(box(50, 98, 100, 40));
    // width = the largest (168), height = 40 + 8 + 40.
    expect(rectOf(project, 'Outer')).toEqual(box(50, 50, 168, 88));
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('the chosen container can be the inner one: only its subtree changes', () => {
    const p = nested();
    const { project } = arrange(p, 'Inner');
    expect(rectOf(project, 'Inner')).toEqual(box(80, 80, 168, 40));
    expect(rectOf(project, 'T1')).toEqual(box(80, 80, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(188, 80, 60, 30));
    expect(rectOf(project, 'Outer')).toEqual(rectOf(p, 'Outer'));
    expect(rectOf(project, 'T3')).toEqual(rectOf(p, 'T3'));
    expectValid(project);
  });

  it('the parent stretch wins over the child hug on the cross axis', () => {
    let p = add(componentProject(), 'Col', 'columnstretch', box(50, 50, 300, 300));
    p = add(p, 'Row', 'rowhug', box(50, 50, 150, 50), 'Col');
    p = add(p, 'T1', 'text', box(50, 50, 100, 40), 'Row');
    const { project } = arrange(p, 'Col');
    // The row takes the column width (stretch) and hugs the content height.
    expect(rectOf(project, 'Row')).toEqual(box(50, 50, 300, 40));
    expect(rectOf(project, 'T1')).toEqual(box(50, 50, 100, 40));
    // The column is fill in width and hug in height.
    expect(rectOf(project, 'Col')).toEqual(box(50, 50, 300, 40));
    expectValid(project);
    // Stable: arranging again changes nothing.
    expect(arrange(project, 'Col').project).toBe(project);
  });
});

describe('arrangeMarking: lock, idempotence and history', () => {
  it('locked container: throws locked when something would change', () => {
    const p = withKids('row', box(100, 100, 300, 100), [box(150, 150, 100, 40)]);
    expect(() => arrange(setMarkingLocked(p, 'C', true), 'C')).toThrow('locked');
  });

  it('a locked child that would change: throws locked; one already in place passes', () => {
    const p = withKids('row', box(100, 100, 300, 100), [box(150, 150, 100, 40)]);
    expect(() => arrange(setMarkingLocked(p, 'T1', true), 'C')).toThrow('locked');
    const placed = withKids('row', box(100, 100, 300, 100), [box(100, 100, 100, 40)]);
    const locked = setMarkingLocked(placed, 'T1', true);
    expect(arrange(locked, 'C').project).toBe(locked);
  });

  it('nothing changed: the same object, even with the container locked', () => {
    const p = withKids('row', box(100, 100, 300, 100), [
      box(100, 100, 100, 40),
      box(208, 100, 100, 40),
    ]);
    const result = arrange(p, 'C');
    expect(result.project).toBe(p);
    expect(result.warnings).toEqual([]);
    const locked = setMarkingLocked(p, 'C', true);
    expect(arrange(locked, 'C').project).toBe(locked);
  });

  it('idempotent: arranging the result again returns the same project', () => {
    const cases: Project[] = [
      withKids('row', box(100, 100, 300, 100), [
        box(150, 150, 100, 40),
        box(300, 120, 100, 40),
      ]),
      withKids('rowstretch', box(100, 100, 300, 100), [
        box(120, 120, 100, 40),
        box(250, 130, 80, 30),
      ]),
      withKids('rowbetween', box(100, 100, 300, 100), [
        box(120, 120, 100, 40),
        box(250, 130, 100, 40),
      ]),
      withKids('rowhug', box(100, 100, 200, 60), [
        box(110, 110, 100, 40),
        box(120, 120, 100, 40),
      ]),
      withKids('column', box(50, 50, 300, 300), [
        box(120, 200, 100, 40),
        box(60, 60, 100, 40),
      ]),
    ];
    for (const p of cases) {
      const first = arrange(p, 'C');
      expect(first.project).not.toBe(p);
      const again = arrange(first.project, 'C');
      expect(again.project).toBe(first.project);
      expect(again.warnings).toEqual(first.warnings);
    }
  });

  it('does not change the input project nor markings outside the subtree', () => {
    let p = withKids('row', box(100, 100, 300, 100), [box(150, 150, 100, 40)]);
    p = add(p, 'Other', 'text', box(600, 600, 100, 40));
    const before = JSON.stringify(p);
    const { project } = arrange(p, 'C');
    expect(JSON.stringify(p)).toBe(before);
    expect(marking(project, 'Other')).toBe(marking(p, 'Other'));
  });
});

// --- Real Material 3 ---------------------------------------------------------------------------------

describe('arrangeMarking: Material 3', () => {
  const root = join(process.cwd(), 'tests/fixtures/material3');
  const specText = readFileSync(join(root, 'material3.spec.json'), 'utf8');
  const parsed = parseSpecText(specText);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const spec = parsed.spec;
  const m3Catalog: ComponentCatalog = new Map([
    [
      spec.id,
      loadSpecComponents(
        spec,
        'specs/material3/material3.spec.json',
        spec.version,
        (path) => readFileSync(join(root, path.replace('specs/material3/', '')), 'utf8'),
      ),
    ],
  ]);

  function m3Project(): Project {
    let p = applySpecialization(emptyProject(), spec, {
      newId: (() => {
        let n = 0;
        return () => `ML${++n}`;
      })(),
      packageSpecName: 'material3.spec.json',
    });
    p = {
      ...p,
      containers: [
        {
          id: 'I1',
          name: null,
          file: 'images/screen.png',
          width: 800,
          height: 1000,
          placement: { x: 0, y: 0, scale: 1 },
          parentId: null,
          markingColor: null,
          locked: false,
          source: null,
          background: null,
        },
      ],
    };
    return p;
  }

  const m3 = (
    p: Project,
    id: string,
    typeId: string,
    rect: Rect,
    parentId: string | null,
    values?: NewComponentArgs['values'],
  ) => add(p, id, typeId, rect, parentId, values ? { values } : {}, m3Catalog, spec.id);

  it('Row with chips: the chips line up and the row hugs the height', () => {
    let p = m3Project();
    p = m3(p, 'Row', 'm3-row', box(20, 20, 380, 48), null);
    p = m3(p, 'C1', 'm3-chip', box(30, 30, 96, 32), 'Row', { label: 'Up' });
    p = m3(p, 'C2', 'm3-chip', box(200, 25, 96, 32), 'Row', { label: 'Down' });
    p = m3(p, 'C3', 'm3-chip', box(100, 35, 96, 32), 'Row', { label: 'Left' });
    expect(canArrange(p, m3Catalog, 'Row')).toBe(true);
    const { project, warnings } = arrange(p, 'Row', m3Catalog);
    // The chips are `hug` in width: each one takes the text plus the padding (never below 40).
    expect(rectOf(project, 'C1')).toEqual(box(20, 20, 48, 32));
    expect(rectOf(project, 'C2')).toEqual(box(76, 20, 63, 32));
    expect(rectOf(project, 'C3')).toEqual(box(147, 20, 63, 32));
    // fill width (stays), hug height: the chips' height.
    expect(rectOf(project, 'Row')).toEqual(box(20, 20, 380, 32));
    expect(warnings).toEqual([]);
    expectValid(project);
    expect(arrange(project, 'Row', m3Catalog).project).toBe(project);
  });

  /** Row with three chips of width 96 (as they are born), the middle one with `label`. */
  function chipRow(label: string, otherLabel = 'Up'): Project {
    let p = m3Project();
    p = m3(p, 'Row', 'm3-row', box(20, 20, 380, 48), null);
    p = m3(p, 'C1', 'm3-chip', box(20, 20, 96, 32), 'Row', { label: otherLabel });
    p = m3(p, 'C2', 'm3-chip', box(124, 20, 96, 32), 'Row', { label });
    p = m3(p, 'C3', 'm3-chip', box(228, 20, 96, 32), 'Row', { label: otherLabel });
    return p;
  }

  it('hug chip: changing the text and arranging adjusts the width (the "Wi-Fi" case)', () => {
    const arranged = arrange(chipRow('Up'), 'Row', m3Catalog).project;
    const edited = setFieldValue(arranged, 'A_C2', 'label', 'Wi-Fi');
    const { project, warnings } = arrange(edited, 'Row', m3Catalog);
    expect(project).not.toBe(edited);
    const wifi = rectOf(project, 'C2');
    expect(wifi.width).toBeGreaterThan(48);
    expect(wifi.width).toBeLessThan(96);
    expect(wifi.height).toBe(32);
    // The neighbors stay attached (gap 8).
    expect(rectOf(project, 'C3').x).toBe(wifi.x + wifi.width + 8);
    expect(warnings).toEqual([]);
    expectValid(project);
    expect(arrange(project, 'Row', m3Catalog).project).toBe(project);
  });

  it('hug chip: short text shrinks without going past the minSize, long text grows', () => {
    const short = arrange(chipRow('A', 'A'), 'Row', m3Catalog).project;
    expect(rectOf(short, 'C2').width).toBe(40);
    const long = arrange(
      chipRow('A really long text for a chip'),
      'Row',
      m3Catalog,
    ).project;
    expect(rectOf(long, 'C2').width).toBeGreaterThan(96);
    expect(rectOf(long, 'C2').width).toBeGreaterThan(rectOf(long, 'C1').width);
    expect(arrange(long, 'Row', m3Catalog).project).toBe(long);
  });

  it('hug child with locked geometry: Arrange fails with locked', () => {
    const p = setMarkingLocked(chipRow('Up'), 'C2', true);
    expect(() => arrange(p, 'Row', m3Catalog)).toThrow('locked');
  });

  /** Hug column › card (hug height) › button: the card's supporting text decides the height. */
  function cardScreen(body: string): Project {
    let p = m3Project();
    p = m3(p, 'Col', 'm3-column', box(20, 100, 360, 400), null);
    p = m3(p, 'Card', 'm3-card', box(20, 100, 360, 300), 'Col', {
      headline: 'Header',
      subhead: 'Sub',
      body,
    });
    p = m3(p, 'Ok', 'm3-button', box(40, 120, 80, 40), 'Card', { label: 'OK' });
    return p;
  }

  const SHORT = 'Short text.';
  const LONG =
    'A much longer supporting text, which needs to wrap into several lines inside the card in order ' +
    'to push its height and the column height down, and along with them whatever comes after.';

  it('hug supporting text inside a hug column: the card and column heights follow the text', () => {
    const short = arrange(cardScreen(SHORT), 'Col', m3Catalog);
    const long = arrange(cardScreen(LONG), 'Col', m3Catalog);
    expect(short.warnings).toEqual([]);
    expect(long.warnings).toEqual([]);
    for (const { project } of [short, long]) {
      expectValid(project);
      const card = rectOf(project, 'Card');
      const col = rectOf(project, 'Col');
      const ok = rectOf(project, 'Ok');
      // the column is just the card (padding 0) and the card changes neither place nor width
      expect(col).toEqual({ ...card, width: col.width });
      expect(card).toMatchObject({ x: 20, y: 100, width: 360 });
      // the button sits at the bottom right of the card (padding 16, justify end)
      expect(ok.y + ok.height).toBe(card.y + card.height - 16);
      expect(ok.x + ok.width).toBe(card.x + card.width - 16);
    }
    const delta =
      rectOf(long.project, 'Card').height - rectOf(short.project, 'Card').height;
    // padding 16 + title 24 + subtitle 20 + support (one line of 20) + button 40 + three gaps of 8
    expect(rectOf(short.project, 'Card').height).toBe(160);
    expect(delta).toBeGreaterThan(40);
    expect(delta % 20).toBe(0);
    expect(rectOf(long.project, 'Col').height - rectOf(short.project, 'Col').height).toBe(
      delta,
    );
    // idempotent
    expect(arrange(short.project, 'Col', m3Catalog).project).toBe(short.project);
    expect(arrange(long.project, 'Col', m3Catalog).project).toBe(long.project);
  });
});

describe('arrangeMarking: slot gap and padding in $token (#948)', () => {
  const tokenCatalog = tokenSlotCatalog();
  const kids = [box(150, 150, 100, 40), box(150, 300, 100, 40)];

  function tokenProject(typeId: string, rect: Rect, at: Rect[] = kids): Project {
    let p = add(
      componentProject(),
      'C',
      typeId,
      rect,
      null,
      { name: 'Column' },
      tokenCatalog,
    );
    at.forEach((kid, i) => {
      p = add(p, `T${i + 1}`, 'text', kid, 'C', { name: `T${i + 1}` }, tokenCatalog);
    });
    return p;
  }

  it('writes the children with the gap and padding of the first mode token', () => {
    const p = tokenProject('column', box(100, 100, 300, 300));
    const { project } = arrange(p, 'C', tokenCatalog);
    expect(rectOf(project, 'T1')).toEqual(box(110, 110, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(110, 154, 100, 40));
  });

  it('the project mode and the container mode decide the table', () => {
    const base = tokenProject('column', box(100, 100, 300, 300));
    const dark = arrange(setProjectDrawingMode(base, 'dark'), 'C', tokenCatalog).project;
    expect(rectOf(dark, 'T1')).toEqual(box(120, 120, 100, 40));
    expect(rectOf(dark, 'T2')).toEqual(box(120, 172, 100, 40));
    const fixed = arrange(
      setContainerDrawingMode(base, 'I1', 'dark'),
      'C',
      tokenCatalog,
    ).project;
    expect(rectOf(fixed, 'T2')).toEqual(box(120, 172, 100, 40));
  });

  it('the component hug follows the token gap and padding', () => {
    const p = tokenProject('columnhug', box(100, 100, 200, 100), [
      box(110, 110, 100, 40),
      box(110, 150, 100, 40),
    ]);
    const { project } = arrange(p, 'C', tokenCatalog);
    // 10 + 40 + 4 + 40 + 10 of height; 10 + 100 + 10 of width.
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 120, 104));
  });
});

const BIG = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'wide',
  name: 'wide',
  size: { width: 100, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [{ type: 'text', text: 'Big', font: { size: 22, lineHeight: 28 } }],
  },
};

describe('arrangeMarking: align "baseline" in the slot (MC1, decision 4)', () => {
  /** `row` with `align: "baseline"` in the slot and `wide` replaced by a 22/28 text. */
  function baselineCatalog(): ComponentCatalog {
    const row = JSON.parse(JSON.stringify(COMPONENTS.row)) as {
      formatVersion: number;
      template: { children: { layout: { align: string } }[] };
    };
    row.formatVersion = 4;
    const slot = row.template.children[0];
    if (slot === undefined) throw new Error('sem slot');
    slot.layout.align = 'baseline';
    return testCatalog({ ...COMPONENTS, row, wide: BIG });
  }

  it('14 px and 22 px texts share the same baseline (the smaller one moves down 7 px)', () => {
    const cat = baselineCatalog();
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100), null, {}, cat);
    p = add(p, 'W', 'wide', box(120, 150, 100, 40), 'C', {}, cat);
    p = add(p, 'T', 'text', box(240, 150, 100, 40), 'C', {}, cat);
    const { project } = arrange(p, 'C', cat);
    // baseline of the approximate measurer: 14/20 → 14.83; 22/28 → 21.59; difference 6.76 → 7
    expect(rectOf(project, 'W').y).toBe(100);
    expect(rectOf(project, 'T').y).toBe(107);
    expect(rectOf(project, 'W').x).toBe(100);
    expect(rectOf(project, 'T').x).toBe(208);
    expectValid(project);
  });

  it('without baseline, the children stay at the top (today\'s behavior)', () => {
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
    p = add(p, 'T1', 'text', box(120, 150, 100, 40), 'C');
    p = add(p, 'T2', 'text', box(240, 150, 100, 40), 'C');
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1').y).toBe(100);
    expect(rectOf(project, 'T2').y).toBe(100);
  });

  it('a component that is hug in height measures the slot by the baseline extent, not by the tallest child', () => {
    const hug = JSON.parse(JSON.stringify(COMPONENTS.rowhug)) as {
      formatVersion: number;
      template: { children: { layout: { align: string } }[] };
    };
    hug.formatVersion = 4;
    const slot = hug.template.children[0];
    if (slot === undefined) throw new Error('sem slot');
    slot.layout.align = 'baseline';
    const cat = testCatalog({ ...COMPONENTS, rowhug: hug, wide: BIG });
    let p = add(componentProject(), 'C', 'rowhug', box(100, 100, 200, 60), null, {}, cat);
    p = add(p, 'W', 'wide', box(100, 100, 100, 40), 'C', {}, cat);
    p = add(p, 'T', 'text', box(200, 100, 100, 40), 'C', {}, cat);
    const { project } = arrange(p, 'C', cat);
    // 21.59 above the baseline + 25.17 below (the 14 text goes down 7): 46.76 → 47, not 40.
    expect(rectOf(project, 'C').height).toBe(47);
  });
});

describe('arrangeMarking: expression sizing in the component with a slot (MC2, decision 9)', () => {
  /** `row` with the height from `spacing`: 8 → 64, 16 → 112, 24 → 152, 32 → hug. */
  function sizedCatalog(): ComponentCatalog {
    const row = JSON.parse(JSON.stringify(COMPONENTS.row)) as Record<string, unknown>;
    row.formatVersion = 4;
    row.sizing = {
      height: {
        $switch: 'spacing',
        cases: { '8': 64, '16': 112, '24': 152, '32': 'hug' },
      },
    };
    return testCatalog({ ...COMPONENTS, row });
  }

  function arranged(spacing: number): Rect {
    const cat = sizedCatalog();
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100), null, {}, cat);
    p = setFieldValue(p, 'A_C', 'spacing', spacing);
    p = add(p, 'T1', 'text', box(120, 120, 100, 40), 'C', {}, cat);
    return rectOf(arrange(p, 'C', cat).project, 'C');
  }

  it('the px that the expression gives becomes the container height', () => {
    expect(arranged(8).height).toBe(64);
    expect(arranged(16).height).toBe(112);
    expect(arranged(24).height).toBe(152);
    expect(arranged(8)).toMatchObject({ x: 100, y: 100, width: 300 });
  });

  it('hug coming from the expression measures the content (the child of height 40)', () => {
    expect(arranged(32).height).toBe(40);
  });

  it('an invalid value leaves the height as it is and arranging goes on', () => {
    expect(arranged(99).height).toBe(100);
  });
});

describe('arrangeMarking: hug axis together with a px axis by expression (/code-review high of MC2)', () => {
  it('the hug is measured at the width the expression gives, not at the old rectangle width', () => {
    const text = JSON.parse(JSON.stringify(COMPONENTS.text)) as Record<string, unknown>;
    text.formatVersion = 4;
    const label = (text.template as { children: Record<string, unknown>[] }).children[0];
    if (label === undefined) throw new Error('no text');
    label.width = 'fill';
    // Width 200 from the expression (the `kind` field is `a`) and content height.
    text.sizing = { width: { $switch: 'kind', cases: { a: 200 } }, height: 'hug' };
    const cat = testCatalog({ ...COMPONENTS, text });
    let p = add(componentProject(), 'C', 'row', box(100, 100, 400, 100), null, {}, cat);
    p = add(p, 'T1', 'text', box(120, 120, 100, 40), 'C', {}, cat);
    p = setFieldValue(p, 'A_T1', 'label', 'aaaaaaaaaa bbbbbbbbbb');
    p = setFieldValue(p, 'A_T1', 'kind', 'a');
    const out = rectOf(arrange(p, 'C', cat).project, 'T1');
    // 21 characters fit on one line at width 200 (≈ 162 px): the height is the minSize floor (24);
    // measured at width 100 (the old rectangle) it would be two lines (40).
    expect(out.width).toBe(200);
    expect(out.height).toBe(24);
  });
});

describe('fitMarking (MC3, decision 14 of #898)', () => {
  const fcat = fitCatalog();
  const addFit = (
    p: Project,
    id: string,
    typeId: string,
    rect: Rect,
    parentId: string | null = null,
    extra: Partial<NewComponentArgs> = {},
  ): Project => add(p, id, typeId, rect, parentId, extra, fcat, FIT_SPEC_ID);
  const fit = (p: Project, id: string) => fitMarking(p, fcat, id, approximateMeasurer);
  /** A `typeId` button at (100, 100), with the given label, at the creation size (120 × 40). */
  const withLabel = (typeId: string, label: string, rect = box(100, 100, 120, 40)) =>
    setFieldValue(addFit(fitProject(), 'B', typeId, rect), 'A_B', 'label', label);

  it('a button with a long label grows in height; the position and the width stay', () => {
    const p = withLabel('fit-button', LONG_LABEL);
    const fitted = fit(p, 'B');
    const rect = rectOf(fitted, 'B');
    expect(rect).toMatchObject({ x: 100, y: 100, width: 120 });
    // Four lines of 20 plus the padding of 8 above and below, rounded up.
    expect(rect.height).toBeGreaterThanOrEqual(76);
    expect((rect.height - 16) % 20).toBe(0);
    expectValid(fitted);
  });

  it('a label that fits (below the minSize): nothing changes, the same Project', () => {
    const p = withLabel('fit-button', 'Ok');
    expect(fit(p, 'B')).toBe(p);
    // After fitting, fitting again also changes nothing.
    const grown = withLabel('fit-button', LONG_LABEL);
    const once = fit(grown, 'B');
    expect(fit(once, 'B')).toBe(once);
  });

  it('a label that shrinks takes the height back (never below the minSize)', () => {
    const grown = fit(withLabel('fit-button', LONG_LABEL), 'B');
    const shortened = setFieldValue(grown, 'A_B', 'label', 'Ok');
    expect(rectOf(fit(shortened, 'B'), 'B')).toMatchObject({ width: 120, height: 40 });
  });

  it('both axes hug: the width is measured too', () => {
    const p = withLabel('fit-hug', 'Ok');
    const rect = rectOf(fit(p, 'B'), 'B');
    expect(rect).toMatchObject({ x: 100, y: 100 });
    // "Ok" does not go past the padding (16): the component minimum (48 × 40) applies.
    expect(rect).toMatchObject({ width: 48, height: 40 });
  });

  it('CL2 (R13.13): hug on both axes near the edge measures the height for the remaining width', () => {
    // The image is 1000 wide: from x = 900 there are 100 px left, and the long label wraps into lines.
    const p = withLabel('fit-hug', LONG_LABEL, box(900, 100, 100, 40));
    const rect = rectOf(fit(p, 'B'), 'B');
    expect(rect).toMatchObject({ x: 900, y: 100, width: 100 });
    expect(rect.height).toBeGreaterThan(40);
    // Without a limit (x = 100), the width is free: one line, minSize height.
    const free = rectOf(
      fit(withLabel('fit-hug', 'Ok', box(100, 100, 100, 40)), 'B'),
      'B',
    );
    expect(free).toMatchObject({ x: 100, y: 100, width: 48, height: 40 });
    // Arranging the same marking (arrangesByFit) takes the same path.
    expect(arrangesByFit(p, fcat, 'B')).toBe(true);
  });

  it('an axis that is fill, absent or stretched by the parent stretch does not change', () => {
    let p = addFit(fitProject(), 'R', 'fit-row-stretch', box(100, 100, 400, 100));
    p = addFit(p, 'B', 'fit-hug', box(100, 100, 120, 100), 'R');
    p = setFieldValue(p, 'A_B', 'label', LONG_LABEL);
    const rect = rectOf(fit(p, 'B'), 'B');
    // The height comes from the row `stretch` (100) and does not grow with the label; the width (hug) changes.
    expect(rect.height).toBe(100);
    expect(rect.width).not.toBe(120);
    // In the row that does not stretch, the height follows too.
    let q = addFit(fitProject(), 'R', 'fit-row-start', box(100, 100, 400, 100));
    q = addFit(q, 'B', 'fit-button', box(100, 100, 120, 40), 'R');
    q = setFieldValue(q, 'A_B', 'label', LONG_LABEL);
    expect(rectOf(fit(q, 'B'), 'B').height).toBeGreaterThan(40);
  });

  it('aligned none slot (v4): justify stretch stretches the width and align stretch the height', () => {
    // `justify: stretch` stretches horizontally: the child width (hug) does not change.
    let p = addFit(fitProject(), 'R', 'fit-none-justify', box(100, 100, 400, 100));
    p = addFit(p, 'B', 'fit-hug', box(100, 100, 120, 40), 'R');
    p = setFieldValue(p, 'A_B', 'label', LONG_LABEL);
    expect(rectOf(fit(p, 'B'), 'B').width).toBe(120);
    // `align: stretch` stretches vertically: the height (hug) stays, even with the long label.
    let q = addFit(fitProject(), 'R', 'fit-none-align', box(100, 100, 400, 100));
    q = addFit(q, 'B', 'fit-button', box(100, 100, 120, 40), 'R');
    q = setFieldValue(q, 'A_B', 'label', LONG_LABEL);
    expect(rectOf(fit(q, 'B'), 'B').height).toBe(40);
  });

  it('L4: sizing max-content fits the width without wrapping, min-content the widest word', () => {
    const max = rectOf(fit(withLabel('fit-max', LONG_LABEL), 'B'), 'B');
    // 52 characters of 7.7 px plus the padding of 8 on both sides, rounded up; a single line.
    expect(max).toMatchObject({ x: 100, y: 100, width: 417, height: 40 });
    const min = rectOf(fit(withLabel('fit-min', LONG_LABEL), 'B'), 'B');
    // the widest word of LONG_LABEL (8 characters): 61.6 + 16, rounded up.
    expect(min.width).toBe(78);
    expect(min.height).toBeGreaterThan(40);
    expect(arrangesByFit(withLabel('fit-max', LONG_LABEL), fcat, 'B')).toBe(true);
  });

  it('the root maxHeight limits the fit', () => {
    const p = withLabel('fit-capped', LONG_LABEL);
    expect(rectOf(fit(p, 'B'), 'B').height).toBe(60);
  });

  it('the expression sizing gives the px, never below the minSize', () => {
    const tall = setFieldValue(withLabel('fit-px', 'Ok'), 'A_B', 'tall', 'yes');
    expect(rectOf(fit(tall, 'B'), 'B').height).toBe(80);
    // Without the field the expression gives 30, below the minimum (40): the marking is already at it.
    const short = withLabel('fit-px', 'Ok');
    expect(fit(short, 'B')).toBe(short);
  });

  it('does not go past the image: the excess is cut', () => {
    const p = withLabel('fit-button', LONG_LABEL, box(100, 740, 120, 40));
    expect(rectOf(fit(p, 'B'), 'B')).toMatchObject({ y: 740, height: 60 });
  });

  it('locked geometry fails with locked (and nothing changes if it is already the right size)', () => {
    const p = setMarkingLocked(withLabel('fit-button', LONG_LABEL), 'B', true);
    expect(() => fit(p, 'B')).toThrow('locked');
    const same = setMarkingLocked(withLabel('fit-button', 'Ok'), 'B', true);
    expect(fit(same, 'B')).toBe(same);
  });

  it('component without a fittable axis, marking without a component and container with children: not-fittable', () => {
    const plain = addFit(fitProject(), 'B', 'fit-plain', box(100, 100, 120, 40));
    expect(() => fit(plain, 'B')).toThrow('not-fittable');
    const filled = addFit(fitProject(), 'B', 'fit-fill', box(100, 100, 120, 40));
    expect(() => fit(filled, 'B')).toThrow('not-fittable');
    const bare = createMarking(fitProject(), {
      id: 'P',
      containerId: 'I1',
      rect: box(10, 10, 50, 50),
    });
    expect(() => fit(bare, 'P')).toThrow('not-fittable');
    let row = addFit(fitProject(), 'R', 'fit-row-start', box(100, 100, 400, 100));
    row = addFit(row, 'B', 'fit-button', box(100, 100, 120, 40), 'R');
    expect(() => fit(row, 'R')).toThrow('not-fittable');
    expect(() => fit(plain, 'nothing')).toThrow('not-found');
  });

  it('a component with children in the slot, even with layout none, does not fit (found by /code-review)', () => {
    let p = addFit(fitProject(), 'R', 'fit-row-none', box(100, 100, 400, 100));
    p = addFit(p, 'B', 'fit-button', box(110, 110, 120, 40), 'R');
    expect(canFit(p, fcat, 'R')).toBe(false);
    expect(() => fit(p, 'R')).toThrow('not-fittable');
  });

  it('canFit: only the component without a slot with a fittable axis', () => {
    const p = addFit(fitProject(), 'B', 'fit-button', box(100, 100, 120, 40));
    expect(canFit(p, fcat, 'B')).toBe(true);
    const plain = addFit(fitProject(), 'B', 'fit-plain', box(100, 100, 120, 40));
    expect(canFit(plain, fcat, 'B')).toBe(false);
    expect(canFit(p, fcat, 'nothing')).toBe(false);
    let row = addFit(fitProject(), 'R', 'fit-row-start', box(100, 100, 400, 100));
    row = addFit(row, 'B', 'fit-button', box(100, 100, 120, 40), 'R');
    expect(canFit(row, fcat, 'R')).toBe(false);
  });

  it('settles at the end: a marking that now fits inside becomes a child', () => {
    let p = withLabel('fit-button', LONG_LABEL);
    p = createMarking(p, { id: 'S', containerId: 'I1', rect: box(110, 145, 20, 10) });
    expect(marking(p, 'S').parentId).toBeNull();
    expect(marking(fit(p, 'B'), 'S').parentId).toBe('B');
  });

  it('gesture previews do not settle (settle: false)', () => {
    let p = withLabel('fit-button', LONG_LABEL);
    p = createMarking(p, { id: 'S', containerId: 'I1', rect: box(110, 145, 20, 10) });
    const result = fitMarking(p, fcat, 'B', approximateMeasurer, { settle: false });
    expect(marking(result, 'S').parentId).toBeNull();
  });
});

describe('arrangeMarking: wrap in the slot (MC4, decision 12)', () => {
  /** The `row` (or `rowhug`) container with the slot in `wrap`, plus the given keys, in formatVersion 4. */
  function wrapCatalog(
    layout: Record<string, unknown>,
    id: 'row' | 'rowhug' = 'row',
  ): ComponentCatalog {
    const base = JSON.parse(JSON.stringify(COMPONENTS[id])) as {
      formatVersion: number;
      template: { children: { layout: Record<string, unknown> }[] };
    };
    base.formatVersion = 4;
    const slot = base.template.children[0];
    if (slot === undefined) throw new Error('sem slot');
    slot.layout = { ...slot.layout, wrap: 'wrap', lineGap: 12, ...layout };
    return testCatalog({ ...COMPONENTS, [id]: base });
  }

  /** Five `text` children of 100 × 40 stacked (not touching) in the 320 × 300 container. */
  function crowd(cat: ComponentCatalog, id: 'row' | 'rowhug' = 'row'): Project {
    let p = add(componentProject(), 'C', id, box(100, 100, 320, 300), null, {}, cat);
    for (let i = 1; i <= 5; i++)
      p = add(p, `T${i}`, 'text', box(100, 100 + (i - 1) * 45, 100, 40), 'C', {}, cat);
    return p;
  }

  it('Arrange puts the children in lines: 3 + 2, with the gap and the lineGap', () => {
    const cat = wrapCatalog({});
    const { project, warnings } = arrange(crowd(cat), 'C', cat);
    expect([1, 2, 3].map((i) => rectOf(project, `T${i}`))).toEqual([
      box(100, 100, 100, 40),
      box(208, 100, 100, 40),
      box(316, 100, 100, 40),
    ]);
    expect([4, 5].map((i) => rectOf(project, `T${i}`))).toEqual([
      box(100, 152, 100, 40),
      box(208, 152, 100, 40),
    ]);
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('wrap-reverse: the new line goes above', () => {
    const cat = wrapCatalog({ wrap: 'wrap-reverse' });
    const { project } = arrange(crowd(cat), 'C', cat);
    expect(rectOf(project, 'T1').y).toBe(152);
    expect(rectOf(project, 'T4').y).toBe(100);
  });

  it('justify space-between and reverse apply on each line', () => {
    const between = wrapCatalog({ justify: 'space-between' });
    const a = arrange(crowd(between), 'C', between).project;
    expect([1, 2, 3].map((i) => rectOf(a, `T${i}`).x)).toEqual([100, 210, 320]);
    expect([4, 5].map((i) => rectOf(a, `T${i}`).x)).toEqual([100, 320]);
    const reversed = wrapCatalog({ reverse: true });
    const b = arrange(crowd(reversed), 'C', reversed).project;
    expect([1, 2, 3].map((i) => rectOf(b, `T${i}`).x)).toEqual([320, 212, 104]);
    expect([4, 5].map((i) => rectOf(b, `T${i}`).x)).toEqual([320, 212]);
  });

  it('maxPerLine 2 and maxLines 2: the fifth child, beyond the last line, stays where it was', () => {
    const cat = wrapCatalog({ maxPerLine: 2, maxLines: 2 });
    const { project } = arrange(crowd(cat), 'C', cat);
    expect([1, 2, 3, 4].map((i) => rectOf(project, `T${i}`).y)).toEqual([
      100, 100, 152, 152,
    ]);
    expect(rectOf(project, 'T5')).toEqual(box(100, 280, 100, 40));
  });

  it('a component that is hug in height grows with the lines (the sum of the lines with the lineGap)', () => {
    const cat = wrapCatalog({}, 'rowhug');
    const { project } = arrange(crowd(cat, 'rowhug'), 'C', cat);
    expect(rectOf(project, 'C').height).toBe(40 + 12 + 40);
    expect(rectOf(project, 'T5').y).toBe(152);
  });

  it('the lines that do not fit in the container height warn "content is larger than the container"', () => {
    const cat = wrapCatalog({ lineGap: 300 });
    const { warnings } = arrange(crowd(cat), 'C', cat);
    expect(warnings.map((w) => w.text)).toContain(
      'Type row: content is larger than the container',
    );
  });
});
