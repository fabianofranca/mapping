import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createArrow,
  createMarking,
  createPage,
  deserialize,
  repairProject,
  serialize,
  validateProject,
  type InvariantCode,
  type Marking,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

// Pages (v21, PG1): each new invariant refuses the opening and has its repair (decision 3).

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** Two pages: PG1 with I1 › M1…M3 and I2 › M4; PG2 with I3 and the canvas marking K (inside it, J). */
function twoPages(): Project {
  let p = createPage(sampleProject(), { id: 'PG2', name: 'Page 2' });
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
  p = createMarking(p, {
    id: 'J',
    containerId: null,
    rect: rect(5050, 5050, 100, 100),
    pageId: 'PG2',
  });
  return p;
}

const codes = (p: Project) => validateProject(p).map((i) => `${i.code}:${i.id}`);
const patchMarking = (p: Project, id: string, change: Partial<Marking>): Project => ({
  ...p,
  markings: p.markings.map((m) => (m.id === id ? { ...m, ...change } : m)),
});

/** Repairs and checks the result is valid; returns the codes of the repairs, in order. */
function repaired(p: Project): { project: Project; codes: string[] } {
  const result = repairProject(
    p,
    validateProject(p),
    (() => {
      let n = 0;
      return () => `new-${++n}`;
    })(),
    'Page 1',
  );
  expect(result.unrepaired).toEqual([]);
  expect(validateProject(result.project)).toEqual([]);
  return {
    project: result.project,
    codes: result.repaired.map((r) => `${r.action}:${r.code}:${r.id}`),
  };
}

describe('pages: the valid project', () => {
  it('two pages with their own items are valid', () => {
    expect(validateProject(twoPages())).toEqual([]);
  });

  it('containers on different pages may overlap on the canvas (each page is a canvas)', () => {
    const p = twoPages();
    const i1 = p.containers.find((c) => c.id === 'I1');
    const moved = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'I3' && i1 ? { ...c, placement: { ...i1.placement } } : c,
      ),
    };
    expect(codes(moved)).toEqual([]);
    const same = {
      ...moved,
      containers: moved.containers.map((c) =>
        c.id === 'I3' ? { ...c, pageId: 'PG1' } : c,
      ),
    };
    expect(codes(same)).toContain('images-overlap:I1');
  });
});

describe('pages: invariants refuse the opening', () => {
  it('pages-empty', () => {
    const p = { ...sampleProject(), pages: [] };
    expect(codes(p)).toContain(`pages-empty:${p.project.id}`);
  });

  it('page-duplicate-name (ignoring case and the spaces at the ends) and duplicate-id', () => {
    const p = twoPages();
    const named = {
      ...p,
      pages: [...p.pages.slice(0, 1), { id: 'PG2', name: '  PAGE 1 ' }],
    };
    expect(validateProject(named)).toContainEqual(
      expect.objectContaining({
        code: 'page-duplicate-name',
        entity: 'page',
        id: 'PG2',
        otherId: 'PG1',
      }),
    );
    const dupId = { ...p, pages: [...p.pages, { id: 'PG2', name: 'Other' }] };
    expect(validateProject(dupId)).toContainEqual(
      expect.objectContaining({ code: 'duplicate-id', entity: 'page', id: 'PG2' }),
    );
  });

  it('page-missing: container and canvas marking on a page that does not exist', () => {
    const p = twoPages();
    const bad = patchMarking(
      {
        ...p,
        containers: p.containers.map((c) => (c.id === 'I3' ? { ...c, pageId: 'XX' } : c)),
      },
      'K',
      { pageId: 'XX' },
    );
    expect(codes(bad)).toEqual(
      expect.arrayContaining(['page-missing:I3', 'page-missing:K']),
    );
  });

  it('page-required: container without pageId, canvas marking without page, container marking with page', () => {
    const p = twoPages();
    const bad = patchMarking(
      patchMarking(
        {
          ...p,
          containers: p.containers.map((c) => (c.id === 'I3' ? { ...c, pageId: '' } : c)),
        },
        'K',
        { pageId: null },
      ),
      'M1',
      { pageId: 'PG1' },
    );
    expect(codes(bad)).toEqual(
      expect.arrayContaining(['page-required:I3', 'page-required:K', 'page-required:M1']),
    );
  });

  it('page-parent-mismatch: canvas marking and container whose parent is on another page', () => {
    const p = twoPages();
    const child = patchMarking(p, 'J', { pageId: 'PG1' });
    expect(codes(child)).toContain('page-parent-mismatch:J');
    const withParent: Project = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'I3' ? { ...c, parentId: 'K', pageId: 'PG1' } : c,
      ),
    };
    expect(codes(withParent)).toContain('page-parent-mismatch:I3');
  });

  it('arrow-cross-page: the ends are on different pages (container markings count through the container)', () => {
    const p = twoPages();
    const arrow = {
      id: 'AR',
      from: 'M1',
      to: 'K',
      fromSide: null,
      toSide: null,
      points: [],
      style: 'curve' as const,
      name: null,
      locked: false,
    };
    expect(codes({ ...p, arrows: [arrow] })).toContain('arrow-cross-page:AR');
    expect(codes({ ...p, arrows: [{ ...arrow, to: 'M4' }] })).toEqual([]);
  });

  it('an anchor between canvas markings of different pages is anchor-other-space', () => {
    const p = twoPages();
    const other = createMarking(p, {
      id: 'Q',
      containerId: null,
      rect: rect(9000, 9000, 100, 100),
      pageId: 'PG1',
    });
    const anchored = patchMarking(other, 'Q', { anchor: { to: 'K' } });
    expect(codes(anchored)).toContain('anchor-other-space:Q');
  });

  it('deserialize refuses the file and brings the repair', () => {
    const p = patchMarking(twoPages(), 'K', { pageId: 'XX' });
    const result = deserialize(serialize(p));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation')
      throw new Error('expected');
    expect(result.error.issues.map((i) => i.code)).toContain('page-missing');
    expect(result.repair?.unrepaired).toEqual([]);
  });

  it('a v21 file with no `pages` key parses (pages []) and the repair creates the first page', () => {
    const json = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
    delete json.pages;
    const result = deserialize(JSON.stringify(json));
    if (result.ok || result.error.code !== 'invariant-violation') {
      throw new Error('expected an invariant violation, not a schema error');
    }
    expect(result.error.issues.map((i) => i.code)).toContain('pages-empty');
    expect(result.repair?.unrepaired).toEqual([]);
    const fixed = result.repair?.project;
    expect(fixed?.pages).toHaveLength(1);
    expect(fixed?.containers.every((c) => c.pageId === fixed.pages[0]?.id)).toBe(true);
    expect(validateProject(fixed as Project)).toEqual([]);
  });

  it('a file without pageId reads and is refused as page-required (not as a schema error)', () => {
    const json = JSON.parse(serialize(twoPages())) as {
      containers: Record<string, unknown>[];
      markings: Record<string, unknown>[];
    };
    delete json.containers[0]?.pageId;
    const canvas = json.markings.find((m) => m.id === 'K');
    delete canvas?.pageId;
    const result = deserialize(JSON.stringify(json));
    if (result.ok || result.error.code !== 'invariant-violation')
      throw new Error('expected');
    expect(result.error.issues.map((i) => `${i.code}:${i.id}`)).toEqual(
      expect.arrayContaining(['page-required:I1', 'page-required:K']),
    );
  });
});

describe('pages: the repair (Repair and open)', () => {
  it('no page: creates one with the given name and everything goes to it', () => {
    const p = { ...sampleProject(), pages: [] };
    const r = repaired(p);
    expect(r.project.pages).toHaveLength(1);
    expect(r.project.pages[0]?.name).toBe('Page 1');
    expect(r.codes[0]).toMatch(/^created:pages-empty:/);
    expect(r.project.containers.every((c) => c.pageId === r.project.pages[0]?.id)).toBe(
      true,
    );
  });

  it('a missing page or a missing pageId: the item goes to the first page', () => {
    const p = twoPages();
    const bad = patchMarking(
      {
        ...p,
        containers: p.containers.map((c) =>
          c.id === 'I3'
            ? { ...c, pageId: 'XX' }
            : c.id === 'I2'
              ? { ...c, pageId: '' }
              : c,
        ),
      },
      'K',
      { pageId: null },
    );
    const r = repaired(bad);
    expect(r.project.containers.find((c) => c.id === 'I3')?.pageId).toBe('PG1');
    expect(r.project.containers.find((c) => c.id === 'I2')?.pageId).toBe('PG1');
    expect(r.project.markings.find((m) => m.id === 'K')?.pageId).toBe('PG1');
    expect(r.codes).toEqual(
      expect.arrayContaining([
        'page-set:page-missing:I3',
        'page-set:page-required:I2',
        'page-set:page-required:K',
      ]),
    );
  });

  it('a pageId on a container marking becomes null', () => {
    const r = repaired(patchMarking(twoPages(), 'M1', { pageId: 'PG2' }));
    expect(r.project.markings.find((m) => m.id === 'M1')?.pageId).toBeNull();
    expect(r.codes).toContain('page-cleared:page-required:M1');
  });

  it('a parent on another page: the item becomes a root', () => {
    const r = repaired(patchMarking(twoPages(), 'J', { pageId: 'PG1' }));
    expect(r.project.markings.find((m) => m.id === 'J')?.parentId).toBeNull();
    expect(r.codes).toContain('made-root:page-parent-mismatch:J');
    const p = twoPages();
    const bad: Project = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'I3' ? { ...c, parentId: 'K', pageId: 'PG1' } : c,
      ),
    };
    const fixed = repaired(bad);
    expect(fixed.project.containers.find((c) => c.id === 'I3')?.parentId).toBeNull();
  });

  it('an arrow between pages leaves with its annotations, and the repair lists it', () => {
    let p = twoPages();
    p = createArrow(p, { id: 'AR', from: 'M4', to: 'M1' });
    const bad: Project = {
      ...p,
      arrows: p.arrows.map((a) => ({ ...a, to: 'K' })),
      annotations: [
        ...p.annotations,
        {
          id: 'AA',
          markingId: 'AR',
          layerId: 'L1',
          name: 'on the arrow',
          parentAnnotationId: null,
          parentRole: null,
          type: null,
          values: null,
          entries: [],
        },
      ],
    };
    expect(codes(bad)).toContain('arrow-cross-page:AR');
    const r = repaired(bad);
    expect(r.project.arrows).toEqual([]);
    expect(r.project.annotations.some((a) => a.id === 'AA')).toBe(false);
    expect(r.codes).toContain('removed:arrow-cross-page:AR');
  });

  it('a repeated page name: the repeated one gets a number; a repeated page id has no repair', () => {
    const p = twoPages();
    const named = {
      ...p,
      pages: [
        { id: 'PG1', name: 'Page 1' },
        { id: 'PG2', name: 'page 1 ' },
      ],
    };
    const r = repaired(named);
    expect(r.project.pages.map((g) => g.name)).toEqual(['Page 1', 'page 1 (2)']);
    const dupId = { ...p, pages: [...p.pages, { id: 'PG2', name: 'Other' }] };
    const result = repairProject(dupId, validateProject(dupId));
    expect(result.unrepaired.map((i) => i.code)).toEqual(['duplicate-id']);
  });

  it('a project that only needs the page repairs is valid and keeps the rest', () => {
    const p = patchMarking(twoPages(), 'J', { pageId: 'XX' });
    const codesBefore: InvariantCode[] = validateProject(p).map((i) => i.code);
    expect(codesBefore).toContain('page-missing');
    const r = repaired(p);
    expect(r.project.containers).toHaveLength(p.containers.length);
    expect(r.project.markings).toHaveLength(p.markings.length);
  });
});
