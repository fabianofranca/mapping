import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  buildPerspective,
  createMarking,
  createPage,
  createProject,
  serialize,
  type Project,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { createCodeWorkspace, type CodeWorkspace } from './codeWorkspace';
import { errorOf, ok } from './proposalSupport';
import { readThread, seedThread } from './threadSupport';
import { codeOf, connect, PNG_1X1, uuidFor, type Connection } from './workspace';

// Pages through the MCP (stage #883, PG5): the read side learns about them. `get_project` lists `pages` and,
// with several, asks for `page` to list containers; `list_markings` and `get_perspective` take `page`; the
// global searches and the conversations say the page of what they point to; `open_thread` puts a canvas
// point on a page.

const id = (name: string) => uuidFor(name, 'pages:');

interface PageRef {
  id: string;
  name: string;
}
interface PageSummary extends PageRef {
  roots: number;
  containers: number;
  markings: number;
  arrows: number;
}
interface ProjectData {
  pages: PageSummary[];
  page?: PageRef;
  hint?: string;
  containers: { ref: string; name: string | null }[];
}
interface Listed {
  total: number;
  markings: { ref: string; name: string | null }[];
}
interface PerspectiveData {
  page?: PageRef;
  roots: { ref: string; page: PageRef }[];
}
interface ThreadRow {
  ref: string;
  page?: PageRef;
  anchor: unknown;
}

let base: string;
let mcp: Connection;
let code: CodeWorkspace;
let codeMcp: Connection;
const firstPage: Record<'one' | 'multi', PageRef> = {
  one: { id: '', name: '' },
  multi: { id: '', name: '' },
};
const pageTwo: PageRef = { id: id('PG2'), name: 'Checkout' };
const ref = (project: string, letter: string, name: string) =>
  `mapping://${project}/${letter}/${codeOf(id(name))}`;

/** Two containers (one per page), a container marking and a canvas marking on each page, and a perspective with both roots. */
function sample(pages: 1 | 2): Project {
  let p = createProject({
    name: 'Pages',
    now: NOW,
    firstLayer: { id: id('L1'), name: 'Layer 1', color: '#D32F2F' },
  });
  if (pages === 2) p = createPage(p, { id: pageTwo.id, name: pageTwo.name });
  firstPage[pages === 1 ? 'one' : 'multi'] = {
    id: p.pages[0]!.id,
    name: p.pages[0]!.name,
  };
  p = addContainer(p, { id: id('C1'), file: 'images/a.png', width: 100, height: 100 });
  p = createMarking(p, {
    id: id('M1'),
    containerId: id('C1'),
    rect: { x: 5, y: 5, width: 20, height: 20 },
    name: 'Button',
  });
  p = createMarking(p, {
    id: id('K1'),
    containerId: null,
    rect: { x: 5000, y: 4000, width: 80, height: 30 },
    name: 'Banner',
  });
  if (pages === 2) {
    p = addContainer(p, {
      id: id('C2'),
      file: 'images/b.png',
      width: 100,
      height: 100,
      pageId: pageTwo.id,
    });
    p = createMarking(p, {
      id: id('M2'),
      containerId: id('C2'),
      rect: { x: 5, y: 5, width: 20, height: 20 },
      name: 'Pay',
    });
    p = createMarking(p, {
      id: id('K2'),
      containerId: null,
      pageId: pageTwo.id,
      rect: { x: 5000, y: 4000, width: 80, height: 30 },
      name: 'Total',
    });
  }
  const view = buildPerspective(p, {
    id: id('P1'),
    name: 'Both',
    startFrom: null,
    hiddenLayers: [],
  });
  const items =
    pages === 2
      ? [
          { root: id('C1'), x: 10, y: 10 },
          { root: id('C2'), x: 300, y: 10 },
        ]
      : [{ root: id('C1'), x: 10, y: 10 }];
  return { ...p, perspectives: [{ ...view, items }] };
}

function writeProject(dir: string, project: Project): void {
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(project));
  writeFileSync(join(dir, 'images', 'a.png'), PNG_1X1);
  writeFileSync(join(dir, 'images', 'b.png'), PNG_1X1);
}

/** The `cadastro` project of the code workspace with its container on a second page, and an origin on a marking. */
function twoPagesInCode(dir: string): void {
  const path = join(dir, 'mapping.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as {
    pages: PageRef[];
    containers: { pageId: string }[];
    markings: { name: string | null; source: unknown }[];
  };
  doc.pages = [...doc.pages, pageTwo];
  doc.containers[0]!.pageId = pageTwo.id;
  const button = doc.markings.find((m) => m.name === 'Cadastrar')!;
  button.source = { system: 'figma', id: '9:9', url: null };
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-pages-read-'));
  writeProject(join(base, 'one'), sample(1));
  writeProject(join(base, 'multi'), sample(2));
  mcp = await connect([base]);
  code = createCodeWorkspace();
  twoPagesInCode(code.projectDir('cadastro'));
  codeMcp = await connect([code.root], { cwd: code.repo });
});

afterAll(async () => {
  await mcp?.close();
  await codeMcp?.close();
  rmSync(base, { recursive: true, force: true });
  if (code) rmSync(code.base, { recursive: true, force: true });
});

describe('get_project', () => {
  it('a single-page project is as before, plus `pages`', async () => {
    const data = ok(await mcp.call<ProjectData>('get_project', { project: 'one' }));
    expect(data.pages).toEqual([
      { ...firstPage.one, roots: 2, containers: 1, markings: 2, arrows: 0 },
    ]);
    expect(data.containers).toHaveLength(1);
    expect(data).not.toHaveProperty('hint');
    expect(data).not.toHaveProperty('page');
  });

  it('several pages and no `page`: no containers and a hint that says how to list them', async () => {
    const data = ok(await mcp.call<ProjectData>('get_project', { project: 'multi' }));
    expect(data.pages.map((g) => g.name)).toEqual([firstPage.multi.name, 'Checkout']);
    expect(data.pages[1]).toEqual({
      ...pageTwo,
      roots: 2,
      containers: 1,
      markings: 2,
      arrows: 0,
    });
    expect(data.containers).toEqual([]);
    expect(data.hint).toContain('2 pages');
    expect(data.hint).toContain('`page`');
    expect(data.hint).toContain('`pages`');
  });

  it('`page` by id or by name lists only that page and echoes it', async () => {
    for (const page of [pageTwo.id, 'checkout']) {
      const data = ok(
        await mcp.call<ProjectData>('get_project', { project: 'multi', page }),
      );
      expect(data.page).toEqual(pageTwo);
      expect(data.containers.map((c) => c.ref)).toEqual([ref('multi', 'i', 'C2')]);
      expect(data).not.toHaveProperty('hint');
    }
  });

  it('an unknown page fails with page-not-found and the pages', async () => {
    const error = errorOf(
      await mcp.call('get_project', { project: 'multi', page: 'Nowhere' }),
    );
    expect(error.code).toBe('page-not-found');
  });
});

describe('list_markings', () => {
  it('`page` keeps the markings of the containers of that page', async () => {
    const listed = ok(
      await mcp.call<Listed>('list_markings', { project: 'multi', page: 'Checkout' }),
    );
    expect(listed.markings.map((m) => m.ref)).toEqual([ref('multi', 'm', 'M2')]);
    expect(listed.total).toBe(1);
  });

  it('combines with `canvas` and `text`', async () => {
    const canvas = ok(
      await mcp.call<Listed>('list_markings', {
        project: 'multi',
        page: pageTwo.id,
        canvas: true,
      }),
    );
    expect(canvas.markings.map((m) => m.ref)).toEqual([ref('multi', 'm', 'K2')]);
    const none = ok(
      await mcp.call<Listed>('list_markings', {
        project: 'multi',
        page: pageTwo.id,
        canvas: true,
        text: 'banner',
      }),
    );
    expect(none.total).toBe(0);
  });

  it('an unknown page fails with page-not-found', async () => {
    const error = errorOf(
      await mcp.call('list_markings', { project: 'multi', page: 'Nowhere' }),
    );
    expect(error.code).toBe('page-not-found');
  });
});

describe('get_perspective', () => {
  it('every root says its page', async () => {
    const data = ok(
      await mcp.call<PerspectiveData>('get_perspective', {
        project: 'multi',
        id: id('P1'),
      }),
    );
    expect(data.roots.map((r) => [r.ref, r.page])).toEqual([
      [ref('multi', 'i', 'C1'), firstPage.multi],
      [ref('multi', 'i', 'C2'), pageTwo],
    ]);
    expect(data).not.toHaveProperty('page');
  });

  it('`page` keeps only the roots of that page and echoes it', async () => {
    const data = ok(
      await mcp.call<PerspectiveData>('get_perspective', {
        project: 'multi',
        id: id('P1'),
        page: 'checkout',
      }),
    );
    expect(data.page).toEqual(pageTwo);
    expect(data.roots.map((r) => r.ref)).toEqual([ref('multi', 'i', 'C2')]);
  });
});

describe('global searches say the page', () => {
  it('find_by_code: each annotation says the page of its marking', async () => {
    const found = ok(
      await codeMcp.call<{
        matches: { project: string; annotations: { page?: PageRef }[] }[];
      }>('find_by_code', { path: 'DSButton.kt' }),
    );
    const mine = found.matches.find((m) => m.project === 'cadastro')!;
    expect(mine.annotations[0]!.page).toEqual(pageTwo);
  });

  it('find_by_source: each match says its page', async () => {
    const found = ok(
      await codeMcp.call<{ matches: { project: string; page?: PageRef }[] }>(
        'find_by_source',
        { project: 'cadastro', system: 'figma', id: '9:9' },
      ),
    );
    expect(found.matches).toHaveLength(1);
    expect(found.matches[0]!.page).toEqual(pageTwo);
  });

  it('list_threads: a thread anchored to an item says the page of the item', async () => {
    const dir = join(base, 'multi');
    seedThread(dir, {
      anchor: { kind: 'marking', id: id('M2') },
      messages: [{ by: 'human', text: 'What is Pay?' }],
    });
    seedThread(dir, {
      anchor: { kind: 'point', containerId: null, x: 3, y: 4, pageId: pageTwo.id },
      messages: [{ by: 'human', text: 'Here' }],
    });
    const listed = ok(
      await mcp.call<{ threads: ThreadRow[] }>('list_threads', { project: 'multi' }),
    );
    expect(listed.threads).toHaveLength(2);
    for (const row of listed.threads) expect(row.page).toEqual(pageTwo);
    const point = listed.threads.find(
      (row) => (row.anchor as { point?: unknown }).point !== undefined,
    )!;
    expect(point.anchor).toEqual({
      point: { container: null, x: 3, y: 4, page: pageTwo },
    });
  });
});

describe('open_thread on a canvas point', () => {
  const open = (project: string, point: Record<string, unknown>) =>
    mcp.call<{ id: string; anchor: { point: { page?: PageRef } } }>('open_thread', {
      project,
      anchor: { point },
      text: 'Is this the right place?',
    });

  it('with several pages it needs `page`', async () => {
    const comments = join(base, 'multi', 'comments');
    const count = () => (existsSync(comments) ? readdirSync(comments).length : 0);
    const before = count();
    const error = errorOf(await open('multi', { container: null, x: 1, y: 2 }));
    expect(error.code).toBe('page-required');
    expect(count()).toBe(before);
  });

  it('with `page` the thread is saved in formatVersion 2 and read back with the page', async () => {
    const opened = ok(
      await open('multi', { container: null, x: 7, y: 8, page: 'checkout' }),
    );
    expect(opened.anchor.point.page).toEqual(pageTwo);
    const stored = readThread(join(base, 'multi'), opened.id);
    expect(stored.formatVersion).toBe(2);
    expect(stored.anchor).toEqual({
      kind: 'point',
      containerId: null,
      x: 7,
      y: 8,
      pageId: pageTwo.id,
    });
    const got = ok(
      await mcp.call<{ anchor: { point: { page?: PageRef } } }>('get_thread', {
        project: 'multi',
        ref: opened.id,
      }),
    );
    expect(got.anchor.point.page).toEqual(pageTwo);
  });

  it('with a single page the point gets that page', async () => {
    const opened = ok(await open('one', { container: null, x: 1, y: 1 }));
    expect(opened.anchor.point.page).toEqual(firstPage.one);
    expect(readThread(join(base, 'one'), opened.id).anchor).toMatchObject({
      pageId: firstPage.one.id,
    });
  });

  it('a point inside a container never has a page', async () => {
    const opened = ok(
      await open('multi', { container: ref('multi', 'i', 'C1'), x: 5, y: 5 }),
    );
    expect(opened.anchor.point).not.toHaveProperty('page');
    const stored = readThread(join(base, 'multi'), opened.id);
    expect(stored.formatVersion).toBe(1);
  });
});
