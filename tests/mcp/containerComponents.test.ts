import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  siblingPosition,
  type Project,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { planChanges } from '../../mcp/changes';
import { decodeImage } from '../../mcp/image/codecs';
import { markingImage } from '../../mcp/imageTools';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { markingRow } from '../../mcp/views';
import { NOW } from '../model/fixtures';
import { encodePng, quadrants } from './images';

// Container with Material 3 components in the MCP: the catalog is read when loading the project,
// the new operations (add_container, create_marking with annotation, move_marking) and the
// `minSize` apply in the batch, and get_marking_image crops the simplified drawing.

const LIBRARY = resolve('tests/fixtures/material3');
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;
let loaded: LoadedProject;

function project(): Project {
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('invalid material3');
  const spec = parsed.spec;
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 200, height: 100 });
  return applySpecialization(p, spec, { packageSpecName: 'material3.spec.json' });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-container-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'material3'), { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(project()));
  roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'telas'));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

function run(
  operations: Operation[],
  from: LoadedProject = loaded,
): Promise<BatchResult> {
  return runBatch(from, operations, io);
}

const SCREEN: Operation = {
  op: 'add_container',
  as: '$screen',
  name: 'Sign in',
  width: 390,
  height: 844,
  background: '#FFEBEE',
};

describe('catalog when loading the project', () => {
  it('reads the components from the specs/material3 folder', () => {
    const components = loaded.catalog.get('material3');
    expect(components?.version).toBe(1);
    expect(components?.problems).toEqual([]);
    expect([...(components?.byType.keys() ?? [])]).toContain('m3-button');
  });
});

describe('add_container and update_container', () => {
  it('creates the container and edits background and size; on the photo, container-has-file', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'update_container',
        container: '$screen',
        background: '#000000',
        height: 900,
      },
      { op: 'update_container', container: PHOTO, background: '#000000' },
      { op: 'update_container', container: PHOTO, width: 300 },
    ]);
    expect(result.errors.map((e) => [e.index, e.code])).toEqual([
      [2, 'container-has-file'],
      [3, 'container-has-file'],
    ]);
    const screen = result.project.containers.find((i) => i.name === 'Sign in');
    expect(screen).toMatchObject({
      file: null,
      width: 390,
      height: 900,
      background: '#000000',
    });
    expect(result.created[0]).toMatchObject({ kind: 'i', alias: '$screen' });
    expect(result.steps[0]?.description).toMatch(/container "Sign in".*390×844/);
  });
});

describe('add_blank_image (old)', () => {
  it('still creates the container, with a warning to use add_container', async () => {
    const result = await run([{ ...SCREEN, op: 'add_blank_image' } as Operation]);
    expect(result.errors).toEqual([]);
    expect(result.project.containers.find((i) => i.name === 'Sign in')).toMatchObject({
      file: null,
      width: 390,
      height: 844,
    });
    expect(result.deprecations).toEqual([
      {
        index: 0,
        op: 'add_blank_image',
        message: expect.stringContaining('add_container'),
      },
    ]);
  });
});

describe('create_marking with annotation', () => {
  const ROW = {
    op: 'create_marking',
    as: '$row',
    annotationAs: '$rowNote',
    container: '$screen',
    annotation: { type: 'material3/m3-row' },
  } as const;
  const BUTTON = {
    op: 'create_marking',
    as: '$btn',
    container: '$screen',
    parent: '$row',
    annotation: { type: 'material3/m3-button', values: { label: 'Sign in' } },
  } as const;

  it('without rect uses the component size: the container in the center and the child in the slot', async () => {
    const result = await run([SCREEN, ROW, BUTTON]);
    expect(result.errors).toEqual([]);
    expect(result.invariantIssues).toEqual([]);
    const { project: p } = result;
    const rowId = (result.aliases.get('$row') as { id: string }).id;
    const buttonId = (result.aliases.get('$btn') as { id: string }).id;
    const noteId = (result.aliases.get('$rowNote') as { id: string }).id;
    const rowMarking = p.markings.find((m) => m.id === rowId)!;
    const button = p.markings.find((m) => m.id === buttonId)!;
    expect(rowMarking.rect).toMatchObject({ width: 380, height: 48 });
    expect(button.parentId).toBe(rowId);
    // `hug` width: the new instance is born with the measured size of the `preview` label (MC3), not the `size` (120).
    expect(button.rect).toMatchObject({ width: 91, height: 40 });
    expect(p.annotations.find((a) => a.id === noteId)).toMatchObject({
      markingId: rowId,
      type: { specId: 'material3', typeId: 'm3-row' },
    });
    expect(p.annotations.find((a) => a.markingId === buttonId)?.values).toMatchObject({
      label: 'Sign in',
    });
    expect(result.created.map((c) => [c.kind, c.alias])).toEqual([
      ['i', '$screen'],
      ['m', '$row'],
      ['a', '$rowNote'],
      ['m', '$btn'],
      ['a', undefined],
    ]);
    // The server never fixes and never writes the drawing.
    expect(JSON.stringify(p)).not.toContain('"scene"');
  });

  it('rect below the component minSize is refused with the minimum in the message', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        container: '$screen',
        rect: { x: 10, y: 10, width: 20, height: 20 },
        annotation: { type: 'material3/m3-button' },
      },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      minSize: { width: 48, height: 40 },
    });
    expect(result.errors[0]?.message).toMatch(/48×40/);
  });

  it('without a component (or without annotation) the rect remains required', async () => {
    const noRect = await run([
      SCREEN,
      { op: 'create_marking', container: '$screen' },
      {
        op: 'create_marking',
        container: '$screen',
        annotation: { type: 'material3/m3-button' },
        rect: { x: 0, y: 0, width: 100, height: 50 },
        annotationAs: '$a',
      },
    ]);
    expect(noRect.errors.map((e) => e.code)).toEqual(['invalid-arguments']);
    const lonely = await run([
      SCREEN,
      {
        op: 'create_marking',
        container: '$screen',
        rect: { x: 0, y: 0, width: 100, height: 50 },
        annotationAs: '$a',
      },
    ]);
    expect(lonely.errors.map((e) => e.code)).toEqual(['invalid-arguments']);
  });

  it('update_marking with rect respects the minSize', async () => {
    const result = await run([
      SCREEN,
      BUTTON_ON_SCREEN,
      {
        op: 'update_marking',
        marking: '$btn',
        rect: { x: 5, y: 5, width: 30, height: 30 },
      },
    ]);
    expect(result.errors.map((e) => e.code)).toEqual(['rect-too-small']);
    expect(result.errors[0]?.message).toMatch(/48×40/);
  });
});

const BUTTON_ON_SCREEN: Operation = {
  op: 'create_marking',
  as: '$btn',
  container: '$screen',
  annotation: { type: 'material3/m3-button' },
};

describe('move_marking', () => {
  it('reorders among the siblings and reports the invalid index', async () => {
    // Outside the first (the parent leaves the geometry): otherwise the second would be born inside the first.
    const second: Operation = {
      ...BUTTON_ON_SCREEN,
      as: '$btn2',
      rect: { x: 0, y: 0, width: 48, height: 40 },
    };
    const result = await run([
      SCREEN,
      BUTTON_ON_SCREEN,
      second,
      { op: 'move_marking', marking: '$btn2', index: 0 },
      { op: 'move_marking', marking: '$btn', index: 7 },
    ]);
    expect(result.errors.map((e) => [e.index, e.code])).toEqual([[4, 'invalid-index']]);
    const id = (alias: string) => (result.aliases.get(alias) as { id: string }).id;
    expect(siblingPosition(result.project, id('$btn2'))).toEqual({ index: 0, count: 2 });
    expect(siblingPosition(result.project, id('$btn'))).toEqual({ index: 1, count: 2 });
  });
});

describe('reading: order, component and minSize', () => {
  it('markingRow gives the order and, when it draws, component and minSize', async () => {
    const result = await run([SCREEN, BUTTON_ON_SCREEN]);
    const next: LoadedProject = { ...loaded, project: result.project };
    const refs = new Refs(next);
    const id = (result.aliases.get('$btn') as { id: string }).id;
    const marking = result.project.markings.find((m) => m.id === id)!;
    expect(markingRow(refs, marking)).toMatchObject({
      order: 0,
      component: 'material3/m3-button',
      minSize: { width: 48, height: 40 },
    });
  });
});

describe('get_marking_image in a container with components', () => {
  it('crops the simplified drawing: background, filled button and text as bars', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        as: '$btn',
        container: '$screen',
        rect: { x: 100, y: 200, width: 160, height: 56 },
        annotation: { type: 'material3/m3-button', values: { label: 'Sign in' } },
      },
    ]);
    expect(result.errors).toEqual([]);
    const next: LoadedProject = { ...loaded, project: result.project };
    const refs = new Refs(next);
    const id = (result.aliases.get('$btn') as { id: string }).id;
    const marking = result.project.markings.find((m) => m.id === id)!;
    const out = await markingImage(roots, refs, marking, { padding: 10 });
    expect(out.json).toMatchObject({
      drawing: 'rendered',
      drawingNote: expect.stringContaining('real text'),
      container: { file: null, background: '#FFEBEE' },
      width: 180,
      height: 76,
    });
    const { raster } = await decodeImage(out.image.bytes);
    const at = (x: number, y: number) => [
      ...raster.data.subarray((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 3),
    ];
    // The margin is the screen background; the button has another color, and the text a third one (bar).
    expect(at(2, 2)).toEqual([0xff, 0xeb, 0xee]);
    const fill = at(14, 38);
    expect(fill).not.toEqual([0xff, 0xeb, 0xee]);
    const colors = new Set<string>();
    for (let x = 12; x < 168; x++) colors.add(at(x, 38).join(','));
    expect(colors.size).toBeGreaterThan(1);
  });

  it('mode context shows the whole screen and keeps the plain background outside the components', async () => {
    const result = await run([SCREEN, BUTTON_ON_SCREEN]);
    const refs = new Refs({ ...loaded, project: result.project });
    const id = (result.aliases.get('$btn') as { id: string }).id;
    const marking = result.project.markings.find((m) => m.id === id)!;
    const out = await markingImage(roots, refs, marking, { mode: 'context' });
    expect(out.json).toMatchObject({ mode: 'context', drawing: 'rendered' });
    const { raster } = await decodeImage(out.image.bytes);
    expect([raster.data[0], raster.data[1], raster.data[2]]).toEqual([0xff, 0xeb, 0xee]);
  });
});

describe('canvas marking and parent by geometry (ME1)', () => {
  const idOf = (result: BatchResult, alias: string) =>
    (result.aliases.get(alias) as { id: string }).id;

  it('create_marking without container creates the canvas marking, with a negative rect', async () => {
    const result = await run([
      {
        op: 'create_marking',
        as: '$m',
        name: 'Loose',
        rect: { x: -50, y: -20, width: 100, height: 60 },
      },
    ]);
    expect(result.errors).toEqual([]);
    const marking = result.project.markings.find((m) => m.id === idOf(result, '$m'))!;
    expect(marking.containerId).toBeNull();
    expect(marking.rect).toEqual({ x: -50, y: -20, width: 100, height: 60 });
    const refs = new Refs({ ...loaded, project: result.project });
    expect(refs.label('m', marking.id)).toBe('Canvas › Loose');
    expect(markingRow(refs, marking)).toMatchObject({ container: 'Canvas' });
  });

  it('`parent` in create_marking and update_marking raises a warning and the parent is the one from the geometry', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        as: '$a',
        container: '$screen',
        rect: { x: 0, y: 0, width: 200, height: 200 },
      },
      {
        op: 'create_marking',
        as: '$b',
        container: '$screen',
        rect: { x: 300, y: 300, width: 50, height: 50 },
      },
      {
        op: 'create_marking',
        as: '$c',
        container: '$screen',
        rect: { x: 10, y: 10, width: 50, height: 50 },
        parent: '$b',
      },
      { op: 'update_marking', marking: '$c', parent: null },
    ]);
    expect(result.errors).toEqual([]);
    const c = result.project.markings.find((m) => m.id === idOf(result, '$c'))!;
    expect(c.parentId).toBe(idOf(result, '$a'));
    expect(result.deprecations.map((d) => [d.index, d.op])).toEqual([
      [3, 'create_marking'],
      [4, 'update_marking'],
    ]);
  });

  it('get_marking_image on a canvas marking gives a clear error', async () => {
    const result = await run([
      {
        op: 'create_marking',
        as: '$m',
        rect: { x: -500, y: -500, width: 10, height: 10 },
      },
    ]);
    const next: LoadedProject = { ...loaded, project: result.project };
    const marking = result.project.markings.find((m) => m.id === idOf(result, '$m'))!;
    await expect(markingImage(roots, new Refs(next), marking, {})).rejects.toThrow(
      /canvas/,
    );
  });
});

describe('replace_container respects the component minSize (#953)', () => {
  it('the button marking (48×40) does not shrink below the minimum when swapped for a smaller image', async () => {
    const half = (await encodePng(quadrants(100, 50))).toString('base64');
    const result = await run([
      {
        op: 'create_marking',
        container: PHOTO,
        rect: { x: 40, y: 20, width: 100, height: 60 },
        annotation: { type: 'material3/m3-button' },
        as: '$btn',
      },
      { op: 'replace_container', container: PHOTO, base64: half },
    ]);
    expect(result.errors).toEqual([]);
    const button = result.project.markings.find((m) => m.containerId === PHOTO);
    // 100×60 at (40,20) would become 50×30: the button asks for 48×40, so it grows around the center.
    expect(button?.rect.width).toBeGreaterThanOrEqual(48);
    expect(button?.rect.height).toBeGreaterThanOrEqual(40);
    expect(button?.needsReview).toBe(true);
  });
});

describe('create_marking with inside (child in the slot)', () => {
  const COLUMN = {
    op: 'create_marking',
    as: '$col',
    container: '$screen',
    annotation: { type: 'material3/m3-column' },
  } as const;
  const child = (as: string, extra: Partial<Operation> = {}): Operation =>
    ({
      op: 'create_marking',
      as,
      inside: '$col',
      annotation: { type: 'material3/m3-button' },
      ...extra,
    }) as Operation;
  const idOf = (result: BatchResult, alias: string) =>
    (result.aliases.get(alias) as { id: string }).id;
  const marking = (result: BatchResult, alias: string) =>
    result.project.markings.find((m) => m.id === idOf(result, alias))!;
  const codes = (result: BatchResult) => result.errors.map((e) => e.code);

  it('Column with 3 Buttons without rect: stacked with the slot gap and the parent is the Column', async () => {
    const batch = [SCREEN, COLUMN, child('$b1'), child('$b2'), child('$b3')];
    const result = await run(batch);
    expect(result.errors).toEqual([]);
    expect(result.invariantIssues).toEqual([]);
    const column = marking(result, '$col');
    const buttons = ['$b1', '$b2', '$b3'].map((a) => marking(result, a));
    expect(buttons.map((b) => b.parentId)).toEqual([column.id, column.id, column.id]);
    // The Column padding starts at 0 and the gap at 8: 40 of height + 8 between them.
    expect(buttons.map((b) => b.rect.x)).toEqual([
      column.rect.x,
      column.rect.x,
      column.rect.x,
    ]);
    expect(buttons.map((b) => b.rect.y)).toEqual([
      column.rect.y,
      column.rect.y + 48,
      column.rect.y + 96,
    ]);
    expect(buttons.map((b) => [b.rect.width, b.rect.height])).toEqual([
      [83, 40],
      [83, 40],
      [83, 40],
    ]);
    expect(result.deprecations).toEqual([]);
    // The plan_changes and propose_changes use the same prepared batch (`prepareBatch`).
    const plan = await planChanges(roots, loaded.location, batch, () => Date.parse(NOW));
    expect(plan.valid).toBe(true);
    const hex = (line: unknown) => String(line).replace(/\b[0-9a-f]{8}\b/g, '#');
    expect((plan.summary as string[]).map(hex)).toEqual(
      result.steps.map((s) => hex(`${s.index}. ${s.description}`)),
    );
  });

  it('with rect, the rect gives only the size (x and y are ignored)', async () => {
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 200, height: 60 } }),
    ]);
    expect(result.errors).toEqual([]);
    const column = marking(result, '$col');
    expect(marking(result, '$b1').rect).toEqual({
      x: column.rect.x,
      y: column.rect.y,
      width: 200,
      height: 60,
    });
  });

  it('rect smaller than the component minSize remains rect-too-small', async () => {
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 20, height: 20 } }),
    ]);
    expect(codes(result)).toEqual(['rect-too-small']);
  });

  it('full slot: accepts, attached to the component, with the warning that it did not fit', async () => {
    // The `$b1` takes the whole width and leaves only 20 of height: there is no free room left for `$b2` (40).
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 380, height: 180 } }),
      child('$b2'),
    ]);
    expect(result.errors).toEqual([]);
    const warning = result.deprecations.find((d) => d.index === 3);
    expect(warning).toMatchObject({ code: 'ignored-argument', op: 'create_marking' });
    expect(warning?.message).toMatch(/did not fit in the slot of/);
    expect(warning?.message).toMatch(/enlarge the component or use Arrange in the app/);
  });

  it('full slot and the child falls inside a sibling: the warning also says where it ended up', async () => {
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 380, height: 200 } }),
      child('$b2'),
    ]);
    expect(result.errors).toEqual([]);
    expect(marking(result, '$b2').parentId).toBe(idOf(result, '$b1'));
    const warning = result.deprecations.find((d) => d.index === 3);
    expect(warning?.message).toMatch(/did not fit in the slot of/);
    expect(warning?.message).toMatch(/it ended up inside/);
  });

  it('sibling covers the slot: the child stays in the component, not inside the sibling (CL1, finding 3.1)', async () => {
    const first = await run([SCREEN, COLUMN]);
    const col = marking(first, '$col').rect;
    const seeded: LoadedProject = { ...loaded, project: first.project };
    const colRef = `mapping://telas/m/${idOf(first, '$col')}`;
    const container = marking(first, '$col').containerId!;
    type Box = { x: number; y: number; width: number; height: number };
    const plain = (as: string, rect: Box): Operation =>
      ({ op: 'create_marking', as, container, rect }) as Operation;
    const result = await run(
      [
        // `$a` covers the slot from y + 15; `$b` (the last child) stays on top, outside `$a`.
        plain('$a', { ...col, y: col.y + 15, height: col.height - 15 }),
        plain('$b', { x: col.x, y: col.y, width: 40, height: 10 }),
        { ...child('$c'), inside: colRef } as Operation,
      ],
      seeded,
    );
    expect(result.errors).toEqual([]);
    // Before CL1 the piece was born contained in `$a` and became its child, with the warning "it ended up inside".
    expect(marking(result, '$c').parentId).toBe(idOf(first, '$col'));
    const warning = result.deprecations.find((d) => d.index === 2);
    expect(warning?.message ?? '').not.toMatch(/it ended up inside/);
  });

  it('rect larger than the slot: the size shrinks to the slot, with a warning', async () => {
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 900, height: 40 } }),
    ]);
    expect(result.errors).toEqual([]);
    expect(marking(result, '$b1').rect.width).toBe(marking(result, '$col').rect.width);
    const warning = result.deprecations.find((d) => d.index === 2);
    expect(warning).toMatchObject({ code: 'ignored-argument', op: 'create_marking' });
    expect(warning?.message).toMatch(/900×40/);
  });

  it('target that does not draw a component with a slot: invalid-parent', async () => {
    const result = await run([
      SCREEN,
      { ...COLUMN, annotation: { type: 'material3/m3-button' } },
      child('$b1'),
    ]);
    expect(codes(result)).toEqual(['invalid-parent']);
  });

  it('target without a component annotation (plain marking): invalid-parent', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        as: '$col',
        container: '$screen',
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      child('$b1'),
    ]);
    expect(codes(result)).toEqual(['invalid-parent']);
  });

  it('container given and different from the target one: invalid-parent; same as the target one is valid', async () => {
    const other: Operation = {
      op: 'add_container',
      as: '$other',
      name: 'Other',
      width: 390,
      height: 844,
      background: '#FFFFFF',
    };
    const divergent = await run([
      SCREEN,
      other,
      COLUMN,
      child('$b1', { container: '$other' }),
    ]);
    expect(codes(divergent)).toEqual(['invalid-parent']);
    const same = await run([
      SCREEN,
      other,
      COLUMN,
      child('$b1', { container: '$screen' }),
    ]);
    expect(same.errors).toEqual([]);
  });

  it('canvas target: the child is born in the canvas, in its slot', async () => {
    const result = await run([{ ...COLUMN, container: undefined }, child('$b1')]);
    expect(result.errors).toEqual([]);
    const column = marking(result, '$col');
    const button = marking(result, '$b1');
    expect(button.containerId).toBeNull();
    expect(button.parentId).toBe(column.id);
  });

  it('inside without annotation, or with a type without a component: invalid-arguments', async () => {
    const noAnnotation = await run([
      SCREEN,
      COLUMN,
      {
        op: 'create_marking',
        inside: '$col',
        rect: { x: 0, y: 0, width: 50, height: 50 },
      },
    ]);
    expect(codes(noAnnotation)).toEqual(['invalid-arguments']);
  });

  it('inside together with near: invalid-arguments', async () => {
    const result = await run([SCREEN, COLUMN, child('$b1', { near: '$screen' })]);
    expect(codes(result)).toEqual(['invalid-arguments']);
  });

  it('inside with a reference that does not exist: invalid-ref', async () => {
    const result = await run([SCREEN, { ...child('$b1'), inside: '???' } as Operation]);
    expect(codes(result)).toEqual(['invalid-ref']);
  });

  it('inside of a marking that is already in the project', async () => {
    const first = await run([SCREEN, COLUMN]);
    expect(first.errors).toEqual([]);
    const colRef = `mapping://telas/m/${idOf(first, '$col')}`;
    const seeded: LoadedProject = { ...loaded, project: first.project };
    const result = await run([{ ...child('$b1'), inside: colRef } as Operation], seeded);
    expect(result.errors).toEqual([]);
    expect(marking(result, '$b1').parentId).toBe(idOf(first, '$col'));
  });

  it('parent remains ignored with a warning, also together with inside', async () => {
    const result = await run([SCREEN, COLUMN, child('$b1', { parent: '$col' })]);
    expect(result.errors).toEqual([]);
    expect(result.deprecations.map((d) => [d.index, d.code])).toContainEqual([
      2,
      'ignored-argument',
    ]);
  });
});
