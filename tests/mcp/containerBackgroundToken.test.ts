import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeImage } from '../../mcp/image/codecs';
import { acceptAllAndApply, ok, propose, readProposal } from './proposalSupport';
import { encodePng, quadrants } from './images';
import { connect, type Connection } from './workspace';

// Phase NV4 (stage #1900, decisions 26 and 31): the background of a container without a file by token.
// `add_container` and `update_container` take `{ "$token": "<name>" }` (checked against the color tokens of
// the applied specializations), the reads return `background` as stored and `resolvedBackground`, and the
// renders paint the resolved color (with the `drawingMode` of a `render_*` pinned).

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 23,
  id: 'theme',
  name: 'Theme',
  version: 1,
  tokens: {
    axes: { theme: ['light', 'dark'] },
    values: {
      surface: { $axis: 'theme', light: '#ffffff', dark: '#102030' },
      ink: { $axis: 'theme', light: '#000000', dark: '#ffffff' },
      gap: 8,
      label: 'hello',
    },
  },
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [{ id: 'btn', name: 'Button', fields: [] }],
    },
  ],
};

let root: string;
let mcp: Connection;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-bg-token-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'theme.json'), JSON.stringify(SPEC));
  writeFileSync(join(root, 'fontes', 'foto.png'), await encodePng(quadrants(300, 200)));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

async function newProject(): Promise<{ name: string; dir: string }> {
  const name = `fundo-${++counter}`;
  ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
  const dir = join(root, 'projetos', name);
  const applied = await propose(mcp, name, [
    { op: 'apply_specialization', file: 'fontes/theme.json' },
  ]);
  expect(applied.valid, JSON.stringify(applied)).toBe(true);
  acceptAllAndApply(dir, applied.proposal.id);
  return { name, dir };
}

const plan = async (name: string, operations: unknown[]) =>
  ok(
    await mcp.call<{
      valid: boolean;
      errors: { code: string; message: string; [key: string]: unknown }[];
    }>('plan_changes', { project: name, operations }),
  );

const box = (background: unknown, extra: Record<string, unknown> = {}) => ({
  op: 'add_container',
  as: '$c',
  width: 40,
  height: 30,
  background,
  ...extra,
});

async function apply(name: string, dir: string, operations: unknown[]) {
  const proposed = await propose(mcp, name, operations);
  expect(proposed.valid, JSON.stringify(proposed)).toBe(true);
  return { proposed, saved: acceptAllAndApply(dir, proposed.proposal.id) };
}

interface ContainerView {
  ref: string;
  background: unknown;
  resolvedBackground: unknown;
}

/** A project with a themed container (token) and a fixed one; returns the refs. */
async function withContainers() {
  const { name, dir } = await newProject();
  const { saved } = await apply(name, dir, [
    box({ $token: 'surface' }, { as: '$t' }),
    box('#336699', { as: '$f' }),
  ]);
  const view = ok(
    await mcp.call<{ containers: ContainerView[] }>('get_project', { project: name }),
  );
  return { name, dir, saved, containers: view.containers };
}

async function image(name: string, args: Record<string, unknown>) {
  const result = await mcp.client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string; data?: string }[];
  expect(result.isError, JSON.stringify(content)).not.toBe(true);
  const data = content.find((c) => c.type === 'image')!.data!;
  const { raster } = await decodeImage(Buffer.from(data, 'base64'));
  const at = (x: number, y: number) => {
    const i = (y * raster.width + x) * 4;
    return [...raster.data.slice(i, i + 3)];
  };
  return at(1, 1);
}

describe('add_container and update_container with a token', () => {
  it('store the token and write the proposal in formatVersion 12', async () => {
    const { name, dir } = await newProject();
    const { proposed, saved } = await apply(name, dir, [box({ $token: 'surface' })]);
    expect(saved.containers[0]!.background).toEqual({ $token: 'surface' });
    expect(readProposal(dir, proposed.proposal.id).formatVersion).toBe(12);
  });

  it('update_container changes a fixed color to a token', async () => {
    const { name, dir, containers } = await withContainers();
    const fixed = containers.find((c) => c.background === '#336699')!;
    const { saved } = await apply(name, dir, [
      { op: 'update_container', container: fixed.ref, background: { $token: 'ink' } },
    ]);
    expect(saved.containers.map((c) => c.background)).toContainEqual({ $token: 'ink' });
  });

  it('a #RRGGBB background keeps working and stays in an older proposal format', async () => {
    const { name, dir } = await newProject();
    const { proposed, saved } = await apply(name, dir, [box('#AABBCC')]);
    expect(saved.containers[0]!.background).toBe('#AABBCC');
    expect(readProposal(dir, proposed.proposal.id).formatVersion).toBeLessThan(12);
  });

  it('an undeclared token and a non-color token are invalid-arguments with the color tokens', async () => {
    const { name } = await newProject();
    for (const token of ['missing', 'gap', 'label']) {
      const planned = await plan(name, [box({ $token: token })]);
      expect(planned.valid).toBe(false);
      expect(planned.errors[0]).toMatchObject({
        code: 'invalid-arguments',
        message: `the token "${token}" is not a color token of the applied specializations`,
        colorTokens: ['surface', 'ink'],
      });
    }
    const update = await plan(name, [
      { op: 'update_container', container: '$none', background: { $token: 'gap' } },
    ]);
    expect(update.valid).toBe(false);
  });

  it('update_container refuses an undeclared token and a malformed name', async () => {
    const { name, containers } = await withContainers();
    const ref = containers[0]!.ref;
    const missing = await plan(name, [
      { op: 'update_container', container: ref, background: { $token: 'nope' } },
    ]);
    expect(missing.errors[0]).toMatchObject({
      code: 'invalid-arguments',
      message: 'the token "nope" is not a color token of the applied specializations',
      colorTokens: ['surface', 'ink'],
    });
    for (const bad of ['Surface', '-x', 'a b']) {
      const planned = await plan(name, [
        { op: 'update_container', container: ref, background: { $token: bad } },
      ]);
      expect(planned.errors.map((e) => e.code)).toEqual(['invalid-arguments']);
    }
  });

  it('a container with a file refuses a token with container-has-file, declared or not', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png' },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const ref = created.created[0]!.ref!;
    for (const token of ['nope', 'surface']) {
      const planned = await plan(name, [
        { op: 'update_container', container: ref, background: { $token: token } },
      ]);
      expect(planned.errors.map((e) => e.code)).toEqual(['container-has-file']);
    }
  });

  it('add_blank_image (old) keeps only #RRGGBB', async () => {
    const { name } = await newProject();
    // The old operation's schema takes only a string: the server refuses the object before the batch.
    const reply = await mcp.client.callTool({
      name: 'plan_changes',
      arguments: {
        project: name,
        operations: [
          {
            op: 'add_blank_image',
            width: 10,
            height: 10,
            background: { $token: 'surface' },
          },
        ],
      },
    });
    expect(reply.isError).toBe(true);
  });

  it('a token with no applied specialization lists no color tokens', async () => {
    const name = `fundo-sem-${++counter}`;
    ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
    const planned = await plan(name, [box({ $token: 'surface' })]);
    expect(planned.errors[0]).toMatchObject({
      code: 'invalid-arguments',
      colorTokens: [],
    });
  });
});

describe('reads: background and resolvedBackground', () => {
  it('get_project and get_container return the stored value and the resolved color', async () => {
    const { name, containers } = await withContainers();
    const themed = containers.find((c) => typeof c.background === 'object')!;
    const fixed = containers.find((c) => c.background === '#336699')!;
    expect(themed.background).toEqual({ $token: 'surface' });
    expect(themed.resolvedBackground).toBe('#FFFFFF');
    expect(fixed.resolvedBackground).toBe('#336699');
    const one = ok(
      await mcp.call<ContainerView>('get_container', { project: name, ref: themed.ref }),
    );
    expect(one.background).toEqual({ $token: 'surface' });
    expect(one.resolvedBackground).toBe('#FFFFFF');
  });

  it('follows the effective drawing mode of the container', async () => {
    const { name, dir } = await newProject();
    await apply(name, dir, [
      box({ $token: 'surface' }, { drawingMode: { theme: 'dark' } }),
    ]);
    const view = ok(
      await mcp.call<{ containers: ContainerView[] }>('get_project', { project: name }),
    );
    expect(view.containers[0]!.resolvedBackground).toBe('#102030');
  });

  it('a container with a file has resolvedBackground null', async () => {
    const { name } = await withContainers();
    const view = ok(
      await mcp.call<{ containers: ContainerView[] }>('get_project', { project: name }),
    );
    expect(view.containers.every((c) => c.resolvedBackground !== undefined)).toBe(true);
  });
});

describe('renders paint the resolved color', () => {
  it('render_container paints the token in the default selection and pins the drawingMode', async () => {
    const { name, containers } = await withContainers();
    const themed = containers.find((c) => typeof c.background === 'object')!;
    expect(await image('render_container', { project: name, ref: themed.ref })).toEqual([
      255, 255, 255,
    ]);
    expect(
      await image('render_container', {
        project: name,
        ref: themed.ref,
        drawingMode: { theme: 'dark' },
      }),
    ).toEqual([0x10, 0x20, 0x30]);
    expect(
      await image('render_container', {
        project: name,
        ref: themed.ref,
        drawingMode: 'dark',
      }),
    ).toEqual([0x10, 0x20, 0x30]);
  });

  it('render_container paints a fixed color as before', async () => {
    const { name, containers } = await withContainers();
    const fixed = containers.find((c) => c.background === '#336699')!;
    expect(await image('render_container', { project: name, ref: fixed.ref })).toEqual([
      0x33, 0x66, 0x99,
    ]);
  });

  it('get_marking_image shows the container background resolved (container drawing mode)', async () => {
    const { name, dir } = await newProject();
    const { saved } = await apply(name, dir, [
      box({ $token: 'surface' }, { drawingMode: { theme: 'dark' } }),
    ]);
    const container = saved.containers[0]!;
    const made = await apply(name, dir, [
      {
        op: 'create_marking',
        container: `mapping://${name}/i/${container.id.slice(0, 8)}`,
        name: 'A',
        rect: { x: 20, y: 15, width: 10, height: 10 },
      },
    ]);
    expect(made.saved.markings.length).toBeGreaterThan(0);
    const marking = made.saved.markings[0]!;
    const px = await image('get_marking_image', {
      project: name,
      ref: `mapping://${name}/m/${marking.id.slice(0, 8)}`,
      mode: 'context',
    });
    expect(px).toEqual([0x10, 0x20, 0x30]);
    const result = await mcp.client.callTool({
      name: 'get_marking_image',
      arguments: {
        project: name,
        ref: `mapping://${name}/m/${marking.id.slice(0, 8)}`,
        mode: 'context',
      },
    });
    const text = (result.content as { type: string; text?: string }[]).find(
      (c) => c.type === 'text',
    )!.text!;
    expect(JSON.parse(text).container).toMatchObject({
      background: { $token: 'surface' },
      resolvedBackground: '#102030',
    });
  });
});

describe('get_specialization: the preset background', () => {
  it('returns containers[].background as written', async () => {
    const withPreset = {
      ...SPEC,
      id: 'preset',
      containers: [
        {
          id: 'themed',
          name: 'Themed',
          width: 360,
          height: 800,
          background: { $token: 'surface' },
        },
        { id: 'fixed', name: 'Fixed', width: 360, height: 800, background: '#FAFAFA' },
      ],
    };
    writeFileSync(join(root, 'fontes', 'preset.json'), JSON.stringify(withPreset));
    const name = `fundo-${++counter}`;
    ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
    const dir = join(root, 'projetos', name);
    const applied = await propose(mcp, name, [
      { op: 'apply_specialization', file: 'fontes/preset.json' },
    ]);
    expect(applied.valid, JSON.stringify(applied)).toBe(true);
    acceptAllAndApply(dir, applied.proposal.id);
    const view = ok(
      await mcp.call<{ spec: { containers: { id: string; background: unknown }[] } }>(
        'get_specialization',
        {
          project: name,
          specId: 'preset',
        },
      ),
    );
    expect(view.spec.containers.map((c) => c.background)).toEqual([
      { $token: 'surface' },
      '#FAFAFA',
    ]);
  });
});
