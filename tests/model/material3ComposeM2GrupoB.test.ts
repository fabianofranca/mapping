// M2 (grupo B) da etapa "Material 3 fiel": lazy-column, lazy-row, lazy-vertical-grid, flow-row, spacer e
// horizontal-pager. São do foundation (sem arquivo de tokens): o que vale é o `Arrangement`/`Alignment` e
// os espaçamentos dos campos chegando ao layout do slot, e nenhuma cor literal no que o `Spacer` desenha.
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

describe('M2 grupo B — foundation no formato 4', () => {
  it('lazy-column: Arrangement e Alignment viram justify e align do slot; spacing e contentPadding, gap e padding', () => {
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
    // reverseLayout liga o `reverse` do slot; o padrão do Compose passa a Bottom (LazyDsl.kt, linhas
    // 393 e 394), que no eixo invertido é o `start`
    expect(slotLayout('lazy-column', { reverseLayout: 'true' }).reverse).toBe(true);
    expect(slotLayout('lazy-column', { reverseLayout: 'false' }).reverse).toBe(false);
    expect(slotLayout('lazy-column', { reverseLayout: 'true' }).justify).toBe('start');
    // Top explícito com reverseLayout mantém o bloco no topo (justify `end` antes do espelho); sem o
    // campo (o padrão) o bloco vai ao fim, como o Bottom que o Compose passa nessa combinação (FX5).
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

  it('lazy-row: horizontalArrangement e verticalAlignment viram justify e align do slot', () => {
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

  it('lazy-vertical-grid: formato 4, grade e contentPadding no slot (L5)', () => {
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

  it('flow-row: horizontalArrangement e itemVerticalAlignment viram justify e align; spacing, gap', () => {
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

  it('spacer: traço e medidas em tokens (outline-variant e outline), light e dark; raio e fonte por token', () => {
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

  it('horizontal-pager: verticalAlignment vira align; pageSpacing, gap; contentPadding, padding', () => {
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
