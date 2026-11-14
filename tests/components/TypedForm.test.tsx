import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecField } from '../../src/model';
import { locale } from '../../src/store/settings';
import { MULTILINE_MIN_LENGTH } from '../../src/ui/FieldEditors';
import { TypedForm } from '../../src/ui/TypedForm';
import { descriptionOf } from './describedBy';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const fields: SpecField[] = [
  { key: 'name', type: 'string', required: true, description: 'Visible name' },
  { key: 'age', type: 'number' },
  { key: 'style', type: 'enum', options: ['a', 'b'] },
  { key: 'target', type: 'ref', accepts: {} } as SpecField,
  {
    key: 'items',
    type: 'table',
    rowLabel: 'name',
    columns: [{ key: 'name', type: 'string' }],
  },
];

function setup(values: Record<string, unknown> = {}, readOnly = false) {
  const onChange = vi.fn();
  render(
    <TypedForm fields={fields} values={values} onChange={onChange} readOnly={readOnly} />,
  );
  return { onChange, user: userEvent.setup() };
}

describe('TypedForm (without a project or EditorProvider)', () => {
  it('renders one control per field type', () => {
    setup();
    expect(screen.getByLabelText('name')).toBeTruthy();
    expect(screen.getByLabelText('age')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'style' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /target/ })).toBeTruthy();
    // The field description is an icon with a hint, not an always-visible text.
    expect(document.querySelector('.props-note')).toBeNull();
    const help = screen.getByRole('button', { name: 'About name' });
    expect(descriptionOf(help)).toBe('Visible name');
    expect(descriptionOf(screen.getByLabelText('name'))).toBe('Visible name');
    expect(screen.getByRole('button', { name: '+ Row' })).toBeTruthy();
  });

  it('text, number and option call onChange with key and value', async () => {
    const { onChange, user } = setup();
    await user.type(screen.getByLabelText('name'), 'Ann{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('name', 'Ann');
    await user.type(screen.getByLabelText('age'), '12,5{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('age', 12.5);
    await user.click(
      within(screen.getByRole('group', { name: 'style' })).getByRole('button', {
        name: 'b',
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith('style', 'b');
  });

  it('table: adds, edits and removes rows', async () => {
    const { onChange, user } = setup({
      items: [{ _id: 'r1', name: 'one' }],
    });
    await user.click(screen.getByRole('button', { name: '+ Row' }));
    const added = onChange.mock.calls.at(-1) as [string, { _id: string }[]];
    expect(added[0]).toBe('items');
    expect(added[1]).toHaveLength(2);
    expect(added[1][0]?._id).toBe('r1');

    const cell = screen.getByLabelText('name (one)');
    await user.clear(cell);
    await user.type(cell, 'two{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('items', [{ _id: 'r1', name: 'two' }]);

    await user.click(screen.getByRole('button', { name: /Actions for row/ }));
    await user.click(screen.getByRole('menuitem', { name: /Remove row/ }));
    expect(onChange).toHaveBeenLastCalledWith('items', []);
  });

  it('readOnly disables the controls and the reference is disabled', () => {
    setup({ items: [{ _id: 'r1', name: 'one' }] }, true);
    expect((screen.getByLabelText('name') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('age') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('name (one)') as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: /target/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('reference without a project: disabled even when editable', () => {
    setup();
    // SN2: the name starts with the visible text.
    const button = screen.getByRole('button', {
      name: 'Choose: target',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('project');
  });
});

describe('TypedForm: long text', () => {
  it('the table cell with long text stays on one line', () => {
    const long = 'y'.repeat(MULTILINE_MIN_LENGTH + 20);
    setup({ items: [{ _id: 'r1', name: long }] });
    expect(screen.getByLabelText(/^name \(/).tagName).toBe('INPUT');
  });
});

describe('TypedForm: ref column of a table (without a project)', () => {
  it('the ref cell shows the unavailable picker, and the other columns stay editable', async () => {
    const onChange = vi.fn();
    const withRef: SpecField[] = [
      {
        key: 'targets',
        label: 'Targets',
        type: 'table',
        columns: [
          { key: 'note', type: 'string' },
          { key: 'target', label: 'Target', type: 'ref', accepts: { free: true } },
        ],
      },
    ];
    render(<TypedForm fields={withRef} values={{}} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Row' }));
    expect(onChange).toHaveBeenLastCalledWith('targets', [
      expect.objectContaining({ note: null, target: null }),
    ]);
  });

  it('with the row in the table, the ref cell button is disabled and explains why', () => {
    const withRef: SpecField[] = [
      {
        key: 'targets',
        type: 'table',
        columns: [
          { key: 'target', label: 'Target', type: 'ref', accepts: { free: true } },
        ],
      },
    ];
    render(
      <TypedForm
        fields={withRef}
        values={{ targets: [{ _id: 'R1', target: null }] }}
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Choose: Target (Row 1)' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.title).toBe('Picking a reference only works inside a project.');
  });
});
