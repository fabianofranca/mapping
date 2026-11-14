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
  setContainerDensity,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// CL2 (#1715): the `create_marking` minimum with a component is in pixels (`minSize` × container
// density); `density: 1` in the MCP does not write the key.

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
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 600, height: 600 });
  p = setContainerDensity(p, PHOTO, 3);
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'material3.spec.json' });
  base = mkdtempSync(join(tmpdir(), 'mapping-min-one-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'material3'), { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const roots = new Roots([base]);
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

const run = (operations: Operation[]): Promise<BatchResult> =>
  runBatch(loaded, operations, io);

const BUTTON = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Operation => ({
  op: 'create_marking',
  container: PHOTO,
  rect,
  annotation: { type: 'material3/m3-button' },
});

describe('create_marking minimum with the container density', () => {
  it('60×60 in a 3x container is refused: the m3-button minimum (48×40) is 144×120 px', async () => {
    const result = await run([BUTTON({ x: 10, y: 10, width: 60, height: 60 })]);
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      minSize: { width: 144, height: 120 },
    });
  });

  it('144×120 in a 3x container is accepted', async () => {
    const result = await run([BUTTON({ x: 10, y: 10, width: 144, height: 120 })]);
    expect(result.errors).toEqual([]);
  });
});

describe('density: 1 in the MCP does not write the key', () => {
  it('update_container with density 1 on a 3x container removes the key', async () => {
    const result = await run([{ op: 'update_container', container: PHOTO, density: 1 }]);
    expect(result.errors).toEqual([]);
    expect('density' in result.project.containers[0]!).toBe(false);
  });

  it('update_container with density 1 on a container without density changes nothing', async () => {
    const result = await run([
      { op: 'update_container', container: PHOTO, density: null },
      { op: 'update_container', container: PHOTO, density: 1 },
    ]);
    expect(result.errors).toEqual([]);
    expect('density' in result.project.containers[0]!).toBe(false);
  });
});
