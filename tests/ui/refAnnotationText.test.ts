import { afterEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import {
  setFieldValue,
  setTableCell,
  addTableRow,
  type Change,
  type Proposal,
} from '../../src/model';
import { tableLines, valueParts } from '../../src/ui/review/changeText';
import { world } from '../model/refAnnotationFixtures';

// `ref` to the whole annotation (stage #679, CF1) in the proposal review: changing the target of a
// cell shows up as a change of that row, with the instance label.
describe('tableLines with the ref cell to the whole annotation', () => {
  it('the row shows the target label; changing the target changes the row text', () => {
    let p = world();
    p = addTableRow(p, 'AL', 'itens', 'I1');
    p = setTableCell(p, 'AL', 'itens', 'I1', 'alvo', { annotationId: 'AM' });
    p = setFieldValue(p, 'AV', 'titulo', 'Extra');
    const rows = (project: typeof p) =>
      tableLines(
        { current: project, preview: null, proposal: {} as Proposal },
        project.annotations.find((a) => a.id === 'AL')?.values?.itens,
      );
    const before = rows(p);
    expect(before).toEqual([{ id: 'I1', text: 'alvo: Cliente' }]);
    const swapped = setTableCell(p, 'AL', 'itens', 'I1', 'alvo', { annotationId: 'AV' });
    const after = rows(swapped);
    expect(after).toEqual([{ id: 'I1', text: 'alvo: Avulso' }]);
    expect(after).not.toEqual(before);
  });
});

describe('valueParts with the ref field to the whole annotation', () => {
  it('shows the target label, not the JSON', () => {
    const names = { current: world(), preview: null, proposal: {} as Proposal };
    const change = { kind: 'update', field: 'values.item' } as unknown as Change;
    expect(valueParts(names, change, { annotationId: 'AM' })).toEqual([
      { text: 'Cliente' },
    ]);
  });
});

describe('broken reference in the review follows the language (#945, item 41)', () => {
  afterEach(() => {
    locale.value = 'en-US';
  });

  it('in en-US the broken ref cell and field come out in English', () => {
    locale.value = 'en-US';
    const names = { current: world(), preview: null, proposal: {} as Proposal };
    const change = { kind: 'update', field: 'values.item' } as unknown as Change;
    const [part] = valueParts(names, change, { annotationId: 'NAO-EXISTE' });
    expect(part?.text).toBe('(broken reference)');
    const rows = tableLines(names, [{ _id: 'R1', alvo: { annotationId: 'NAO-EXISTE' } }]);
    expect(rows?.[0]?.text).toBe('alvo: (broken reference)');
  });
});
