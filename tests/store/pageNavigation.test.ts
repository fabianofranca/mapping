import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArrow, type Project } from '../../src/model';
import { revealAnnotation, revealItem, revealTarget } from '../../src/store/reveal';
import { pagesProject } from './pageHarness';
import { openHarness, type Harness } from './proposalHarness';

// Navigating to an item switches the page (stage #883, PG2, decision 12); undo and redo never do.

let open: Harness[] = [];
beforeEach(() => localStorage.clear());
afterEach(async () => {
  for (const h of open) await h.session.close();
  open = [];
  localStorage.clear();
});

async function start(project: Project = pagesProject()) {
  const h = await openHarness({ project });
  open.push(h);
  return h.session;
}

describe('revealItem', () => {
  it('opens the page of an item on another page', async () => {
    const s = await start();
    expect(revealItem(s, 'M5')).toEqual({
      found: true,
      pageChanged: true,
      perspectiveChanged: false,
    });
    expect(s.page.id.value).toBe('PG2');
  });

  it('works for containers, canvas markings and arrows', async () => {
    const s = await start(createArrow(pagesProject(), { id: 'R1', from: 'M5', to: 'K' }));
    for (const [id, page] of [
      ['I3', 'PG2'],
      ['K', 'PG2'],
      ['R1', 'PG2'],
      ['I2', 'PG1'],
    ] as const) {
      s.page.open(id === 'I2' ? 'PG3' : 'PG1');
      revealItem(s, id);
      expect(s.page.id.value).toBe(page);
    }
  });

  it('an item on the open page changes nothing', async () => {
    const s = await start();
    expect(revealItem(s, 'M1')).toEqual({
      found: true,
      pageChanged: false,
      perspectiveChanged: false,
    });
    expect(s.page.id.value).toBe('PG1');
  });

  it('an unknown item changes nothing', async () => {
    const s = await start();
    s.page.open('PG2');
    expect(revealItem(s, 'nope')).toEqual({
      found: false,
      pageChanged: false,
      perspectiveChanged: false,
    });
    expect(s.page.id.value).toBe('PG2');
  });

  it('an annotation reveals the page of its marking', async () => {
    const s = await start();
    s.page.open('PG3');
    expect(revealAnnotation(s, 'A4').pageChanged).toBe(true);
    expect(s.page.id.value).toBe('PG1');
  });

  it('keeps the perspective when it shows the item on its page', async () => {
    const s = await start();
    s.perspective.open('V');
    expect(revealItem(s, 'M5')).toMatchObject({
      pageChanged: true,
      perspectiveChanged: false,
    });
    expect(s.perspective.id.value).toBe('V');
    expect(s.page.id.value).toBe('PG2');
  });

  it('opens the Completa, with a notice, when the perspective does not show the item', async () => {
    const s = await start();
    s.perspective.open('V');
    expect(revealItem(s, 'K')).toEqual({
      found: true,
      pageChanged: true,
      perspectiveChanged: true,
    });
    expect(s.perspective.id.value).toBeNull();
    expect(s.page.id.value).toBe('PG2');
    expect(s.perspective.notice.value).toEqual({ kind: 'outside', name: 'View' });
  });

  it('on the same page, an item outside the perspective also opens the Completa', async () => {
    const s = await start();
    s.perspective.open('V');
    expect(revealItem(s, 'M4')).toMatchObject({
      pageChanged: false,
      perspectiveChanged: true,
    });
    expect(s.perspective.id.value).toBeNull();
  });

  it('with the review locking the perspective, only the page switches', async () => {
    const s = await start();
    s.perspective.setLocked(true);
    expect(revealItem(s, 'M5')).toMatchObject({
      pageChanged: true,
      perspectiveChanged: false,
    });
    expect(s.page.id.value).toBe('PG2');
  });
});

describe('revealTarget (citations and conversation anchors)', () => {
  it('goes to the page of an item, an annotation or one of its parts', async () => {
    const s = await start();
    const cases = [
      { kind: 'marking', id: 'M5' },
      { kind: 'container', id: 'I3' },
      { kind: 'annotation', id: 'A4' },
      { kind: 'field', annotationId: 'A4', key: 'tipo' },
      { kind: 'point', containerId: 'I3', x: 1, y: 1 },
    ] as const;
    for (const target of cases) {
      s.page.open(
        target.kind === 'annotation' || target.kind === 'field' ? 'PG3' : 'PG1',
      );
      const expected =
        target.kind === 'annotation' || target.kind === 'field' ? 'PG1' : 'PG2';
      expect(revealTarget(s, target).found).toBe(true);
      expect(s.page.id.value).toBe(expected);
    }
  });

  it('a canvas point opens its page: its own, or the first one for a version 1 point', async () => {
    const s = await start();
    expect(
      revealTarget(s, { kind: 'point', containerId: null, x: 1, y: 1, pageId: 'PG3' }),
    ).toMatchObject({ found: true, pageChanged: true });
    expect(s.page.id.value).toBe('PG3');
    expect(
      revealTarget(s, { kind: 'point', containerId: null, x: 1, y: 1 }),
    ).toMatchObject({
      found: true,
      pageChanged: true,
    });
    expect(s.page.id.value).toBe('PG1');
    s.page.open('PG2');
    expect(
      revealTarget(s, { kind: 'point', containerId: null, x: 1, y: 1, pageId: 'GONE' })
        .found,
    ).toBe(false);
    expect(s.page.id.value).toBe('PG2');
  });

  it('a layer, a conversation and a proposal change nothing', async () => {
    const s = await start();
    s.page.open('PG2');
    for (const target of [
      { kind: 'layer', id: 'L1' },
      { kind: 'thread', id: 'T1' },
      { kind: 'proposal', id: 'P1' },
    ] as const) {
      expect(revealTarget(s, target).found).toBe(false);
    }
    expect(s.page.id.value).toBe('PG2');
  });
});

describe('undo and redo do not switch the page', () => {
  async function changeOnPage2(s: Awaited<ReturnType<typeof start>>) {
    s.page.open('PG2');
    expect(
      s.actions.createMarking(null, { x: 9000, y: 9000, width: 50, height: 50 }).ok,
    ).toBe(true);
    s.page.open('PG1');
    s.page.notice.value = null;
  }

  it('says "undone" and "redone" with the page of the change, staying on the open page', async () => {
    const s = await start();
    await changeOnPage2(s);
    expect(s.store.undo()).toBe(true);
    expect(s.page.id.value).toBe('PG1');
    expect(s.page.notice.value).toEqual({ kind: 'undone', name: 'Page 2' });
    s.page.notice.value = null;
    expect(s.store.redo()).toBe(true);
    expect(s.page.id.value).toBe('PG1');
    expect(s.page.notice.value).toEqual({ kind: 'redone', name: 'Page 2' });
  });

  it('says nothing when the change is on the open page', async () => {
    const s = await start();
    s.actions.createMarking(null, { x: 9000, y: 9000, width: 50, height: 50 });
    s.store.undo();
    expect(s.page.notice.value).toBeNull();
  });

  it('says nothing when the change also touches the open page', async () => {
    const s = await start();
    s.actions.moveRootsToPage(['I2'], 'PG2'); // PG1 → PG2, seen from PG1
    s.page.notice.value = null;
    s.store.undo();
    expect(s.page.notice.value).toBeNull();
  });

  it('says nothing for a change to the page list itself', async () => {
    const s = await start();
    s.actions.addPage('Checkout');
    s.store.undo();
    expect(s.page.notice.value).toBeNull();
    s.store.redo();
    expect(s.page.notice.value).toBeNull();
  });

  it('says nothing for a change that is not about items, even next to another page', async () => {
    const s = await start();
    s.actions.renameLayer('L1', 'Renamed');
    s.store.undo();
    expect(s.page.notice.value).toBeNull();
  });

  it('an annotation change counts on the page of its marking', async () => {
    const s = await start();
    s.page.open('PG2');
    s.actions.addAnnotation('M5', 'L1', 'On the other page');
    s.page.open('PG1');
    s.page.notice.value = null;
    s.store.undo();
    expect(s.page.notice.value).toEqual({ kind: 'undone', name: 'Page 2' });
  });
});
