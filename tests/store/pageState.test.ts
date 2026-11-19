import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addContainer,
  addPerspective,
  createPage,
  deletePage,
  type Project,
} from '../../src/model';
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

describe('expectRemoval: a deliberate delete of the open page', () => {
  it('skips the removed notice (once) and still opens the first page', async () => {
    const { session } = await start();
    session.page.open('PG2');
    session.page.expectRemoval('PG2');
    expect(session.actions.deletePage('PG2', { discard: true }).ok).toBe(true);
    expect(session.page.id.value).toBe('PG1');
    expect(session.page.notice.value).toBeNull();
    // Once: a later removal of the open page (here an undo) notifies again.
    const created = session.actions.addPage('Checkout');
    if (!created.ok) throw new Error('page not created');
    session.page.open(created.value);
    session.store.undo();
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Checkout' });
  });

  it('is cleared by the next change, so a stale expectation never hides a later removal', async () => {
    const { session } = await start();
    session.page.open('PG2');
    session.page.expectRemoval('PG2');
    expect(session.actions.renamePage('PG2', 'Renamed').ok).toBe(true);
    expect(session.actions.deletePage('PG2', { discard: true }).ok).toBe(true);
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Renamed' });
  });

  it('only covers the page it was announced for, and null cancels it', async () => {
    const { session } = await start();
    session.page.open('PG2');
    session.page.expectRemoval('PG3');
    expect(session.actions.deletePage('PG2', { discard: true }).ok).toBe(true);
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Page 2' });
    session.page.notice.value = null;
    session.store.undo();
    session.page.open('PG2');
    session.page.expectRemoval('PG2');
    session.page.expectRemoval(null);
    session.actions.deletePage('PG2', { discard: true });
    expect(session.page.notice.value).toEqual({ kind: 'removed', name: 'Page 2' });
  });
});

// The review's proposed pages (stage #2177, PF3, decision 13): while the Proposed view of an open
// proposal is shown, the page state also knows the pages that only the proposal creates.
describe("the open page with the review's proposed pages", () => {
  const proposedWithD = (): Project =>
    createPage(pagesProject(), { id: 'D', name: 'Drafts' });

  it('open() accepts a page only the proposal creates and the id follows it', async () => {
    const { session } = await start();
    expect(session.page.open('D')).toBe(false);
    session.page.setProposed(proposedWithD());
    expect(session.page.open('D')).toBe(true);
    expect(session.page.id.value).toBe('D');
    expect(session.page.openId()).toBe('D');
  });

  it('goes back to the page that was open before, with no notice, when the proposed pages go away', async () => {
    const { session } = await start();
    session.page.open('PG2');
    session.page.setProposed(proposedWithD());
    session.page.open('D');
    session.page.setProposed(null);
    expect(session.page.id.value).toBe('PG2');
    expect(session.page.notice.value).toBeNull();
  });

  it('never writes the proposed page to the kept choice', async () => {
    const { session } = await start();
    session.page.open('PG2');
    const before = localStorage.getItem(KEY);
    session.page.setProposed(proposedWithD());
    session.page.open('D');
    expect(localStorage.getItem(KEY)).toBe(before);
    session.page.setProposed(null);
    expect(localStorage.getItem(KEY)).toBe(before);
  });

  it('a committed page chosen meanwhile stays when the proposed pages go away', async () => {
    const { session } = await start();
    session.page.setProposed(proposedWithD());
    session.page.open('D');
    session.page.open('PG3');
    session.page.setProposed(null);
    expect(session.page.id.value).toBe('PG3');
  });

  it('lists the pages of the view being shown, with the ones only the proposal creates', async () => {
    const { session } = await start();
    expect(session.page.pages.value.map((g) => g.id)).toEqual(['PG1', 'PG2', 'PG3']);
    expect(session.page.createdByProposal.value.size).toBe(0);
    session.page.setProposed(proposedWithD());
    expect(session.page.pages.value.map((g) => g.id)).toEqual(['PG1', 'PG2', 'PG3', 'D']);
    expect([...session.page.createdByProposal.value]).toEqual(['D']);
    session.page.setProposed(null);
    expect(session.page.pages.value).toHaveLength(3);
  });

  it('a proposed page that the new preview lacks no longer holds the open page', async () => {
    const { session } = await start();
    session.page.setProposed(proposedWithD());
    session.page.open('D');
    session.page.setProposed(pagesProject());
    expect(session.page.id.value).toBe('PG1');
    expect(session.page.notice.value).toBeNull();
  });

  it('a proposal that removes the open page leaves the first page of the preview open', async () => {
    const { session } = await start();
    session.page.open('PG2');
    session.page.setProposed(deletePage(pagesProject(), 'PG2', { discard: true }));
    expect(session.page.pages.value.map((g) => g.id)).not.toContain('PG2');
    expect(session.page.id.value).toBe('PG1');
    session.page.setProposed(null);
    expect(session.page.id.value).toBe('PG2');
    expect(session.page.notice.value).toBeNull();
  });

  it('the perspective counts follow the preview on a page only the proposal creates', async () => {
    const { session } = await start();
    let preview = addContainer(proposedWithD(), {
      id: 'ID',
      file: 'images/draft.png',
      width: 500,
      height: 500,
      pageId: 'D',
    });
    preview = addPerspective(preview, {
      id: 'N',
      name: 'New one',
      hiddenLayers: [],
      items: [{ root: 'ID', x: 0, y: 0 }],
    });
    session.page.setProposed(preview);
    session.page.open('D');
    expect(session.page.rootCounts.value.get('D')).toBe(1);
    expect(session.page.perspectiveCounts.value.get('N')).toBe(1);
    expect(session.page.perspectiveCounts.value.get('V')).toBe(0);
  });
});
