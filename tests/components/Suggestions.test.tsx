// Suggestions in the text field (SG1, decision 3): the TextField combobox in commit mode and the
// three surfaces that wire it (Details field, table cell, Catalog form).
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecField } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TextField } from '../../src/ui/controls/TextField';
import { SimpleEditor, StringEditor } from '../../src/ui/FieldEditors';
import { TableEditor } from '../../src/ui/TableField';
import { TypedForm } from '../../src/ui/TypedForm';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const LIST = ['String', 'Int', 'MutableList', 'List', 'Unit'];

function setup(
  props: {
    value?: string;
    readOnly?: boolean;
    disabled?: boolean;
    suggestions?: string[];
  } = {},
) {
  const onCommit = vi.fn(() => true);
  render(
    <>
      <TextField
        aria-label="type"
        value={props.value ?? ''}
        readOnly={props.readOnly}
        disabled={props.disabled}
        suggestions={'suggestions' in props ? props.suggestions : LIST}
        onCommit={onCommit}
      />
      <button type="button">after</button>
    </>,
  );
  const input = screen.getByLabelText<HTMLInputElement>('type');
  return { input, onCommit, user: userEvent.setup() };
}

function render2(suggestions: string[]) {
  const onCommit = vi.fn(() => true);
  render(
    <TextField
      aria-label="type"
      value=""
      suggestions={suggestions}
      onCommit={onCommit}
    />,
  );
  return {
    input: screen.getByLabelText<HTMLInputElement>('type'),
    onCommit,
    user: userEvent.setup(),
  };
}

const options = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('TextField with suggestions', () => {
  it('typing a word with a match opens the filtered list, with combobox ARIA', async () => {
    const { input, user } = setup();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await user.type(input, 'li');
    expect(options()).toEqual(['List', 'MutableList']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('listbox', { name: 'Suggestions' });
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(screen.getAllByRole('option').every((o) => o.id !== '')).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('with no match the list stays closed', async () => {
    const { user, input } = setup();
    await user.type(input, 'zzz');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('↓/↑ navigate (aria-activedescendant/aria-selected) and Enter chooses without saving', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'List<Mu');
    expect(options()).toEqual(['MutableList']);
    await user.keyboard('{ArrowDown}');
    const option = screen.getByRole('option');
    expect(option.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id);
    await user.keyboard('{Enter}');
    expect(input.value).toBe('List<MutableList');
    expect(input.selectionStart).toBe('List<MutableList'.length);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
    // The next confirmation saves the chosen text.
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('List<MutableList');
  });

  it('navigates with ↑ and ↓ between the items', async () => {
    const { input, user } = setup();
    await user.type(input, 'li');
    // Opens with the first item active.
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    expect(input.value).toBe('MutableList');
  });

  it('replaces only the word under the cursor, keeping the rest of the text', async () => {
    const { input, user } = setup({ value: 'Map<Str, Int>' });
    input.focus();
    input.setSelectionRange(7, 7);
    await user.keyboard('{ArrowDown}');
    expect(options()).toEqual(['String']);
    await user.keyboard('{Enter}');
    expect(input.value).toBe('Map<String, Int>');
    expect(input.selectionStart).toBe('Map<String'.length);
  });

  it('Enter with the list open chooses the first item and does not save', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'Str');
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Enter}');
    expect(input.value).toBe('String');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('String');
  });

  it('filtering resets the active one to the first item', async () => {
    const { input, user } = setup();
    await user.type(input, 'li{ArrowDown}');
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    await user.type(input, 's');
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('explicit opening (Ctrl+Space, ↓) shows the identical item that the automatic one closes', async () => {
    const { input, user } = setup({ value: 'String' });
    await user.click(input);
    await user.keyboard('{End}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Control>} {/Control}');
    expect(options()).toEqual(['String']);
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Escape}{ArrowDown}');
    expect(options()).toEqual(['String']);
  });

  it('Enter with the list closed saves as before', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'String?');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('String?');
  });

  it('the identical item stays when there are other matches: Enter chooses without changing the text', async () => {
    const { input, onCommit, user } = render2(['UInt', 'Int']);
    await user.type(input, 'Int');
    expect(options()).toEqual(['Int', 'UInt']);
    await user.keyboard('{Enter}');
    expect(input.value).toBe('Int');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('Int');
  });

  it('clicking an option chooses without taking the focus or saving', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'in');
    await user.click(screen.getByRole('option', { name: 'Int' }));
    expect(input.value).toBe('Int');
    expect(document.activeElement).toBe(input);
    expect(onCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith('Int');
  });

  it('Esc closes without changing anything and the next Esc reverts the text', async () => {
    const { input, user } = setup({ value: 'x<' });
    await user.click(input);
    await user.keyboard('{Escape}');
    await user.keyboard('li');
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('x<li');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('x<');
  });

  it('Esc with the list open does not bubble to the surroundings', async () => {
    const outer = vi.fn();
    const { user } = (() => {
      render(
        <div onKeyDown={outer}>
          <TextField
            aria-label="type"
            value=""
            suggestions={LIST}
            onCommit={() => true}
          />
        </div>,
      );
      return { user: userEvent.setup() };
    })();
    const input = screen.getByLabelText('type');
    await user.type(input, 'li');
    outer.mockClear();
    await user.keyboard('{Escape}');
    expect(outer).not.toHaveBeenCalled();
  });

  it('Tab closes and keeps the typed text, without accepting the suggestion', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'li');
    await user.keyboard('{ArrowDown}{Tab}');
    expect(screen.queryByRole('listbox')).toBeNull();
    // The typed text stays (and is what saves on leaving), not the active suggestion.
    expect(onCommit).toHaveBeenCalledWith('li');
  });

  it('clicking the empty field shows everything; Ctrl+Space opens with the current word', async () => {
    const { input, user } = setup();
    await user.click(input);
    expect(options()).toEqual(LIST);
    await user.keyboard('{Escape}');
    await user.keyboard('Un');
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>} {/Control}');
    expect(options()).toEqual(['Unit']);
  });

  it('the list closes when leaving the field', async () => {
    const { user, input } = setup();
    await user.type(input, 'li');
    await user.tab();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('read-only or disabled: no list and no combobox role', async () => {
    const a = setup({ readOnly: true, value: 'x' });
    await a.user.click(a.input);
    await a.user.keyboard('{ArrowDown}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(a.input.getAttribute('role')).toBeNull();
    cleanup();
    const b = setup({ disabled: true });
    await b.user.click(b.input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('without suggestions (absent or empty) the field is the usual one', async () => {
    for (const suggestions of [undefined, []]) {
      const { input, onCommit, user } = setup({ suggestions });
      expect(input.getAttribute('role')).toBeNull();
      await user.type(input, 'li{ArrowDown}');
      expect(screen.queryByRole('listbox')).toBeNull();
      await user.keyboard('{Enter}');
      expect(onCommit).toHaveBeenCalledWith('li');
      cleanup();
    }
  });

  it('accepts items with secondary text', async () => {
    render(
      <TextField
        aria-label="type"
        value=""
        suggestions={[{ label: 'User', detail: 'Class' }, 'Int']}
        onCommit={() => true}
      />,
    );
    await userEvent.setup().type(screen.getByLabelText('type'), 'use');
    expect(screen.getByRole('option').textContent).toBe('UserClass');
  });

  it('the draft typed after choosing is not lost on render', async () => {
    const { input, user } = setup();
    await user.type(input, 'li');
    fireEvent.mouseDown(screen.getByRole('option', { name: 'List' }));
    await user.click(screen.getByRole('option', { name: 'List' }));
    await user.type(input, '?');
    expect(input.value).toBe('List?');
  });
});

describe('suggestions on the editing surfaces', () => {
  const string: SpecField = {
    key: 'type',
    type: 'string',
    suggestions: ['String', 'Int'],
  };

  it('Details field (StringEditor) and simple editor', async () => {
    const onSet = vi.fn(() => ({ ok: true as const }));
    render(
      <StringEditor
        field={string as never}
        value=""
        label="Type"
        readOnly={false}
        onSet={onSet as never}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Type'), 'st');
    expect(options()).toEqual(['String']);
    await user.keyboard('{ArrowDown}{Enter}{Enter}');
    expect(onSet).toHaveBeenCalledWith('String');
    cleanup();
    render(
      <SimpleEditor
        field={string as never}
        value=""
        label="Type"
        readOnly
        onSet={onSet as never}
      />,
    );
    await user.click(screen.getByLabelText('Type'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('table cell', async () => {
    const onSetCell = vi.fn(() => ({ ok: true as const }));
    render(
      <TableEditor
        field={
          {
            key: 'props',
            type: 'table',
            rowLabel: 'name',
            columns: [
              { key: 'name', type: 'string' },
              { key: 'type', type: 'string', suggestions: ['String', 'Int'] },
            ],
          } as never
        }
        rows={[{ _id: 'r1', name: 'a', type: '' }]}
        readOnly={false}
        onAddRow={() => true}
        onSetCell={onSetCell as never}
        onMoveRow={() => undefined}
        onRemoveRow={() => undefined}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('combobox')[0] as HTMLElement);
    expect(options()).toEqual(['String', 'Int']);
    // The other string column, without suggestions, does not open a list.
    await user.keyboard('{Escape}');
    await user.click(screen.getAllByRole('textbox')[0] as HTMLElement);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Catalog form (field and table column)', async () => {
    const onChange = vi.fn();
    render(
      <TypedForm
        fields={[
          string,
          {
            key: 'items',
            type: 'table',
            rowLabel: 'name',
            columns: [{ key: 'name', type: 'string', suggestions: ['Alpha'] }],
          } as never,
        ]}
        values={{ items: [{ _id: 'r1', name: '' }] }}
        onChange={onChange}
        readOnly={false}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('type'), 'in');
    expect(options()).toEqual(['Int', 'String']);
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText(/^name/i));
    expect(options()).toEqual(['Alpha']);
  });
});
