import { describe, expect, it } from 'vitest';
import {
  IMAGE_GAP,
  ModelError,
  addContainer,
  createArrow,
  createMarking,
  createPage,
  deletePage,
  movePage,
  moveRootsToPage,
  pageContent,
  renamePage,
  setArrowEndpoint,
  validateProject,
  type Project,
} from '../../src/model';
import { image, marking, sampleProject } from './fixtures';

// Pages (v21, PG1): the page list, what a page holds, moving roots and deleting a page.

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
  return 'no-error';
}

/** PG1 holds I1 › M1…M3 and I2 › M4 (sample); PG2 is empty. */
const withEmptyPage = (): Project =>
  createPage(sampleProject(), { id: 'PG2', name: 'Page 2' });

/** PG2 with the container I3 (1000×1000 at the origin) and the canvas marking K. */
function twoPages(): Project {
  let p = withEmptyPage();
  p = addContainer(p, {
    id: 'I3',
    file: 'images/tras.jpg',
    width: 1000,
    height: 1000,
    pageId: 'PG2',
  });
  p = createMarking(p, {
    id: 'K',
    containerId: null,
    rect: rect(5000, 5000, 400, 400),
    pageId: 'PG2',
  });
  return p;
}

describe('the list of pages', () => {
  it('createPage adds at the end; the name is trimmed', () => {
    const p = createPage(sampleProject(), { id: 'PG2', name: '  Checkout ' });
    expect(p.pages.map((g) => g.name)).toEqual(['Page 1', 'Checkout']);
  });

  it('refuses an empty name, a name taken (case and accents ignored) and a repeated id', () => {
    const p = sampleProject();
    expect(codeOf(() => createPage(p, { id: 'X', name: '   ' }))).toBe('page-name-empty');
    expect(codeOf(() => createPage(p, { id: 'X', name: ' page 1 ' }))).toBe(
      'page-name-taken',
    );
    expect(codeOf(() => createPage(p, { id: 'PG1', name: 'Other' }))).toBe(
      'duplicate-id',
    );
    expect(codeOf(() => createPage(p, { id: 'M1', name: 'Other' }))).toBe('duplicate-id');
  });

  it('renamePage renames, keeps the current name as no change and refuses a taken one', () => {
    const p = withEmptyPage();
    const renamed = renamePage(p, 'PG2', ' Cart ');
    expect(renamed.pages[1]?.name).toBe('Cart');
    expect(renamePage(renamed, 'PG2', 'Cart')).toBe(renamed);
    expect(renamePage(renamed, 'PG2', 'cart')).not.toBe(renamed);
    expect(codeOf(() => renamePage(p, 'PG2', 'PAGE 1'))).toBe('page-name-taken');
    expect(codeOf(() => renamePage(p, 'PG2', ''))).toBe('page-name-empty');
    expect(codeOf(() => renamePage(p, 'nothing', 'x'))).toBe('not-found');
  });

  it('movePage reorders the tabs', () => {
    const p = movePage(withEmptyPage(), 'PG2', 0);
    expect(p.pages.map((g) => g.id)).toEqual(['PG2', 'PG1']);
    expect(movePage(p, 'PG2', 0)).toBe(p);
  });
});

describe('creating on a page', () => {
  it('a container and a canvas marking go to the first page by default', () => {
    const p = addContainer(withEmptyPage(), {
      id: 'I9',
      file: 'a.png',
      width: 10,
      height: 10,
    });
    expect(image(p, 'I9').pageId).toBe('PG1');
  });

  it('pageId puts the container on that page; an unknown page is not-found', () => {
    const p = twoPages();
    expect(image(p, 'I3').pageId).toBe('PG2');
    expect(marking(p, 'K').pageId).toBe('PG2');
    expect(
      codeOf(() =>
        addContainer(p, {
          id: 'I9',
          file: 'a.png',
          width: 10,
          height: 10,
          pageId: 'zzz',
        }),
      ),
    ).toBe('not-found');
  });

  it('a marking inside a container has no pageId; pageId with containerId is invalid-space', () => {
    const p = twoPages();
    expect(marking(p, 'M1').pageId).toBeNull();
    expect(
      codeOf(() =>
        createMarking(p, {
          id: 'Z',
          containerId: 'I1',
          rect: rect(0, 0, 10, 10),
          pageId: 'PG2',
        }),
      ),
    ).toBe('invalid-space');
  });

  it('a new container does not take the place of one on another page', () => {
    const p = addContainer(twoPages(), {
      id: 'I4',
      file: 'b.png',
      width: 1000,
      height: 1000,
      pageId: 'PG2',
    });
    // PG2 only had I3 at its origin: I4 goes beside I3, not beside the PG1 containers.
    expect(image(p, 'I4').placement.x).toBeLessThan(image(p, 'I2').placement.x + 10000);
    expect(validateProject(p)).toEqual([]);
  });
});

describe('what a page holds', () => {
  it('counts roots, containers, markings, arrows and annotations', () => {
    let p = twoPages();
    expect(pageContent(p, 'PG1')).toEqual({
      roots: 2,
      containers: 2,
      markings: 4,
      arrows: 0,
      annotations: 4,
    });
    expect(pageContent(p, 'PG2')).toMatchObject({ roots: 2, containers: 1, markings: 1 });
    p = createArrow(p, { id: 'AR', from: 'M1', to: 'M4' });
    expect(pageContent(p, 'PG1').arrows).toBe(1);
    expect(pageContent(p, 'PG2').arrows).toBe(0);
    expect(codeOf(() => pageContent(p, 'nothing'))).toBe('not-found');
  });
});

describe('arrows do not cross pages', () => {
  it('createArrow between pages is arrow-cross-page', () => {
    const p = twoPages();
    expect(codeOf(() => createArrow(p, { id: 'AR', from: 'M1', to: 'K' }))).toBe(
      'arrow-cross-page',
    );
    expect(codeOf(() => createArrow(p, { id: 'AR', from: 'M1', to: 'M4' }))).toBe(
      'no-error',
    );
  });

  it('setArrowEndpoint to another page is arrow-cross-page', () => {
    const p = createArrow(twoPages(), { id: 'AR', from: 'M1', to: 'M4' });
    expect(codeOf(() => setArrowEndpoint(p, 'AR', 'to', 'K', null))).toBe(
      'arrow-cross-page',
    );
  });
});

describe('moveRootsToPage', () => {
  it('takes the whole root (container and its markings and annotations) to the right of the destination content', () => {
    const p = twoPages();
    const next = moveRootsToPage(p, ['I1'], 'PG2');
    expect(image(next, 'I1').pageId).toBe('PG2');
    expect(marking(next, 'M3')).toEqual(marking(p, 'M3'));
    expect(next.annotations).toEqual(p.annotations);
    const rightOfContent = Math.max(
      image(p, 'I3').placement.x + 1000,
      marking(p, 'K').rect.x + 400,
    );
    expect(image(next, 'I1').placement.x).toBeGreaterThanOrEqual(
      rightOfContent + IMAGE_GAP,
    );
    expect(Number.isInteger(image(next, 'I1').placement.x)).toBe(true);
    expect(image(next, 'I1').placement.y).toBe(
      Math.min(image(p, 'I3').placement.y, marking(p, 'K').rect.y),
    );
    expect(validateProject(next)).toEqual([]);
  });

  it('keeps the relative positions of a group', () => {
    const p = twoPages();
    const next = moveRootsToPage(p, ['I1', 'I2'], 'PG2');
    const before = image(p, 'I2').placement.x - image(p, 'I1').placement.x;
    expect(image(next, 'I2').placement.x - image(next, 'I1').placement.x).toBe(before);
    expect(image(next, 'I2').placement.y - image(next, 'I1').placement.y).toBe(
      image(p, 'I2').placement.y - image(p, 'I1').placement.y,
    );
    expect(pageContent(next, 'PG1').roots).toBe(0);
  });

  it('an empty destination puts the group at the origin', () => {
    const next = moveRootsToPage(withEmptyPage(), ['I2'], 'PG2');
    expect(image(next, 'I2').placement.x).toBe(0);
    expect(image(next, 'I2').placement.y).toBe(0);
    expect(image(next, 'I1').pageId).toBe('PG1');
  });

  it('a canvas marking changes page and moves with it', () => {
    const p = twoPages();
    const next = moveRootsToPage(p, ['K'], 'PG1');
    expect(marking(next, 'K').pageId).toBe('PG1');
    expect(marking(next, 'K').rect.x).toBeGreaterThan(image(p, 'I2').placement.x + 1000);
    expect(validateProject(next)).toEqual([]);
  });

  it('roots already on the page change nothing', () => {
    const p = twoPages();
    expect(moveRootsToPage(p, ['I1'], 'PG1')).toBe(p);
  });

  it('refuses what is not a root, what does not exist and what is locked', () => {
    const p = twoPages();
    expect(codeOf(() => moveRootsToPage(p, ['M1'], 'PG2'))).toBe('not-root');
    expect(codeOf(() => moveRootsToPage(p, ['nothing'], 'PG2'))).toBe('not-found');
    expect(codeOf(() => moveRootsToPage(p, ['I1'], 'nothing'))).toBe('not-found');
    const locked = {
      ...p,
      containers: p.containers.map((c) => (c.id === 'I1' ? { ...c, locked: true } : c)),
    };
    expect(codeOf(() => moveRootsToPage(locked, ['I1'], 'PG2'))).toBe('locked');
  });

  it('refuses when an arrow links the group to what stays, listing the arrows', () => {
    const p = createArrow(twoPages(), { id: 'AR', from: 'M1', to: 'M4' });
    try {
      moveRootsToPage(p, ['I1'], 'PG2');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ModelError);
      expect((e as ModelError).code).toBe('page-arrow-crossing');
      expect(JSON.stringify((e as ModelError).data)).toContain('AR');
    }
    // Both ends in the group: the arrow goes along.
    const both = moveRootsToPage(p, ['I1', 'I2'], 'PG2');
    expect(pageContent(both, 'PG2').arrows).toBe(1);
    expect(validateProject(both)).toEqual([]);
  });

  it('a perspective with a moved root shows it at the right of what it already shows on the destination', () => {
    const p: Project = {
      ...twoPages(),
      perspectives: [
        {
          id: 'P1',
          name: 'View',
          hiddenLayers: [],
          items: [
            { root: 'I1', x: 0, y: 0 },
            { root: 'I3', x: 5000, y: 0 },
          ],
        },
      ],
    };
    const next = moveRootsToPage(p, ['I1'], 'PG2');
    const items = next.perspectives[0]?.items ?? [];
    const moved = items.find((i) => i.root === 'I1');
    const kept = items.find((i) => i.root === 'I3');
    expect(kept).toEqual({ root: 'I3', x: 5000, y: 0 });
    expect(moved?.x).toBeGreaterThan(5000 + 1000);
    expect(validateProject(next)).toEqual([]);
  });
});

describe('deletePage', () => {
  it('the last page cannot be deleted', () => {
    expect(codeOf(() => deletePage(sampleProject(), 'PG1', { discard: true }))).toBe(
      'page-last',
    );
  });

  it('moveTo takes every root to the other page and nothing is lost', () => {
    const p = twoPages();
    const next = deletePage(p, 'PG1', { moveTo: 'PG2' });
    expect(next.pages.map((g) => g.id)).toEqual(['PG2']);
    expect(next.containers).toHaveLength(p.containers.length);
    expect(next.markings).toHaveLength(p.markings.length);
    expect(next.annotations).toHaveLength(p.annotations.length);
    expect(next.containers.every((c) => c.pageId === 'PG2')).toBe(true);
    expect(validateProject(next)).toEqual([]);
  });

  it('moveTo the page itself or to one that does not exist is not-found', () => {
    const p = twoPages();
    expect(codeOf(() => deletePage(p, 'PG1', { moveTo: 'PG1' }))).toBe('not-found');
    expect(codeOf(() => deletePage(p, 'PG1', { moveTo: 'zzz' }))).toBe('not-found');
  });

  it('moveTo with an arrow across the pages is refused and nothing is written', () => {
    const p = createArrow(twoPages(), { id: 'AR', from: 'M1', to: 'M4' });
    const q = moveRootsToPage(p, ['I1', 'I2'], 'PG2');
    expect(q.arrows).toHaveLength(1);
    expect(codeOf(() => moveRootsToPage(p, ['I2'], 'PG2'))).toBe('page-arrow-crossing');
  });

  it('discard removes the page and everything on it, locked or not', () => {
    const p = createArrow(twoPages(), { id: 'AR', from: 'M1', to: 'M4' });
    const locked = {
      ...p,
      containers: p.containers.map((c) => (c.id === 'I1' ? { ...c, locked: true } : c)),
    };
    const next = deletePage(locked, 'PG1', { discard: true });
    expect(next.pages.map((g) => g.id)).toEqual(['PG2']);
    expect(next.containers.map((c) => c.id)).toEqual(['I3']);
    expect(next.markings.map((m) => m.id)).toEqual(['K']);
    expect(next.arrows).toEqual([]);
    expect(next.annotations).toEqual([]);
    expect(validateProject(next)).toEqual([]);
  });
});
