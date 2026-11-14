// L5 (#1101, decisions 24 and 25 of #1078): Material 3 (Compose) adopts the engine's new layout.
//  - `box`: the `none` slot aligned by `contentAlignment` (Arrange puts the child where Compose puts it);
//  - `lazy-vertical-grid`: the `grid` slot with `columns`/`minColumnWidth` and the spacings;
//  - `segmented-button`: the segments in a grid of equal columns (the `IntrinsicSize.Min`);
//  - `row`, `column`, `lazy-column`, `lazy-row` and the lazy grid: the slot with `clip`.
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  arrangeMarking,
  createDrawingCache,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { drawFitted, fittedSize } from '../support/material3Fitted';
import {
  at,
  catalog,
  clipProject,
  component,
  layoutOf,
  slotOf,
  withButtons,
  type Json,
} from '../support/material3Adoption';

describe('box: Arrange puts the child by contentAlignment (Compose)', () => {
  const arrange = (contentAlignment: string, n = 1) => {
    const p = withButtons(
      'box',
      { x: 20, y: 20, width: 200, height: 160 },
      { contentAlignment, height: 'fixed' },
      n,
    );
    return arrangeMarking(p, catalog, 'C', approximateMeasurer).project;
  };

  /** The rectangle of the child and of the Box (20, 20, 200 × 160): `x` and `y` by the middle or the end. */
  const place = (alignment: string) => {
    const r = at(arrange(alignment), 'B1');
    return {
      r,
      center: {
        x: Math.round(20 + (200 - r.width) / 2),
        y: Math.round(20 + (160 - r.height) / 2),
      },
      end: { x: 220 - r.width, y: 180 - r.height },
    };
  };

  it('Center: the child in the middle of the 200 × 160 Box', () => {
    const { r, center } = place('Center');
    expect([r.x, r.y]).toEqual([center.x, center.y]);
  });

  it('BottomEnd: in the bottom right corner', () => {
    const { r, end } = place('BottomEnd');
    expect([r.x, r.y]).toEqual([end.x, end.y]);
  });

  it('TopCenter and CenterStart use one axis each', () => {
    const top = place('TopCenter');
    expect([top.r.x, top.r.y]).toEqual([top.center.x, 20]);
    const side = place('CenterStart');
    expect([side.r.x, side.r.y]).toEqual([20, side.center.y]);
  });

  it('the children stay overlapped, each aligned on its own', () => {
    const p = arrange('Center', 2);
    expect(at(p, 'B1')).toEqual(at(p, 'B2'));
  });

  it('TopStart (the default) does not touch the children: the usual none', () => {
    const p = withButtons(
      'box',
      { x: 20, y: 20, width: 200, height: 160 },
      { contentAlignment: 'TopStart', height: 'fixed' },
      1,
    );
    expect(() => arrangeMarking(p, catalog, 'C', approximateMeasurer)).toThrow();
  });

  it('the slot declares align and justify by contentAlignment', () => {
    const layout = layoutOf('box');
    expect(layout.type).toBe('none');
    expect(layout.align).toMatchObject({ $switch: 'contentAlignment' });
    expect(layout.justify).toMatchObject({ $switch: 'contentAlignment' });
  });
});

describe('lazy-vertical-grid: Arrange puts the children in a grid', () => {
  const arrange = (values: NewComponentArgs['values'], n = 5) => {
    const p = withButtons(
      'lazy-vertical-grid',
      { x: 20, y: 20, width: 360, height: 400 },
      values,
      n,
    );
    return arrangeMarking(p, catalog, 'C', approximateMeasurer).project;
  };
  const cells = (p: Project, n = 5) =>
    Array.from({ length: n }, (_, i) => {
      const r = at(p, `B${i + 1}`);
      return [r.x, r.y];
    });

  it('columns 2: 5 children in 3 rows, with horizontalSpacing and verticalSpacing', () => {
    const p = arrange({
      columns: 2,
      minColumnWidth: null,
      horizontalSpacing: 8,
      verticalSpacing: 12,
      contentPadding: 0,
    });
    // Columns of (360 − 8) / 2 = 176: the second starts at 20 + 184; rows of 40 + 12.
    expect(cells(p)).toEqual([
      [20, 20],
      [204, 20],
      [20, 72],
      [204, 72],
      [20, 124],
    ]);
  });

  it('minColumnWidth 100 (Adaptive): floor((360 + 8) / 108) = 3 columns', () => {
    const p = arrange({
      columns: 2,
      minColumnWidth: 100,
      horizontalSpacing: 8,
      verticalSpacing: 12,
      contentPadding: 0,
    });
    // Three columns of (360 − 16) / 3 ≈ 114.7: step of 122.7.
    expect(cells(p)).toEqual([
      [20, 20],
      [143, 20],
      [265, 20],
      [20, 72],
      [143, 72],
    ]);
  });

  it('the slot is a grid and the label no longer summarizes Fixed/Adaptive', () => {
    const layout = layoutOf('lazy-vertical-grid');
    expect(layout.type).toBe('grid');
    expect(layout.gap).toMatchObject({ $field: 'horizontalSpacing' });
    expect(layout.lineGap).toMatchObject({ $field: 'verticalSpacing' });
    const label = JSON.stringify(slotOf('lazy-vertical-grid').label);
    expect(label).not.toMatch(/Fixed|Adaptive/);
  });
});

describe('segmented-button: segments of equal width set by the widest', () => {
  const options = (...labels: string[]) =>
    labels.map((label, i) => ({ label, icon: '', selected: i === 0 ? 'true' : 'false' }));

  /** The widths of the `segmento` nodes of the drawing. */
  // pt-BR kept: node names of libraries/material3-compose are Portuguese data
  const widths = (values: Json, mode: 'light' | 'dark' = 'light') => {
    const { drawing, box } = drawFitted('segmented-button', values, mode);
    const boxes = absoluteBoxes(drawing.root);
    const cells = [...walk(drawing.root)].filter((n) => n.name === 'segmento');
    return {
      box,
      widths: cells.map((n) => boxes.get(n.id)!.width),
      heights: cells.map((n) => boxes.get(n.id)!.height),
    };
  };

  it('"A" and "Advanced application settings": both segments measure the same (the widest) (#898)', () => {
    const values = { options: options('A', 'Advanced application settings') };
    const fitted = fittedSize('segmented-button', values);
    const { box, widths: w } = widths(values);
    expect(w).toHaveLength(2);
    expect(Math.abs((w[0] as number) - (w[1] as number))).toBeLessThanOrEqual(1);
    // The fitted size is twice the widest segment; the "A" does not shrink to its label.
    expect(Math.abs(fitted.width - 2 * (w[0] as number))).toBeLessThanOrEqual(2);
    expect(box.width).toBe(fitted.width);
    expect(w[0]).toBeGreaterThan(150);
  });

  it('with the 328 box, the three segments split the width equally', () => {
    const { widths: w, heights: h } = widths({
      options: options('Day', 'Week', 'Month'),
    });
    expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(1);
    // The segments have the height of the row (40), not just that of the content.
    expect(h).toEqual([40, 40, 40]);
  });

  it('in light and dark the drawing is the same (only the colors change)', () => {
    const values = { options: options('A', 'Advanced application settings') };
    expect(widths(values, 'dark').widths).toEqual(widths(values, 'light').widths);
  });

  it('the segments are a grid with one column per option', () => {
    const repeat = (component('segmented-button').template as Json).children as Json[];
    const grid = repeat.find((c) => c.type === 'repeat') as Json;
    expect(grid.layout).toMatchObject({ type: 'grid', columns: { $rows: 'options' } });
    expect(grid.direction).toBeUndefined();
  });
});

describe('the slot of the scrolling containers and of the flows cuts what goes past (clip)', () => {
  it.each(['lazy-column', 'lazy-row', 'lazy-vertical-grid', 'row', 'column'])(
    '%s: slot with clip true',
    (id) => {
      expect(slotOf(id).clip).toBe(true);
    },
  );

  it('box and flow-row do not clip (Compose does not clip)', () => {
    expect(slotOf('box').clip).toBeUndefined();
    expect(slotOf('flow-row').clip).toBeUndefined();
  });

  it('in the app: the drawing of the child carries the box of the parent slot as the clip', () => {
    const drawings = createDrawingCache()(clipProject(), catalog, approximateMeasurer, 0);
    expect(drawings.get('K')?.clip).toMatchObject({
      x: 20,
      y: 20,
      width: 140,
      height: 70,
    });
  });
});
