import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createArrow,
  createMarking,
  createPage,
  projectIndex,
  setMarkingAnchor,
  type Project,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';
import { NOW } from '../model/fixtures';
import { pagesProject } from './pageHarness';
import { openHarness, type Harness } from './proposalHarness';

// The creating actions put what they create on the open page, and the page actions (stage #883,
// PG2, decisions 6, 10 and 11): each one is a single undo entry.

const pageOf = (p: Project | null, id: string): string | undefined =>
  p ? projectIndex(p).pageOf.get(id) : undefined;

describe('what is created lands on the open page', () => {
  function setup(open: { page: string }, initial: Project = pagesProject()) {
    const store: ProjectStore = createProjectStore({ now: () => NOW });
    let n = 0;
    const actions = createProjectActions(store, {
      newId: () => `N${++n}`,
      components: () => testCatalog(),
      page: () => open.page,
    });
    store.load(initial);
    const project = () => store.committed.peek() as Project;
    return { store, actions, project };
  }

  it('a container goes to the open page, with a position computed on that page', () => {
    const open = { page: 'PG2' };
    const { actions, project } = setup(open);
    const result = actions.addBackgroundContainer({
      name: null,
      width: 100,
      height: 100,
      background: '#FFFFFF',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pageOf(project(), result.value)).toBe('PG2');
    // At the right of the content of PG2 (I3 is 1000 wide at the origin), not of PG1's I1.
    const created = project().containers.find((c) => c.id === result.value);
    expect(created?.placement.x).toBeLessThan(4000);
  });

  it('an image container goes to the open page', () => {
    const open = { page: 'PG3' };
    const { actions, project } = setup(open);
    const result = actions.addContainer({
      file: 'images/new.png',
      width: 800,
      height: 600,
    });
    expect(result.ok && pageOf(project(), result.value)).toBe('PG3');
  });

  it('a canvas marking goes to the open page; a container marking has no page of its own', () => {
    const open = { page: 'PG2' };
    const { actions, project } = setup(open);
    const canvas = actions.createMarking(null, {
      x: 9000,
      y: 9000,
      width: 50,
      height: 50,
    });
    expect(canvas.ok && pageOf(project(), canvas.value)).toBe('PG2');
    const inside = actions.createMarking('I3', { x: 10, y: 10, width: 50, height: 50 });
    expect(inside.ok && pageOf(project(), inside.value)).toBe('PG2');
    expect(
      project().markings.find((m) => m.id === (inside.ok ? inside.value : ''))?.pageId,
    ).toBeNull();
  });

  it('a component on the canvas goes to the open page; nothing lands on another page', () => {
    const open = { page: 'PG2' };
    const base = createPage(componentProject(), { id: 'PG2', name: 'Page 2' });
    const { actions, project } = setup(open, base);
    const before = project();
    const result = actions.addComponent({
      containerId: null,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      center: { x: 100, y: 100 },
    });
    expect(result.ok && pageOf(project(), result.value)).toBe('PG2');
    const created = new Set([
      ...project()
        .markings.filter((m) => !before.markings.includes(m))
        .map((m) => m.id),
    ]);
    for (const id of created) expect(pageOf(project(), id)).toBe('PG2');
    expect(project().containers).toEqual(before.containers);
  });

  it('without the dep (tests of the editor) the first page is used, as before', () => {
    const store = createProjectStore({ now: () => NOW });
    const actions = createProjectActions(store, { newId: () => 'Z' });
    store.load(pagesProject());
    const result = actions.createMarking(null, {
      x: 9000,
      y: 9000,
      width: 50,
      height: 50,
    });
    expect(result.ok && pageOf(store.committed.peek(), 'Z')).toBe('PG1');
  });

  it('wrapping derives the page from what it wraps', () => {
    const open = { page: 'PG1' };
    const { actions, project } = setup(open);
    const k = actions.wrapItems([{ kind: 'marking', id: 'K' }]);
    expect(k.ok && pageOf(project(), k.value)).toBe('PG2');
  });
});

describe('page actions', () => {
  let harnesses: Harness[] = [];
  beforeEach(() => localStorage.clear());
  afterEach(async () => {
    for (const h of harnesses) await h.session.close();
    harnesses = [];
    localStorage.clear();
  });
  async function start(project: Project = pagesProject()) {
    const h = await openHarness({ project });
    harnesses.push(h);
    return h.session;
  }
  const pages = (s: Awaited<ReturnType<typeof start>>) =>
    (s.store.committed.peek() as Project).pages.map((g) => g.name);

  it('addPage appends a page with a generated id and does not open it', async () => {
    const s = await start();
    const result = s.actions.addPage('Checkout');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pages(s)).toEqual(['Page 1', 'Page 2', 'Page 3', 'Checkout']);
    expect((s.store.committed.peek() as Project).pages.at(-1)?.id).toBe(result.value);
    expect(s.page.id.value).toBe('PG1');
    s.store.undo();
    expect(pages(s)).toEqual(['Page 1', 'Page 2', 'Page 3']);
  });

  it('refuses an empty or taken name', async () => {
    const s = await start();
    expect(s.actions.addPage('  ')).toEqual({ ok: false, error: 'page-name-empty' });
    expect(s.actions.addPage('page 2')).toEqual({ ok: false, error: 'page-name-taken' });
    expect(s.actions.renamePage('PG2', 'PAGE 1')).toEqual({
      ok: false,
      error: 'page-name-taken',
    });
    expect(s.store.canUndo.value).toBe(false);
  });

  it('renamePage and movePage change the page list, one undo entry each', async () => {
    const s = await start();
    expect(s.actions.renamePage('PG3', 'Last').ok).toBe(true);
    expect(s.actions.movePage('PG3', 0).ok).toBe(true);
    expect(pages(s)).toEqual(['Last', 'Page 1', 'Page 2']);
    s.store.undo();
    expect(pages(s)).toEqual(['Page 1', 'Page 2', 'Last']);
    s.store.undo();
    expect(pages(s)).toEqual(['Page 1', 'Page 2', 'Page 3']);
  });

  it('deletePage with moveTo keeps the content on the destination, in ONE undo entry', async () => {
    const s = await start();
    const before = s.store.committed.peek() as Project;
    expect(s.actions.deletePage('PG2', { moveTo: 'PG1' }).ok).toBe(true);
    const after = s.store.committed.peek() as Project;
    expect(after.pages.map((g) => g.id)).toEqual(['PG1', 'PG3']);
    expect(pageOf(after, 'I3')).toBe('PG1');
    expect(pageOf(after, 'K')).toBe('PG1');
    expect(s.store.undo()).toBe(true);
    expect(s.store.committed.peek()?.pages).toEqual(before.pages);
    expect(pageOf(s.store.committed.peek(), 'I3')).toBe('PG2');
    // One entry: a second undo has nothing left.
    expect(s.store.canUndo.value).toBe(false);
  });

  it('deletePage with moveTo takes a locked root along, in ONE undo entry', async () => {
    const base = pagesProject();
    const locked: Project = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'I3' ? { ...c, locked: true } : c,
      ),
    };
    const s = await start(locked);
    expect(s.actions.deletePage('PG2', { moveTo: 'PG1' }).ok).toBe(true);
    const after = s.store.committed.peek() as Project;
    expect(pageOf(after, 'I3')).toBe('PG1');
    expect(after.containers.find((c) => c.id === 'I3')?.locked).toBe(true);
    expect(s.store.undo()).toBe(true);
    expect(pageOf(s.store.committed.peek(), 'I3')).toBe('PG2');
    expect(s.store.canUndo.value).toBe(false);
  });

  it('deletePage with discard removes the page and everything on it, in ONE undo entry', async () => {
    const s = await start();
    expect(s.actions.deletePage('PG2', { discard: true }).ok).toBe(true);
    const after = s.store.committed.peek() as Project;
    expect(after.containers.map((c) => c.id)).toEqual(['I1', 'I2']);
    expect(after.markings.some((m) => m.id === 'K' || m.id === 'M5')).toBe(false);
    s.store.undo();
    expect(s.store.committed.peek()?.containers.map((c) => c.id)).toContain('I3');
    expect(s.store.canUndo.value).toBe(false);
  });

  it('the last page is refused, and so is moving to itself or to an unknown page', async () => {
    const s = await start();
    s.actions.deletePage('PG3', { discard: true });
    s.actions.deletePage('PG2', { moveTo: 'PG1' });
    expect(s.actions.deletePage('PG1', { discard: true })).toEqual({
      ok: false,
      error: 'page-last',
    });
    expect(s.actions.deletePage('PG1', { moveTo: 'nope' }).ok).toBe(false);
  });

  it('page actions work with a perspective open', async () => {
    const s = await start();
    s.perspective.open('V');
    expect(s.actions.addPage('Inside a perspective').ok).toBe(true);
    expect(s.actions.movePage('PG3', 0).ok).toBe(true);
  });

  it('they follow the same lock as the others: refused in a review', async () => {
    const s = await start();
    s.store.setReviewing('P1');
    expect(s.actions.addPage('X')).toEqual({ ok: false, error: 'reviewing' });
    expect(s.actions.deletePage('PG2', { discard: true })).toEqual({
      ok: false,
      error: 'reviewing',
    });
  });
});

describe('moveRootsToPage', () => {
  let harnesses: Harness[] = [];
  beforeEach(() => localStorage.clear());
  afterEach(async () => {
    for (const h of harnesses) await h.session.close();
    harnesses = [];
    localStorage.clear();
  });
  async function start(project: Project = pagesProject()) {
    const h = await openHarness({ project });
    harnesses.push(h);
    return h.session;
  }

  it('moves the roots with everything in them in ONE undo entry and stays on the source page', async () => {
    const s = await start();
    const result = s.actions.moveRootsToPage(['I2'], 'PG2');
    expect(result.ok).toBe(true);
    const after = s.store.committed.peek() as Project;
    expect(pageOf(after, 'I2')).toBe('PG2');
    expect(pageOf(after, 'M4')).toBe('PG2');
    expect(s.page.id.value).toBe('PG1');
    s.store.undo();
    expect(pageOf(s.store.committed.peek(), 'I2')).toBe('PG1');
    expect(s.store.canUndo.value).toBe(false);
  });

  it('announces the move with the name and the id of the destination page', async () => {
    const s = await start();
    s.actions.moveRootsToPage(['I2'], 'PG3');
    expect(s.page.notice.value).toEqual({ kind: 'moved', pageId: 'PG3', name: 'Page 3' });
  });

  it('no notice and no entry when the roots are already there', async () => {
    const s = await start();
    expect(s.actions.moveRootsToPage(['I3'], 'PG2').ok).toBe(true);
    expect(s.store.canUndo.value).toBe(false);
    expect(s.page.notice.value).toBeNull();
  });

  it('refuses a move that cuts an arrow, listing the arrows, and changes nothing', async () => {
    const base = createArrow(pagesProject(), { id: 'R1', from: 'M1', to: 'M4' });
    const s = await start(base);
    const before = s.store.committed.peek();
    const result = s.actions.moveRootsToPage(['I2'], 'PG2');
    expect(result).toEqual({
      ok: false,
      error: 'page-arrow-crossing',
      arrows: [{ id: 'R1', from: 'M1', to: 'M4' }],
      anchors: [],
    });
    expect(s.store.committed.peek()).toBe(before);
    expect(s.page.notice.value).toBeNull();
  });

  it('refuses a move that would cut an anchor, listing the anchors, and writes no undo entry', async () => {
    let base = createMarking(pagesProject(), {
      id: 'KB',
      containerId: null,
      rect: { x: 5600, y: 5000, width: 400, height: 400 },
      pageId: 'PG2',
    });
    base = setMarkingAnchor(base, 'KB', { to: 'K', side: 'end' });
    const s = await start(base);
    const before = s.store.committed.peek();
    const result = s.actions.moveRootsToPage(['K'], 'PG3');
    expect(result).toEqual({
      ok: false,
      error: 'page-anchor-crossing',
      arrows: [],
      anchors: [{ marking: 'KB', to: 'K' }],
    });
    expect(s.store.committed.peek()).toBe(before);
    expect(s.store.canUndo.value).toBe(false);
    expect(s.page.notice.value).toBeNull();
  });

  it('keeps the arrows in the refusal result of an arrow', async () => {
    const base = createArrow(pagesProject(), { id: 'R1', from: 'M1', to: 'M4' });
    const s = await start(base);
    expect(s.actions.moveRootsToPage(['I2'], 'PG2')).toEqual({
      ok: false,
      error: 'page-arrow-crossing',
      arrows: [{ id: 'R1', from: 'M1', to: 'M4' }],
      anchors: [],
    });
  });

  it('moves both ends together without refusing', async () => {
    const base = createArrow(pagesProject(), { id: 'R1', from: 'M1', to: 'M4' });
    const s = await start(base);
    expect(s.actions.moveRootsToPage(['I1', 'I2'], 'PG3').ok).toBe(true);
    expect(pageOf(s.store.committed.peek(), 'R1')).toBe('PG3');
  });

  it('works with a perspective open, repositioning it on the destination page', async () => {
    const s = await start();
    s.perspective.open('V');
    expect(s.actions.moveRootsToPage(['I1'], 'PG3').ok).toBe(true);
    expect(pageOf(s.store.committed.peek(), 'I1')).toBe('PG3');
  });
});
