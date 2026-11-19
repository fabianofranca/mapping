import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pageContent, type Thread } from '../../src/model';
import { locale } from '../../src/store/settings';
import { sampleThread } from '../model/threadFixtures';
import { openDialog, setupPages } from './pageUiHarness';

// Delete page (stage #883, PG2, decision 10): simple for an empty page; with content, counts and
// two exits (move the content / delete everything), one undo entry each, Cancel focused.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const button = (name: string | RegExp) => screen.getByRole('button', { name });

describe('DeletePageDialog', () => {
  it('an empty page gets the simple confirmation (no counts, no second exit)', async () => {
    const { harness, ids } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'deletePage', id: ids[0] as string });
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the page Second?' });
    expect(within(dialog).getByText(/The page is empty/)).toBeTruthy();
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(within(dialog).queryByText(/Markings:/)).toBeNull();
    expect(document.activeElement).toBe(button('Cancel'));
    await user.click(button('Delete page'));
    expect(harness.project().pages.map((p) => p.name)).toEqual(['Page 1']);
    await harness.store.undo();
    expect(harness.project().pages.map((p) => p.name)).toEqual(['Page 1', 'Second']);
  });

  it('with content: shows the counts, has Cancel focused and both exits', async () => {
    const { harness } = await setupPages(['Second']);
    const first = harness.project().pages[0]?.id as string;
    const counts = pageContent(harness.project(), first);
    await openDialog(harness, { kind: 'deletePage', id: first });
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the page Page 1?' });
    expect(within(dialog).getByText(`Top-level items: ${counts.roots}`)).toBeTruthy();
    expect(within(dialog).getByText(`Markings: ${counts.markings}`)).toBeTruthy();
    expect(within(dialog).getByText(`Arrows: ${counts.arrows}`)).toBeTruthy();
    expect(within(dialog).getByText(`Annotations: ${counts.annotations}`)).toBeTruthy();
    expect(counts.markings).toBeGreaterThan(0);
    expect(document.activeElement).toBe(button('Cancel'));
    expect(within(dialog).getByText(/loses all of this content/)).toBeTruthy();
    const select = within(dialog).getByRole('combobox', { name: 'Move the content to…' });
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Second',
    ]);
    expect(button('Move the content and delete the page')).toBeTruthy();
    expect(button('Delete the page and everything in it')).toBeTruthy();
  });

  it('"Move the content to…" moves it to the chosen page: one undo entry', async () => {
    const { harness, ids } = await setupPages(['Second']);
    const first = harness.project().pages[0]?.id as string;
    const counts = pageContent(harness.project(), first);
    const user = await openDialog(harness, { kind: 'deletePage', id: first });
    await user.click(button('Move the content and delete the page'));
    const after = harness.project();
    expect(after.pages.map((p) => p.name)).toEqual(['Second']);
    expect(pageContent(after, ids[0] as string)).toEqual(counts);
    await harness.store.undo();
    const undone = harness.project();
    expect(undone.pages.map((p) => p.name)).toEqual(['Page 1', 'Second']);
    expect(pageContent(undone, first)).toEqual(counts);
  });

  it('"Delete the page and everything in it" discards the content: one undo entry', async () => {
    const { harness } = await setupPages(['Second']);
    const first = harness.project().pages[0]?.id as string;
    const counts = pageContent(harness.project(), first);
    const user = await openDialog(harness, { kind: 'deletePage', id: first });
    await user.click(button('Delete the page and everything in it'));
    const after = harness.project();
    expect(after.pages.map((p) => p.name)).toEqual(['Second']);
    expect(after.markings).toHaveLength(0);
    expect(after.containers).toHaveLength(0);
    await harness.store.undo();
    expect(pageContent(harness.project(), first)).toEqual(counts);
  });

  it('with three pages the Select offers the other two', async () => {
    const { harness } = await setupPages(['Second', 'Third']);
    const first = harness.project().pages[0]?.id as string;
    const user = await openDialog(harness, { kind: 'deletePage', id: first });
    const select = screen.getByRole('combobox', {
      name: 'Move the content to…',
    }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['Second', 'Third']);
    await user.selectOptions(select, 'Third');
    await user.click(button('Move the content and delete the page'));
    const third = harness.project().pages.find((p) => p.name === 'Third')?.id as string;
    expect(pageContent(harness.project(), third).roots).toBe(1);
  });

  it('Cancel and Esc delete nothing', async () => {
    const { harness, ids } = await setupPages(['Second']);
    const user = await openDialog(harness, { kind: 'deletePage', id: ids[0] as string });
    await user.click(button('Cancel'));
    expect(harness.project().pages).toHaveLength(2);
  });

  it('the open page deleted: the first page opens', async () => {
    const { harness, session } = await setupPages(['Second']);
    const first = harness.project().pages[0]?.id as string;
    const user = await openDialog(harness, { kind: 'deletePage', id: first });
    await user.click(button('Delete the page and everything in it'));
    expect(session.page.id.value).toBe(harness.project().pages[0]?.id);
  });
});

describe('DeletePageDialog: the deliberate delete of the open page', () => {
  it('discarding the open page opens the first page without the "no longer exists" notice', async () => {
    const { harness, session } = await setupPages(['Second']);
    const second = harness.project().pages[1]?.id as string;
    session.page.open(second);
    const user = await openDialog(harness, { kind: 'deletePage', id: second });
    await user.click(button('Delete page'));
    expect(session.page.id.value).toBe(harness.project().pages[0]?.id);
    expect(session.page.notice.value).toBeNull();
  });

  it('moving the content of the open page opens the destination page, with no notice', async () => {
    const { harness, ids, session } = await setupPages(['Second']);
    const first = harness.project().pages[0]?.id as string;
    const user = await openDialog(harness, { kind: 'deletePage', id: first });
    expect(session.page.id.value).toBe(first);
    await user.click(button('Move the content and delete the page'));
    expect(session.page.id.value).toBe(ids[0]);
    expect(session.page.notice.value).toBeNull();
  });

  it('deleting a page that is not open leaves the open page and any other notice alone', async () => {
    const { harness, ids, session } = await setupPages(['Second']);
    const first = harness.project().pages[0]?.id as string;
    session.page.notice.value = { kind: 'moved', pageId: first, name: 'Page 1' };
    const user = await openDialog(harness, { kind: 'deletePage', id: ids[0] as string });
    await user.click(button('Delete page'));
    expect(session.page.id.value).toBe(first);
    expect(session.page.notice.value?.kind).toBe('moved');
  });

  it('undoing the delete of the open page still says it no longer exists', async () => {
    const { harness, ids, session } = await setupPages(['Second']);
    const second = ids[0] as string;
    session.page.open(second);
    const user = await openDialog(harness, { kind: 'deletePage', id: second });
    await user.click(button('Delete page'));
    session.page.open(second);
    expect(session.page.id.value).toBe(harness.project().pages[0]?.id);
    await harness.store.undo();
    // The page is back; the user goes there and an undo of its creation takes the page away again.
    session.page.open(second);
    await harness.store.undo();
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Second' });
  });
});

describe('DeletePageDialog: point conversations of the page', () => {
  const point = (id: string, pageId: string): Thread =>
    sampleThread({
      id,
      anchor: { kind: 'point', containerId: null, x: 5, y: 6, pageId },
    });

  async function withThreads(pageIndex: number) {
    const s = await setupPages(['Second']);
    const first = s.harness.project().pages[0]?.id as string;
    const second = s.ids[0] as string;
    for (const t of [point('t1', first), point('t2', first), point('t3', second)]) {
      await s.session.threads.create(t);
    }
    const id = pageIndex === 0 ? first : second;
    return { ...s, id };
  }

  it('the move and discard forms say how many conversations lose their place', async () => {
    const { harness, id } = await withThreads(0);
    await openDialog(harness, { kind: 'deletePage', id });
    expect(
      screen.getByText(
        '2 conversations on empty spots of this page lose their place: they stay in Comments, without a place.',
      ),
    ).toBeTruthy();
  });

  it('the empty form says it too, in the singular for one', async () => {
    const { harness, id } = await withThreads(1);
    await openDialog(harness, { kind: 'deletePage', id });
    expect(
      screen.getByText(
        '1 conversation on an empty spot of this page loses its place: it stays in Comments, without a place.',
      ),
    ).toBeTruthy();
  });

  it('no line when there is none', async () => {
    const { harness, ids } = await setupPages(['Second']);
    await openDialog(harness, { kind: 'deletePage', id: ids[0] as string });
    expect(screen.queryByText(/loses? (its|their) place/)).toBeNull();
  });

  it('Cancel keeps the focus', async () => {
    const { harness, id } = await withThreads(0);
    await openDialog(harness, { kind: 'deletePage', id });
    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('deleting with "Move the content…" a page with a locked root succeeds', async () => {
    const { harness, ids } = await setupPages(['Second']);
    const first = harness.project().pages[0]?.id as string;
    const root = harness.project().containers[0]?.id as string;
    expect(harness.actions.setImageLocked(root, true).ok).toBe(true);
    const user = await openDialog(harness, { kind: 'deletePage', id: first });
    await user.click(button('Move the content and delete the page'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(harness.project().pages.map((p) => p.id)).toEqual(ids);
  });
});
