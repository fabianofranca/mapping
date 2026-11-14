import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_BAND_PAD,
  arrivalBadgeSpot as spotOf,
  arrivalBandLabelFit as bandFitOf,
  arrivalBandLabelSpot as bandSpotOf,
  arrivalBadgeWidth as widthOf,
  arrivalMarks,
  type ArrivalRoot,
} from '../../src/canvas/arrivals';
import {
  addContainer,
  createArrow,
  createMarking,
  dismissArrival,
  setContainerPlacement,
  type Arrival,
  type Project,
  type Rect,
} from '../../src/model';
import { TOKENS, canvasProject } from './harness';

const A = TOKENS.arrival;
const badgeWidth = (text: string) => widthOf(text, A);
const badgeSpot = (
  rect: Rect,
  zoom: number,
  width: number,
  view?: Rect,
  avoid?: Rect,
  roots?: readonly ArrivalRoot[],
  self?: string,
  extra?: readonly Rect[],
) => spotOf(rect, zoom, width, A, view, avoid, roots, self, extra);
const bandLabelSpot = (
  band: Rect,
  zoom: number,
  size: { readonly width: number; readonly height: number },
  view: Rect,
  nameClear: number,
) => bandSpotOf(band, zoom, size, view, nameClear, A);

// The arrival marks on the canvas (stage #659, PE3, decision 8): the "Came from <name>" seal over each
// root with a mark and the "Arrival area" strip. Pure functions over the project, without Konva.

const mark = (p: Project, root: string, fromName = 'Front'): Project => ({
  ...p,
  arrivals: [...p.arrivals, { root, from: 'V', fromName } satisfies Arrival],
});

describe('arrivalMarks: o que desenhar', () => {
  it('without an arrival mark, nothing to draw', () => {
    expect(arrivalMarks(canvasProject())).toBeNull();
    expect(arrivalMarks(null)).toBeNull();
  });

  it('one seal per root with a mark, with the origin name and the root footprint', () => {
    const p = mark(canvasProject(), 'I2', 'Front');
    const marks = arrivalMarks(p);
    expect(marks?.badges).toEqual([
      { root: 'I2', name: 'Front', rect: { x: 1100, y: 0, width: 500, height: 500 } },
    ]);
  });

  it('a mark of a root that no longer exists does not become a seal', () => {
    expect(arrivalMarks(mark(canvasProject(), 'XX'))).toBeNull();
  });

  it('dispensar a marca tira o selo (e a faixa)', () => {
    const p = mark(canvasProject(), 'I2');
    expect(arrivalMarks(p)).not.toBeNull();
    expect(arrivalMarks(dismissArrival(p, 'I2'))).toBeNull();
  });

  it('strip: the box of the roots with a mark, with slack, when it sits to the right of everything else', () => {
    const p = mark(canvasProject(), 'I2');
    const band = arrivalMarks(p)?.band;
    // I1 (the one without a mark) ends at x=1000; I2 starts at 1100.
    expect(band).toEqual({
      x: 1100 - ARRIVAL_BAND_PAD,
      y: 0 - ARRIVAL_BAND_PAD,
      width: 500 + 2 * ARRIVAL_BAND_PAD,
      height: 500 + 2 * ARRIVAL_BAND_PAD,
    });
  });

  it('without a strip when the root with a mark is not to the right of the rest (mark near the reference)', () => {
    const p = mark(canvasProject(), 'I1');
    const marks = arrivalMarks(p);
    expect(marks?.badges).toHaveLength(1);
    expect(marks?.band).toBeNull();
  });

  it('with all the roots marked the strip wraps them all', () => {
    const p = mark(mark(canvasProject(), 'I1'), 'I2');
    expect(arrivalMarks(p)?.band).not.toBeNull();
  });

  it('without ArrivalInfo (after reloading): the strip wraps only the root without a reference (stage #764, AP1)', () => {
    // I3 (0,900) arrived near the reference I1 (arrow from M1 to M4); I2 (1100,0) has no arrow.
    let p = addContainer(canvasProject(), {
      id: 'I3',
      file: 'images/c.jpg',
      width: 400,
      height: 300,
    });
    p = setContainerPlacement(p, 'I3', { x: 0, y: 900, scale: 1 });
    p = createMarking(p, {
      id: 'M4',
      containerId: 'I3',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    p = createArrow(p, { id: 'R1', from: 'M1', to: 'M4' });
    const marks = arrivalMarks(mark(mark(p, 'I3'), 'I2'));
    expect(marks?.badges.map((b) => b.root).sort()).toEqual(['I2', 'I3']);
    expect(marks?.band).toEqual({
      x: 1100 - ARRIVAL_BAND_PAD,
      y: 0 - ARRIVAL_BAND_PAD,
      width: 500 + 2 * ARRIVAL_BAND_PAD,
      height: 500 + 2 * ARRIVAL_BAND_PAD,
    });
  });

  it('only marked roots with a reference: seal and no strip', () => {
    const p = createArrow(canvasProject(), { id: 'R1', from: 'M1', to: 'M3' });
    const marks = arrivalMarks(mark(p, 'I2'));
    expect(marks?.badges).toHaveLength(1);
    expect(marks?.band).toBeNull();
  });

  it('it is computed once per project version (same object on the second call)', () => {
    const p = mark(canvasProject(), 'I2');
    expect(arrivalMarks(p)).toBe(arrivalMarks(p));
    expect(arrivalMarks(mark(p, 'I1'))).not.toBe(arrivalMarks(p));
  });
});

describe('arrivalBadgeSpot: o lugar do selo', () => {
  const big = { x: 100, y: 200, width: 800, height: 600 };
  const small = { x: 100, y: 200, width: 40, height: 30 };

  it('big root: inside, at the bottom left corner (the container name is on top)', () => {
    const spot = badgeSpot(big, 1, 100);
    expect(spot.x).toBeGreaterThan(100);
    expect(spot.y).toBeGreaterThan(200 + 600 - 2 * A.height);
    expect(spot.y + A.height).toBeLessThanOrEqual(200 + 600);
  });

  it('small root: outside, below the bottom left corner (never over the name nor the strip)', () => {
    const spot = badgeSpot(small, 1, 100);
    expect(spot.x).toBe(100);
    expect(spot.y).toBeGreaterThanOrEqual(200 + 30);
  });

  it('the seal size on the screen does not change with zoom: the gap in canvas units shrinks', () => {
    const at1 = badgeSpot(small, 1, 100);
    const at2 = badgeSpot(small, 2, 100);
    expect(at1.y - 230).toBeCloseTo(2 * (at2.y - 230));
  });

  it('small root: the gap covers the selection handles (10 screen px below the corner)', () => {
    const spot = badgeSpot(small, 2, 100);
    expect(spot.y - (200 + 30)).toBeGreaterThanOrEqual(10 / 2 - 1e-9);
  });

  it('small root with another root right below: the seal does not fall on its name, it goes to the side', () => {
    const zoom = 0.22;
    const below = { x: 100, y: 200 + 30 + 5, width: 40, height: 30 };
    const width = 100;
    const spot = badgeSpot(small, zoom, width, undefined, undefined, [
      { id: 'B', rect: below },
    ]);
    const nameBand = 24 / zoom;
    const hits =
      spot.x < below.x + below.width &&
      spot.x + width / zoom > below.x &&
      spot.y < below.y + below.height &&
      spot.y + A.height / zoom > below.y - nameBand;
    expect(hits).toBe(false);
    // Without an obstacle, the usual place: below the corner.
    expect(badgeSpot(small, zoom, width).x).toBe(100);
  });

  // R23.10: the Report at y 0 and the Funnel right below, at the same x; at ~39% zoom the name strip
  // of the Funnel (24 screen px) invades the bottom of the Report, where the seal used to sit.
  const report = { x: 0, y: 0, width: 1000, height: 700 };
  const funnel = { x: 0, y: 720, width: 1000, height: 600 };
  const both = [
    { id: 'R', rect: report },
    { id: 'F', rect: funnel },
  ];
  const crosses = (at: { x: number; y: number }, w: number, h: number, r: Rect) =>
    at.x < r.x + r.width && at.x + w > r.x && at.y < r.y + r.height && at.y + h > r.y;

  it('big root with another root right below (~39%): the seal does not cross its name strip', () => {
    const zoom = 0.39;
    const width = 150;
    const spot = badgeSpot(report, zoom, width, undefined, undefined, both, 'R');
    const band = {
      x: funnel.x,
      y: funnel.y - A.nameBand / zoom,
      width: funnel.width,
      height: funnel.height + A.nameBand / zoom,
    };
    expect(crosses(spot, width / zoom, A.height / zoom, band)).toBe(false);
    // Still inside the Report, below its name strip.
    expect(spot.y).toBeGreaterThanOrEqual(report.y + A.nameBand / zoom);
    expect(spot.y + A.height / zoom).toBeLessThanOrEqual(report.y + report.height);
  });

  it('the root does not block itself: the comparison is by id, not by object', () => {
    const copy = [{ id: 'R', rect: { ...report } }];
    const alone = badgeSpot(report, 1, 150);
    expect(badgeSpot(report, 1, 150, undefined, undefined, copy, 'R')).toEqual(alone);
  });

  it('without a free candidate: the one with the least intersection', () => {
    const a = { x: 0, y: 0, width: 300, height: 60 };
    const b = { x: -50, y: 60, width: 200, height: 100 };
    const c = { x: 300, y: 30, width: 60, height: 60 };
    const roots = [
      { id: 'A', rect: a },
      { id: 'B', rect: b },
      { id: 'C', rect: c },
    ];
    // The inside one would fall entirely over the name strip of B (2000), the lower one over its body
    // (2000), the right one over C (1120); the left one is the one that covers the least (920).
    const spot = badgeSpot(a, 1, 100, undefined, undefined, roots, 'A');
    expect(spot).toEqual({ x: a.x - A.gap - 100, y: a.y + 60 + A.gap - A.height });
  });

  it('the seal does not leave the visible area: it touches the right and bottom edges', () => {
    const zoom = 0.16;
    const width = 220;
    const view = { x: 0, y: 0, width: 880 / zoom, height: 660 / zoom };
    const edge = { x: 5300, y: 3900, width: 400, height: 300 };
    const spot = badgeSpot(edge, zoom, width, view);
    expect(spot.x + width / zoom).toBeLessThanOrEqual(view.x + view.width);
    expect(spot.y + A.height / zoom).toBeLessThanOrEqual(view.y + view.height);
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });

  it('the width grows with the name', () => {
    expect(badgeWidth('Came from Long front')).toBeGreaterThan(badgeWidth('Came from A'));
  });
});

describe('seal measures come from the tokens', () => {
  it('width, height and gap follow the measures passed', () => {
    expect(widthOf('abc', { ...A, charWidth: 10, pad: 4 })).toBe(38);
    const rect = { x: 0, y: 0, width: 1000, height: 1000 };
    const tall = spotOf(rect, 1, 100, { ...A, height: 40, gap: 10 });
    expect(tall.y).toBe(1000 - 10 - 40);
    expect(tall.x).toBe(10);
  });
});

describe('arrivalBandLabelSpot: the place of the strip label', () => {
  const view = { x: 0, y: 0, width: 900, height: 600 };
  const size = { width: 160, height: 40 };

  it('with room on top: above the strip, without touching it', () => {
    const band = { x: 300, y: 300, width: 200, height: 200 };
    const spot = bandLabelSpot(band, 1, size, view, 20);
    expect(spot.x).toBe(300);
    expect(spot.y + size.height).toBeLessThanOrEqual(300);
  });

  it('low zoom: the strip slack shrinks and the label rises above the container name line', () => {
    const zoom = 0.16;
    const band = { x: 3000, y: 2000, width: 800, height: 3000 };
    const spot = arrivalBadgeSpotless(band, zoom);
    // The container name takes the 20 screen px right above the content, which is
    // ARRIVAL_BAND_PAD below the top of the strip.
    const contentTop = band.y + ARRIVAL_BAND_PAD;
    const nameTop = contentTop - 20 / zoom;
    expect(spot.y + size.height / zoom).toBeLessThanOrEqual(nameTop);

    function arrivalBadgeSpotless(b: typeof band, z: number) {
      const v = { x: 0, y: 0, width: 6000, height: 6000 };
      return bandLabelSpot(b, z, size, v, 20);
    }
  });

  it('without room on top: goes below the strip, inside the visible area', () => {
    const band = { x: 100, y: 5, width: 200, height: 300 };
    const spot = bandLabelSpot(band, 1, size, view, 20);
    expect(spot.y).toBeGreaterThanOrEqual(305);
    expect(spot.y + size.height).toBeLessThanOrEqual(view.y + view.height);
  });

  it('the label stays at tokens.arrival.pad (screen px) from each edge of the visible area', () => {
    const margin = A.pad / 0.5;
    const wide = { x: 0, y: 0, width: 1800, height: 1200 };
    const right = bandLabelSpot(
      { x: 1700, y: 600, width: 60, height: 100 },
      0.5,
      size,
      wide,
      20,
    );
    expect(right.x + size.width / 0.5).toBeLessThanOrEqual(wide.x + wide.width - margin);
    const left = bandLabelSpot(
      { x: 2, y: 600, width: 60, height: 100 },
      0.5,
      size,
      wide,
      20,
    );
    expect(left.x).toBeGreaterThanOrEqual(wide.x + margin);
    const top = bandLabelSpot(
      { x: 300, y: 2, width: 60, height: 100 },
      0.5,
      size,
      wide,
      20,
    );
    expect(top.y).toBeGreaterThanOrEqual(wide.y + margin);
  });

  it('wider than the visible area minus the margins: gains width and ellipsis', () => {
    expect(bandFitOf(160, 1, view, A)).toBeNull();
    expect(bandFitOf(1000, 1, view, A)).toBe(view.width - 2 * A.pad);
    expect(bandFitOf(1000, 0.5, view, A)).toBe(view.width * 0.5 - 2 * A.pad);
    const band = { x: 100, y: 300, width: 200, height: 200 };
    const spot = bandLabelSpot(band, 1, { width: 1000, height: 40 }, view, 20);
    expect(spot.x).toBe(view.x + A.pad);
  });

  it('does not leave through the right nor the left of the visible area', () => {
    const band = { x: 820, y: 300, width: 60, height: 100 };
    const spot = bandLabelSpot(band, 1, size, view, 20);
    expect(spot.x + size.width).toBeLessThanOrEqual(view.x + view.width);
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });
});

describe('arrivalBadgeSpot: sem cair sob o minimapa', () => {
  const view = { x: 0, y: 0, width: 600, height: 400 };
  const width = 135;
  const minimap = { x: 500, y: 300, width: 90, height: 90 };

  it('seal that would fall under the minimap goes to its left', () => {
    const rect = { x: 480, y: 250, width: 60, height: 40 };
    const spot = badgeSpot(rect, 1, width, view, minimap);
    const overlaps =
      spot.x < minimap.x + minimap.width &&
      spot.x + width > minimap.x &&
      spot.y < minimap.y + minimap.height &&
      spot.y + A.height > minimap.y;
    expect(overlaps).toBe(false);
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });

  it('without room on its left, it goes up above the minimap', () => {
    const narrow = { x: 0, y: 0, width: 600, height: 400 };
    const mini = { x: 20, y: 300, width: 570, height: 90 };
    const rect = { x: 480, y: 250, width: 60, height: 40 };
    const spot = badgeSpot(rect, 1, width, narrow, mini);
    expect(spot.y + A.height).toBeLessThanOrEqual(mini.y);
  });

  it('longe do minimapa, nada muda', () => {
    const rect = { x: 100, y: 100, width: 60, height: 40 };
    expect(badgeSpot(rect, 1, width, view, minimap)).toEqual(
      badgeSpot(rect, 1, width, view),
    );
  });
});

// Findings 1.2 and 2.1 of the PV2 tester round (#1406, fix CL1): the seal does not cover the title
// of any container nor that of the strip, even when the visible area pushes it to where it was.
describe('arrivalBadgeSpot: without covering titles (CL1, findings 1.2 and 2.1)', () => {
  const crosses = (at: { x: number; y: number }, w: number, h: number, r: Rect) =>
    at.x < r.x + r.width && at.x + w > r.x && at.y < r.y + r.height && at.y + h > r.y;

  it('1.2: the Main one fitted (11%): the seal of the Report does not fall on the title of the Funnel', () => {
    const zoom = 0.11;
    const width = 120;
    const c = { x: 0, y: 0, width: 1400, height: 1000 };
    const report = { x: 1450, y: 0, width: 1600, height: 1000 };
    const funnel = { x: 1450, y: 1050, width: 1600, height: 1000 };
    const roots = [
      { id: 'C', rect: c },
      { id: 'R', rect: report },
      { id: 'F', rect: funnel },
    ];
    // Canvas of 360 px: the visible area ends right after the strip, and the place to the right of the
    // Report, pulled inside it, fell on the title of the Funnel.
    const view = { x: -100, y: -400, width: 3270, height: 5000 };
    const spot = badgeSpot(report, zoom, width, view, undefined, roots, 'R');
    const w = width / zoom;
    const h = A.height / zoom;
    for (const other of [c, funnel]) {
      const named = {
        x: other.x,
        y: other.y - A.nameBand / zoom,
        width: other.width,
        height: other.height + A.nameBand / zoom,
      };
      expect(crosses(spot, w, h, named), JSON.stringify({ spot, named })).toBe(false);
    }
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
    expect(spot.x + w).toBeLessThanOrEqual(view.x + view.width);
  });

  it('2.1: the strip title below it (top out of view): the seal of the Funnel does not cover it', () => {
    const zoom = 0.23;
    const width = 120;
    const funnel = { x: 1450, y: 1050, width: 700, height: 1000 };
    const band = { x: 1426, y: -24, width: 748, height: 2098 };
    const view = { x: 100, y: 300, width: 2500, height: 2600 };
    const size = { width: 160, height: 40 };
    const at = bandLabelSpot(band, zoom, size, view, 20);
    // The top of the strip left the view: the title sits below it.
    expect(at.y).toBeGreaterThan(band.y + band.height);
    const label = { ...at, width: size.width / zoom, height: size.height / zoom };
    const roots = [{ id: 'F', rect: funnel }];
    const spot = badgeSpot(funnel, zoom, width, view, undefined, roots, 'F', [label]);
    expect(
      crosses(spot, width / zoom, A.height / zoom, label),
      JSON.stringify({ spot, label }),
    ).toBe(false);
  });
});
