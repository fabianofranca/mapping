import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { openDialog, setupPages } from './pageUiHarness';

// Manage pages (stage #883, PG2, decision 9): create, rename, reorder (Move up/down) and delete.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const names = (h: Awaited<ReturnType<typeof setupPages>>['harness']) =>
  h.project().pages.map((p) => p.name);
const createField = () => screen.getByRole('textbox', { name: 'Name of the new page' });
const button = (name: string) => screen.getByRole('button', { name });

describe('ManagePagesDialog', () => {
  it('lists the pages in order, with the open one marked and the root counts', async () => {
    const { harness } = await setupPages(['Second']);
    await openDialog(harness, { kind: 'managePages' });
    const table = screen.getByRole('table', { name: 'Pages' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('Page 1')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('open')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('1 item')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('Second')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByText('open')).toBeNull();
    expect(within(rows[1] as HTMLElement).getByText('empty')).toBeTruthy();
  });

  it('opens with the create field focused', async () => {
    const { harness } = await setupPages(['Second']);
    await openDialog(harness, { kind: 'managePages', focus: { kind: 'create' } });
    expect(document.activeElement).toBe(createField());
  });

  it('creates a page at the end and clears the field', async () => {
    const { harness } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'managePages' });
    await user.type(createField(), '  Third ');
    await user.click(button('Create page'));
    expect(names(harness)).toEqual(['Page 1', 'Second', 'Third']);
    expect((createField() as HTMLInputElement).value).toBe('');
  });

  it('Enter in the field creates too', async () => {
    const { harness } = await setupPages([]);
    const user = await openDialog(harness, { kind: 'managePages' });
    await user.type(createField(), 'Other{Enter}');
    expect(names(harness)).toEqual(['Page 1', 'Other']);
  });

  it('refuses an empty and a repeated name with a message', async () => {
    const { harness } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'managePages' });
    await user.click(button('Create page'));
    expect(screen.getByRole('alert').textContent).toBe('Give the page a name.');
    await user.type(createField(), 'second');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(button('Create page'));
    expect(screen.getByRole('alert').textContent).toBe(
      'A page named “second” already exists.',
    );
    expect(names(harness)).toEqual(['Page 1', 'Second']);
  });

  it('renames a page; an invalid name shows the error and keeps editing', async () => {
    const { harness } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'managePages' });
    await user.click(button('Rename Second'));
    const field = screen.getByRole('textbox', { name: 'New name for Second' });
    await user.clear(field);
    await user.type(field, 'Page 1');
    await user.click(button('Save name'));
    expect(screen.getByRole('alert').textContent).toBe(
      'A page named “Page 1” already exists.',
    );
    expect(names(harness)).toEqual(['Page 1', 'Second']);
    await user.clear(field);
    await user.type(field, 'Renamed');
    await user.click(button('Save name'));
    expect(names(harness)).toEqual(['Page 1', 'Renamed']);
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
  });

  it('cancelling the rename changes nothing', async () => {
    const { harness } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'managePages' });
    await user.click(button('Rename Second'));
    await user.type(screen.getByRole('textbox', { name: 'New name for Second' }), 'x');
    await user.click(button('Cancel renaming'));
    expect(names(harness)).toEqual(['Page 1', 'Second']);
  });

  it('Move up / Move down reorder and are disabled at the ends', async () => {
    const { harness } = await setupPages(['Second', 'Third']);
    const user = await openDialog(harness, { kind: 'managePages' });
    expect((button('Move Page 1 up') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Move Third down') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Move Page 1 down') as HTMLButtonElement).disabled).toBe(false);
    await user.click(button('Move Third up'));
    expect(names(harness)).toEqual(['Page 1', 'Third', 'Second']);
    await user.click(button('Move Page 1 down'));
    expect(names(harness)).toEqual(['Third', 'Page 1', 'Second']);
  });

  it('the last page cannot be deleted: disabled with an explaining tooltip', async () => {
    const { harness } = await setupPages([]);
    await openDialog(harness, { kind: 'managePages' });
    const del = button('Delete Page 1') as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.parentElement?.querySelector('[data-tooltip]')?.textContent).toBe(
      'The last page cannot be deleted.',
    );
  });

  it('Delete opens the confirmation of that page', async () => {
    const { harness } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'managePages' });
    await user.click(button('Delete Second'));
    expect(
      screen.getByRole('alertdialog', { name: 'Delete the page Second?' }),
    ).toBeTruthy();
  });

  it('Esc closes the dialog', async () => {
    const { harness } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'managePages' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
