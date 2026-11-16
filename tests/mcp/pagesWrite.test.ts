import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  addLayer,
  createArrow,
  createMarking,
  createPage,
  createProject,
  serialize,
  type Project,
} from '../../src/model';
import { PROPOSAL_PAGES_FORMAT_VERSION } from '../../src/model/proposal';
import { NOW } from '../model/fixtures';
import {
  acceptAllAndApply,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, PNG_1X1, uuidFor, type Connection } from './workspace';

// Pages through the MCP write side (stage #883, PG5): a root needs a page in a project with
// several, `wrap_items` and arrows do not cross pages, and `add_page`, `update_page`,
// `delete_page` and `move_to_page` change the page list and the roots' pages.

const id = (name: string) => uuidFor(name, 'pgw:');
const PAGE_MAIN = id('P-main');
const PAGE_FLOWS = id('P-flows');
const PAGE_EMPTY = id('P-empty');

interface OpError {
  index: number;
  op: string;
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  contents?: Record<string, number>;
  arrows?: { arrow: string; from: string; to: string }[];
}
interface Plan {
  valid: boolean;
  errors?: OpError[];
  summary?: string[];
  created?: { op: number; alias?: string; kind: string; id?: string; name?: string }[];
}

let base: string;
let mcp: Connection;
let counter = 0;

const rect = { x: 10, y: 10, width: 40, height: 30 };
const bg = { width: 300, height: 200, background: '#FFFFFF' };

/**
 * Three pages: "Main" (container Home with a marking, a canvas marking, a lone container Solo with
 * two markings and an arrow between them, and an arrow from Home's marking to the canvas marking),
 * "Flows" (container Detail with a marking) and "Empty".
 */
function sample(): Project {
  let p = createProject({
    name: 'Pages',
    now: NOW,
    firstLayer: { id: id('L1'), name: 'Layer 1', color: '#D32F2F' },
    firstPage: { id: PAGE_MAIN, name: 'Main' },
  });
  p = addLayer(p, { id: id('L2'), name: 'Data', color: '#1976D2' });
  p = createPage(p, { id: PAGE_FLOWS, name: 'Flows' });
  p = createPage(p, { id: PAGE_EMPTY, name: 'Empty' });
  p = addBackgroundContainer(p, {
    id: id('Home'),
    name: 'Home',
    ...bg,
    pageId: PAGE_MAIN,
  });
  p = addBackgroundContainer(p, {
    id: id('Solo'),
    name: 'Solo',
    ...bg,
    pageId: PAGE_MAIN,
  });
  p = addBackgroundContainer(p, {
    id: id('Detail'),
    name: 'Detail',
    ...bg,
    pageId: PAGE_FLOWS,
  });
  p = createMarking(p, {
    id: id('M-home'),
    containerId: id('Home'),
    rect,
    name: 'Button',
  });
  p = createMarking(p, { id: id('M-solo1'), containerId: id('Solo'), rect, name: 'One' });
  p = createMarking(p, {
    id: id('M-solo2'),
    containerId: id('Solo'),
    rect: { x: 100, y: 100, width: 40, height: 30 },
    name: 'Two',
  });
  p = createMarking(p, {
    id: id('M-detail'),
    containerId: id('Detail'),
    rect,
    name: 'Detail button',
  });
  p = createMarking(p, {
    id: id('K-main'),
    containerId: null,
    pageId: PAGE_MAIN,
    rect: { x: 5000, y: 0, width: 80, height: 40 },
    name: 'Canvas note',
  });
  p = createArrow(p, { id: id('A-solo'), from: id('M-solo1'), to: id('M-solo2') });
  p = createArrow(p, { id: id('A-cross'), from: id('M-home'), to: id('K-main') });
  return p;
}

/** A project folder of its own (tests that apply a proposal change it). */
function fresh(source: Project = sample()): { name: string; dir: string } {
  const name = `p${++counter}`;
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(source));
  return { name, dir };
}

function single(): Project {
  let p = createProject({
    name: 'One page',
    now: NOW,
    firstLayer: { id: id('L1'), name: 'Layer 1', color: '#D32F2F' },
    firstPage: { id: PAGE_MAIN, name: 'Main' },
  });
  p = addBackgroundContainer(p, { id: id('Home'), name: 'Home', ...bg });
  return p;
}

let two: { name: string; dir: string };
let one: { name: string; dir: string };

const plan = async (operations: unknown[], project = two.name) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const codes = (result: Plan) => (result.errors ?? []).map((e) => e.code);

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-pages-write-'));
  two = fresh();
  one = fresh(single());
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('a root needs a page when the project has several', () => {
  it('add_container without `page` fails with page-required', async () => {
    const result = await plan([{ op: 'add_container', name: 'New', ...bg }]);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatchObject({ index: 0, code: 'page-required' });
    expect(result.errors?.[0]?.hint).toContain('page');
  });

  it('add_image and add_blank_image also need it', async () => {
    const result = await plan([
      { op: 'add_blank_image', name: 'New', ...bg },
      { op: 'add_image', base64: PNG_1X1.toString('base64'), fileName: 'x.png' },
    ]);
    expect(codes(result)[0]).toBe('page-required');
    expect(result.errors?.[0]).toMatchObject({ index: 0, op: 'add_blank_image' });
  });

  it('create_marking on the canvas without `page` fails with page-required', async () => {
    const result = await plan([{ op: 'create_marking', rect, name: 'Free' }]);
    expect(codes(result)).toEqual(['page-required']);
  });

  it('`page` by id and by name (case-insensitive) is accepted', async () => {
    const result = await plan([
      { op: 'add_container', name: 'ById', page: PAGE_FLOWS, ...bg },
      { op: 'add_container', name: 'ByName', page: 'fLoWs', ...bg },
      { op: 'create_marking', page: 'Main', rect, name: 'Free' },
    ]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('an unknown `page` fails with page-not-found', async () => {
    const result = await plan([{ op: 'add_container', page: 'Nowhere', ...bg }]);
    expect(codes(result)).toEqual(['page-not-found']);
  });

  it('`container`, `near`, `beside` and `inside` already say the page', async () => {
    const result = await plan([
      { op: 'create_marking', container: 'Home', rect: { ...rect, x: 100 } },
      { op: 'add_container', name: 'Next', beside: 'Detail', ...bg },
      {
        op: 'create_marking',
        near: id('Detail'),
        annotation: { type: 'notas/nota' },
        name: 'Nota',
      },
    ]);
    // The project has no notes library: only the first two have to be free of page-required.
    expect(codes(result)).not.toContain('page-required');
    expect(result.errors?.filter((e) => e.index < 2)).toEqual([]);
  });

  it('`page` with `container` on create_marking is invalid-arguments', async () => {
    const result = await plan([
      { op: 'create_marking', container: 'Home', page: 'Main', rect },
    ]);
    expect(codes(result)).toEqual(['invalid-arguments']);
  });

  it('`page` and `beside` on different pages fail', async () => {
    const result = await plan([
      { op: 'add_container', name: 'Next', beside: 'Detail', page: 'Main', ...bg },
    ]);
    expect(result.valid).toBe(false);
    expect(codes(result)).toHaveLength(1);
  });

  it('`page` and `near` on different pages fail', async () => {
    const result = await plan([
      { op: 'create_marking', near: id('Detail'), page: 'Main', rect, name: 'X' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.code).toBe('invalid-arguments');
    expect(result.errors?.[0]?.message).toMatch(/page/);
  });

  it('with a single page nothing is required', async () => {
    const result = await plan(
      [
        { op: 'add_container', name: 'New', ...bg },
        { op: 'create_marking', rect, name: 'Free' },
      ],
      one.name,
    );
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.valid).toBe(true);
  });
});

describe('items and arrows do not cross pages', () => {
  it('wrap_items with items of different pages fails with page-mixed', async () => {
    const result = await plan([
      { op: 'wrap_items', items: [id('Home'), id('Detail')], name: 'Group' },
    ]);
    expect(codes(result)).toEqual(['page-mixed']);
  });

  it('wrap_items on one page works', async () => {
    const result = await plan([
      { op: 'wrap_items', items: [id('M-solo1'), id('M-solo2')], name: 'Group' },
    ]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
  });

  it('create_arrow between pages fails with arrow-cross-page', async () => {
    const result = await plan([
      { op: 'create_arrow', from: id('M-home'), to: id('M-detail') },
    ]);
    expect(codes(result)).toEqual(['arrow-cross-page']);
  });
});

describe('add_page, update_page and delete_page', () => {
  it('add_page creates a page that the next operations name (by name and by alias)', async () => {
    const result = await plan([
      { op: 'add_page', name: 'Settings', as: '$settings' },
      { op: 'add_container', name: 'Prefs', page: 'settings', ...bg },
      { op: 'add_container', name: 'Prefs 2', page: '$settings', ...bg },
      { op: 'create_marking', page: '$settings', rect, name: 'Free' },
    ]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.created?.[0]).toMatchObject({
      op: 0,
      alias: '$settings',
      kind: 'page',
      name: 'Settings',
    });
  });

  it('a name already taken fails with page-name-taken; an empty one with page-name-empty', async () => {
    const result = await plan([
      { op: 'add_page', name: ' flows ' },
      { op: 'add_page', name: '  ' },
    ]);
    expect(codes(result)).toEqual(['page-name-taken', 'page-name-empty']);
  });

  it('update_page renames and moves; with neither it changes nothing', async () => {
    const result = await plan([
      { op: 'update_page', page: 'Flows', name: 'User flows', position: 0 },
      { op: 'update_page', page: 'User flows' },
    ]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.summary?.[0]).toMatch(/User flows/);
  });

  it('update_page to a taken name fails', async () => {
    const result = await plan([{ op: 'update_page', page: 'Flows', name: 'main' }]);
    expect(codes(result)).toEqual(['page-name-taken']);
  });

  it('delete_page with content and without a destination fails with page-not-empty and the counts', async () => {
    const result = await plan([{ op: 'delete_page', page: 'Main' }]);
    expect(codes(result)).toEqual(['page-not-empty']);
    expect(result.errors?.[0]?.contents).toEqual({
      roots: 3,
      containers: 2,
      markings: 4,
      arrows: 2,
      annotations: 0,
    });
  });

  it('delete_page with both `move_to` and `discard` is invalid-arguments', async () => {
    const result = await plan([
      { op: 'delete_page', page: 'Flows', move_to: 'Main', discard: true },
    ]);
    expect(codes(result)).toEqual(['invalid-arguments']);
  });

  it('delete_page of an empty page needs neither', async () => {
    const result = await plan([{ op: 'delete_page', page: 'Empty' }]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.summary?.[0]).toMatch(/Empty/);
  });

  it('deleting the last page fails with page-last', async () => {
    const result = await plan([{ op: 'delete_page', page: 'Main' }], one.name);
    expect(codes(result)).toEqual(['page-last']);
  });

  it('delete_page with `move_to` moves the content; with `discard` it is deleted', async () => {
    const moved = fresh();
    const proposedMove = await propose(mcp, moved.name, [
      { op: 'delete_page', page: 'Flows', move_to: 'Main' },
    ]);
    expect(proposedMove.valid, JSON.stringify(proposedMove.errors)).toBe(true);
    expect(proposedMove.summary.join('\n')).toMatch(/Main/);
    const afterMove = acceptAllAndApply(moved.dir, proposedMove.proposal.id);
    expect(afterMove.pages.map((g) => g.name)).toEqual(['Main', 'Empty']);
    expect(afterMove.containers.find((c) => c.id === id('Detail'))?.pageId).toBe(
      PAGE_MAIN,
    );
    expect(afterMove.markings.some((m) => m.id === id('M-detail'))).toBe(true);

    const discarded = fresh();
    const proposedDiscard = await propose(mcp, discarded.name, [
      { op: 'delete_page', page: 'Flows', discard: true },
    ]);
    expect(proposedDiscard.valid, JSON.stringify(proposedDiscard.errors)).toBe(true);
    expect(proposedDiscard.summary.join('\n')).toMatch(/discard/i);
    const afterDiscard = acceptAllAndApply(discarded.dir, proposedDiscard.proposal.id);
    expect(afterDiscard.pages.map((g) => g.name)).toEqual(['Main', 'Empty']);
    expect(afterDiscard.containers.some((c) => c.id === id('Detail'))).toBe(false);
    expect(afterDiscard.markings.some((m) => m.id === id('M-detail'))).toBe(false);
  });
});

describe('move_to_page', () => {
  it('moves the roots with what belongs to them, keeping their relative positions', async () => {
    const target = fresh();
    const before = readProject(target.dir);
    const proposed = await propose(mcp, target.name, [
      { op: 'move_to_page', roots: [id('Solo')], page: 'Flows' },
    ]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(target.dir, proposed.proposal.id);
    const solo = after.containers.find((c) => c.id === id('Solo'))!;
    expect(solo.pageId).toBe(PAGE_FLOWS);
    const rectOf = (p: Project, markingId: string) =>
      p.markings.find((m) => m.id === markingId)!.rect;
    // Markings inside a container keep their pixels.
    expect(rectOf(after, id('M-solo1'))).toEqual(rectOf(before, id('M-solo1')));
    expect(rectOf(after, id('M-solo2'))).toEqual(rectOf(before, id('M-solo2')));
    // It lands to the right of what was on the page.
    const detail = after.containers.find((c) => c.id === id('Detail'))!;
    expect(solo.placement.x).toBeGreaterThan(detail.placement.x);
  });

  it('moving to the page the roots are already on changes nothing and says so', async () => {
    const result = await plan([
      { op: 'move_to_page', roots: [id('Home')], page: 'Main' },
    ]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.summary?.[0]).toMatch(/already/);
  });

  it('something that is not a root fails with not-root', async () => {
    const result = await plan([
      { op: 'move_to_page', roots: [id('M-home')], page: 'Flows' },
    ]);
    expect(codes(result)).toEqual(['not-root']);
  });

  it('an arrow that would cross is refused and the error carries the arrows', async () => {
    const result = await plan([
      { op: 'move_to_page', roots: [id('Home')], page: 'Flows' },
    ]);
    expect(codes(result)).toEqual(['page-arrow-crossing']);
    const error = result.errors![0]!;
    expect(error.arrows).toHaveLength(1);
    expect(error.arrows![0]).toEqual({
      arrow: expect.stringContaining('/m/'),
      from: expect.stringContaining('/m/'),
      to: expect.stringContaining('/m/'),
    });
  });

  it('a root created earlier in the batch can move (alias)', async () => {
    const result = await plan([
      { op: 'add_container', name: 'Fresh', page: 'Main', ...bg, as: '$fresh' },
      { op: 'move_to_page', roots: ['$fresh'], page: 'Flows' },
    ]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
  });
});

describe('a mixed batch through plan_changes and propose_changes', () => {
  const batch = [
    { op: 'add_page', name: 'Settings', as: '$settings' },
    { op: 'add_container', name: 'Prefs', page: 'Settings', ...bg, as: '$prefs' },
    { op: 'create_marking', container: '$prefs', rect, name: 'Toggle' },
    { op: 'update_page', page: '$settings', position: 0 },
    { op: 'move_to_page', roots: [id('Solo')], page: '$settings' },
  ];

  it('plans', async () => {
    const result = await plan(batch);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('proposes with formatVersion 10 and applies', async () => {
    const target = fresh();
    const proposed = await propose(mcp, target.name, batch);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    expect(PROPOSAL_PAGES_FORMAT_VERSION).toBe(10);
    expect(readProposal(target.dir, proposed.proposal.id).formatVersion).toBe(10);
    const after = acceptAllAndApply(target.dir, proposed.proposal.id);
    expect(after.pages.map((g) => g.name)).toEqual([
      'Settings',
      'Main',
      'Flows',
      'Empty',
    ]);
    const settings = after.pages[0]!.id;
    expect(after.containers.find((c) => c.name === 'Prefs')?.pageId).toBe(settings);
    expect(after.containers.find((c) => c.id === id('Solo'))?.pageId).toBe(settings);
  });

  it('a batch without page changes keeps the earlier format version', async () => {
    const target = fresh(single());
    const proposed = await propose(mcp, target.name, [
      { op: 'create_marking', container: 'Home', rect, name: 'Plain' },
    ]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    expect(readProposal(target.dir, proposed.proposal.id).formatVersion).toBeLessThan(10);
  });
});
