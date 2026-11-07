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
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// Decisão 24: marcação com anotação de um tipo COM componente tem mínimo de 1 px (o `minSize`
// do componente, se houver, continua mandando); a marcação comum mantém 8 px.

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
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 200, height: 100 });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'material3.spec.json' });
  base = mkdtempSync(join(tmpdir(), 'mapping-min-one-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'material3'), { recursive: true });
  // O `m3-box` sem `minSize`: o mínimo dele passa a ser o de qualquer componente (1×1).
  const boxPath = join(dir, 'specs', 'material3', 'components', 'm3-box.json');
  const box = JSON.parse(readFileSync(boxPath, 'utf8')) as Record<string, unknown>;
  delete box.minSize;
  writeFileSync(boxPath, JSON.stringify(box, null, 2));
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

const SMALL = { x: 10, y: 10, width: 3, height: 3 };
const BOX: Operation = {
  op: 'create_marking',
  as: '$box',
  container: PHOTO,
  rect: SMALL,
  annotation: { type: 'material3/m3-box' },
};

describe('mínimo de 1 px com componente', () => {
  it('create_marking 3×3 com componente sem minSize é aceito', async () => {
    const result = await run([BOX]);
    expect(result.errors).toEqual([]);
    const marking = result.project.markings.find((m) => m.containerId === PHOTO);
    expect(marking?.rect).toEqual(SMALL);
  });

  it('update_marking 3×3 numa marcação com componente sem minSize é aceito', async () => {
    const result = await run([
      { ...BOX, rect: { x: 0, y: 0, width: 50, height: 50 } },
      { op: 'update_marking', marking: '$box', rect: SMALL },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.project.markings.find((m) => m.containerId === PHOTO)?.rect).toEqual(
      SMALL,
    );
  });

  it('sem componente 3×3 segue recusado, com mínimo 8×8', async () => {
    const result = await run([{ op: 'create_marking', container: PHOTO, rect: SMALL }]);
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      detail: 'recebido 3×3 px; mínimo 8×8 px',
    });
  });

  it('o minSize do componente (48×40) continua mandando', async () => {
    const result = await run([
      {
        op: 'create_marking',
        container: PHOTO,
        rect: SMALL,
        annotation: { type: 'material3/m3-button' },
      },
    ]);
    expect(result.errors[0]).toMatchObject({
      code: 'rect-too-small',
      minSize: { width: 48, height: 40 },
    });
  });
});
