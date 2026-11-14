// The cell of a `ref` column of a `table` in the Details (ME4, decision (e)): the compact version of
// the `ref` field, with the compact reference picker.
// pt-BR kept: shared fixture data (names such as Alvo, alvos, Cliente.cpf, Glossário.termo) asserted by tests/model and tests/store
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
  locale.value = 'en-US';
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
    if (!field) throw new Error('field alvos does not exist');
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

/** The button of the `alvo` cell of row 1 (the accessible name is "<value>: Alvo (Row 1)"). */
const cellButton = () => screen.getByRole('button', { name: /: Alvo \(Row 1\)$/ });

const cellValue = (h: { project(): Project }) => {
  const rows = annotationOf(h.project(), 'AL').values?.alvos as Record<string, unknown>[];
  return rows[0]?.alvo;
};

describe('TableField: ref column cell', () => {
  it('an empty cell shows "Choose…", the column header and the Clear button disabled', () => {
    setup(build());
    expect(cellButton().textContent).toContain('Choose…');
    // SN2: the name starts with the visible text, without the ellipsis.
    expect(cellButton().getAttribute('aria-label')).toBe('Choose: Alvo (Row 1)');
    expect(cellButton().className).toContain('is-empty');
    expect(screen.getByRole('columnheader', { name: 'Alvo *' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear (Alvo (Row 1))' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('opens the compact picker: column title, only the accepted targets, without the shortcut bar', async () => {
    const { user } = setup(build());
    await user.click(cellButton());
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('picker-compact');
    expect(within(dialog).getByText('Choose the target of "Alvo"')).toBeTruthy();
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((o) => o.textContent ?? '')
        .map((text) => text.replace(/(free|data-field).*$/, '')),
    ).toEqual([
      expect.stringContaining('Cliente.cpf'),
      expect.stringContaining('Cliente.nome'),
      expect.stringContaining('Glossário.termo'),
    ]);
    expect(dialog.querySelector('.picker-foot')).toBeNull();
    // The tabs by accepted tag stay as in the field (All, the tag and Free).
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All', 'data-field', 'Free']);
  });

  it('choosing writes the reference in the cell, closes the picker and returns focus to the cell', async () => {
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
    expect(cellButton().closest('.tooltip-anchor')?.textContent).toContain(
      '→ Cliente.nome',
    );
    expect(document.activeElement).toBe(cellButton());
  });

  it('keyboard: Ctrl+B opens, the search filters, Enter chooses; the current one comes marked on reopening', async () => {
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
    expect(current.textContent).toContain('current');
  });

  it('Esc closes the picker without changing anything', async () => {
    const { harness, user } = setup(build());
    await user.click(cellButton());
    const dialog = await screen.findByRole('dialog');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cellValue(harness)).toBeNull();
    expect(document.activeElement).toBe(cellButton());
  });

  it('Clear removes the reference from the cell', async () => {
    const { harness, user } = setup(
      setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1),
    );
    expect(cellButton().textContent).toContain('Cliente.cpf');
    await user.click(screen.getByRole('button', { name: 'Clear (Alvo (Row 1))' }));
    expect(cellValue(harness)).toBeNull();
    expect(cellButton().textContent).toContain('Choose…');
  });

  it('Ctrl+click goes to the target, without opening the picker', async () => {
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

  it('a target that no longer exists shows as a broken reference, with the reason in the hint', () => {
    const linked = setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1);
    setup(removeTableRow(linked, 'AM', 'campos', 'R1'));
    expect(cellButton().textContent).toContain('(broken reference)');
    expect(cellButton().getAttribute('aria-label')).toBe(
      'Broken reference: Alvo (Row 1)',
    );
    expect(cellButton().className).toContain('is-broken');
  });

  it('filled cell: the name starts with the target and ends in the field with the row', () => {
    setup(setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1));
    const name = cellButton().getAttribute('aria-label') ?? '';
    expect(name).toMatch(/: Alvo \(Row 1\)$/);
    expect(name.startsWith(cellButton().textContent?.trim() ?? '?')).toBe(true);
  });

  it('read-only: the cell and Clear are disabled', () => {
    setup(setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1), true);
    expect(cellButton()).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Clear (Alvo (Row 1))' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('an empty required column shows as invalid', () => {
    setup(build());
    expect(cellButton().getAttribute('aria-invalid')).toBe('true');
  });

  it('the other columns of the row keep the simple editor', async () => {
    const { harness, user } = setup(build());
    const note = screen.getByLabelText('nota (Row 1)');
    await user.type(note, 'first{Enter}');
    const rows = annotationOf(harness.project(), 'AL').values?.alvos as Record<
      string,
      unknown
    >[];
    expect(rows[0]?.nota).toBe('first');
  });
});
