import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  componentPlacement,
  createMarking,
  imageCanvasRect,
  rectsOverlap,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { expectValid, marking } from './fixtures';
import { NOTES_SPEC_ID, notesCatalog, notesProject } from './notesFixtures';

// Stage #1087 (EL1): the new piece is born in free space (decisions 3 to 6 and the stage's "Out of scope").

const catalog = testCatalog();

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

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

const plain = (p: Project, id: string, r: Rect, containerId: string | null = 'I1') =>
  createMarking(p, { id, containerId, rect: r });

const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;
const overlaps = (a: Rect, b: Rect): boolean => rectsOverlap(a, b);

// `text` measures 100 × 40: at the center of the 1000 × 800 image, R0 is (450, 380, 100, 40).
const R0 = rect(450, 380, 100, 40);

describe('placement in free space (EL1)', () => {
  it('(a) R0 covers a smaller marking: the piece is born outside it, both without a parent', () => {
    const card = rect(470, 390, 60, 24);
    let p = plain(componentProject(), 'CARD', card);
    p = add(p, 'NAV', 'text');
    expect(overlaps(rectOf(p, 'NAV'), card)).toBe(false);
    expect(marking(p, 'CARD').parentId).toBeNull();
    expect(marking(p, 'NAV').parentId).toBeNull();
    expectValid(p);
  });

  it('(b) two equal pieces at the same spot: side by side, both without a parent', () => {
    let p = add(componentProject(), 'T1', 'text');
    p = add(p, 'T2', 'text');
    expect(rectOf(p, 'T1')).toEqual(R0);
    expect(rectOf(p, 'T2')).not.toEqual(R0);
    expect(overlaps(rectOf(p, 'T1'), rectOf(p, 'T2'))).toBe(false);
    expect(marking(p, 'T1').parentId).toBeNull();
    expect(marking(p, 'T2').parentId).toBeNull();
    expectValid(p);
  });

  it('(c) R0 inside a larger marking: the piece becomes a child and does not cover whatever crosses its rectangle', () => {
    const big = rect(300, 300, 400, 300);
    const inner = rect(480, 380, 30, 30);
    const crossing = rect(690, 290, 60, 60);
    let p = plain(componentProject(), 'P', big);
    p = plain(p, 'X', inner);
    p = plain(p, 'Y', crossing);
    p = add(p, 'T', 'text');
    const placed = rectOf(p, 'T');
    expect(marking(p, 'T').parentId).toBe('P');
    expect(overlaps(placed, inner)).toBe(false);
    expect(overlaps(placed, crossing)).toBe(false);
    expect(placed.x).toBeGreaterThanOrEqual(big.x);
    expect(placed.x + placed.width).toBeLessThanOrEqual(big.x + big.width);
    expect(placed.y).toBeGreaterThanOrEqual(big.y);
    expect(placed.y + placed.height).toBeLessThanOrEqual(big.y + big.height);
    expect(marking(p, 'X').parentId).toBe('P');
    expectValid(p);
  });

  it('(d) slot without a layout with one child at the start: the second does not coincide and the parent is the component', () => {
    let p = add(componentProject(), 'B', 'box', { rect: rect(100, 100, 300, 200) });
    p = add(p, 'T1', 'text', { parentId: 'B' });
    p = add(p, 'T2', 'text', { parentId: 'B' });
    expect(rectOf(p, 'T1')).toEqual(rect(100, 100, 100, 40));
    expect(rectOf(p, 'T2')).not.toEqual(rectOf(p, 'T1'));
    expect(overlaps(rectOf(p, 'T1'), rectOf(p, 'T2'))).toBe(false);
    expect(marking(p, 'T1').parentId).toBe('B');
    expect(marking(p, 'T2').parentId).toBe('B');
    expectValid(p);
  });

  it("(e) full area: today's position, without an error", () => {
    let p = plain(componentProject(), 'P', rect(440, 370, 120, 60));
    p = plain(p, 'X1', rect(440, 370, 60, 60));
    p = plain(p, 'X2', rect(500, 370, 60, 60));
    const placed = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: null, specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    expect(placed).toEqual(R0);
  });

  it('(f) canvas: a container and a canvas marking are obstacles', () => {
    const base = componentProject();
    const container = base.containers.find((c) => c.id === 'I1')!;
    const area = imageCanvasRect(container, container.placement);
    const center = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    const loose = rect(center.x + 60, center.y - 20, 80, 40);
    const p = plain(base, 'L', loose, null);
    const placed = componentPlacement(
      p,
      catalog,
      { containerId: null, parentId: null, specId: SPEC_ID, typeId: 'text', center },
      approximateMeasurer,
    );
    expect(overlaps(placed, area)).toBe(false);
    expect(overlaps(placed, loose)).toBe(false);
  });

  it('(g) R0 touching a sibling, without overlapping: stays where it is', () => {
    const p = plain(componentProject(), 'S', rect(550, 380, 60, 40));
    const placed = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: null, specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    expect(placed).toEqual(R0);
  });

  it('(h) floating type on the canvas: born at the requested center, without searching', () => {
    const notes = notesCatalog();
    const base = plain(notesProject(), 'L', rect(2900, 450, 200, 100), null);
    const p = addComponentMarking(
      base,
      notes,
      {
        markingId: 'N1',
        annotationId: 'A_N1',
        containerId: null,
        parentId: null,
        specId: NOTES_SPEC_ID,
        typeId: 'nota',
        center: { x: 3000, y: 500 },
      },
      approximateMeasurer,
    );
    expect(rectOf(p, 'N1')).toEqual(rect(2880, 440, 240, 120));
    expect(
      componentPlacement(
        base,
        notes,
        {
          containerId: null,
          parentId: null,
          specId: NOTES_SPEC_ID,
          typeId: 'nota',
          center: { x: 3000, y: 500 },
        },
        approximateMeasurer,
      ),
    ).toEqual(rect(2880, 440, 240, 120));
  });

  it('(i) a marking Q that partly crosses the parent is an obstacle: the piece stays outside it and the parent is P', () => {
    const pRect = rect(400, 300, 200, 200);
    const x = rect(480, 370, 40, 60);
    const q = rect(440, 430, 200, 100);
    let p = plain(componentProject(), 'P', pRect);
    p = plain(p, 'X', x);
    p = plain(p, 'Q', q);
    p = add(p, 'T', 'text');
    expect(overlaps(rectOf(p, 'T'), q)).toBe(false);
    expect(overlaps(rectOf(p, 'T'), x)).toBe(false);
    expect(marking(p, 'T').parentId).toBe('P');
    expectValid(p);
  });

  it('(j) chain of equal rectangles that contain R0: the parent is the innermost one', () => {
    const same = rect(400, 300, 200, 200);
    let p = plain(componentProject(), 'P1', same);
    p = plain(p, 'P2', same);
    p = plain(p, 'X', rect(480, 370, 40, 60));
    p = add(p, 'T', 'text');
    expect(marking(p, 'P2').parentId).toBe('P1');
    expect(marking(p, 'T').parentId).toBe('P2');
    expect(overlaps(rectOf(p, 'T'), rect(480, 370, 40, 60))).toBe(false);
    expectValid(p);
  });
});
