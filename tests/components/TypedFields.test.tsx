import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFieldValue, typeOfAnnotation, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { MULTILINE_MIN_LENGTH } from '../../src/ui/FieldEditors';
import { TypedField } from '../../src/ui/TypedFields';
// pt-BR kept: shared fixture data (cadastroProject: estilo, tipo, dado, atributos, exemplo, texto, Cadastrar) asserted by tests/model, tests/mcp and tests/examples
import { cadastroProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

/** Renders a field (`fieldKey`) of the typed annotation `annotationId`. */
function setup(
  annotationId: string,
  fieldKey: string,
  project: Project = cadastroProject(),
) {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
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
        onGoToAnnotation={onGoToAnnotation}
      />
    );
  });
  return { harness, onGoToAnnotation, user: userEvent.setup() };
}

const valueOf = (h: { project(): Project }, id: string, key: string) =>
  annotationOf(h.project(), id).values?.[key];

describe('TypedFields — simple fields', () => {
  it('number: accepts a decimal comma and rejects text', async () => {
    const { harness, user } = setup('AII', 'maxLength');
    const before = valueOf(harness, 'AII', 'maxLength');
    const input = screen.getByLabelText('maxLength');
    await user.type(input, 'abc{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('number');
    expect(valueOf(harness, 'AII', 'maxLength')).toEqual(before);

    await user.clear(input);
    await user.type(input, '12,5{Enter}');
    expect(valueOf(harness, 'AII', 'maxLength')).toBe(12.5);
  });

  it('options (few): segmented buttons; tapping the chosen one again clears it', async () => {
    const { harness, user } = setup('AB', 'estilo');
    const group = screen.getByRole('group', { name: 'estilo' });
    const secondary = within(group).getByRole('button', { name: 'secondary' });
    await user.click(secondary);
    expect(valueOf(harness, 'AB', 'estilo')).toBe('secondary');
    expect(secondary.getAttribute('aria-pressed')).toBe('true');
    await user.click(secondary);
    expect(valueOf(harness, 'AB', 'estilo')).toBeNull();
  });

  it('options (many): selection list', async () => {
    const { harness, user } = setup('AIE', 'tipo');
    const select = screen.getByLabelText('tipo');
    expect(select).toHaveProperty('value', 'email');
    await user.selectOptions(select, 'phone');
    expect(valueOf(harness, 'AIE', 'tipo')).toBe('phone');
  });
});

describe('TypedFields — reference (ref)', () => {
  /** Button of the `dado` field (the accessible name ends in the field label). */
  const field = () => screen.getByRole('button', { name: /: dado$/ });

  // SN2 (WCAG 2.5.3): the accessible name starts with the text the button shows.
  it('accessible name: target value and layer first, field last; empty and broken', async () => {
    const { user } = setup('AIN', 'dado');
    expect(field().getAttribute('aria-label')).toMatch(/^User\.name .+: dado$/);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'Choose: dado' })).toBeTruthy();
  });

  it('shows the current target and the buttons', () => {
    setup('AIN', 'dado');
    expect(field().textContent).toContain('User.name');
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByRole('button', { name: 'Go to target' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  // Stage 6 (6.4), finding 6: the truncated value ("→ User.no…") stays whole in the hint.
  it('the reference value goes whole in the tooltip (the field truncates the text)', () => {
    setup('AIN', 'dado');
    expect(field().closest('.tooltip-anchor')?.textContent).toContain('→ User.name');
  });

  it('Go to target navigates to the pointed annotation', async () => {
    const { onGoToAnnotation, user } = setup('AIN', 'dado');
    await user.click(screen.getByRole('button', { name: 'Go to target' }));
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AU' });
  });

  it('Ctrl+click on the field goes to the target, without opening the picker', async () => {
    const { onGoToAnnotation, user } = setup('AIN', 'dado');
    await user.keyboard('{Control>}');
    await user.click(field());
    await user.keyboard('{/Control}');
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AU' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Clear removes the reference', async () => {
    const { harness, user } = setup('AIN', 'dado');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(valueOf(harness, 'AIN', 'dado')).toBeNull();
    expect(field().textContent).toContain('Choose…');
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('the picker lists only the accepted targets (free tuple and type row with the tag)', async () => {
    const { user } = setup('AIN', 'dado');
    await user.click(field());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Choose the target of "dado"')).toBeTruthy();
    const options = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent ?? '');
    // Free tuples of User and the `email` row of the Contato class.
    expect(options.join('|')).toContain('age');
    expect(options.join('|')).toContain('email');
    // No fields that do not accept a reference (the `id` of the input itself).
    expect(options.join('|')).not.toContain('input_nome');
    // The current target comes marked and is the active one on opening.
    const active = within(dialog).getByRole('option', { selected: true });
    expect(active.textContent).toContain('User.name');
    expect(active.textContent).toContain('current');
  });

  it('tabs by accepted tag (P5): All, the tag and Free', async () => {
    const { user } = setup('AIN', 'dado');
    await user.click(field());
    const dialog = await screen.findByRole('dialog');
    const labels = within(dialog)
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    expect(labels).toEqual(['All', 'data-field', 'Free']);
    await user.click(within(dialog).getByRole('tab', { name: 'data-field' }));
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringContaining('Contato.email')]);
    await user.click(within(dialog).getByRole('tab', { name: 'Free' }));
    const free = within(dialog).getAllByRole('option');
    expect(free.every((o) => o.textContent?.includes('User.'))).toBe(true);
  });

  it('choosing in the picker writes the reference and closes the picker', async () => {
    const { harness, user } = setup('AIN', 'dado');
    await user.click(field());
    const dialog = await screen.findByRole('dialog');
    const age = within(dialog)
      .getAllByRole('option')
      .find((o) => o.textContent?.includes('age'));
    if (!age) throw new Error('target age not listed');
    await user.click(age);
    expect(valueOf(harness, 'AIN', 'dado')).toEqual({
      annotationId: 'AU',
      entryId: 'EA',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keyboard: ↓ and Enter choose; focus returns to the field', async () => {
    const { harness, user } = setup('AIN', 'dado');
    await user.click(field());
    await screen.findByRole('dialog');
    // Opens on the current one (User.name); ↓ goes to User.age.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(valueOf(harness, 'AIN', 'dado')).toEqual({
      annotationId: 'AU',
      entryId: 'EA',
    });
    expect(document.activeElement).toBe(field());
  });

  it('Ctrl+Enter chooses and goes to the target', async () => {
    const { harness, onGoToAnnotation, user } = setup('AIN', 'dado');
    await user.click(field());
    await screen.findByRole('dialog');
    await user.type(screen.getByRole('combobox'), 'email');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(valueOf(harness, 'AIN', 'dado')).toMatchObject({ annotationId: 'AC' });
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AC' });
  });

  it('Ctrl+B on the field opens the picker; Esc closes and returns the focus', async () => {
    const { user } = setup('AIN', 'dado');
    field().focus();
    await user.keyboard('{Control>}b{/Control}');
    const dialog = await screen.findByRole('dialog');
    expect(document.activeElement).toBe(within(dialog).getByRole('combobox'));
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(field());
  });

  // Stage 7 (7.1), O2: the arrow icon already marks the reference; the text does not repeat "→".
  it('the reference value shows a single arrow (the icon)', () => {
    setup('AIN', 'dado');
    expect(field().querySelector('.ref-control-text')?.textContent).toBe('User.name');
    expect(field().querySelectorAll('svg')).toHaveLength(1);
  });

  // Stage 7 (7.1), finding A1: with the modal picker open, the rest of the page is inert;
  // focusing the field before the picker closes does not help and the focus fell on the body.
  describe('with the modal picker (browser inertness)', () => {
    it('Enter chooses the target and the focus returns to the dado field', async () => {
      const { harness, user } = setup('AIN', 'dado');
      await user.click(field());
      await screen.findByRole('dialog');
      await user.keyboard('{ArrowDown}{Enter}');
      expect(valueOf(harness, 'AIN', 'dado')).toEqual({
        annotationId: 'AU',
        entryId: 'EA',
      });
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(field());
    });

    it('Esc closes and the focus returns to the dado field', async () => {
      const { user } = setup('AIN', 'dado');
      field().focus();
      await user.keyboard('{Control>}b{/Control}');
      const dialog = await screen.findByRole('dialog');
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(field());
    });
  });

  it('the search filters the targets and highlights the match', async () => {
    const { user } = setup('AIN', 'dado');
    await user.click(field());
    const dialog = await screen.findByRole('dialog');
    const search = within(dialog).getByRole('combobox');
    await user.type(search, 'zzz');
    expect(within(dialog).getByText('No target matches the search.')).toBeTruthy();
    await user.clear(search);
    await user.type(search, 'email');
    const shown = within(dialog).getAllByRole('option');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((o) => /email/i.test(o.textContent ?? ''))).toBe(true);
    expect(dialog.querySelector('mark')?.textContent).toBe('email');
  });

  it('a reference to a target that no longer exists shows as broken', () => {
    const base = cadastroProject();
    const broken: Project = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'AIN'
          ? { ...a, values: { ...a.values, dado: { annotationId: 'AU', entryId: 'X' } } }
          : a,
      ),
    };
    setup('AIN', 'dado', broken);
    expect(
      screen.getByRole('button', { name: 'Broken reference: dado' }).textContent,
    ).toContain('(broken reference)');
    expect(screen.getByRole('button', { name: 'Go to target' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('TypedFields — table', () => {
  it('shows the rows and allows editing a cell', async () => {
    const { harness, user } = setup('AC', 'atributos');
    expect(screen.getByText('email')).toBeTruthy(); // row name (rowLabel)
    const cell = screen.getByLabelText('exemplo (email)');
    await user.clear(cell);
    await user.type(cell, 'new@example.com{Enter}');
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect(JSON.stringify(rows)).toContain('new@example.com');
  });

  it('adds and reorders rows', async () => {
    const { harness, user } = setup('AC', 'atributos');
    await user.click(screen.getByRole('button', { name: '+ Row' }));
    const count = () => {
      const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
      return Array.isArray(rows) ? rows.length : 0;
    };
    expect(count()).toBe(2);
    await user.click(screen.getAllByRole('button', { name: /^Actions for row/ })[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Move row down' }));
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect((rows as { _id: string }[]).map((r) => r._id)[1]).toBe('R1');
  });

  it('removing a row that is a reference target asks for confirmation', async () => {
    const { harness, user } = setup('AC', 'atributos');
    await user.click(screen.getByRole('button', { name: 'Actions for row email' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove row' }));
    // Stage 8 (8.3), F10: destructive confirmation, announced as an alert.
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('References will break')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect(Array.isArray(rows) ? rows.length : 0).toBe(0);
  });

  // Stage 7 (7.1), finding A3: the cell truncates the text ("ana@exe"); the whole value goes in the hint.
  it('cells and text fields carry the whole value in the title', () => {
    setup('AC', 'atributos');
    expect(screen.getByLabelText('exemplo (email)').title).toBe('ana@exemplo.com');
    expect(screen.getByLabelText('nome (email)').title).toBe('email');
  });

  // Stage 7 (7.1), finding A1: the deleted row took the button that opened the dialog with it.
  // Stage 8 (8.3), F1: this was the flake ("no rows, goes to the table"). Runs 20 times per
  // round (`repeats`), and the wait below is deliberately only "the <dialog> is in the DOM", the
  // condition in which the click arrived before the dialog opened.
  describe('focus after Delete in "References will break"', { repeats: 19 }, () => {
    async function removeEmail(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Actions for row email' }));
      await user.click(screen.getByRole('menuitem', { name: 'Remove row' }));
      const dialog = await vi.waitFor(() => {
        const el = document.querySelector('dialog');
        if (!el) throw new Error('the dialog has not opened yet');
        return el;
      });
      await user.click(
        within(dialog).getByRole('button', { name: 'Delete', hidden: true }),
      );
      await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    }

    it('goes to the actions button of the row that stayed in place', async () => {
      const { user } = setup('AC', 'atributos');
      await user.click(screen.getByRole('button', { name: '+ Row' }));
      // The new row takes the focus in the next frame.
      await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('INPUT'));
      await removeEmail(user);
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /^Actions for row/ }),
      );
    });

    it('no rows, goes to the table (the + Row button)', async () => {
      const { user } = setup('AC', 'atributos');
      await removeEmail(user);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Row' }));
    });

    it('Cancel returns to the actions button of the row itself', async () => {
      const { user } = setup('AC', 'atributos');
      await user.click(screen.getByRole('button', { name: 'Actions for row email' }));
      await user.click(screen.getByRole('menuitem', { name: 'Remove row' }));
      const dialog = await vi.waitFor(() => {
        const el = document.querySelector('dialog');
        if (!el) throw new Error('the dialog has not opened yet');
        return el;
      });
      await user.click(
        within(dialog).getByRole('button', { name: 'Cancel', hidden: true }),
      );
      await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Actions for row email' }),
      );
    });
  });

  it('shows who references the row', () => {
    setup('AC', 'atributos');
    expect(screen.getByRole('button', { name: /^← Input input_email/ })).toBeTruthy();
  });
});

describe('TypedFields: text field (StringEditor)', () => {
  const LONG = 'x'.repeat(MULTILINE_MIN_LENGTH + 1);
  const withText = (text: string | null): Project => {
    const base = cadastroProject();
    const p = setFieldValue(base, 'AB', 'texto', text);
    return p;
  };

  it('short text: single-line field', () => {
    setup('AB', 'texto');
    const field = screen.getByLabelText('texto');
    expect(field.tagName).toBe('INPUT');
  });

  it('text with a line break: multi-line editor', () => {
    setup('AB', 'texto', withText('one\ntwo'));
    const field = screen.getByLabelText('texto');
    expect(field.tagName).toBe('TEXTAREA');
    expect((field as HTMLTextAreaElement).value).toBe('one\ntwo');
  });

  it('text with more than 60 characters: multi-line editor; with exactly 60, single line', () => {
    setup('AB', 'texto', withText(LONG));
    expect(screen.getByLabelText('texto').tagName).toBe('TEXTAREA');
    cleanup();
    setup('AB', 'texto', withText('x'.repeat(MULTILINE_MIN_LENGTH)));
    expect(screen.getByLabelText('texto').tagName).toBe('INPUT');
  });

  it('Shift+Enter switches to multi-line, with the typed text plus the break, focus and cursor at the end', async () => {
    const { harness, user } = setup('AB', 'texto');
    const input = screen.getByLabelText('texto');
    await user.clear(input);
    await user.type(input, 'abc');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('abc\n');
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(4);
    // Nothing has been saved yet: leaving the field saves.
    expect(valueOf(harness, 'AB', 'texto')).toBe('Cadastrar');
    await user.type(area, 'def');
    await user.tab();
    expect(valueOf(harness, 'AB', 'texto')).toBe('abc\ndef');
  });

  it('A plain Enter still saves in the single-line field', async () => {
    const { harness, user } = setup('AB', 'texto');
    const input = screen.getByLabelText('texto');
    await user.clear(input);
    await user.type(input, 'new{Enter}');
    expect(valueOf(harness, 'AB', 'texto')).toBe('new');
    expect(screen.getByLabelText('texto').tagName).toBe('INPUT');
  });

  it('Enter that saves a long value in the single-line field moves the focus to the TEXTAREA, with the cursor at the end', async () => {
    const { harness, user } = setup('AB', 'texto');
    const input = screen.getByLabelText('texto');
    await user.clear(input);
    await user.type(input, `${LONG}{Enter}`);
    expect(valueOf(harness, 'AB', 'texto')).toBe(LONG);
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(LONG.length);
  });

  it('long→empty and short→short keep the focus in the single-line field', async () => {
    const { user } = setup('AB', 'texto');
    const input = screen.getByLabelText('texto');
    await user.clear(input);
    await user.type(input, 'new{Enter}');
    expect(document.activeElement).toBe(screen.getByLabelText('texto'));
    await user.clear(screen.getByLabelText('texto'));
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByLabelText('texto'));
  });

  it('Enter saves the long text without a break, without needing blur, and the focus stays in the field', async () => {
    const { harness, user } = setup('AB', 'texto', withText(LONG));
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    await user.clear(area);
    await user.type(area, `${LONG}y{Enter}`);
    expect(valueOf(harness, 'AB', 'texto')).toBe(`${LONG}y`);
    const after = screen.getByLabelText('texto') as HTMLTextAreaElement;
    expect(after.value).toBe(`${LONG}y`);
    expect(document.activeElement).toBe(after);
  });

  it('Enter that saves a short value moves the focus to the single-line field, with the cursor at the end', async () => {
    const { harness, user } = setup('AB', 'texto', withText(LONG));
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    await user.clear(area);
    await user.type(area, 'short{Enter}');
    expect(valueOf(harness, 'AB', 'texto')).toBe('short');
    const input = screen.getByLabelText('texto') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(5);
  });

  it('Shift+Enter in the multi-line editor breaks the line and does not save', async () => {
    const { harness, user } = setup('AB', 'texto', withText(LONG));
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    await user.click(area);
    await user.keyboard('{Control>}{End}{/Control}{Shift>}{Enter}{/Shift}');
    expect(area.value).toBe(`${LONG}\n`);
    expect(valueOf(harness, 'AB', 'texto')).toBe(LONG);
  });

  it('with a break in the text, Enter breaks the line and blur saves (the trailing break is dropped)', async () => {
    const { harness, user } = setup('AB', 'texto', withText('a\nb'));
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    await user.click(area);
    await user.keyboard('{Control>}{End}{/Control}{Enter}');
    expect(area.value).toBe('a\nb\n');
    expect(valueOf(harness, 'AB', 'texto')).toBe('a\nb');
    await user.tab();
    expect(valueOf(harness, 'AB', 'texto')).toBe('a\nb');
  });

  it('during IME composition Enter does not save', async () => {
    const { harness } = setup('AB', 'texto', withText(LONG));
    const area = screen.getByLabelText('texto') as HTMLTextAreaElement;
    area.focus();
    fireEvent.keyDown(area, { key: 'Enter', isComposing: true });
    expect(valueOf(harness, 'AB', 'texto')).toBe(LONG);
  });

  it('the trailing line break is not saved (extra Enter, text that already has a break)', async () => {
    const { harness, user } = setup('AB', 'texto', withText(`${LONG}\nend`));
    const area = screen.getByLabelText('texto');
    await user.click(area);
    await user.keyboard('{Control>}{End}{/Control}{Enter}');
    expect((area as HTMLTextAreaElement).value).toBe(`${LONG}\nend\n`);
    await user.tab();
    expect(valueOf(harness, 'AB', 'texto')).toBe(`${LONG}\nend`);
  });

  it('only line breaks save null; the middle ones stay', async () => {
    const { harness, user } = setup('AB', 'texto', withText('a\nb'));
    const area = screen.getByLabelText('texto');
    await user.clear(area);
    await user.type(area, '{Enter}{Enter}');
    await user.tab();
    expect(valueOf(harness, 'AB', 'texto')).toBeNull();
  });

  it('leaving the multi-line editor saves; empty saves null', async () => {
    const { harness, user } = setup('AB', 'texto', withText('a\nb'));
    const area = screen.getByLabelText('texto');
    await user.clear(area);
    await user.type(area, 'l1\nl2');
    await user.tab();
    expect(valueOf(harness, 'AB', 'texto')).toBe('l1\nl2');

    await user.clear(screen.getByLabelText('texto'));
    await user.tab();
    expect(valueOf(harness, 'AB', 'texto')).toBeNull();
  });
});
