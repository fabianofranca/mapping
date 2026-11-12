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

// CL2 (#1715): o mínimo do `create_marking` com componente vale em pixels (`minSize` × densidade
// do container); `density: 1` no MCP não grava a chave.

const LIBRARY = resolve('tests/fixtures/material3');
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let loaded: LoadedProject;

beforeAll(async () => {
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('material3 inválida');
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
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
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

describe('mínimo do create_marking com a densidade do container', () => {
  it('60×60 num container 3x recusa: o mínimo do m3-button (48×40) vale 144×120 px', async () => {
    const result = await run([BUTTON({ x: 10, y: 10, width: 60, height: 60 })]);
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      minSize: { width: 144, height: 120 },
    });
  });

  it('144×120 num container 3x é aceito', async () => {
    const result = await run([BUTTON({ x: 10, y: 10, width: 144, height: 120 })]);
    expect(result.errors).toEqual([]);
  });
});

describe('density: 1 no MCP não grava a chave', () => {
  it('update_container com density 1 num container 3x remove a chave', async () => {
    const result = await run([{ op: 'update_container', container: PHOTO, density: 1 }]);
    expect(result.errors).toEqual([]);
    expect('density' in result.project.containers[0]!).toBe(false);
  });

  it('update_container com density 1 num container sem densidade não muda nada', async () => {
    const result = await run([
      { op: 'update_container', container: PHOTO, density: null },
      { op: 'update_container', container: PHOTO, density: 1 },
    ]);
    expect(result.errors).toEqual([]);
    expect('density' in result.project.containers[0]!).toBe(false);
  });
});
