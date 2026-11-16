import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deletePage, type Project } from '../../src/model';
import { openHarness, type Harness } from './proposalHarness';
import { pagesProject } from './pageHarness';

// The open page (stage #883, PG2, decision 5): UI state outside undo, kept in this browser by
// `project.id` (`mapping.openPage`), always a valid page of the committed project.

const KEY = 'mapping.openPage';
let open: Harness[] = [];

beforeEach(() => localStorage.clear());
afterEach(async () => {
  for (const h of open) await h.session.close();
  open = [];
  localStorage.clear();
});

async function start(project: Project = pagesProject()): Promise<Harness> {
  const h = await openHarness({ project });
  open.push(h);
  return h;
}

describe('the open page', () => {
  it('opens on the first page and the id is never null', async () => {
    const { session } = await start();
    expect(session.page.id.value).toBe('PG1');
    expect(session.page.openId()).toBe('PG1');
    expect(session.page.notice.value).toBeNull();
  });

  it('open() switches to a page of the project and refuses an unknown id, keeping the choice', async () => {
    const { session } = await start();
    expect(session.page.open('PG2')).toBe(true);
    expect(session.page.id.value).toBe('PG2');
    expect(session.page.open('nope')).toBe(false);
    expect(session.page.id.value).toBe('PG2');
  });

  it('switching page is outside undo and writes nothing to the project', async () => {
    const { session } = await start();
    const before = session.store.committed.peek();
    session.page.open('PG3');
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.revision.value).toBe(0);
    expect(session.store.committed.value).toBe(before);
  });

  it('is kept per project.id and resumed on open', async () => {
    const first = await start();
    first.session.page.open('PG2');
    await first.session.close();
    open = [];
    const again = await start();
    expect(again.session.page.id.value).toBe('PG2');
    expect(again.session.page.notice.value).toBeNull();
  });

  it('keeps the choices of other projects when it writes', async () => {
    const first = await start();
    first.session.page.open('PG2');
    const blob = JSON.parse(localStorage.getItem(KEY) as string) as {
      v: number;
      open: Record<string, { id: string; name: string }>;
    };
    expect(blob.v).toBe(1);
    expect(Object.values(blob.open)).toEqual([{ id: 'PG2', name: 'Page 2' }]);
    // Another project's entry stays when this one is written again.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        open: { ...blob.open, other: { id: 'X', name: 'Elsewhere' } },
      }),
    );
    first.session.page.open('PG3');
    const next = JSON.parse(localStorage.getItem(KEY) as string) as typeof blob;
    expect(next.open.other).toEqual({ id: 'X', name: 'Elsewhere' });
    expect(Object.keys(next.open)).toHaveLength(2);
  });

  it('keeps only the 20 most recent projects', async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`p${i}`, { id: 'X', name: 'N' }]),
    );
    localStorage.setItem(KEY, JSON.stringify({ v: 1, open: entries }));
    const { session } = await start();
    session.page.open('PG2');
    const blob = JSON.parse(localStorage.getItem(KEY) as string) as {
      open: Record<string, unknown>;
    };
    expect(Object.keys(blob.open)).toHaveLength(20);
  });

  it('ignores a corrupted or foreign-version blob', async () => {
    localStorage.setItem(KEY, '{not json');
    expect((await start()).session.page.id.value).toBe('PG1');
    localStorage.setItem(KEY, JSON.stringify({ v: 99, open: {} }));
    expect((await start()).session.page.id.value).toBe('PG1');
  });

  it('opens the first page with the removed notice when the kept one no longer exists', async () => {
    const first = await start();
    first.session.page.open('PG2');
    await first.session.close();
    open = [];
    const without = deletePage(pagesProject(), 'PG2', { discard: true });
    const again = await start(without);
    expect(again.session.page.id.value).toBe('PG1');
    expect(again.session.page.notice.value).toEqual({ kind: 'removed', name: 'Page 2' });
  });
});

describe('when the open page disappears', () => {
  it('deleting it goes to the first page with the removed notice', async () => {
    const { session } = await start();
    session.page.open('PG2');
    expect(session.actions.deletePage('PG2', { discard: true }).ok).toBe(true);
    expect(session.page.id.value).toBe('PG1');
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Page 2' });
  });

  it('undoing the creation of the open page goes to the first one', async () => {
    const { session } = await start();
    const created = session.actions.addPage('Checkout');
    if (!created.ok) throw new Error('page not created');
    expect(session.page.open(created.value)).toBe(true);
    session.store.undo();
    expect(session.page.id.value).toBe('PG1');
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Checkout' });
  });

  it('an external reload without the page goes to the first one', async () => {
    const { session } = await start();
    session.page.open('PG3');
    session.store.load(deletePage(pagesProject(), 'PG3', { discard: true }));
    expect(session.page.id.value).toBe('PG1');
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Page 3' });
  });

  it('the id never points to a page the project does not have, not even in between', async () => {
    const { session } = await start();
    session.page.open('PG2');
    session.store.load(deletePage(pagesProject(), 'PG2', { discard: true }));
    const ids = session.store.committed.value?.pages.map((g) => g.id) ?? [];
    expect(ids).toContain(session.page.id.value);
  });

  it('the notice carries the new name after a rename', async () => {
    const { session } = await start();
    session.page.open('PG2');
    expect(session.actions.renamePage('PG2', 'Renamed').ok).toBe(true);
    expect(session.actions.deletePage('PG2', { discard: true }).ok).toBe(true);
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Renamed' });
  });

  it('the kept name follows a rename (so the removed notice on open is current)', async () => {
    const first = await start();
    first.session.page.open('PG2');
    first.session.actions.renamePage('PG2', 'Renamed');
    await first.session.close();
    open = [];
    const without = deletePage(pagesProject(), 'PG2', { discard: true });
    const again = await start(without);
    expect(again.session.page.notice.value).toEqual({ kind: 'removed', name: 'Renamed' });
  });

  it('the notice is also cleared by whoever shows it (a plain signal)', async () => {
    const { session } = await start();
    session.page.open('PG2');
    session.actions.deletePage('PG2', { discard: true });
    session.page.notice.value = null;
    expect(session.page.notice.value).toBeNull();
  });
});
