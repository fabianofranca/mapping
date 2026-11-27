import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROPOSAL_DECORATIVE_FORMAT_VERSION, type Project } from '../../src/model';
import {
  acceptAllAndApply,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// `decorative` in the MCP (stage #2826, DM3): `create_marking.decorative` (absent takes the type's
// value), `update_marking.decorative` with the errors `locked` and `decorative-floating`, `decorative`
// in `get_marking`, in the `list_markings` rows and as its filter, a decorative member in `wrap_items`,
// and the proposal written at the new `formatVersion`.

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  warnings?: { code: string; op: number; message: string }[];
  summary: string[];
}

interface MarkingData {
  decorative: boolean;
  members: { markings: { ref: string; name: string | null }[] };
}

interface Listing {
  total: number;
  markings: { ref: string; name: string | null; decorative: boolean }[];
}

// A specialization with a decorative type (without a component: a bare outlined marking) and an
// ordinary one.
const SPEC = {
  format: 'mapping-spec',
  formatVersion: 25,
  id: 'deco',
  name: 'Deco',
  version: 1,
  platforms: [{ id: 'web', name: 'Web', language: 'typescript' }],
  layers: [
    {
      id: 'notas',
      name: 'Notes',
      color: '#1565C0',
      annotationTypes: [
        {
          id: 'moldura',
          name: 'Frame',
          decorative: true,
          fields: [{ key: 'titulo', type: 'string' }],
        },
        { id: 'item', name: 'Item', fields: [{ key: 'titulo', type: 'string' }] },
      ],
    },
  ],
};

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const container = (as: string, name: string) => ({
  op: 'add_container',
  as,
  name,
  width: 400,
  height: 300,
  background: '#FFFFFF',
});

let root: string;
let mcp: Connection;
let dir: string;
const project = 'deco';

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

async function apply(operations: unknown[]): Promise<Project> {
  const proposed = await propose(mcp, project, operations);
  expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
  return acceptAllAndApply(dir, proposed.proposal.id);
}

const byName = (p: Project, name: string) => p.markings.find((m) => m.name === name)!;
const get = async (id: string) =>
  ok(await mcp.call<MarkingData>('get_marking', { project, ref: id }));
const list = async (args: Record<string, unknown>) =>
  ok(await mcp.call<Listing>('list_markings', { project, ...args }));

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-decorative-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'deco.json'), JSON.stringify(SPEC));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
  await apply([{ op: 'apply_specialization', file: 'fontes/deco.json' }]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('create_marking.decorative', () => {
  it('a marking created with an annotation of a decorative type is decorative and first among its siblings', async () => {
    const saved = await apply([
      container('$s', 'CreateScreen'),
      { op: 'create_marking', container: '$s', rect: rect(20, 30, 100, 60), name: 'S1' },
      { op: 'create_marking', container: '$s', rect: rect(150, 30, 100, 60), name: 'S2' },
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(10, 10, 380, 120),
        name: 'Frame',
        annotation: { type: 'deco/moldura' },
      },
    ]);
    const frame = byName(saved, 'Frame');
    expect(frame.decorative).toBe(true);
    const order = saved.markings.filter((m) => m.containerId === frame.containerId);
    expect(order[0]!.id).toBe(frame.id);
    // It is never a parent: the samples it covers stay outside it.
    expect(byName(saved, 'S1').parentId).toBeNull();
    expect(byName(saved, 'S2').parentId).toBeNull();
  });

  it('decorative: false makes it an ordinary marking that adopts what it contains', async () => {
    const saved = await apply([
      container('$s', 'OrdinaryScreen'),
      { op: 'create_marking', container: '$s', rect: rect(20, 30, 100, 60), name: 'T1' },
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(10, 10, 380, 120),
        name: 'Plain',
        decorative: false,
        annotation: { type: 'deco/moldura' },
      },
    ]);
    const plain = byName(saved, 'Plain');
    expect(plain.decorative).toBe(false);
    expect(byName(saved, 'T1').parentId).toBe(plain.id);
  });

  it('a type that is not decorative creates an ordinary marking, and decorative: true makes it decorative', async () => {
    const saved = await apply([
      container('$s', 'ItemScreen'),
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(10, 10, 100, 60),
        name: 'Plain item',
        annotation: { type: 'deco/item' },
      },
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(150, 10, 100, 60),
        name: 'Forced item',
        decorative: true,
        annotation: { type: 'deco/item' },
      },
    ]);
    expect(byName(saved, 'Plain item').decorative).toBe(false);
    expect(byName(saved, 'Forced item').decorative).toBe(true);
  });

  it('a bare create_marking with decorative: true works and is first among its siblings', async () => {
    const saved = await apply([
      container('$s', 'BareScreen'),
      { op: 'create_marking', container: '$s', rect: rect(20, 30, 100, 60), name: 'B1' },
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(10, 10, 380, 120),
        name: 'Bare',
        decorative: true,
      },
    ]);
    const bare = byName(saved, 'Bare');
    expect(bare.decorative).toBe(true);
    expect(saved.markings.filter((m) => m.containerId === bare.containerId)[0]!.id).toBe(
      bare.id,
    );
    expect(byName(saved, 'B1').parentId).toBeNull();
  });
});

describe('update_marking.decorative', () => {
  it('turns on and off, and get_marking shows the flag and the members', async () => {
    const saved = await apply([
      container('$s', 'ToggleScreen'),
      { op: 'create_marking', container: '$s', rect: rect(10, 10, 300, 200), name: 'P' },
      { op: 'create_marking', container: '$s', rect: rect(30, 30, 50, 50), name: 'C' },
    ]);
    const p = byName(saved, 'P');
    const c = byName(saved, 'C');
    expect(c.parentId).toBe(p.id);
    expect((await get(p.id)).members.markings.map((m) => m.name)).toEqual(['C']);

    const turnOn = await plan([
      { op: 'update_marking', marking: p.id, decorative: true },
    ]);
    expect(turnOn.valid, JSON.stringify(turnOn.errors)).toBe(true);
    expect(turnOn.summary.join('\n')).toMatch(/decorative/);

    const on = await apply([{ op: 'update_marking', marking: p.id, decorative: true }]);
    expect(byName(on, 'P').decorative).toBe(true);
    expect(byName(on, 'C').parentId).toBeNull();
    const viewOn = await get(p.id);
    expect(viewOn.decorative).toBe(true);
    expect(viewOn.members.markings).toEqual([]);

    const turnOff = await plan([
      { op: 'update_marking', marking: p.id, decorative: false },
    ]);
    expect(turnOff.summary.join('\n')).toMatch(/stop being decorative/);
    const off = await apply([{ op: 'update_marking', marking: p.id, decorative: false }]);
    expect(byName(off, 'P').decorative).toBe(false);
    expect(byName(off, 'C').parentId).toBe(p.id);
    const viewOff = await get(p.id);
    expect(viewOff.decorative).toBe(false);
    expect(viewOff.members.markings.map((m) => m.name)).toEqual(['C']);
  });

  it('a locked marking fails with locked, in both directions', async () => {
    const created = await apply([
      container('$s', 'LockedScreen'),
      {
        op: 'create_marking',
        as: '$l',
        container: '$s',
        rect: rect(10, 10, 100, 60),
        name: 'L',
      },
      {
        op: 'create_marking',
        as: '$ld',
        container: '$s',
        rect: rect(150, 10, 100, 60),
        name: 'LD',
        decorative: true,
      },
      { op: 'update_marking', marking: '$l', locked: true },
      { op: 'update_marking', marking: '$ld', locked: true },
    ]);
    const l = byName(created, 'L');
    const ld = byName(created, 'LD');
    const on = await plan([{ op: 'update_marking', marking: l.id, decorative: true }]);
    expect(on.valid).toBe(false);
    expect(on.errors?.[0]).toMatchObject({ index: 0, code: 'locked' });
    const off = await plan([{ op: 'update_marking', marking: ld.id, decorative: false }]);
    expect(off.valid).toBe(false);
    expect(off.errors?.[0]).toMatchObject({ index: 0, code: 'locked' });
  });

  it('a floating marking fails with decorative-floating, and so does floating on a decorative one', async () => {
    const created = await apply([
      { op: 'create_marking', rect: rect(-5000, -5000, 100, 80), name: 'Loose' },
      { op: 'create_marking', rect: rect(-5000, -4000, 100, 80), name: 'Decor' },
    ]);
    const decor = byName(created, 'Decor');
    await apply([{ op: 'update_marking', marking: decor.id, decorative: true }]);
    const loose = byName(created, 'Loose');
    await apply([{ op: 'update_marking', marking: loose.id, floating: true }]);

    const toDecorative = await plan([
      { op: 'update_marking', marking: loose.id, decorative: true },
    ]);
    expect(toDecorative.valid).toBe(false);
    expect(toDecorative.errors?.[0]).toMatchObject({
      index: 0,
      code: 'decorative-floating',
    });
    const toFloating = await plan([
      { op: 'update_marking', marking: decor.id, floating: true },
    ]);
    expect(toFloating.valid).toBe(false);
    expect(toFloating.errors?.[0]).toMatchObject({
      index: 0,
      code: 'decorative-floating',
    });
  });
});

describe('list_markings', () => {
  it('the rows carry decorative and the filter keeps the decorative ones or the others', async () => {
    await apply([
      container('$s', 'ListScreen'),
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(20, 30, 100, 60),
        name: 'Sample',
      },
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(10, 10, 380, 120),
        name: 'ListFrame',
        decorative: true,
      },
    ]);
    const all = await list({ container: 'ListScreen' });
    const rows = new Map(all.markings.map((m) => [m.name, m.decorative]));
    expect(rows.get('ListFrame')).toBe(true);
    expect(rows.get('Sample')).toBe(false);

    const only = await list({ container: 'ListScreen', decorative: true });
    expect(only.markings.map((m) => m.name)).toEqual(['ListFrame']);
    const others = await list({ container: 'ListScreen', decorative: false });
    expect(others.markings.map((m) => m.name)).toEqual(['Sample']);
  });
});

describe('wrap_items', () => {
  it('a decorative member goes in (no ignored warning) and becomes a child of the new marking', async () => {
    const before = await apply([
      container('$s', 'WrapScreen'),
      { op: 'create_marking', container: '$s', rect: rect(50, 50, 40, 30), name: 'WA' },
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(120, 60, 40, 30),
        name: 'WD',
        decorative: true,
      },
    ]);
    const items = [byName(before, 'WA').id, byName(before, 'WD').id];
    const planned = await plan([{ op: 'wrap_items', items }]);
    expect(planned.valid, JSON.stringify(planned.errors)).toBe(true);
    expect(planned.warnings).toBeUndefined();

    const after = await apply([{ op: 'wrap_items', items, name: 'Wrapper' }]);
    const wrapper = byName(after, 'Wrapper');
    expect(byName(after, 'WA').parentId).toBe(wrapper.id);
    expect(byName(after, 'WD').parentId).toBe(wrapper.id);
    expect(byName(after, 'WD').decorative).toBe(true);
  });

  it('wrapping only a decorative marking works', async () => {
    const before = readProject(dir);
    const only = await plan([{ op: 'wrap_items', items: [byName(before, 'WD').id] }]);
    expect(only.valid, JSON.stringify(only.errors)).toBe(true);
    expect(only.warnings).toBeUndefined();
  });
});

describe('propose_changes', () => {
  it('writes the proposal at the decorative formatVersion only when it uses decorative', async () => {
    const withFlag = await propose(mcp, project, [
      container('$s', 'ProposalScreen'),
      {
        op: 'create_marking',
        container: '$s',
        rect: rect(10, 10, 100, 60),
        name: 'Proposed',
        decorative: true,
      },
    ]);
    expect(withFlag.valid, JSON.stringify(withFlag.errors)).toBe(true);
    expect(readProposal(dir, withFlag.proposal.id).formatVersion).toBe(
      PROPOSAL_DECORATIVE_FORMAT_VERSION,
    );

    const without = await propose(mcp, project, [
      container('$s', 'PlainProposalScreen'),
      { op: 'create_marking', container: '$s', rect: rect(10, 10, 100, 60), name: 'P2' },
    ]);
    expect(without.valid, JSON.stringify(without.errors)).toBe(true);
    expect(readProposal(dir, without.proposal.id).formatVersion).toBeLessThan(
      PROPOSAL_DECORATIVE_FORMAT_VERSION,
    );
  });
});
