import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addContainer,
  arrivalArea,
  createArrow,
  createMarking,
  createProject,
  createPage,
  moveContainer,
  moveMarking,
  moveRootsToPage,
  pageView,
  perspectiveView,
  settleHierarchy,
  setMarkingSpace,
  validateProject,
  type InvariantCode,
  type Project,
} from '../../src/model';
import { NOW, image, marking } from './fixtures';

// Pages (v21, PG1): containment is decided inside a page; no parent and no arrow crosses pages.

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** PG1 and PG2, each with a 1000×1000 container at (0, 0): the same place, on different pages. */
function overlappingPages(): Project {
  let p = createProject({
    name: 'Pages',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Layer', color: '#D32F2F' },
    firstPage: { id: 'PG1', name: 'Page 1' },
  });
  p = createPage(p, { id: 'PG2', name: 'Page 2' });
  p = addContainer(p, {
    id: 'IA',
    file: 'a.png',
    width: 1000,
    height: 1000,
    pageId: 'PG1',
  });
  p = addContainer(p, {
    id: 'IB',
    file: 'b.png',
    width: 1000,
    height: 1000,
    pageId: 'PG2',
  });
  return p;
}

const pageCodes: InvariantCode[] = [
  'page-required',
  'page-missing',
  'page-parent-mismatch',
  'arrow-cross-page',
  'anchor-other-space',
];
const pageIssues = (p: Project) =>
  validateProject(p).filter((i) => pageCodes.includes(i.code));

describe('settling by page', () => {
  it('a container placed over a canvas marking of another page does not become its child', () => {
    let p = overlappingPages();
    // Canvas marking on PG2, enclosing the whole place where the PG1 container is.
    p = createMarking(p, {
      id: 'K',
      containerId: null,
      rect: rect(-500, -500, 3000, 3000),
      pageId: 'PG2',
    });
    const settled = settleHierarchy(p);
    expect(image(settled, 'IA').parentId).toBeNull();
    expect(image(settled, 'IB').parentId).toBe('K');
    expect(pageIssues(settled)).toEqual([]);
  });

  it('a canvas marking of one page does not enter the container of another', () => {
    let p = overlappingPages();
    p = createMarking(p, {
      id: 'K',
      containerId: null,
      rect: rect(100, 100, 200, 200),
      pageId: 'PG2',
    });
    // IA (PG1) occupies the same place: K stays on the canvas of PG2, inside IB.
    const settled = settleHierarchy(p);
    expect(marking(settled, 'K').containerId).toBe('IB');
    expect(pageIssues(settled)).toEqual([]);
    const p1 = createMarking(overlappingPages(), {
      id: 'J',
      containerId: null,
      rect: rect(5000, 5000, 10, 10),
      pageId: 'PG1',
    });
    expect(marking(settleHierarchy(p1), 'J').containerId).toBeNull();
  });

  it('the right parent among candidates of different pages is the one of the same page', () => {
    let p = overlappingPages();
    p = createMarking(p, {
      id: 'KA',
      containerId: null,
      rect: rect(-500, -500, 3000, 3000),
      pageId: 'PG1',
    });
    p = createMarking(p, {
      id: 'KB',
      containerId: null,
      rect: rect(-100, -100, 1200, 1200),
      pageId: 'PG2',
    });
    const settled = settleHierarchy(p);
    expect(image(settled, 'IA').parentId).toBe('KA');
    expect(image(settled, 'IB').parentId).toBe('KB');
  });

  it('a marking leaving its container falls on the canvas of the page of that container', () => {
    let p = overlappingPages();
    p = createMarking(p, {
      id: 'M',
      containerId: 'IB',
      rect: rect(10, 10, 100, 100),
    });
    const at = image(p, 'IB').placement;
    const moved = setMarkingSpace(p, 'M', null, rect(at.x + 1500, at.y + 1500, 100, 100));
    const settled = settleHierarchy(moved);
    expect(marking(settled, 'M').containerId).toBeNull();
    expect(marking(settled, 'M').pageId).toBe('PG2');
    expect(pageIssues(settled)).toEqual([]);
  });

  it('a marking dragged into a container takes pageId null', () => {
    let p = overlappingPages();
    p = createMarking(p, {
      id: 'K',
      containerId: null,
      rect: rect(5000, 5000, 100, 100),
      pageId: 'PG2',
    });
    const settled = moveMarking(p, 'K', -4900, -4900);
    expect(marking(settled, 'K').containerId).toBe('IB');
    expect(marking(settled, 'K').pageId).toBeNull();
  });
});

describe('arrows and pages', () => {
  it('an arrow between a canvas marking and a container marking of the same page is accepted', () => {
    let p = overlappingPages();
    p = createMarking(p, { id: 'M', containerId: 'IA', rect: rect(0, 0, 10, 10) });
    p = createMarking(p, {
      id: 'K',
      containerId: null,
      rect: rect(3000, 0, 100, 100),
      pageId: 'PG1',
    });
    expect(createArrow(p, { id: 'AR', from: 'M', to: 'K' }).arrows).toHaveLength(1);
  });

  it('moveRootsToPage of a canvas marking with an arrow to the page keeps the arrow valid', () => {
    let p = overlappingPages();
    p = createMarking(p, {
      id: 'K1',
      containerId: null,
      rect: rect(3000, 0, 100, 100),
      pageId: 'PG1',
    });
    p = createMarking(p, {
      id: 'K2',
      containerId: null,
      rect: rect(3500, 0, 100, 100),
      pageId: 'PG1',
    });
    p = createArrow(p, { id: 'AR', from: 'K1', to: 'K2' });
    const next = moveRootsToPage(p, ['K1', 'K2'], 'PG2');
    expect(pageIssues(next)).toEqual([]);
    expect(next.arrows).toHaveLength(1);
  });
});

describe('a marking sent to a container of another page', () => {
  it('is refused with arrow-cross-page when an arrow would stay behind, and accepted without arrows', () => {
    let p = overlappingPages();
    p = createMarking(p, { id: 'MA', containerId: 'IA', rect: rect(0, 0, 50, 50) });
    p = createMarking(p, { id: 'MA2', containerId: 'IA', rect: rect(200, 0, 50, 50) });
    const free = setMarkingSpace(p, 'MA', 'IB', rect(5, 5, 20, 20));
    expect(pageIssues(free)).toEqual([]);
    expect(marking(free, 'MA').containerId).toBe('IB');
    const linked = createArrow(p, { id: 'AR', from: 'MA', to: 'MA2' });
    expect(() => setMarkingSpace(linked, 'MA', 'IB', rect(5, 5, 20, 20))).toThrow(
      /arrow-cross-page/,
    );
  });
});

describe('views by page', () => {
  it('pageView holds only what is on the page and is memoized', () => {
    const p = overlappingPages();
    const view = pageView(p, 'PG2');
    expect(view.containers.map((c) => c.id)).toEqual(['IB']);
    expect(pageView(p, 'PG2')).toBe(view);
    expect(perspectiveView(p, null, 'PG1')).toBe(pageView(p, 'PG1'));
    expect(perspectiveView(p, null)).toBe(p);
  });

  it('perspectiveView with a page cuts the perspective to that page', () => {
    const p: Project = {
      ...overlappingPages(),
      perspectives: [
        {
          id: 'P1',
          name: 'View',
          hiddenLayers: [],
          items: [
            { root: 'IA', x: 0, y: 0 },
            { root: 'IB', x: 0, y: 0 },
          ],
        },
      ],
    };
    const view = perspectiveView(p, p.perspectives[0] ?? null, 'PG2');
    expect(view.containers.map((c) => c.id)).toEqual(['IB']);
  });

  it('arrivalArea only looks at the arrivals of the page', () => {
    const base = overlappingPages();
    const moved = moveContainer(base, 'IB', 4000, 0);
    const p: Project = {
      ...moved,
      arrivals: [{ root: 'IB', from: 'P1', fromName: 'View' }],
    };
    expect(arrivalArea(p, 'PG1')).toBeNull();
    expect(arrivalArea(p, 'PG2')).toMatchObject({ x: 4000 });
    expect(arrivalArea(p)).toMatchObject({ x: 4000 });
  });
});

describe('the helpers throw ModelError', () => {
  it('createMarking on a page that does not exist', () => {
    expect(() =>
      createMarking(overlappingPages(), {
        id: 'K',
        containerId: null,
        rect: rect(0, 0, 10, 10),
        pageId: 'zzz',
      }),
    ).toThrow(ModelError);
  });
});
