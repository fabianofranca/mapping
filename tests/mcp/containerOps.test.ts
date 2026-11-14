import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodePng, quadrants } from './images';
import {
  acceptAllAndApply,
  errorOf,
  ok,
  propose,
  readProject,
  readProposal,
  type Proposed,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Container surface of MCP 0.8.0, over stdio: `add_container` with a file and with a background,
// `update_container`, `replace_container` and `delete_container`, and the old operations
// (`add_image`, `add_blank_image`, `update_image`, `replace_image`, `delete_image`, the
// `image` argument of `create_marking`) accepted with a `deprecated-op` warning, including in a
// proposal written with format 1 or 2.

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created: { op: number; alias?: string; kind: string; ref?: string }[];
  warnings?: { code: string; op: number; message: string }[];
}

interface ContainerData {
  ref: string;
  name: string | null;
  file: string | null;
  background: string | null;
  width: number;
  height: number;
  exists: boolean;
  bgContainer?: boolean;
  warnings?: { code: string; tool: string; message: string }[];
}

let root: string;
let mcp: Connection;
let replacement: string;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-container-ops-'));
  const sources = join(root, 'fontes');
  mkdirSync(sources, { recursive: true });
  writeFileSync(join(sources, 'foto.png'), await encodePng(quadrants(300, 200)));
  replacement = (await encodePng(quadrants(150, 100))).toString('base64');
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

/** A new empty project (each test uses its own, so the revision does not depend on the others). */
async function newProject(): Promise<{ name: string; dir: string }> {
  const name = `boxes-${++counter}`;
  ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
  return { name, dir: join(root, 'projetos', name) };
}

const plan = async (project: string, operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const warningOps = (data: { warnings?: Record<string, unknown>[] }) =>
  (data.warnings ?? []).map((w) => [w.op, w.code]);

describe('add_container: with a file and with a background', () => {
  it('the file gives the width and the height; the background brings its own; no warning', async () => {
    const { name, dir } = await newProject();
    const operations = [
      { op: 'add_container', as: '$foto', file: 'fontes/foto.png', name: 'Photo' },
      {
        op: 'add_container',
        as: '$cartao',
        name: 'Card',
        width: 320,
        height: 200,
        background: '#ffffff',
      },
      {
        op: 'create_marking',
        as: '$m1',
        container: '$foto',
        rect: { x: 10, y: 10, width: 100, height: 50 },
      },
      {
        op: 'create_marking',
        as: '$m2',
        container: '$cartao',
        rect: { x: 0, y: 0, width: 50, height: 50 },
      },
    ];
    const result = await plan(name, operations);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeUndefined();
    expect(result.summary[0]).toMatch(
      /^0\. Add the container "Photo" with the image images\/foto\.webp \(300×200 px, /,
    );
    expect(result.summary[1]).toBe(
      '1. Add the container "Card" (320×200 px, background #FFFFFF)',
    );
    expect(result.changes).toMatchObject({
      containers: { created: 2 },
      markings: { created: 2 },
    });
    expect(result.created.filter((c) => c.kind === 'container')).toHaveLength(2);

    const proposed = await propose(mcp, name, operations);
    // No warning, and the `mapping.json` only changes when the user applies.
    expect(proposed.warnings).toBeUndefined();
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(
      saved.containers.map((c) => [c.name, c.file, c.width, c.height, c.background]),
    ).toEqual([
      ['Photo', 'images/foto.webp', 300, 200, null],
      ['Card', null, 320, 200, '#FFFFFF'],
    ]);
    // The marking writes `containerId` (never `imageId`) in the proposal values.
    const markingChanges = readProposal(dir, proposed.proposal.id).changes.filter(
      (c) => c.entity === 'marking' && c.kind === 'create',
    );
    expect(markingChanges).toHaveLength(2);
    for (const change of markingChanges) {
      expect(change.to).toHaveProperty('containerId');
      expect(change.to).not.toHaveProperty('imageId');
    }
    expect(saved.markings.map((m) => m.containerId).sort()).toEqual(
      saved.containers.map((c) => c.id).sort(),
    );

    // The new tools read both.
    const [photoRef, boxRef] = proposed.created
      .filter((c) => c.kind === 'container')
      .map((c) => c.ref!);
    const photo = ok(await mcp.call<ContainerData>('get_container', { ref: photoRef }));
    expect(photo).toMatchObject({
      file: 'images/foto.webp',
      background: null,
      width: 300,
      height: 200,
      exists: true,
    });
    const box = ok(await mcp.call<ContainerData>('get_container', { ref: boxRef }));
    expect(box).toMatchObject({
      file: null,
      background: '#FFFFFF',
      width: 320,
      height: 200,
    });
    expect(box.bgContainer).toBeUndefined();
    const file = await mcp.call('get_container_file', { ref: photoRef });
    expect(file.isError).toBe(false);
    expect(errorOf(await mcp.call('get_container_file', { ref: boxRef })).code).toBe(
      'container-without-file',
    );
  });

  it('refuses the ambiguous combination and the missing one, with a clear message', async () => {
    const { name } = await newProject();
    const result = await plan(name, [
      { op: 'add_container', file: 'fontes/foto.png', width: 100, height: 100 },
      { op: 'add_container', file: 'fontes/foto.png', background: '#000000' },
      { op: 'add_container', name: 'Sem nada' },
      { op: 'add_container', width: 100, background: '#000000' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors?.map((e) => [e.index, e.code])).toEqual([
      [0, 'invalid-arguments'],
      [1, 'invalid-arguments'],
      [2, 'invalid-arguments'],
      [3, 'invalid-arguments'],
    ]);
    expect(result.errors![0]!.message).toMatch(/ambiguous.*`file`.*`width`/);
    expect(result.errors![2]!.message).toMatch(
      /missing: `width`, `height`, `background`/,
    );
    expect(result.errors![3]!.message).toMatch(/missing: `height`/);
  });
});

describe('update_container, replace_container and delete_container', () => {
  it('the new names (`container` argument) generate no warning', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png', name: 'Photo' },
      {
        op: 'add_container',
        name: 'Card',
        width: 320,
        height: 200,
        background: '#FFFFFF',
      },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const [photo, box] = created.created.map((c) => c.ref!);

    const result = await plan(name, [
      { op: 'update_container', container: box, name: 'Card 2', background: '#000000' },
      { op: 'replace_container', container: photo, base64: replacement },
      { op: 'delete_container', container: box },
    ]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeUndefined();
    expect(result.summary[0]).toMatch(/^0\. Change the container ".*": name "Card 2"/);
    expect(result.summary[1]).toMatch(/^1\. Replace the image of the container /);
    expect(result.summary[2]).toMatch(/^2\. Delete the container /);
    expect(result.changes).toMatchObject({ containers: { updated: 1, deleted: 1 } });
  });

  it('update_container with a noisy x writes the integer; add_container with a noisy center too', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      {
        op: 'add_container',
        name: 'Card',
        width: 100,
        height: 100,
        background: '#FFFFFF',
        center: { x: 275.00000000000006, y: 100.00000000000001 },
      },
    ]);
    const box = created.created[0]!.ref!;
    const after = acceptAllAndApply(dir, created.proposal.id);
    expect(after.containers[0]!.placement).toEqual({ x: -225, y: -400, scale: 10 });
    const update = await plan(name, [
      { op: 'update_container', container: box, x: 275.00000000000006 },
    ]);
    expect(update.summary[0]).toContain('position (275, -400)');
    const changed = await propose(mcp, name, [
      { op: 'update_container', container: box, x: 275.00000000000006 },
    ]);
    const written = acceptAllAndApply(dir, changed.proposal.id);
    expect(written.containers[0]!.placement.x).toBe(275);
  });

  it('update_container with a fractional x writes 6 decimal places and the text shows the written value; add_container with a fractional center writes without a tail', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      {
        op: 'add_container',
        name: 'Card',
        width: 100,
        height: 100,
        background: '#FFFFFF',
        center: { x: 100.1234567891, y: 50.9876543219 },
      },
    ]);
    const box = created.created[0]!.ref!;
    const after = acceptAllAndApply(dir, created.proposal.id);
    expect(after.containers[0]!.placement).toEqual({
      x: -399.876543,
      y: -449.012346,
      scale: 10,
    });
    const update = await plan(name, [
      { op: 'update_container', container: box, x: 100.1234567 },
    ]);
    expect(update.summary[0]).toContain('position (100.123457, -449.012346)');
    const changed = await propose(mcp, name, [
      { op: 'update_container', container: box, x: 100.1234567 },
    ]);
    const written = acceptAllAndApply(dir, changed.proposal.id);
    expect(written.containers[0]!.placement.x).toBe(100.123457);
  });

  it('the old update_image, replace_image and delete_image still work, with a warning', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png', name: 'Photo' },
      {
        op: 'add_container',
        name: 'Card',
        width: 320,
        height: 200,
        background: '#FFFFFF',
      },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const [photo, box] = created.created.map((c) => c.ref!);

    const result = await plan(name, [
      { op: 'update_image', image: box, name: 'Card 2' },
      { op: 'replace_image', image: photo, base64: replacement },
      { op: 'delete_image', image: box },
    ]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(warningOps(result)).toEqual([
      [0, 'deprecated-op'],
      [1, 'deprecated-op'],
      [2, 'deprecated-op'],
    ]);
    expect(result.warnings!.map((w) => w.message)).toEqual([
      expect.stringContaining('update_container'),
      expect.stringContaining('replace_container'),
      expect.stringContaining('delete_container'),
    ]);
    // The result is the same as the new operations'.
    expect(result.summary[0]).toMatch(/^0\. Change the container ".*": name "Card 2"/);
    expect(result.changes).toMatchObject({ containers: { updated: 1, deleted: 1 } });

    const proposed = await propose(mcp, name, [{ op: 'delete_image', image: box }]);
    expect(warningOps(proposed)).toEqual([[0, 'deprecated-op']]);
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(saved.containers.map((c) => c.name)).toEqual(['Photo']);
  });

  it('update_container has the same errors: background and size only on a container without a file', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png' },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const result = await plan(name, [
      {
        op: 'update_container',
        container: created.created[0]!.ref!,
        background: '#000000',
      },
    ]);
    expect(result.errors?.map((e) => e.code)).toEqual(['container-has-file']);
    expect(result.errors![0]!.message).toMatch(/has an image file/);
  });
});

describe('the old add_image and add_blank_image, and the image argument', () => {
  const OLD_OPS = [
    { op: 'add_image', as: '$foto', file: 'fontes/foto.png', name: 'Photo' },
    {
      op: 'add_blank_image',
      as: '$cartao',
      name: 'Card',
      width: 320,
      height: 200,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      image: '$foto',
      rect: { x: 10, y: 10, width: 100, height: 50 },
    },
  ];

  it('are still accepted, each with the warning that says what to use instead', async () => {
    const { name } = await newProject();
    const result = await plan(name, OLD_OPS);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(warningOps(result)).toEqual([
      [0, 'deprecated-op'],
      [1, 'deprecated-op'],
      [2, 'deprecated-op'],
    ]);
    expect(result.warnings!.map((w) => w.message)).toEqual([
      expect.stringContaining('use add_container'),
      expect.stringContaining('use add_container'),
      expect.stringContaining('`container`'),
    ]);
    expect(result.changes).toMatchObject({
      containers: { created: 2 },
      markings: { created: 1 },
    });
  });

  it('giving `container` and `image` on the same marking is an error', async () => {
    const { name } = await newProject();
    const result = await plan(name, [
      {
        op: 'add_container',
        as: '$c',
        name: 'C',
        width: 100,
        height: 100,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$c',
        image: '$c',
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
    ]);
    expect(result.errors?.map((e) => [e.index, e.code])).toEqual([
      [1, 'invalid-arguments'],
    ]);
  });

  it.each([1, 2])(
    'a proposal written with format %i and these operations opens and applies',
    async (formatVersion) => {
      const { name, dir } = await newProject();
      const proposed = await propose(mcp, name, OLD_OPS);
      expect(warningOps(proposed)).toEqual([
        [0, 'deprecated-op'],
        [1, 'deprecated-op'],
        [2, 'deprecated-op'],
      ]);
      // Rewrites the file with the old format; the stored `operations` are the old ones.
      const file = join(dir, 'proposals', proposed.proposal.id, 'proposal.json');
      const json = JSON.parse(readFileSync(file, 'utf8')) as {
        formatVersion: number;
        operations: { op: string }[];
      };
      json.formatVersion = formatVersion;
      expect(json.operations.map((o) => o.op)).toEqual([
        'add_image',
        'add_blank_image',
        'create_marking',
      ]);
      writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);

      const got = ok(
        await mcp.call<{ proposal: { status: string }; levels: Proposed['levels'] }>(
          'get_proposal',
          { ref: proposed.proposal.ref },
        ),
      );
      expect(got.proposal.status).toBe('open');
      expect(got.levels.containers).toHaveLength(2);
      const saved = acceptAllAndApply(dir, proposed.proposal.id);
      expect(saved.containers.map((c) => [c.name, c.file === null])).toEqual([
        ['Photo', false],
        ['Card', true],
      ]);
      expect(saved.markings).toHaveLength(1);
    },
  );
});

describe('the old tools get_image and get_image_file', () => {
  it('still respond, with deprecated-tool warnings, and the new ones have no warning', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png' },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const ref = created.created[0]!.ref!;

    const current = ok(await mcp.call<ContainerData>('get_container', { ref }));
    expect(current.warnings).toBeUndefined();
    const old = ok(await mcp.call<ContainerData>('get_image', { ref }));
    expect(old.warnings).toEqual([
      expect.objectContaining({ code: 'deprecated-tool', tool: 'get_image' }),
    ]);
    expect(old).toMatchObject({ file: 'images/foto.webp', width: 300, height: 200 });

    const oldFile = await mcp.call<{ warnings?: { tool: string }[] }>('get_image_file', {
      ref,
    });
    expect(oldFile.isError).toBe(false);
    expect(oldFile.data.warnings).toEqual([
      expect.objectContaining({ tool: 'get_image_file' }),
    ]);
    const newFile = await mcp.call<{ warnings?: unknown[] }>('get_container_file', {
      ref,
    });
    expect(newFile.isError).toBe(false);
    expect(newFile.data.warnings).toBeUndefined();
  });
});

describe('reading always in plain language, without raw error JSON', () => {
  it('container-without-file and container-has-file have a clear message', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      {
        op: 'add_container',
        name: 'Card',
        width: 100,
        height: 100,
        background: '#FFFFFF',
      },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const error = errorOf(
      await mcp.call('get_container_file', { ref: created.created[0]!.ref! }),
    );
    expect(error.code).toBe('container-without-file');
    expect(error.message).toMatch(/has no image file/);
    expect(error.message).not.toMatch(/[{}]/);
    expect(readProject(dir).containers).toHaveLength(1);
  });
});
