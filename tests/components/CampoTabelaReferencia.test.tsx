// CR da interface (#954, fase 3): defeitos do seletor de referência (33, 34) e da confirmação
// de apagar linha da tabela (39).
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
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(project: Project, annotationId: string, fieldKey: string) {
  const harness = createHarness(project);
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, annotationId);
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === fieldKey,
    );
    if (!field) throw new Error(`campo ${fieldKey} não existe`);
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

const alvosRows = (h: { project(): Project }) =>
  annotationOf(h.project(), 'AL').values?.alvos as Record<string, unknown>[];

describe('RefPicker', () => {
  it('33: o <mark> cobre o trecho certo quando o minúsculo muda o tamanho do texto ("İ")', async () => {
    const project = setTableCell(build(), 'AM', 'campos', 'R1', 'nome', 'İstanbul');
    const { user } = setup(project, 'AL', 'alvos');
    await user.click(screen.getByRole('button', { name: /: Alvo \(Linha 1\)$/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('combobox'), 'stan');
    const marks = [...dialog.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['stan']);
  });

  it('34: Alt+Enter no seletor só escolhe o alvo e não acrescenta linha à tabela', async () => {
    const { harness, user } = setup(build(), 'AL', 'alvos');
    expect(alvosRows(harness)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /: Alvo \(Linha 1\)$/ }));
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('combobox').focus();
    await user.keyboard('{Alt>}{Enter}{/Alt}');
    expect(alvosRows(harness)[0]?.alvo).not.toBeNull();
    expect(alvosRows(harness)).toHaveLength(1);
  });

  it('34: Enter no seletor não sobe ao campo da tabela', async () => {
    const { harness, user } = setup(build(), 'AL', 'alvos');
    await user.click(screen.getByRole('button', { name: /: Alvo \(Linha 1\)$/ }));
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('combobox').focus();
    await user.keyboard('{Enter}');
    expect(alvosRows(harness)).toHaveLength(1);
  });
});

describe('TableField: confirmação de apagar linha', () => {
  it('39: o nome da linha vem da linha atual (por _id), também depois de recarga externa', async () => {
    const linked = setTableCell(build(), 'AL', 'alvos', 'L1', 'alvo', R1);
    // Linha sem nome: o texto usa "Linha N".
    const { harness, user } = setup(linked, 'AM', 'campos');
    await user.click(screen.getByRole('button', { name: 'Ações da linha cpf' }));
    await user.click(await screen.findByRole('menuitem', { name: /Remover/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('A linha "cpf"');
    // Recarga externa com o diálogo aberto: a linha vira outro objeto, agora sem nome.
    act(() => {
      harness.actions.setTableCell('AM', 'campos', 'R1', 'nome', '');
    });
    expect(screen.getByRole('alertdialog').textContent).toContain('A linha "Linha 1"');
    expect(screen.getByRole('alertdialog').textContent).not.toContain('Linha 0');
  });
});
