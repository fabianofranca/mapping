import { describe, expect, it } from 'vitest';
import { setFieldValue, setTableCell, addTableRow, type Proposal } from '../../src/model';
import { tableLines } from '../../src/ui/review/changeText';
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
