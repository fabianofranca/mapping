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
  ModelError,
  addContainer,
  applySpecialization,
  createProject,
  formatRef,
  parseSpecText,
  serialize,
  shortCode,
  type Project,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { MODEL_ERROR_HINTS, modelToolError } from '../../mcp/modelErrors';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// `plan_changes` errors with the model's facts (`ModelError.data`): `rect-too-small` says the
// received size and the minimum; `image-overlap` says which container it overlaps, by
// reference; the detail is not cut when it contains `: `.

const LIBRARY = resolve('tests/fixtures/material3');
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let loaded: LoadedProject;

beforeAll(async () => {
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('invalid material3');
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 200, height: 100 });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'material3.spec.json' });
  base = mkdtempSync(join(tmpdir(), 'mapping-plan-errors-'));
  const dir = join(base, 'screens');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'material3'), { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'screens'));
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

function run(operations: Operation[]): Promise<BatchResult> {
  return runBatch(loaded, operations, io);
}

const ENTRAR: Operation = {
  op: 'add_container',
  as: '$a',
  name: 'Entrar',
  width: 300,
  height: 300,
  background: '#FFFFFF',
};
const SAIR: Operation = { ...ENTRAR, as: '$b', name: 'Sair' } as Operation;

describe('rect-too-small', () => {
  it('create_marking 5×3 without a component: received, minimum and hint', async () => {
    const result = await run([
      {
        op: 'create_marking',
        container: PHOTO,
        rect: { x: 0, y: 0, width: 5, height: 3 },
      },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      detail: 'received 5×3 px; minimum 8×8 px',
    });
    expect(result.errors[0]?.hint).toMatch(/width.*height/);
  });

  it('update_marking with a small rect brings the same detail', async () => {
    const made = await run([
      {
        op: 'create_marking',
        as: '$m',
        container: PHOTO,
        rect: { x: 0, y: 0, width: 50, height: 50 },
      },
    ]);
    const next: LoadedProject = { ...loaded, project: made.project };
    const result = await runBatch(
      next,
      [
        {
          op: 'update_marking',
          marking: made.created[0]!.id,
          rect: { x: 0, y: 0, width: 2, height: 40 },
        },
      ],
      io,
    );
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      detail: 'received 2×40 px; minimum 8×8 px',
    });
  });

  it('below the component minSize: the received, the minimum and the minSize', async () => {
    const result = await run([
      ENTRAR,
      {
        op: 'create_marking',
        container: '$a',
        rect: { x: 10, y: 10, width: 20, height: 20 },
        annotation: { type: 'material3/m3-button' },
      },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      minSize: { width: 48, height: 40 },
      detail: 'received 20×20 px; minimum 48×40 px (from the component)',
    });
    expect(result.errors[0]?.hint).toMatch(/width.*height/);
  });
});

/** `mapping://screens/i/<code>` of the container, as the MCP returns it. */
function containerRef(project: Project, id: string): string {
  return formatRef({ project: 'screens', kind: 'i', code: shortCode(project, 'i', id) });
}

describe('image-overlap', () => {
  it('update_container that grows over another says which, by reference', async () => {
    const setup = await run([ENTRAR, SAIR]);
    const [entrar, sair] = setup.created;
    const result = await runBatch(
      { ...loaded, project: setup.project },
      [{ op: 'update_container', container: entrar!.id, width: 5000 }],
      io,
    );
    expect(result.errors).toHaveLength(1);
    const error = result.errors[0]!;
    expect(error.code).toBe('image-overlap');
    // Only the URL of the other container (without the name in parentheses), never that of the one that grows.
    expect(error.detail).toBe(
      `overlaps the container ${containerRef(setup.project, sair!.id)}`,
    );
    expect(String(error.hint)).toMatch(/x.*y.*scale/);
  });

  it('moving a container over another cites the other, not the one that moves', async () => {
    const setup = await run([ENTRAR, SAIR]);
    const entrar = setup.project.containers.find((c) => c.name === 'Entrar')!;
    const result = await runBatch(
      { ...loaded, project: setup.project },
      [
        {
          op: 'update_container',
          container: setup.created[1]!.id,
          x: entrar.placement.x + 10,
          y: entrar.placement.y,
        },
      ],
      io,
    );
    expect(result.errors).toHaveLength(1);
    const error = result.errors[0]!;
    expect(error.code).toBe('image-overlap');
    expect(error.detail).toBe(
      `overlaps the container ${containerRef(setup.project, entrar.id)}`,
    );
  });
});

describe('detail with ": " inside', () => {
  it('modelToolError keeps everything after the first ": "', () => {
    const error = modelToolError(new ModelError('not-found', 'a: b: c'));
    expect(error.toJSON().error).toMatchObject({ detail: 'a: b: c' });
  });

  it('both codes have a hint in the registry', () => {
    expect(MODEL_ERROR_HINTS['rect-too-small']).toBeDefined();
    expect(MODEL_ERROR_HINTS['image-overlap']).toBeDefined();
  });
});
