import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  type Project,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { createServer } from '../../mcp/server';
import { NOW } from '../model/fixtures';

// CF10 (decisions 27 and 28): `plan_changes` and `propose_changes` instantiate the component of each
// created or changed marking and return the "does not fit" in `issues` (`component-overflow`, without
// blocking the batch); `operationsFile` brings the batch from a file inside the roots.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';

const spec = (withFonts: boolean) => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  ...(withFonts ? { fonts: [{ family: 'Acme', file: 'fonts/Acme.ttf' }] } : {}),
  tokens: {
    modes: ['light', 'dark'],
    values: { face: { light: 'sans-serif', dark: 'Acme' } },
  },
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'btn',
          name: 'Button',
          component: 'components/btn.json',
          fields: [{ key: 'label', type: 'string', default: 'Confirm payment now' }],
        },
        {
          id: 'chip',
          name: 'Chip',
          component: 'components/chip.json',
          fields: [],
        },
        {
          id: 'save',
          name: 'Save button',
          component: 'components/save.json',
          fields: [{ key: 'label', type: 'string', default: 'Save' }],
        },
        {
          id: 'dir',
          name: 'Direction',
          component: 'components/dir.json',
          fields: [],
        },
        {
          id: 'face',
          name: 'Label',
          component: 'components/face.json',
          fields: [{ key: 'label', type: 'string', default: 'Confirm payment now' }],
        },
      ],
    },
  ],
});

const textNode = (family?: unknown) => ({
  type: 'text',
  name: 'label',
  text: { $field: 'label', default: 'Confirm payment now' },
  width: 'fill',
  height: 'fill',
  font: { size: 14, lineHeight: 20, ...(family === undefined ? {} : { family }) },
  color: '#000000',
});

const component = (id: string, family?: unknown) => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name: id,
  size: { width: 120, height: 40 },
  template: { type: 'frame', layout: { type: 'row' }, children: [textNode(family)] },
});

/** From #1093: `none` root with a `hug` frame with 24 side padding and a 39 bar (87×36). */
const chipComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'chip',
  name: 'chip',
  size: { width: 87, height: 40 },
  template: {
    type: 'frame',
    name: 'chip',
    layout: { type: 'none' },
    children: [
      {
        type: 'frame',
        name: 'core',
        width: 'hug',
        height: 'hug',
        anchors: { centerX: true, centerY: true },
        layout: { type: 'row', padding: [0, 24] },
        children: [{ type: 'rect', name: 'bar', width: 39, height: 36 }],
      },
    ],
  },
};

/** From #1631: the label of a button with 24 side padding (58 of width leaves 10 for the word). */
const saveComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'save',
  name: 'save',
  size: { width: 96, height: 40 },
  template: {
    type: 'frame',
    name: 'save',
    layout: { type: 'row', padding: [0, 24] },
    children: [
      {
        ...textNode(),
        name: 'save-label',
        text: { $field: 'label', default: 'Save' },
      },
    ],
  },
};

/** Overflows only in `rtl`: a 300-wide bar, visible only in that direction, in a 120 frame. */
const dirComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'dir',
  name: 'dir',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    name: 'dir',
    layout: { type: 'row' },
    children: [
      { type: 'rect', name: 'short', width: 30, height: 10, fill: '#000000' },
      {
        type: 'rect',
        name: 'wide',
        width: 300,
        height: 10,
        fill: '#000000',
        visible: { $direction: 'rtl' },
      },
    ],
  },
};

interface Workspace {
  base: string;
  client: Client;
}

async function workspace(withFonts: boolean): Promise<Workspace> {
  const base = mkdtempSync(join(tmpdir(), 'mapping-overflow-'));
  const dir = join(base, 'screens');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(lib, 'fonts'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec(withFonts)));
  writeFileSync(join(lib, 'components', 'btn.json'), JSON.stringify(component('btn')));
  writeFileSync(join(lib, 'components', 'chip.json'), JSON.stringify(chipComponent));
  writeFileSync(join(lib, 'components', 'save.json'), JSON.stringify(saveComponent));
  writeFileSync(join(lib, 'components', 'dir.json'), JSON.stringify(dirComponent));
  writeFileSync(
    join(lib, 'components', 'face.json'),
    JSON.stringify(component('face', { $token: 'face' })),
  );
  // "Acme" is the bold mono: much wider than the sans for the same characters.
  cpSync('mcp/fonts/MappingMono-Bold.ttf', join(lib, 'fonts', 'Acme.ttf'));
  writeFileSync(join(dir, 'images', 'photo.png'), Buffer.from([0]));
  const parsed = parseSpecText(JSON.stringify(spec(withFonts)));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/photo.png', width: 400, height: 300 });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { base, client };
}

/** Writes the result of a batch to `mapping.json` (the project is born with markings). */
async function seed(ws: Workspace, operations: Operation[]): Promise<Project> {
  const roots = new Roots([ws.base]);
  const loaded = await loadProject(roots, await findProject(roots, 'screens'));
  const result = await runBatch(loaded, operations, {
    readSource: () => Promise.reject(new Error('no files')),
    readSpecInput: () => Promise.reject(new Error('no files')),
    takenImageFiles: new Set<string>(),
    now: () => new Date(NOW),
  });
  expect(result.errors).toEqual([]);
  writeFileSync(join(ws.base, 'screens', 'mapping.json'), serialize(result.project));
  return result.project;
}

interface Data {
  valid?: boolean;
  errors?: unknown;
  issues?: { new?: { annotation: string; issues: { code: string }[] }[] };
  error?: { code?: string; message?: string };
  [key: string]: unknown;
}

interface Reply {
  isError: boolean;
  data: Data;
}

async function call(
  ws: Workspace,
  name: string,
  args: Record<string, unknown>,
): Promise<Reply> {
  const result = await ws.client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  try {
    return { isError: result.isError === true, data: JSON.parse(text) };
  } catch {
    // Refusal by the SDK itself (argument outside the schema): plain text, without `code`.
    return { isError: result.isError === true, data: { message: text } };
  }
}

const SCREEN = {
  op: 'add_container',
  as: '$screen',
  width: 300,
  height: 200,
  background: '#FFEBEE',
};
const create = (
  rect: { x: number; y: number; width: number; height: number },
  type = 'lib/btn',
  extra: Record<string, unknown> = {},
) => ({
  op: 'create_marking',
  as: '$m',
  container: '$screen',
  rect,
  annotation: { type },
  ...extra,
});
const plan = (ws: Workspace, operations: unknown[]) =>
  call(ws, 'plan_changes', { project: 'screens', operations });
/** The `component-overflow` items of `issues.new` (each with the annotation it belongs to). */
const overflows = (reply: Reply): Record<string, unknown>[] =>
  (
    (reply.data.issues?.new ?? []) as { annotation: string; issues: { code: string }[] }[]
  ).flatMap((entry) =>
    entry.issues
      .filter((i) => i.code === 'component-overflow')
      .map((i) => ({ annotation: entry.annotation, ...i })),
  );

let approx: Workspace;
let real: Workspace;
let seeded: Workspace;

beforeAll(async () => {
  approx = await workspace(false);
  real = await workspace(true);
  seeded = await workspace(false);
});

afterAll(async () => {
  for (const ws of [approx, real, seeded]) {
    await ws.client.close();
    rmSync(ws.base, { recursive: true, force: true });
  }
});

describe('plan_changes: drawing proof per instance', () => {
  it('60×20 with "Confirm payment now" does not fit: component-overflow with the node and how much is missing, without blocking', async () => {
    const reply = await plan(approx, [
      SCREEN,
      create({ x: 10, y: 10, width: 60, height: 20 }),
    ]);
    expect(reply.data.errors).toBeUndefined();
    expect(reply.isError).toBe(false);
    expect(reply.data.valid).toBe(true);
    const items = overflows(reply);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: 'component-overflow', node: 'label' });
    expect(items[0]!.missing).toBeGreaterThan(0);
    expect(items[0]!.message).toMatch(/\d+ px short/);
  });

  it('the same batch with 200×40 brings no component-overflow', async () => {
    const reply = await plan(approx, [
      SCREEN,
      create({ x: 10, y: 10, width: 200, height: 40 }),
    ]);
    expect(reply.data.valid).toBe(true);
    expect(overflows(reply)).toEqual([]);
  });

  it('(approximate) without the library fonts; with them, not', async () => {
    const ops = [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })];
    const without = overflows(await plan(approx, ops));
    const withFonts = overflows(await plan(real, ops));
    expect(without[0]!.message).toContain('(approximate)');
    expect(without[0]!.approximate).toBe(true);
    expect(withFonts[0]!.message).not.toContain('(approximate)');
    expect(withFonts[0]!.approximate).toBeUndefined();
  });

  it('an update_marking that shrinks generates the item; a marking not touched by the batch does not', async () => {
    // The project already has a marking that does not fit ("old") and another that fits ("good").
    const project = await seed(seeded, [
      { ...SCREEN, as: '$s' } as Operation,
      create({ x: 10, y: 10, width: 60, height: 20 }, 'lib/btn', {
        as: '$old',
        container: '$s',
        name: 'old',
      }) as Operation,
      create({ x: 10, y: 60, width: 200, height: 40 }, 'lib/btn', {
        as: '$good',
        container: '$s',
        name: 'good',
      }) as Operation,
    ]);
    const id = (name: string) => project.markings.find((m) => m.name === name)!.id;

    // Touch only the one that fits, without shrinking: no item (the "old" one was not touched by the batch).
    const untouched = await plan(seeded, [
      { op: 'update_marking', marking: id('good'), name: 'good now' },
      { op: 'update_marking', marking: id('good'), move: { dx: 1, dy: 0 } },
    ]);
    expect(untouched.data.errors).toBeUndefined();
    expect(overflows(untouched)).toEqual([]);

    // Shrink the "good" one to 60×20: it stops fitting and only it is reported.
    const shrink = await plan(seeded, [
      {
        op: 'update_marking',
        marking: id('good'),
        rect: { x: 10, y: 60, width: 60, height: 20 },
      },
    ]);
    expect(shrink.data.errors).toBeUndefined();
    expect(overflows(shrink)).toHaveLength(1);
  });

  it('uses the container effective mode: with "dark" the token font changes and so does the result', async () => {
    const rect = { x: 10, y: 10, width: 140, height: 20 };
    const light = await plan(real, [SCREEN, create(rect, 'lib/face')]);
    const dark = await plan(real, [
      { ...SCREEN, drawingMode: 'dark' },
      create(rect, 'lib/face'),
    ]);
    expect(overflows(light)).toEqual([]);
    expect(overflows(dark)).toHaveLength(1);
  });

  it('propose_changes returns the same items in issues', async () => {
    const operations = [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })];
    const planned = overflows(await plan(approx, operations));
    const proposed = await call(approx, 'propose_changes', {
      project: 'screens',
      title: 'Proof',
      operations,
    });
    expect(proposed.isError).toBe(false);
    // The annotation reference changes on every call (new ids); the rest is the same.
    const bare = (items: Record<string, unknown>[]) =>
      items.map((item) => ({ ...item, annotation: undefined }));
    expect(bare(overflows(proposed))).toEqual(bare(planned));
    expect(planned).toHaveLength(1);
  });
});

describe('plan_changes: warning on the none parent (#1093)', () => {
  it('a none-root chip at 58×40 returns a content component-overflow; at 87×40 nothing', async () => {
    const small = await plan(approx, [
      SCREEN,
      create({ x: 10, y: 10, width: 58, height: 40 }, 'lib/chip'),
    ]);
    expect(small.data.errors).toBeUndefined();
    const items = overflows(small);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'component-overflow',
      kind: 'content',
      node: 'chip',
      missing: 29,
    });
    const fits = await plan(approx, [
      SCREEN,
      create({ x: 10, y: 10, width: 87, height: 40 }, 'lib/chip'),
    ]);
    expect(overflows(fits)).toEqual([]);
  });
});

describe('plan_changes: word wider than the box (#1631)', () => {
  const save = (width: number) => create({ x: 10, y: 10, width, height: 40 }, 'lib/save');

  it('button "Save" at 58×40 returns a text component-overflow on the label; at 96×40 nothing', async () => {
    const small = await plan(approx, [SCREEN, save(58)]);
    expect(small.data.errors).toBeUndefined();
    const items = overflows(small);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'component-overflow',
      kind: 'text',
      node: 'save-label',
    });
    expect(items[0]!.missing).toBeGreaterThan(0);
    const fits = await plan(approx, [SCREEN, save(96)]);
    expect(overflows(fits)).toEqual([]);
  });
});

describe('plan_changes: drawing proof × density (#1085)', () => {
  const SCREEN3 = { ...SCREEN, width: 1200, height: 800, density: 3 };

  it('update_container density 3 with a 200×40 button returns component-overflow with missing in pixels', async () => {
    const project = await seed(seeded, [
      { ...SCREEN3, density: undefined, as: '$s' } as Operation,
      create({ x: 10, y: 10, width: 200, height: 40 }, 'lib/btn', {
        as: '$b',
        container: '$s',
        name: 'button',
      }) as Operation,
    ]);
    const container = project.containers.find((c) => c.file === null)!;
    const flat = await plan(seeded, [
      { op: 'update_container', container: container.id },
    ]);
    expect(overflows(flat)).toEqual([]);
    const dense = await plan(seeded, [
      { op: 'update_container', container: container.id, density: 3 },
    ]);
    expect(dense.data.errors).toBeUndefined();
    const items = overflows(dense);
    const text = items.find((i) => i.node === 'label');
    expect(text).toMatchObject({ code: 'component-overflow', kind: 'text' });
    expect(text!.missing as number).toBeGreaterThan(0);
  });

  it('the shortfall is in pixels: the same button at 180×60 at 3x is short by 3× that of 60×20 at 1x', async () => {
    const one = overflows(
      await plan(approx, [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })]),
    );
    const three = overflows(
      await plan(approx, [SCREEN3, create({ x: 30, y: 30, width: 180, height: 60 })]),
    );
    expect(one).toHaveLength(1);
    expect(three).toHaveLength(1);
    expect(three[0]!.missing as number).toBeCloseTo((one[0]!.missing as number) * 3, 0);
  });

  it('at 3x the 600×120 button (200×40 units) fits and generates nothing', async () => {
    const reply = await plan(approx, [
      SCREEN3,
      create({ x: 30, y: 30, width: 600, height: 120 }),
    ]);
    expect(reply.data.valid).toBe(true);
    expect(overflows(reply)).toEqual([]);
  });
});

describe('plan_changes: drawing proof × direction', () => {
  const seedDir = () =>
    seed(seeded, [
      { ...SCREEN, as: '$s' } as Operation,
      create({ x: 10, y: 10, width: 120, height: 40 }, 'lib/dir', {
        as: '$b',
        container: '$s',
        name: 'dir',
      }) as Operation,
    ]);

  it('a batch only changing the container direction proves the component that overflows only in rtl', async () => {
    const project = await seedDir();
    const container = project.containers.find((c) => c.file === null)!;
    const same = await plan(seeded, [
      { op: 'update_container', container: container.id },
    ]);
    expect(overflows(same)).toEqual([]);
    const rtl = await plan(seeded, [
      { op: 'update_container', container: container.id, direction: 'rtl' },
    ]);
    expect(rtl.data.errors).toBeUndefined();
    expect(overflows(rtl).length).toBeGreaterThan(0);
  });

  it('a batch only changing the project direction proves the component that overflows only in rtl', async () => {
    await seedDir();
    const rtl = await plan(seeded, [{ op: 'update_project', direction: 'rtl' }]);
    expect(rtl.data.errors).toBeUndefined();
    expect(overflows(rtl).length).toBeGreaterThan(0);
  });
});

describe('plan_changes and propose_changes: operationsFile', () => {
  const operations = [SCREEN, create({ x: 10, y: 10, width: 60, height: 20 })];

  it('applies the batch from the file and the result equals that of inline operations', async () => {
    writeFileSync(join(approx.base, 'batch.json'), JSON.stringify(operations));
    const inline = await plan(approx, operations);
    const file = await call(approx, 'plan_changes', {
      project: 'screens',
      operationsFile: join(approx.base, 'batch.json'),
    });
    expect(file.isError).toBe(false);
    // The ids of the created items are new on every call: only the rest is compared.
    const strip = (r: Reply) =>
      JSON.parse(JSON.stringify(r.data).replace(/[0-9a-f]{8}/g, '#'));
    expect(strip(file)).toEqual(strip(inline));
    expect(overflows(file)).toHaveLength(1);
  });

  it('accepts a path relative to a root and also works in propose_changes', async () => {
    writeFileSync(join(approx.base, 'batch2.json'), JSON.stringify(operations));
    const proposed = await call(approx, 'propose_changes', {
      project: 'screens',
      title: 'From file',
      operationsFile: 'batch2.json',
    });
    expect(proposed.isError).toBe(false);
    expect(proposed.data.valid).toBe(true);
    expect(overflows(proposed)).toHaveLength(1);
  });

  it('operations and operationsFile together: invalid-arguments', async () => {
    const reply = await call(approx, 'plan_changes', {
      project: 'screens',
      operations,
      operationsFile: 'batch.json',
    });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
  });

  it('neither of them: invalid-arguments', async () => {
    const reply = await call(approx, 'plan_changes', { project: 'screens' });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
  });

  it('a file outside the roots: the same path error as today (outside-roots)', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'mapping-outside-'));
    writeFileSync(join(outside, 'batch.json'), JSON.stringify(operations));
    try {
      const reply = await call(approx, 'plan_changes', {
        project: 'screens',
        operationsFile: join(outside, 'batch.json'),
      });
      expect(reply.isError).toBe(true);
      expect(reply.data.error?.code).toBe('outside-roots');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('a symbolic link outside the roots is also outside-roots', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'mapping-outside-'));
    writeFileSync(join(outside, 'batch.json'), JSON.stringify(operations));
    symlinkSync(join(outside, 'batch.json'), join(approx.base, 'escapes.json'));
    try {
      const reply = await call(approx, 'plan_changes', {
        project: 'screens',
        operationsFile: 'escapes.json',
      });
      expect(reply.data.error?.code).toBe('outside-roots');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('invalid JSON: error with the position', async () => {
    writeFileSync(join(approx.base, 'broken.json'), '[{"op": "add_container",,}]');
    const reply = await call(approx, 'plan_changes', {
      project: 'screens',
      operationsFile: 'broken.json',
    });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
    expect(reply.data.error?.message).toMatch(/broken\.json/);
    expect(reply.data.error?.message).toMatch(/position|line \d+ column \d+/);
  });

  it('the content is checked like the inline operations (unknown op)', async () => {
    writeFileSync(
      join(approx.base, 'bad.json'),
      JSON.stringify([{ op: 'does_not_exist' }]),
    );
    const reply = await call(approx, 'plan_changes', {
      project: 'screens',
      operationsFile: 'bad.json',
    });
    expect(reply.isError).toBe(true);
    expect(reply.data.error?.code).toBe('invalid-arguments');
  });
});
