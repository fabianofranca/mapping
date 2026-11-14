import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { citationUrl, type CitationTarget, type ThreadAnchor } from '../../src/model';
import { composerOpen, insertCitation } from '../../src/store/composerBridge';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { CitationEditor } from '../../src/ui/comments/CitationEditor';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';
import {
  caretAtEnd,
  chipsOf,
  keyDown,
  pasteText,
  setCaret,
  typeIn,
} from './composerHelpers';
import { createHarness, type Harness } from './harness';

// The citation editor (Comments stage, CM5, decision 30): contenteditable with chips, the `@`
// that opens the picker, Enter that breaks the line and Ctrl+Enter that submits, paste as plain text.

const LABEL = 'Comment as Marina Alves';

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
  setIdentity('Marina Alves', 'marina@example.com');
});
afterEach(() => {
  cleanup();
  clearIdentity();
});

const urlOf = (h: Harness, target: CitationTarget): string => {
  const url = citationUrl(
    h.context.session.storage.folderName ?? 'project',
    h.project(),
    h.context.session.threads.list.value,
    target,
  );
  if (url === null) throw new Error('target without URL');
  return url;
};

interface HostProps {
  readonly initial?: string;
  readonly seen: string[];
  readonly onSubmit?: () => void;
  readonly anchor?: ThreadAnchor | null;
  readonly excludeThreadId?: string;
}

function Host({
  initial = '',
  seen,
  onSubmit,
  anchor = null,
  excludeThreadId,
}: HostProps) {
  const [value, setValue] = useState(initial);
  return (
    <CitationEditor
      label={LABEL}
      value={value}
      anchor={anchor}
      excludeThreadId={excludeThreadId}
      onInput={(next) => {
        seen.push(next);
        setValue(next);
      }}
      onSubmit={onSubmit}
    />
  );
}

function setup(props: Omit<HostProps, 'seen'> = {}, harness?: Harness) {
  const h = harness ?? createHarness(sampleProject());
  const seen: string[] = [];
  const view = render(
    <EditorContext.Provider value={h.context}>
      <Host {...props} seen={seen} />
    </EditorContext.Provider>,
  );
  const editor = screen.getByRole('textbox', { name: LABEL });
  return { h, seen, editor, view };
}

const last = (seen: string[]) => seen.at(-1);

describe('CitationEditor › the field', () => {
  it('is an editable multiline textbox, with an accessible name and the shortcut hint', () => {
    const { editor } = setup();
    expect(editor.tagName).toBe('DIV');
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(editor.getAttribute('aria-multiline')).toBe('true');
    // role=textbox does not allow aria-expanded/aria-haspopup; aria-controls only with the picker open.
    expect(editor.hasAttribute('aria-haspopup')).toBe(false);
    expect(editor.hasAttribute('aria-expanded')).toBe(false);
    expect(editor.hasAttribute('aria-controls')).toBe(false);
    expect(editor.hasAttribute('aria-activedescendant')).toBe(false);
    const hint = document.getElementById(editor.getAttribute('aria-describedby')!);
    expect(hint?.textContent).toBe(t('thread.editorHint'));
  });

  it('typing emits the markdown through onInput', () => {
    const { editor, seen } = setup();
    typeIn(editor, 'hello world');
    expect(last(seen)).toBe('hello world');
  });

  it('Enter breaks the line (one <br>) and does not submit; Ctrl+Enter and Cmd+Enter submit', () => {
    const onSubmit = vi.fn();
    const { editor, seen } = setup({ onSubmit });
    typeIn(editor, 'line 1');
    expect(keyDown(editor, 'Enter')).toBe(false);
    typeIn(editor, 'line 2');
    expect(last(seen)).toBe('line 1\nline 2');
    expect(editor.querySelectorAll('br:not([data-fill])')).toHaveLength(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(keyDown(editor, 'Enter', { ctrlKey: true })).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    keyDown(editor, 'Enter', { metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(last(seen)).toBe('line 1\nline 2');
  });

  it('the external value becomes the DOM, and changing it rebuilds (clear after submitting)', () => {
    const h = createHarness(sampleProject());
    const seen: string[] = [];
    function Controlled({ value }: { value: string }) {
      return (
        <CitationEditor
          label={LABEL}
          value={value}
          anchor={null}
          onInput={(v) => seen.push(v)}
        />
      );
    }
    const view = render(
      <EditorContext.Provider value={h.context}>
        <Controlled value={'a\nb'} />
      </EditorContext.Provider>,
    );
    const editor = screen.getByRole('textbox', { name: LABEL });
    expect(editor.textContent).toBe('ab');
    expect(editor.querySelectorAll('br')).toHaveLength(1);
    view.rerender(
      <EditorContext.Provider value={h.context}>
        <Controlled value="" />
      </EditorContext.Provider>,
    );
    expect(editor.childNodes.length).toBe(0);
    expect(seen).toEqual([]);
  });

  it('does not build anything through innerHTML (Trusted Types)', () => {
    const spy = vi.spyOn(Element.prototype, 'innerHTML', 'set');
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    setup({ initial: `hi [x](${url}) <b>no</b>` }, h);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('CitationEditor › chips', () => {
  it('a value with a citation becomes a chip with the live name; the saved value uses the live label', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    const { editor, seen } = setup({ initial: `see [old](${url}) already` }, h);
    const [chip] = chipsOf(editor);
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(chip?.textContent).toBe('Porta');
    expect(chip?.getAttribute('contenteditable')).toBe('false');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(chip?.getAttribute('aria-label')).toBe('Porta, citation');
    expect(chip?.dataset.url).toBe(url);
    // The old draft had the old label: it now saves the live one.
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(last(seen)).toBe(`see [Porta](${url}) already`);
  });

  it('renaming the target updates the chip and the value', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    const { editor, seen } = setup({ initial: `[Porta](${url})` }, h);
    expect(seen).toEqual([]);
    act(() => {
      h.actions.renameMarking('M1', 'Rear door');
    });
    expect(chipsOf(editor)[0]?.textContent).toBe('Rear door');
    expect(last(seen)).toBe(`[Rear door](${url})`);
  });

  it('deleted target: struck-through chip, with the fallback label and the tip', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M3' });
    act(() => {
      h.actions.removeMarking('M3');
    });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    const { editor, seen } = setup({ initial: `[Fechadura](${url})` }, h);
    const chip = chipsOf(editor)[0]!;
    expect(chip.classList.contains('citation-chip-broken')).toBe(true);
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(chip.textContent).toBe('Fechadura');
    expect(chip.getAttribute('title')).toBe(t('citation.missing'));
    expect(seen).toEqual([]);
  });

  it('Backspace right after the chip deletes the whole chip; Delete right before it too', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    const { editor, seen } = setup({ initial: `a [Porta](${url}) b` }, h);
    const chip = chipsOf(editor)[0]!;
    setCaret(editor, [...editor.childNodes].indexOf(chip) + 1);
    expect(keyDown(editor, 'Backspace')).toBe(false);
    expect(chipsOf(editor)).toHaveLength(0);
    expect(last(seen)).toBe('a  b');

    cleanup();
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    const second = setup({ initial: `a [Porta](${url}) b` }, h);
    const chip2 = chipsOf(second.editor)[0]!;
    setCaret(second.editor, [...second.editor.childNodes].indexOf(chip2));
    expect(keyDown(second.editor, 'Delete')).toBe(false);
    expect(chipsOf(second.editor)).toHaveLength(0);
    expect(last(second.seen)).toBe('a  b');
  });

  it('Backspace away from a chip belongs to the browser (not intercepted)', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    const { editor } = setup({ initial: `ab [Porta](${url})` }, h);
    setCaret(editor.firstChild!, 1);
    expect(keyDown(editor, 'Backspace')).toBe(true);
  });

  it('the arrows pass over the chip in one go', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    const { editor } = setup({ initial: `a[Porta](${url})b` }, h);
    const chip = chipsOf(editor)[0]!;
    const index = [...editor.childNodes].indexOf(chip);
    setCaret(editor.firstChild!, 1);
    expect(keyDown(editor, 'ArrowRight')).toBe(false);
    let range = window.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(editor);
    expect(range.startOffset).toBe(index + 1);
    expect(keyDown(editor, 'ArrowLeft')).toBe(false);
    range = window.getSelection()!.getRangeAt(0);
    expect(range.startOffset).toBe(index);
    // With Shift or away from the chip, the browser decides.
    expect(keyDown(editor, 'ArrowRight', { shiftKey: true })).toBe(true);
  });
});

describe('CitationEditor › paste', () => {
  it('a mapping:// URL that resolves becomes a chip with the live name; the rest stays plain text', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M2' });
    const { editor, seen } = setup({}, h);
    expect(pasteText(editor, `see ${url} and <b>x</b> mapping://p/m/zzzz`)).toBe(false);
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(chipsOf(editor)[0]?.textContent).toBe('Maçaneta');
    expect(editor.querySelector('b')).toBeNull();
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(last(seen)).toBe(`see [Maçaneta](${url}) and <b>x</b> mapping://p/m/zzzz`);
  });

  it('the pasted text goes at the cursor, in the middle of what was already there', () => {
    const { editor, seen } = setup();
    typeIn(editor, 'starts end');
    setCaret(editor.firstChild!, 7);
    pasteText(editor, 'MIDDLE ');
    expect(last(seen)).toBe('starts MIDDLE end');
  });
});

describe('CitationEditor › @', () => {
  const optionNames = () =>
    screen.queryAllByRole('option').map((o) => o.textContent ?? '');

  it('@ opens the picker with groups; the editor points to the active option', () => {
    const { editor } = setup();
    typeIn(editor, '@');
    const list = screen.getByRole('listbox', { name: t('citation.picker') });
    expect(editor.hasAttribute('aria-expanded')).toBe(false);
    expect(editor.getAttribute('aria-controls')).toBe(list.id);
    expect(document.getElementById(list.id)).toBe(list);
    const options = within(list).getAllByRole('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    expect(editor.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(within(list).getByText(t('citation.group.marking'))).toBeTruthy();
  });

  it('typing after the @ filters; ↑/↓ move the active option', () => {
    const { editor } = setup();
    typeIn(editor, '@');
    typeIn(editor, 'ma');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(optionNames().some((n) => n.startsWith('Maçaneta'))).toBe(true);
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(optionNames().some((n) => n.startsWith('Porta'))).toBe(false);
    typeIn(editor, 'x');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor.hasAttribute('aria-controls')).toBe(false);
  });

  it('↑ and ↓ cycle through the options', () => {
    const { editor } = setup();
    typeIn(editor, '@');
    const count = screen.getAllByRole('option').length;
    keyDown(editor, 'ArrowDown');
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
    keyDown(editor, 'ArrowUp');
    keyDown(editor, 'ArrowUp');
    expect(screen.getAllByRole('option')[count - 1]!.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('Enter replaces the @term with the chip, with a space, and the cursor stays after it', () => {
    const h = createHarness(sampleProject());
    const { editor, seen } = setup({}, h);
    typeIn(editor, 'see ');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    typeIn(editor, '@maç');
    expect(keyDown(editor, 'Enter')).toBe(false);
    const url = urlOf(h, { kind: 'marking', id: 'M2' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(last(seen)).toBe(`see [Maçaneta](${url}) `);
    expect(chipsOf(editor)).toHaveLength(1);
    expect(screen.queryByRole('listbox')).toBeNull();
    const range = window.getSelection()!.getRangeAt(0);
    expect(range.collapsed).toBe(true);
    expect(range.startContainer.textContent).toBe(' ');
    typeIn(editor, 'ok');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(last(seen)).toBe(`see [Maçaneta](${url}) ok`);
  });

  it('clicking an option also chooses', () => {
    const h = createHarness(sampleProject());
    const { editor, seen } = setup({}, h);
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    typeIn(editor, '@fech');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    fireEvent.click(screen.getByRole('option', { name: /Fechadura/ }));
    expect(last(seen)).toContain(
      // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
      `[Fechadura](${urlOf(h, { kind: 'marking', id: 'M3' })})`,
    );
  });

  it('Esc closes without choosing and does not reopen on the same @; a new @ opens', () => {
    const { editor, seen } = setup();
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    typeIn(editor, '@po');
    keyDown(editor, 'Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    typeIn(editor, 'r');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(last(seen)).toBe('@por');
    typeIn(editor, ' @');
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('without the picker open, Enter breaks the line', () => {
    const { editor, seen } = setup();
    typeIn(editor, '@zzzzzz');
    expect(screen.queryByRole('listbox')).toBeNull();
    keyDown(editor, 'Enter');
    expect(last(seen)).toBe('@zzzzzz\n');
  });

  it('@ in the middle of a word (e-mail) does not open the picker', () => {
    const { editor } = setup();
    typeIn(editor, 'a@b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('the "here" group comes first, with the label and the path', () => {
    const { editor } = setup({ anchor: { kind: 'marking', id: 'M1' } });
    typeIn(editor, '@');
    const options = screen.getAllByRole('option');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(options[0]!.textContent).toContain('tipo');
    const groups = [...document.querySelectorAll('.cite-picker-group')].map(
      (g) => g.textContent,
    );
    expect(groups[0]).toBe(t('citation.group.here'));
    expect(groups.slice(1)).toContain(t('citation.group.marking'));
    expect(options[0]!.querySelector('.suggestion-detail')?.textContent).toContain(
      // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
      'Amassado',
    );
  });

  it('the thread itself does not appear (excludeThreadId); the others do', async () => {
    const h = createHarness(sampleProject());
    for (const id of ['cx1', 'cx2']) {
      await h.context.session.threads.create(
        sampleThread({
          id,
          messages: [
            {
              id: `${id}m`,
              author: { kind: 'human', name: 'M', email: 'm@x.com' },
              at: '2026-09-01T10:00:00.000Z',
              text: `Subject ${id}`,
              proposal: null,
            },
          ],
        }),
      );
    }
    const { editor } = setup({ excludeThreadId: 'cx1' }, h);
    typeIn(editor, '@subject');
    const names = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(names.some((n) => n.startsWith('Subject cx2'))).toBe(true);
    expect(names.some((n) => n.startsWith('Subject cx1'))).toBe(false);
  });
});

describe('CitationEditor › composer bridge', () => {
  it('registers itself while mounted; inserts the chip at the end if it has no focus', () => {
    const h = createHarness(sampleProject());
    const { editor, seen, view } = setup({ initial: 'hi' }, h);
    expect(composerOpen.value).toBe(true);
    expect(insertCitation({ kind: 'marking', id: 'M1' })).toBe(true);
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(last(seen)).toBe(`hi [Porta](${url}) `);
    expect(chipsOf(editor)).toHaveLength(1);
    view.unmount();
    expect(composerOpen.value).toBe(false);
    expect(insertCitation({ kind: 'marking', id: 'M1' })).toBe(false);
  });

  it('with focus in the field, inserts at the cursor', () => {
    const h = createHarness(sampleProject());
    const { editor, seen } = setup({ initial: 'starts end' }, h);
    editor.focus();
    setCaret(editor.firstChild!, 6);
    insertCitation({ kind: 'marking', id: 'M2' });
    const url = urlOf(h, { kind: 'marking', id: 'M2' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(last(seen)).toBe(`starts [Maçaneta](${url}) end`);
  });

  it('a target that does not exist inserts nothing', () => {
    const { editor, seen } = setup();
    insertCitation({ kind: 'marking', id: 'nothing' });
    expect(seen).toEqual([]);
    expect(editor.childNodes.length).toBe(0);
    caretAtEnd(editor);
  });
});
