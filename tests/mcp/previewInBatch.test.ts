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
  getAnnotationIssues,
  parseSpecText,
  serialize,
  type Project,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { readSpecInput } from '../../mcp/library';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// The component catalog of the batch follows the specializations of the batch (Source and
// preview stage, FP2; bug #746): after apply/update/remove_specialization, create_marking sees the
// component of the version the operation just read (preview, minSize, optional rect), and warns
// when the type declares a component that the batch did not find.

const LIBRARY = resolve('tests/fixtures/material3');
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;

function material3Spec(version: number): string {
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('invalid material3');
  return JSON.stringify({ ...parsed.spec, version }, null, 2);
}

/** Copy of the Material 3 library in a folder, in the requested version. */
function writeLibrary(dir: string, version: number): void {
  cpSync(LIBRARY, dir, { recursive: true });
  writeFileSync(join(dir, 'material3.spec.json'), material3Spec(version));
}

function baseProject(): Project {
  const p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  return addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 400, height: 300 });
}

/** Project in a folder, without the library (`withLibrary` false) or with v1 applied. */
async function openProject(name: string, withLibrary: boolean): Promise<LoadedProject> {
  const dir = join(base, name);
  mkdirSync(join(dir, 'specs'), { recursive: true });
  let p = baseProject();
  if (withLibrary) {
    cpSync(join(base, 'lib1'), join(dir, 'specs', 'material3'), { recursive: true });
    const parsed = parseSpecText(material3Spec(1));
    if (!parsed.ok) throw new Error('invalid material3');
    p = applySpecialization(p, parsed.spec, { packageSpecName: 'material3.spec.json' });
  }
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  return loadProject(roots, await findProject(roots, name));
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mapping-preview-'));
  writeLibrary(join(base, 'lib1'), 1);
  writeLibrary(join(base, 'lib2'), 2);
  roots = new Roots([base]);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: (path: string) => readSpecInput(roots, path),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

function run(from: LoadedProject, operations: Operation[]): Promise<BatchResult> {
  return runBatch(from, operations, io);
}

const BUTTON: Operation = {
  op: 'create_marking',
  as: '$btn',
  container: PHOTO,
  annotation: { type: 'material3/m3-button', values: { variant: 'tonal' } },
};

function buttonOf(result: BatchResult) {
  const id = (result.aliases.get('$btn') as { id: string }).id;
  const marking = result.project.markings.find((m) => m.id === id)!;
  const annotation = result.project.annotations.find((a) => a.markingId === id)!;
  return {
    marking,
    annotation,
    issues: getAnnotationIssues(result.project, annotation.id),
  };
}

describe('create_marking with partial values (preview fills in the rest)', () => {
  it('(a) simple path: the library already applied on open', async () => {
    const result = await run(await openProject('simple', true), [BUTTON]);
    expect(result.errors).toEqual([]);
    const { annotation, issues } = buttonOf(result);
    expect(annotation.values).toMatchObject({ label: 'Label', variant: 'tonal' });
    expect(issues).toEqual([]);
  });

  it('(b) after update_specialization in the same batch', async () => {
    const result = await run(await openProject('update', true), [
      { op: 'update_specialization', file: join(base, 'lib2') },
      BUTTON,
    ]);
    expect(result.errors).toEqual([]);
    const { annotation, issues } = buttonOf(result);
    expect(annotation.values).toMatchObject({ label: 'Label', variant: 'tonal' });
    expect(issues).toEqual([]);
  });

  it('(c) after apply_specialization in the same batch', async () => {
    const result = await run(await openProject('apply', false), [
      { op: 'apply_specialization', file: join(base, 'lib1') },
      BUTTON,
    ]);
    expect(result.errors).toEqual([]);
    const { annotation, issues } = buttonOf(result);
    expect(annotation.values).toMatchObject({ label: 'Label', variant: 'tonal' });
    expect(issues).toEqual([]);
  });
});

describe('the batch catalog follows apply/update/remove_specialization', () => {
  it('after apply_specialization, without rect uses the initial component size', async () => {
    const result = await run(await openProject('apply-without-rect', false), [
      { op: 'apply_specialization', file: join(base, 'lib1') },
      BUTTON,
    ]);
    expect(result.errors).toEqual([]);
    // The button has `sizing.width` `hug`: it is born with the measured size of the `preview` (MC3), 83 × 40.
    expect(buttonOf(result).marking.rect).toMatchObject({ width: 83, height: 40 });
  });

  it('after update_specialization, a rect smaller than the minSize is refused with the minimum', async () => {
    const result = await run(await openProject('update-min', true), [
      { op: 'update_specialization', file: join(base, 'lib2') },
      {
        op: 'create_marking',
        container: PHOTO,
        rect: { x: 10, y: 10, width: 20, height: 20 },
        annotation: { type: 'material3/m3-button' },
      },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      index: 1,
      code: 'rect-too-small',
      minSize: { width: 48, height: 40 },
    });
  });

  it('after remove_specialization the type no longer exists', async () => {
    const result = await run(await openProject('remove', true), [
      { op: 'remove_specialization', specId: 'material3', mode: 'delete' },
      BUTTON,
    ]);
    expect(result.errors.map((e) => [e.index, e.code])).toEqual([[1, 'unknown-type']]);
  });
});

describe('create_annotation with type on an existing marking', () => {
  it('only the type defaults: without the component preview', async () => {
    const result = await run(await openProject('note', true), [
      {
        op: 'create_marking',
        as: '$m',
        container: PHOTO,
        rect: { x: 10, y: 10, width: 120, height: 40 },
      },
      {
        op: 'create_annotation',
        as: '$a',
        marking: '$m',
        type: 'material3/m3-button',
        values: { variant: 'tonal' },
      },
    ]);
    expect(result.errors).toEqual([]);
    const id = (result.aliases.get('$a') as { id: string }).id;
    const values = result.project.annotations.find((a) => a.id === id)?.values;
    expect(values).toMatchObject({ variant: 'tonal', disabled: 'não' });
    expect(values).not.toHaveProperty('label', 'Label');
  });
});

describe('notice when the type declares a component and the batch does not find it', () => {
  const MARKING: Operation = {
    op: 'create_marking',
    as: '$btn',
    container: PHOTO,
    rect: { x: 10, y: 10, width: 120, height: 40 },
    annotation: { type: 'material3/m3-button' },
  };

  it('component file missing from the project folder: the notice gives the reason', async () => {
    const loaded = await openProject('without-button', true);
    rmSync(
      join(base, 'without-button', 'specs', 'material3', 'components', 'm3-button.json'),
    );
    const reopened = await loadProject(roots, await findProject(roots, 'without-button'));
    expect(loaded.catalog.get('material3')?.problems).toEqual([]);
    const result = await run(reopened, [MARKING]);
    expect(result.errors).toEqual([]);
    const note = result.deprecations.find((d) => d.index === 0);
    expect(note?.message).toMatch(
      /^type material3\/m3-button declares a component, but missing file \(.*m3-button\.json\): the annotation was created without the preview and without the minimum size$/,
    );
    // The annotation exists, with only the defaults.
    expect(buttonOf(result).annotation.values).not.toHaveProperty('label', 'Label');
  });

  it('component loaded: no notice', async () => {
    const result = await run(await openProject('with-button', true), [MARKING]);
    expect(result.deprecations.filter((d) => d.code === 'ignored-argument')).toEqual([]);
  });
});
