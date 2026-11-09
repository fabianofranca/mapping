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

// `ref` para a anotação inteira (etapa #679, CF1) na revisão da proposta: trocar o alvo de uma
// célula aparece como mudança daquela linha, com o rótulo da instância.
describe('tableLines com a célula ref para a anotação inteira', () => {
  it('a linha mostra o rótulo do alvo; trocar o alvo muda o texto da linha', () => {
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

describe('valueParts com o campo ref para a anotação inteira', () => {
  it('mostra o rótulo do alvo, não o JSON', () => {
    const names = { current: world(), preview: null, proposal: {} as Proposal };
    const change = { kind: 'update', field: 'values.item' } as unknown as Change;
    expect(valueParts(names, change, { annotationId: 'AM' })).toEqual([
      { text: 'Cliente' },
    ]);
  });
});

describe('referência quebrada na revisão segue o idioma (#945, item 41)', () => {
  afterEach(() => {
    locale.value = 'pt-BR';
  });

  it('em en-US a célula e o campo ref quebrados saem em inglês', () => {
    locale.value = 'en-US';
    const names = { current: world(), preview: null, proposal: {} as Proposal };
    const change = { kind: 'update', field: 'values.item' } as unknown as Change;
    const [part] = valueParts(names, change, { annotationId: 'NAO-EXISTE' });
    expect(part?.text).toBe('(broken reference)');
    const rows = tableLines(names, [{ _id: 'R1', alvo: { annotationId: 'NAO-EXISTE' } }]);
    expect(rows?.[0]?.text).toBe('alvo: (broken reference)');
  });
});
