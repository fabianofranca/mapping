// A célula de uma coluna `ref` de `table` nos Detalhes (ME4, decisão (e)): a versão compacta do
// campo `ref`, com o seletor de referência compacto.
import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  removeTableRow,
  setTableCell,
  typeOfAnnotation,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypedField } from '../../src/ui/TypedFields';
import { R1, build } from '../model/refColumnFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(project: Project, readOnly = false) {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, 'AL');
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === 'alvos',
    );
    if (!field) throw new Error('campo alvos não existe');
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        readOnly={readOnly}
        onGoToAnnotation={onGoToAnnotation}
      />
    );
  });
  return { harness, onGoToAnnotation, user: userEvent.setup() };
}

/** O botão da célula `alvo` da linha 1 (o nome acessível é "Alvo (Linha 1): <valor>"). */
const cellButton = () => screen.getByRole('button', { name: /^Alvo \(Linha 1\): / });

const cellValue = (h: { project(): Project }) => {
  const rows = annotationOf(h.project(), 'AL').values?.alvos as Record<string, unknown>[];
  return rows[0]?.alvo;
};

describe('TableField: célula de coluna ref', () => {
  it('célula vazia mostra "Escolher…", o cabeçalho da coluna e o botão Limpar desabilitado', () => {
    setup(build());
    expect(cellButton().textContent).toContain('Escolher…');
    expect(cellButton().className).toContain('is-empty');
    expect(screen.getByRole('columnheader', { name: 'Alvo *' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Limpar (Alvo (Linha 1))' }),
    ).toHaveProperty('disabled', true);
  });

  it('abre o seletor compacto: título da coluna, só os alvos aceitos, sem a barra de atalhos', async () => {
    const { user } = setup(build());
    await user.click(cellButton());
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('picker-compact');
    expect(within(dialog).getByText('Escolher alvo de "Alvo"')).toBeTruthy();
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((o) => o.textContent ?? '')
        .map((text) => text.replace(/(free|livre|data-field).*$/, '')),
    ).toEqual([
      expect.stringContaining('Cliente.cpf'),
      expect.stringContaining('Cliente.nome'),
      expect.stringContaining('Glossário.termo'),
    ]);
    expect(dialog.querySelector('.picker-foot')).toBeNull();
    // As abas por etiqueta aceita seguem como no campo (Todos, a etiqueta e Livres).
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Todos', 'data-field', 'Livres']);
  });

  it('escolher grava a referência na célula, fecha o seletor e devolve o foco à célula', async () => {
    const { harness, user } = setup(build());
    await user.click(cellButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('option', { name: /Cliente\.nome/ }));
    expect(cellValue(harness)).toEqual({
      annotationId: 'AM',
      key: 'campos',
      rowId: 'R2',
    });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cellButton().textContent).toContain('Cliente.nome');
    expect(cellButton().title).toContain('→ Cliente.nome');
    expect(document.activeElement).toBe(cellButton());
  });

  it('teclado: Ctrl+B abre, a busca filtra, Enter escolhe; o atual vem marcado ao reabrir', async () => {
    const { harness, user } = setup(build());
    cellButton().focus();
    await user.keyboard('{Control>}b{/Control}');
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('combobox'), 'termo');
    await user.keyboard('{Enter}');
    expect(cellValue(harness)).toEqual({ annotationId: 'AF', entryId: 'E1' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(cellButton());
    const again = await screen.findByRole('dialog');
    const current = within(again).getByRole('option', { selected: true });
    expect(current.textContent).toContain('Glossário.termo');
    expect(current.textContent).toContain('atual');
  });

  it('Esc fecha o seletor sem mudar nada', async () => {
    const { harness, user } = setup(build());
    await user.click(cellButton());
    const dialog = await screen.findByRole('dialog');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cellValue(harness)).toBeNull();
    expect(document.activeElement).toBe(cellButton());
  });

  it('Limpar remove a referência da célula', async () => {
    const { harness, user } = setup(
      setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1),
    );
    expect(cellButton().textContent).toContain('Cliente.cpf');
    await user.click(screen.getByRole('button', { name: 'Limpar (Alvo (Linha 1))' }));
    expect(cellValue(harness)).toBeNull();
    expect(cellButton().textContent).toContain('Escolher…');
  });

  it('Ctrl+clique vai até o alvo, sem abrir o seletor', async () => {
    const { onGoToAnnotation, user } = setup(
      setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1),
    );
    await user.keyboard('{Control>}');
    await user.click(cellButton());
    await user.keyboard('{/Control}');
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AM' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('alvo que não existe mais aparece como referência quebrada, com o motivo na dica', () => {
    const linked = setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1);
    setup(removeTableRow(linked, 'AM', 'campos', 'R1'));
    expect(cellButton().textContent).toContain('(referência quebrada)');
    expect(cellButton().className).toContain('is-broken');
  });

  it('somente leitura: a célula e o Limpar ficam desabilitados', () => {
    setup(setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1), true);
    expect(cellButton()).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: 'Limpar (Alvo (Linha 1))' }),
    ).toHaveProperty('disabled', true);
  });

  it('a coluna obrigatória vazia aparece como inválida', () => {
    setup(build());
    expect(cellButton().getAttribute('aria-invalid')).toBe('true');
  });

  it('as outras colunas da linha seguem com o editor simples', async () => {
    const { harness, user } = setup(build());
    const note = screen.getByLabelText('nota (Linha 1)');
    await user.type(note, 'primeira{Enter}');
    const rows = annotationOf(harness.project(), 'AL').values?.alvos as Record<
      string,
      unknown
    >[];
    expect(rows[0]?.nota).toBe('primeira');
  });
});
