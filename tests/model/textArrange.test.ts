// The Text component (notes library v5) under Arrange: `fixa` keeps the width and grows the height to hold
// every wrapped line, `auto` is one line per typed line and the width of the longest one, and the same text
// has the same width however many lines it is typed in, on the canvas and inside a container of scale 3.33.
// A box near the container's edge slides back inside instead of being cut (the report's 118x108 and 164x24).
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  componentMinSize,
  createDrawingCache,
  fitMarking,
  moveMarking,
  setContainerDensity,
  setMarkingFloating,
  type Project,
  type Rect,
} from '../../src/model';
import { NOTES_ID } from '../../libraries/notas';
import { notesCatalog, notesProject } from './notesFixtures';

const catalog = notesCatalog();
const TEXT = 'A long label that goes on and on, with enough words to need several lines.';
const BOLD20 = { tamanho: 20, peso: 'bold' } as const;
// 20 bold: 12 px per character and a 24 px line in the approximate measurer.
const CHAR = 12;
const LINE = 24;

type Values = Record<string, string | number>;

function textProject(
  values: Values,
  rect: Rect,
  containerId: string | null,
  density?: number,
): Project {
  const base = notesProject();
  const p = density === undefined ? base : setContainerDensity(base, 'I1', density);
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: 'X1',
      annotationId: 'AX1',
      containerId,
      parentId: null,
      specId: NOTES_ID,
      typeId: 'texto',
      rect,
      values,
    },
    approximateMeasurer,
  );
}

const rectOf = (p: Project): Rect => p.markings.find((m) => m.id === 'X1')!.rect;
const arrange = (p: Project): Project =>
  fitMarking(p, catalog, 'X1', approximateMeasurer);
const overflows = (p: Project): boolean =>
  createDrawingCache()(p, catalog, approximateMeasurer, 0).get('X1')!.overflow;

// The container I1 is 1000 x 800 px; a density of 3.33 makes a unit 3.33 px.
const SPACES = [
  ['the canvas', null, undefined, 1],
  ['a container of scale 3.33', 'I1', 3.33, 3.33],
] as const;

describe.each(SPACES)('Text Arrange on %s', (_name, containerId, density, unit) => {
  const origin = containerId === null ? 5000 : 10;

  it('fixa keeps the width and the height holds every wrapped line', () => {
    const width = Math.round(118 * unit);
    const p = textProject(
      { texto: TEXT, ...BOLD20, largura: 'fixa' },
      { x: origin, y: 10, width, height: 108 },
      containerId,
      density,
    );
    const once = arrange(p);
    expect(rectOf(once).width).toBe(width);
    const perLine = Math.floor(118 / CHAR);
    const lines = Math.ceil(TEXT.length / perLine);
    expect(rectOf(once).height).toBeGreaterThanOrEqual(lines * LINE * unit - 1);
    expect(arrange(once)).toBe(once);
  });

  it('fixa near the bottom edge slides up to hold every line instead of being cut', () => {
    if (containerId === null) return;
    const width = Math.round(118 * unit);
    const p = textProject(
      { texto: TEXT, ...BOLD20, largura: 'fixa' },
      { x: 10, y: 692, width, height: 108 },
      containerId,
      density,
    );
    const once = arrange(p);
    const { y, height } = rectOf(once);
    expect(y + height).toBeLessThanOrEqual(800);
    expect(height).toBeGreaterThan(108);
    expect(overflows(once)).toBe(false);
    expect(rectOf(arrange(once))).toEqual(rectOf(once));
  });

  it('auto is one line per typed line, as wide as the longest line', () => {
    const text = 'A long label that';
    const p = textProject(
      { texto: text, ...BOLD20 },
      { x: origin, y: 10, width: Math.round(60 * unit), height: Math.round(10 * unit) },
      containerId,
      density,
    );
    const fitted = rectOf(arrange(p));
    expect(fitted.width).toBe(Math.ceil(text.length * CHAR * unit - 1e-6));
    expect(fitted.height).toBe(Math.ceil(LINE * unit - 1e-6));
    expect(overflows(arrange(p))).toBe(false);
  });

  it('auto at the right edge slides left to hold the whole line instead of cutting it', () => {
    if (containerId === null) return;
    const text = 'A long label that';
    const p = textProject(
      { texto: text, ...BOLD20 },
      { x: 836, y: 10, width: 164, height: 24 },
      containerId,
      density,
    );
    const once = arrange(p);
    const { x, width } = rectOf(once);
    expect(x + width).toBeLessThanOrEqual(1000);
    expect(width).toBeGreaterThanOrEqual(Math.ceil(text.length * CHAR * unit - 1e-6));
    expect(overflows(once)).toBe(false);
  });

  it('the same text has the same width in one line and in two', () => {
    const at = {
      x: origin,
      y: 10,
      width: Math.round(118 * unit),
      height: Math.round(108 * unit),
    };
    const widthOf = (texto: string): number =>
      rectOf(arrange(textProject({ texto, ...BOLD20 }, at, containerId, density))).width;
    expect(widthOf('Line A\nLine A')).toBe(widthOf('Line A'));
    expect(widthOf('Line A\nLine B\nLine C')).toBe(widthOf('Line A'));
  });
});

// F.5: the drawing, the fit and the minimum compare the font and the box in the same unit (the container's
// density), so a text that moves into a container never stays "Incomplete" after Arrange.
// Stage #2210: with the minimum of the components (`minSizeOf`, as the store and the MCP pass it) the
// settle itself keeps the text in its units, so there is no overflow right after the move, before Arrange.
describe('Text moved into a container, before Arrange', () => {
  it.each([
    ['scale 3.33', undefined, 3.33],
    ['density 3.33', 3.33, 1],
    ['density and scale 3.33', 3.33, 3.33],
  ] as const)('with %s: the move leaves no overflow', (_n, density, scale) => {
    let p = textProject(
      { texto: 'A long label', ...BOLD20 },
      { x: 5000, y: 0, width: 144, height: 24 },
      null,
    );
    if (density !== undefined) p = setContainerDensity(p, 'I1', density);
    p = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'I1' ? { ...c, placement: { ...c.placement, scale } } : c,
      ),
    };
    const placement = p.containers.find((c) => c.id === 'I1')!.placement;
    const moved = moveMarking(p, 'X1', placement.x + 20 - 5000, placement.y + 20, {
      minSizeOf: (id) => componentMinSize(p, catalog, id),
    });
    expect(moved.markings.find((m) => m.id === 'X1')!.containerId).toBe('I1');
    expect(overflows(moved)).toBe(false);
    // Floating on takes it out again: the box is back to the canvas size.
    const floated = setMarkingFloating(moved, 'X1', true, {
      minSizeOf: (id) => componentMinSize(moved, catalog, id),
    });
    expect(Math.abs(rectOf(floated).width - 144)).toBeLessThanOrEqual(1);
    expect(Math.abs(rectOf(floated).height - 24)).toBeLessThanOrEqual(1);
  });
});

describe('Text moved into a container', () => {
  it.each([
    ['scale 3.33', undefined, 3.33],
    ['density 3.33', 3.33, 1],
    ['density and scale 3.33', 3.33, 3.33],
  ] as const)(
    'with %s: Arrange leaves the font and the box in the same units',
    (_n, density, scale) => {
      let p = textProject(
        { texto: 'A long label', ...BOLD20 },
        { x: 5000, y: 0, width: 144, height: 24 },
        null,
      );
      if (density !== undefined) p = setContainerDensity(p, 'I1', density);
      p = {
        ...p,
        containers: p.containers.map((c) =>
          c.id === 'I1' ? { ...c, placement: { ...c.placement, scale } } : c,
        ),
      };
      const placement = p.containers.find((c) => c.id === 'I1')!.placement;
      p = moveMarking(p, 'X1', placement.x + 20 - 5000, placement.y + 20);
      expect(p.markings.find((m) => m.id === 'X1')!.containerId).toBe('I1');
      const arranged = arrange(p);
      expect(overflows(arranged)).toBe(false);
      const unit = density ?? 1;
      expect(rectOf(arranged).width).toBe(Math.ceil(12 * CHAR * unit - 1e-6));
      expect(rectOf(arranged).height).toBe(Math.ceil(LINE * unit - 1e-6));
    },
  );
});
