import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFieldValue, typeOfAnnotation, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypedField } from '../../src/ui/TypedFields';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(text: string) {
  const project: Project = setFieldValue(cadastroProject(), 'AB', 'texto', text);
  const harness = createHarness(project);
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, 'AB');
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === 'texto',
    );
    if (!field) throw new Error('campo texto não existe');
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

const stored = (h: { project(): Project }) =>
  annotationOf(h.project(), 'AB').values?.texto;

describe('MultilineEditor — valor externo (#956)', () => {
  it('segue o valor do projeto mudado por fora e o blur não regrava o valor velho', async () => {
    const { harness, user } = setup('A\nB');
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    await user.click(area);
    expect(document.activeElement).toBe(area);

    act(() => {
      harness.actions.setFieldValue('AB', 'texto', 'C\nD');
    });
    expect((screen.getByLabelText('texto') as HTMLTextAreaElement).value).toBe('C\nD');

    const set = vi.spyOn(harness.actions, 'setFieldValue');
    await user.tab();
    expect(set).not.toHaveBeenCalled();
    expect(stored(harness)).toBe('C\nD');
  });

  it('blur sem edição não grava nada', async () => {
    const { harness, user } = setup('A\nB');
    const set = vi.spyOn(harness.actions, 'setFieldValue');
    await user.click(screen.getByLabelText('texto'));
    await user.tab();
    expect(set).not.toHaveBeenCalled();
    expect(stored(harness)).toBe('A\nB');
  });
});

describe('MultilineEditor — foco só ao montar (#955)', () => {
  it('Shift+Enter: o cursor fica depois do caractere digitado no meio e o foco não volta', async () => {
    const { user } = setup('abc');
    const input = screen.getByLabelText('texto');
    await user.click(input);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    area.setSelectionRange(2, 2);
    await user.keyboard('X');
    expect(area.value).toContain('X');
    expect(area.selectionStart).toBe(area.value.indexOf('X') + 1);
    expect(area.selectionStart).not.toBe(area.value.length);

    // Sair do campo: renderizar de novo não devolve o foco.
    area.blur();
    fireEvent.input(area, { target: { value: `${area.value}Y` } });
    expect(document.activeElement).not.toBe(area);
  });
});
