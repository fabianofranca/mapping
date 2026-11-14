// M2 (group B) of the "faithful Material 3" stage: lazy-column, lazy-row, lazy-vertical-grid, flow-row, spacer and
// horizontal-pager. They come from the foundation (no tokens file): what matters is the `Arrangement`/`Alignment` and
// the fields' spacings reaching the slot layout, and no literal color in what the `Spacer` draws.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { findSlot, resolveSlotLayout } from '../../src/model/components/arrange';
import { defaultValues } from '../../src/model/libraryDrawing';
import { drawIn, files, findText, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entry = (id: string) => findEntry(catalog, id)!;
const tokens = spec.tokens!.values as Record<string, unknown>;
const mode = (token: string, m: 'light' | 'dark'): string =>
  (tokens[token] as Record<'light' | 'dark', string>)[m];

function slotLayout(id: string, values: Record<string, string | number>) {
  const e = entry(id);
  const slot = findSlot(e.component!)!;
  return resolveSlotLayout(slot, { ...defaultValues(e.type), ...values });
}
const version = (id: string) => entry(id).component!.formatVersion;

describe('M2 group B — foundation in format 4', () => {
  it('lazy-column: Arrangement and Alignment become the slot's justify and align; spacing and contentPadding, gap and padding', () => {
    expect(version('lazy-column')).toBe(4);
    const bottom = slotLayout('lazy-column', {
      verticalArrangement: 'Bottom',
      horizontalAlignment: 'CenterHorizontally',
      spacing: 8,
      contentPadding: 16,
    });
    expect(bottom).toMatchObject({
      type: 'column',
      gap: 8,
      justify: 'end',
      align: 'center',
    });
    expect(bottom.padding).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(slotLayout('lazy-column', { horizontalAlignment: 'End' }).align).toBe('end');
    expect(slotLayout('lazy-column', { verticalArrangement: 'Center' }).justify).toBe(
      'center',
    );
    expect(
      slotLayout('lazy-column', { verticalArrangement: 'SpaceBetween' }).justify,
    ).toBe('space-between');
    // reverseLayout turns on the slot's `reverse`; the Compose default becomes Bottom (LazyDsl.kt, lines
    // 393 and 394), which on the reversed axis is `start`
    expect(slotLayout('lazy-column', { reverseLayout: 'true' }).reverse).toBe(true);
    expect(slotLayout('lazy-column', { reverseLayout: 'false' }).reverse).toBe(false);
    expect(slotLayout('lazy-column', { reverseLayout: 'true' }).justify).toBe('start');
    // An explicit Top with reverseLayout keeps the block at the top (justify `end` before the mirror); without the
    // field (the default) the block goes to the end, like the Bottom Compose passes in that combination (FX5).
    expect(
      slotLayout('lazy-column', { reverseLayout: 'true', verticalArrangement: 'Top' })
        .justify,
    ).toBe('end');
    expect(
      slotLayout('lazy-column', { reverseLayout: 'false', verticalArrangement: 'Top' })
        .justify,
    ).toBe('start');
    expect(
      slotLayout('lazy-column', { reverseLayout: 'true', verticalArrangement: 'Bottom' })
        .justify,
    ).toBe('start');
    expect(
      slotLayout('lazy-column', { verticalArrangement: 'SpaceAround' }).justify,
    ).toBe('space-around');
    expect(
      slotLayout('lazy-column', { verticalArrangement: 'SpaceEvenly' }).justify,
    ).toBe('space-evenly');
    expect(
      slotLayout('lazy-column', { reverseLayout: 'true', verticalArrangement: 'Center' })
        .justify,
    ).toBe('center');
  });

  it('lazy-row: horizontalArrangement and verticalAlignment become the slot's justify and align', () => {
    expect(version('lazy-row')).toBe(4);
    const l = slotLayout('lazy-row', {
      horizontalArrangement: 'End',
      verticalAlignment: 'CenterVertically',
      spacing: 12,
      contentPadding: 16,
    });
    expect(l).toMatchObject({ type: 'row', gap: 12, justify: 'end', align: 'center' });
    expect(slotLayout('lazy-row', { verticalAlignment: 'Bottom' }).align).toBe('end');
    expect(slotLayout('lazy-row', { reverseLayout: 'true' }).reverse).toBe(true);
    expect(slotLayout('lazy-row', { reverseLayout: 'true' }).justify).toBe('start');
    expect(
      slotLayout('lazy-row', { reverseLayout: 'true', horizontalArrangement: 'Start' })
        .justify,
    ).toBe('end');
    expect(
      slotLayout('lazy-row', { reverseLayout: 'true', horizontalArrangement: 'End' })
        .justify,
    ).toBe('start');
  });

  it('lazy-vertical-grid: format 4, grid and contentPadding in the slot (L5)', () => {
    expect(version('lazy-vertical-grid')).toBe(4);
    const layout = slotLayout('lazy-vertical-grid', {
      contentPadding: 16,
      horizontalSpacing: 8,
      verticalSpacing: 12,
    });
    expect(layout).toMatchObject({
      type: 'grid',
      gap: 8,
      lineGap: 12,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
    });
  });

  it('flow-row: horizontalArrangement and itemVerticalAlignment become justify and align; spacing, gap', () => {
    expect(version('flow-row')).toBe(4);
    const l = slotLayout('flow-row', {
      horizontalArrangement: 'Center',
      itemVerticalAlignment: 'CenterVertically',
      spacing: 12,
    });
    expect(l).toMatchObject({ type: 'row', gap: 12, justify: 'center', align: 'center' });
    expect(slotLayout('flow-row', { horizontalArrangement: 'End' }).justify).toBe('end');
    expect(slotLayout('flow-row', { itemVerticalAlignment: 'Bottom' }).align).toBe('end');
  });

  it('spacer: stroke and measures in tokens (outline-variant and outline), light and dark; radius and font by token', () => {
    expect(version('spacer')).toBe(4);
    for (const m of ['light', 'dark'] as const) {
      const root = drawIn(catalog, entry('spacer'), {}, m).root;
      expect(solid(root.stroke?.paints ?? [])).toBe(mode('outline-variant', m));
      expect(root.cornerRadius).toBe(tokens['corner-extra-small']);
      const label = findText(root)!;
      expect(solid(label.fills)).toBe(mode('outline', m));
      expect(label.style.fontSize).toBe(tokens['label-small-size']);
      expect(label.style.lineHeight).toBe(tokens['label-small-line-height']);
      expect(label.style.fontWeight).toBe(tokens['label-small-weight']);
      expect(label.style.letterSpacing).toBe(tokens['label-small-tracking']);
      expect(label.style.fontFamily).toBe(tokens['font-sans']);
    }
  });

  it('horizontal-pager: verticalAlignment becomes align; pageSpacing, gap; contentPadding, padding', () => {
    expect(version('horizontal-pager')).toBe(4);
    const l = slotLayout('horizontal-pager', { pageSpacing: 16, contentPadding: 32 });
    expect(l).toMatchObject({ type: 'row', gap: 16, justify: 'start', align: 'center' });
    expect(l.padding).toEqual({ top: 32, right: 32, bottom: 32, left: 32 });
    expect(slotLayout('horizontal-pager', { verticalAlignment: 'Top' }).align).toBe(
      'start',
    );
    expect(slotLayout('horizontal-pager', { verticalAlignment: 'Bottom' }).align).toBe(
      'end',
    );
  });
});
