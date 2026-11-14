// UI code review (#954, phase 3): defects of the reference picker (33, 34) and of the table row
// delete confirmation (39).
import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTableCell, typeOfAnnotation, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypedField } from '../../src/ui/TypedFields';
import { R1, build } from '../model/refColumnFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup(project: Project, annotationId: string, fieldKey: string) {
  const harness = createHarness(project);
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, annotationId);
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === fieldKey,
    );
    if (!field) throw new Error(`field ${fieldKey} does not exist`);
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        readOnly={false}
        onGoToAnnotation={vi.fn()}
      />
    );
  });
  return { harness, user: userEvent.setup() };
}

const targetRows = (h: { project(): Project }) =>
  annotationOf(h.project(), 'AL').values?.alvos as Record<string, unknown>[];

describe('RefPicker', () => {
  it('33: the <mark> covers the right span when lowercasing changes the text length ("İ")', async () => {
    const project = setTableCell(build(), 'AM', 'campos', 'R1', 'nome', 'İstanbul');
    const { user } = setup(project, 'AL', 'alvos');
    await user.click(screen.getByRole('button', { name: /: Alvo \(Row 1\)$/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('combobox'), 'stan');
    const marks = [...dialog.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['stan']);
  });

  it('34: Alt+Enter in the picker only chooses the target and does not add a row to the table', async () => {
    const { harness, user } = setup(build(), 'AL', 'alvos');
    expect(targetRows(harness)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /: Alvo \(Row 1\)$/ }));
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('combobox').focus();
    await user.keyboard('{Alt>}{Enter}{/Alt}');
    expect(targetRows(harness)[0]?.alvo).not.toBeNull();
    expect(targetRows(harness)).toHaveLength(1);
  });

  it('34: Enter in the picker does not bubble up to the table field', async () => {
    const { harness, user } = setup(build(), 'AL', 'alvos');
    await user.click(screen.getByRole('button', { name: /: Alvo \(Row 1\)$/ }));
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('combobox').focus();
    await user.keyboard('{Enter}');
    expect(targetRows(harness)).toHaveLength(1);
  });
});

describe('TableField: row delete confirmation', () => {
  it('39: the row name comes from the current row (by _id), also after an external reload', async () => {
    const linked = setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1);
    // Row without a name: the text uses "Row N".
    const { harness, user } = setup(linked, 'AM', 'campos');
    await user.click(screen.getByRole('button', { name: 'Actions for row cpf' }));
    await user.click(await screen.findByRole('menuitem', { name: /Remove/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('The row "cpf"');
    // External reload with the dialog open: the row becomes another object, now without a name.
    act(() => {
      harness.actions.setTableCell('AM', 'campos', 'R1', 'nome', '');
    });
    expect(screen.getByRole('alertdialog').textContent).toContain('The row "Row 1"');
    expect(screen.getByRole('alertdialog').textContent).not.toContain('Row 0');
  });
});
