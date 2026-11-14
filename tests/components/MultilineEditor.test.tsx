import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFieldValue, typeOfAnnotation, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypedField } from '../../src/ui/TypedFields';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
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
    if (!field) throw new Error('field texto does not exist');
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

describe('MultilineEditor — external value (#956)', () => {
  it('follows the project value changed from outside and the blur does not rewrite the old value', async () => {
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

  it('blur without editing saves nothing', async () => {
    const { harness, user } = setup('A\nB');
    const set = vi.spyOn(harness.actions, 'setFieldValue');
    await user.click(screen.getByLabelText('texto'));
    await user.tab();
    expect(set).not.toHaveBeenCalled();
    expect(stored(harness)).toBe('A\nB');
  });
});

describe('MultilineEditor — focus only on mount (#955)', () => {
  it('Shift+Enter: the cursor stays after the character typed in the middle and the focus does not come back', async () => {
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

    // Leaving the field: rendering again does not give the focus back.
    area.blur();
    fireEvent.input(area, { target: { value: `${area.value}Y` } });
    expect(document.activeElement).not.toBe(area);
  });
});

describe('MultilineEditor — Shift+Enter with unconfirmed text (CE4, #956)', () => {
  it('types in the single-line field, Shift+Enter and continues: both lines stay', async () => {
    const { user } = setup('');
    const input = screen.getByLabelText('texto');
    await user.click(input);
    await user.keyboard('Line 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    // Chrome fires the change of the input that left the DOM: the single-line field saves the text.
    act(() => {
      fireEvent.change(input);
    });
    await user.keyboard('Line 2');
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('Line 1\nLine 2');
  });
});
