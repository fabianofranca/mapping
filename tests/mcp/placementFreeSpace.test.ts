import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applyBundledLibrary,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  type Project,
} from '../../src/model';
import { NOTES_FILES, NOTES_LIBRARY } from '../../libraries/notas';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { planChanges, prepareBatch } from '../../mcp/changes';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// Stage #1087 (EL1): `create_marking` without `rect` is born in free space (the same placement as the app),
// in the batch and through both doors (`plan_changes` and `propose_changes`, which use the same prepared batch).
// The floating type and the `near` path stay as before.

const LIBRARY = resolve('tests/fixtures/material3');
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let notes: LoadedProject;

function project(): Project {
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('material3 is invalid');
  const spec = parsed.spec;
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/photo.png', width: 200, height: 100 });
  return applySpecialization(p, spec, { packageSpecName: 'material3.spec.json' });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-container-'));
  const dir = join(base, 'screens');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'material3'), { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(project()));
  roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'screens'));
  // Project with the notes library (type `nota`, floating), with the `specs/notas/` folder beside it.
  const notesDir = join(base, 'notas');
  for (const [path, text] of NOTES_FILES) {
    const file = join(notesDir, 'specs', 'notas', ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const bare = createProject({
    name: 'Notes',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  writeFileSync(
    join(notesDir, 'mapping.json'),
    serialize(applyBundledLibrary(bare, NOTES_LIBRARY, { newId: () => 'LN' }).project),
  );
  notes = await loadProject(roots, await findProject(roots, 'notas'));
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

const button = (as: string, extra: Partial<Operation> = {}): Operation =>
  ({
    op: 'create_marking',
    as,
    container: '$screen',
    annotation: { type: 'material3/m3-button' },
    ...extra,
  }) as Operation;

const idOf = (result: BatchResult, alias: string) =>
  (result.aliases.get(alias) as { id: string }).id;
const marking = (result: BatchResult, alias: string) =>
  result.project.markings.find((m) => m.id === idOf(result, alias))!;
const overlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe('create_marking without rect: free space', () => {
  it('two equal components in the same container, in the same batch: side by side, both without a parent', async () => {
    const batch = [SCREEN, button('$a'), button('$b')];
    const result = await run(batch);
    expect(result.errors).toEqual([]);
    const a = marking(result, '$a');
    const b = marking(result, '$b');
    expect(b.rect).not.toEqual(a.rect);
    expect(overlap(a.rect, b.rect)).toBe(false);
    expect(a.parentId).toBeNull();
    expect(b.parentId).toBeNull();
    expect(result.invariantIssues).toEqual([]);
    // The first is born at the center of the container (390 × 844), at the measured size of the label (`sizing.width`
    // `hug`, MC3): 83 wide, not the 120 of `size`.
    expect(a.rect).toEqual({ x: 154, y: 402, width: 83, height: 40 });
    expect(b.rect.width).toBe(83);
    expect(b.rect.height).toBe(40);
  });

  it('plan_changes and propose_changes use the same prepared batch: the same rectangles', async () => {
    const batch = [SCREEN, button('$a'), button('$b')];
    const result = await run(batch);
    const plan = await planChanges(roots, loaded.location, batch, () => Date.parse(NOW));
    expect(plan.valid).toBe(true);
    const prepared = await prepareBatch(roots, loaded.location, batch, {
      now: () => Date.parse(NOW),
    });
    expect(prepared.valid).toBe(true);
    for (const alias of ['$a', '$b']) {
      const same = prepared.result.project.markings.find(
        (m) => m.id === idOf(prepared.result, alias),
      )!;
      expect(same.rect).toEqual(marking(result, alias).rect);
    }
  });

  it('floating type without near or rect, with an obstacle at the canvas center: born centered at (0, 0), as today', async () => {
    const result = await run(
      [
        {
          op: 'create_marking',
          as: '$obstacle',
          rect: { x: -100, y: -100, width: 200, height: 200 },
        } as Operation,
        {
          op: 'create_marking',
          as: '$note',
          annotation: { type: 'notas/nota' },
        } as Operation,
      ],
      notes,
    );
    expect(result.errors).toEqual([]);
    const note = marking(result, '$note');
    expect(note).toMatchObject({ floating: true, containerId: null, parentId: null });
    // The note measures 240 × 120: centered at (0, 0), on top of the obstacle, without looking for a place.
    expect(note.rect).toEqual({ x: -120, y: -60, width: 240, height: 120 });
  });

  it('the near path stays the same: the note goes to the container margin, without covering it', async () => {
    const result = await run(
      [
        SCREEN,
        {
          op: 'create_marking',
          as: '$note',
          annotation: { type: 'notas/nota' },
          near: '$screen',
        } as Operation,
      ],
      notes,
    );
    expect(result.errors).toEqual([]);
    const note = marking(result, '$note');
    const screen = result.project.containers.find(
      (c) => c.id === idOf(result, '$screen'),
    )!;
    expect(
      overlap(note.rect, {
        x: screen.placement.x,
        y: screen.placement.y,
        width: screen.width * screen.placement.scale,
        height: screen.height * screen.placement.scale,
      }),
    ).toBe(false);
  });
});
