import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROPOSAL_DRAWING_MODE_MAP_FORMAT_VERSION } from '../../src/model';
import { parseSpec } from '../../src/model/spec';
import {
  acceptAllAndApply,
  errorOf,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Phase CF6 (schema v18), then phase NV3 (schema v24, stage #1900): the drawing mode in the MCP, as a map
// axis -> entry. `update_project` pins or removes the project's mode; `add_container` and `update_container`
// pin the container's (`null` goes back to following the project's); a string is the entry of every
// declared axis that has it; `get_project`, `get_container` and `list_markings` return the maps.

const lib = (id: string, tokens: unknown) => ({
  format: 'mapping-spec',
  formatVersion: id === 'axes' ? 23 : 15,
  id,
  name: id,
  version: 1,
  tokens,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [{ id: 'btn', name: 'Button', fields: [] }],
    },
  ],
});

// Axis `mode`: light, dim, compact.
const MODES = lib('modes', {
  modes: ['light', 'dim', 'compact'],
  values: { bg: { light: '#ffffff', dim: '#444444', compact: '#eeeeee' } },
});

// Axes `theme` (light, dark) and `accent` (vivid, dark): `dark` is an entry of both.
const AXES = lib('axes', {
  axes: { theme: ['light', 'dark'], accent: ['vivid', 'dark'] },
  values: {
    bg: { $axis: 'theme', light: '#ffffff', dark: '#000000' },
    ink: {
      $value: { $axis: 'theme', light: '#000000', dark: '#ffffff' },
      $description: 'text color',
      $group: 'color',
      $notices: [{ kind: 'deprecated', message: 'use fg' }],
    },
    tint: { $axis: 'accent', vivid: '#ff0000', dark: '#220000' },
    gap: 8,
    surface: { $token: 'bg' },
    title: {
      size: { $axis: 'theme', light: 22, dark: 24 },
      lineHeight: 28,
    },
  },
});

let root: string;
let mcp: Connection;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-drawing-mode-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'modes.json'), JSON.stringify(MODES));
  writeFileSync(join(root, 'fontes', 'axes.json'), JSON.stringify(AXES));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

/** A project with both libraries applied (declared axes: `mode`, `theme`, `accent`). */
async function newProject(): Promise<{ name: string; dir: string }> {
  const name = `modo-${++counter}`;
  ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
  const dir = join(root, 'projetos', name);
  const applied = await propose(mcp, name, [
    { op: 'apply_specialization', file: 'fontes/modes.json' },
    { op: 'apply_specialization', file: 'fontes/axes.json' },
  ]);
  expect(applied.valid, JSON.stringify(applied)).toBe(true);
  acceptAllAndApply(dir, applied.proposal.id);
  return { name, dir };
}

/** Applies the batch through the proposal (accepts everything) and returns the saved project. */
async function apply(name: string, dir: string, operations: unknown[]) {
  const proposed = await propose(mcp, name, operations);
  return { proposed, saved: acceptAllAndApply(dir, proposed.proposal.id) };
}

const plan = async (name: string, operations: unknown[]) =>
  ok(
    await mcp.call<{
      valid: boolean;
      errors: { code: string; message: string; [key: string]: unknown }[];
    }>('plan_changes', { project: name, operations }),
  );

const box = {
  op: 'add_container',
  as: '$c',
  width: 100,
  height: 80,
  background: '#FFFFFF',
};

describe("update_project: the project's drawing mode", () => {
  it('writes a map, it shows up in proposal.json and in get_project; null removes it', async () => {
    const { name, dir } = await newProject();
    const { proposed, saved } = await apply(name, dir, [
      { op: 'update_project', drawingMode: { theme: 'dark', accent: 'vivid' } },
    ]);
    expect(saved.drawingMode).toEqual({ theme: 'dark', accent: 'vivid' });
    const proposal = readProposal(dir, proposed.proposal.id);
    expect(JSON.stringify(proposal.changes)).toContain('drawingMode');
    expect(proposal.formatVersion).toBe(PROPOSAL_DRAWING_MODE_MAP_FORMAT_VERSION);
    const view = ok(await mcp.call('get_project', { project: name }));
    expect(view.drawingMode).toEqual({ theme: 'dark', accent: 'vivid' });
    expect(view.drawingAxes).toEqual({
      mode: ['light', 'dim', 'compact'],
      theme: ['light', 'dark'],
      accent: ['vivid', 'dark'],
    });

    const cleared = await apply(name, dir, [{ op: 'update_project', drawingMode: null }]);
    expect(cleared.saved.drawingMode).toBeUndefined();
    expect(ok(await mcp.call('get_project', { project: name })).drawingMode).toBeNull();
  });

  it('a map replaces the whole map', async () => {
    const { name, dir } = await newProject();
    await apply(name, dir, [
      { op: 'update_project', drawingMode: { theme: 'dark', accent: 'vivid' } },
    ]);
    const next = await apply(name, dir, [
      { op: 'update_project', drawingMode: { mode: 'dim' } },
    ]);
    expect(next.saved.drawingMode).toEqual({ mode: 'dim' });
  });

  it('a string sets the entry on every declared axis that has it', async () => {
    const { name, dir } = await newProject();
    const { saved } = await apply(name, dir, [
      { op: 'update_project', drawingMode: 'dark' },
    ]);
    // `dark` belongs to `theme` and `accent`, not to `mode`.
    expect(saved.drawingMode).toEqual({ theme: 'dark', accent: 'dark' });
  });

  it('a string no axis has is invalid-arguments, with the declared axes in the details', async () => {
    const { name } = await newProject();
    const planned = await plan(name, [{ op: 'update_project', drawingMode: 'sepia' }]);
    expect(planned.valid).toBe(false);
    expect(planned.errors.map((e) => e.code)).toEqual(['invalid-arguments']);
    expect(planned.errors[0]).toMatchObject({
      drawingAxes: {
        mode: ['light', 'dim', 'compact'],
        theme: ['light', 'dark'],
        accent: ['vivid', 'dark'],
      },
    });
  });

  it('an absent key changes nothing; a wrong type is refused; an invalid name is invalid-name', async () => {
    const { name, dir } = await newProject();
    await apply(name, dir, [{ op: 'update_project', drawingMode: { mode: 'dim' } }]);
    const planned = await plan(name, [{ op: 'update_project' }]);
    expect(planned.valid).toBe(true);
    expect(readProject(dir).drawingMode).toEqual({ mode: 'dim' });

    // Wrong type: the operation's schema refuses it (as with the other operations).
    const wrong = await mcp.client
      .callTool({
        name: 'plan_changes',
        arguments: {
          project: name,
          operations: [{ op: 'update_project', drawingMode: 3 }],
        },
      })
      .then(
        (r) => JSON.stringify(r),
        (e: unknown) => String(e),
      );
    expect(wrong).toMatch(/drawingMode/);

    for (const bad of ['Dark Mode', { 'Bad Axis': 'dark' }, { theme: 'Dark Mode' }]) {
      const refused = await plan(name, [{ op: 'update_project', drawingMode: bad }]);
      expect(refused.valid).toBe(false);
      expect(refused.errors.map((e) => e.code)).toEqual(['invalid-name']);
    }
  });
});

describe('container mode', () => {
  it('add_container and update_container pin it; null goes back to following the project', async () => {
    const { name, dir } = await newProject();
    const first = await apply(name, dir, [
      { op: 'update_project', drawingMode: { mode: 'light', theme: 'light' } },
      { ...box, drawingMode: { theme: 'dark' } },
    ]);
    const container = first.saved.containers[0]!;
    expect(container.drawingMode).toEqual({ theme: 'dark' });
    const ref = first.proposed.created.find((c) => c.kind === 'container')!.ref!;
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      drawingMode: { theme: 'dark' },
      // EVERY declared axis: the container's, else the project's, else the default of the axis.
      effectiveDrawingMode: { mode: 'light', theme: 'dark', accent: 'vivid' },
    });

    const second = await apply(name, dir, [
      { op: 'update_container', container: ref, drawingMode: 'compact' },
    ]);
    expect(second.saved.containers[0]!.drawingMode).toEqual({ mode: 'compact' });

    const third = await apply(name, dir, [
      { op: 'update_container', container: ref, drawingMode: null },
    ]);
    expect(third.saved.containers[0]!.drawingMode ?? null).toBeNull();
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      drawingMode: null,
      effectiveDrawingMode: { mode: 'light', theme: 'light', accent: 'vivid' },
    });
  });

  it('a string on two axes, an entry no axis has and an invalid name, on add_container and update_container', async () => {
    const { name, dir } = await newProject();
    const added = await apply(name, dir, [{ ...box, drawingMode: 'dark' }]);
    expect(added.saved.containers[0]!.drawingMode).toEqual({
      theme: 'dark',
      accent: 'dark',
    });
    const ref = added.proposed.created.find((c) => c.kind === 'container')!.ref!;

    for (const op of [
      { ...box, drawingMode: 'sepia' },
      { op: 'update_container', container: ref, drawingMode: 'sepia' },
    ]) {
      const refused = await plan(name, [op]);
      expect(refused.errors.map((e) => e.code)).toEqual(['invalid-arguments']);
      expect(refused.errors[0]).toHaveProperty('drawingAxes');
    }
    for (const op of [
      { ...box, drawingMode: 'Dark Mode' },
      { op: 'update_container', container: ref, drawingMode: { theme: 'Dark Mode' } },
    ]) {
      const refused = await plan(name, [op]);
      expect(refused.errors.map((e) => e.code)).toEqual(['invalid-name']);
    }
  });

  it('list_markings returns the marking effective mode as a map', async () => {
    const { name, dir } = await newProject();
    const { proposed } = await apply(name, dir, [
      { op: 'update_project', drawingMode: { mode: 'dim' } },
      { ...box, drawingMode: { accent: 'dark' } },
      {
        op: 'create_marking',
        container: '$c',
        name: 'A',
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
    ]);
    expect(proposed.valid).toBe(true);
    const list = ok(
      await mcp.call<{
        markings: { name: string; effectiveDrawingMode: Record<string, string> }[];
      }>('list_markings', { project: name }),
    );
    expect(list.markings.map((m) => [m.name, m.effectiveDrawingMode])).toEqual([
      ['A', { mode: 'dim', theme: 'light', accent: 'dark' }],
    ]);
  });

  it('get_project carries the pinned and the effective map of each container', async () => {
    const { name, dir } = await newProject();
    await apply(name, dir, [
      { op: 'update_project', drawingMode: { theme: 'dark' } },
      { ...box, drawingMode: { accent: 'dark' } },
    ]);
    const view = ok(
      await mcp.call<{
        containers: {
          drawingMode: unknown;
          effectiveDrawingMode: unknown;
        }[];
      }>('get_project', { project: name }),
    );
    expect(view.containers[0]).toMatchObject({
      drawingMode: { accent: 'dark' },
      effectiveDrawingMode: { mode: 'light', theme: 'dark', accent: 'dark' },
    });
  });
});

describe('proposal format (it rises to 12 when a map is used)', () => {
  it('update_project and add_container with a mode write formatVersion 12; without a mode the proposal stays at 4', async () => {
    const { name, dir } = await newProject();
    const withMode = await propose(mcp, name, [
      { op: 'update_project', drawingMode: 'dark' },
    ]);
    expect(readProposal(dir, withMode.proposal.id).formatVersion).toBe(
      PROPOSAL_DRAWING_MODE_MAP_FORMAT_VERSION,
    );
    const plain = await propose(mcp, name, [{ ...box }]);
    expect(readProposal(dir, plain.proposal.id).formatVersion).toBe(4);
    const container = await propose(mcp, name, [
      { ...box, drawingMode: { mode: 'dim' } },
    ]);
    expect(readProposal(dir, container.proposal.id).formatVersion).toBe(12);
  });
});

describe('get_specialization: the tokens index', () => {
  interface TokenRow {
    kind: string;
    value?: string | number;
    fields?: Record<string, string | number>;
    aliasOf?: string;
    varies: string[];
    description?: string;
    group?: string;
    notices?: { kind: string; message: string }[];
  }

  it('lists each token with kind, resolved value, alias, composite fields, varies and metadata', async () => {
    const { name } = await newProject();
    const view = ok(
      await mcp.call<{ tokens: Record<string, TokenRow> }>('get_specialization', {
        project: name,
        specId: 'axes',
      }),
    );
    const { tokens } = view;
    expect(tokens.bg).toEqual({ kind: 'color', value: '#ffffff', varies: ['theme'] });
    expect(tokens.tint).toEqual({ kind: 'color', value: '#ff0000', varies: ['accent'] });
    expect(tokens.gap).toEqual({ kind: 'number', value: 8, varies: [] });
    // An alias: resolved in the default selection, named target, varies like its target.
    expect(tokens.surface).toEqual({
      kind: 'color',
      value: '#ffffff',
      aliasOf: 'bg',
      varies: ['theme'],
    });
    // A composite: field -> resolved value.
    expect(tokens.title).toEqual({
      kind: 'composite',
      fields: { size: 22, lineHeight: 28 },
      varies: ['theme'],
    });
    // The `$value` wrapper: description, group and notices.
    expect(tokens.ink).toEqual({
      kind: 'color',
      value: '#000000',
      varies: ['theme'],
      description: 'text color',
      group: 'color',
      notices: [{ kind: 'deprecated', message: 'use fg' }],
    });
  });

  it('a library with `modes` still lists its tokens, varying by the axis `mode`', async () => {
    const { name } = await newProject();
    const view = ok(
      await mcp.call<{ tokens: Record<string, TokenRow> }>('get_specialization', {
        project: name,
        specId: 'modes',
      }),
    );
    expect(view.tokens.bg).toEqual({ kind: 'color', value: '#ffffff', varies: ['mode'] });
  });

  it('a specialization without tokens carries no index', async () => {
    const { name, dir } = await newProject();
    writeFileSync(
      join(root, 'fontes', 'plain.json'),
      JSON.stringify({ ...lib('plain', undefined), tokens: undefined }),
    );
    await apply(name, dir, [{ op: 'apply_specialization', file: 'fontes/plain.json' }]);
    const view = ok(
      await mcp.call<{ tokens?: unknown }>('get_specialization', {
        project: name,
        specId: 'plain',
      }),
    );
    expect(view.tokens).toBeUndefined();
    expect(
      errorOf(await mcp.call('get_specialization', { project: name, specId: 'x' })).code,
    ).toBe('not-found');
  });
});

describe('get_specialization: the written form of `$tokens` suggestions', () => {
  it('keeps the `$tokens` item, drops `suggestionsSource` and still validates', async () => {
    const { name, dir } = await newProject();
    const sizes = {
      ...lib('sized', {
        values: {
          small: { $value: 'S', $group: 'sizes' },
          large: { $value: 'L', $group: 'sizes' },
        },
      }),
      formatVersion: 23,
      layers: [
        {
          id: 'ui',
          name: 'UI',
          color: '#6750A4',
          annotationTypes: [
            {
              id: 'btn',
              name: 'Button',
              fields: [
                {
                  key: 'size',
                  type: 'string',
                  suggestions: [{ $tokens: 'sizes' }, 'custom'],
                },
              ],
            },
          ],
        },
      ],
    };
    writeFileSync(join(root, 'fontes', 'sized.json'), JSON.stringify(sizes));
    await apply(name, dir, [{ op: 'apply_specialization', file: 'fontes/sized.json' }]);
    const view = ok(
      await mcp.call<{ spec: unknown }>('get_specialization', {
        project: name,
        specId: 'sized',
      }),
    );
    const field = JSON.stringify(view.spec);
    expect(field).not.toContain('suggestionsSource');
    expect(field).toContain('"suggestions":[{"$tokens":"sizes"},"custom"]');
    expect(parseSpec(view.spec).ok).toBe(true);
  });
});
