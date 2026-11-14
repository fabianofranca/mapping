// CL1 (1.4): segmented-button with labels of different widths: no label goes past the track, not even
// when the fit (`fit_marking`) has a width limit smaller than the sum of the tracks. The limit only
// tightens what breaks: the label is `wrap: none`, so the track does not shrink below the longest
// unbreakable word (the min-content) and the component exceeds the limit instead of invading its neighbor.
// pt-BR kept: shared fixture data (sdui example fields/layers, Material 3 node names) asserted by other dirs
import { describe, expect, it } from 'vitest';
import { fitComponentSize } from '../../src/model/components/sizing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { defaultValues } from '../../src/model/libraryDrawing';
import { catalog, drawFitted, entryOf, fittedSize } from '../support/material3Fitted';
import { instantiateOptions } from '../support/material3Library';

const options = (...labels: string[]) =>
  labels.map((label, i) => ({ label, icon: '', selected: i === 1 ? 'true' : 'false' }));

const VALUES = { options: options('A', 'Whole week', 'Mon') };

/** Each segment with the label rectangle inside it, drawn at the given width. */
function segments(width: number, height: number) {
  const { drawing } = drawFitted('segmented-button', VALUES, 'light', { width, height });
  const boxes = absoluteBoxes(drawing.root);
  const nodes = [...walk(drawing.root)];
  const texts = nodes.filter((n) => n.name === 'rótulo' && n.type === 'text');
  return nodes
    .filter((n) => n.name === 'segmento')
    .map((cell, i) => ({
      cell: boxes.get(cell.id)!,
      text: boxes.get(texts[i]!.id)!,
    }));
}

const expectInside = (rows: ReturnType<typeof segments>) =>
  rows.forEach(({ cell, text }) => {
    expect(text.x).toBeGreaterThanOrEqual(cell.x - 0.5);
    expect(text.x + text.width).toBeLessThanOrEqual(cell.x + cell.width + 0.5);
  });

describe('segmented-button hug: the track covers the widest label', () => {
  it('without a limit: three equal tracks by the largest segment and each label inside its own', () => {
    const fitted = fittedSize('segmented-button', VALUES);
    const rows = segments(fitted.width, fitted.height);
    expect(rows).toHaveLength(3);
    expectInside(rows);
    const widths = rows.map((r) => r.cell.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(fitted.width + 1);
  });

  it('with the fit limit of 340: the width does not shrink below the widest label', () => {
    const entry = entryOf('segmented-button');
    const all = { ...defaultValues(entry.type), ...VALUES } as never;
    const fit = fitComponentSize(
      entry.component!,
      all,
      instantiateOptions(catalog, 'light'),
      { maxWidth: 340 },
    );
    expect(fit!.width).toBeGreaterThan(340);
    expectInside(segments(fit!.width, fit!.height));
  });
});
