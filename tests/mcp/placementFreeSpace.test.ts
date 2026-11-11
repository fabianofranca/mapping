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

// Etapa #1087 (EL1): `create_marking` sem `rect` nasce em lugar livre (a mesma colocação da app),
// no lote e nas duas portas (`plan_changes` e `propose_changes`, que usam o mesmo lote preparado).
// O tipo flutuante e o caminho `near` continuam como antes.

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
  if (!parsed.ok) throw new Error('material3 inválida');
  const spec = parsed.spec;
  let p = createProject({
    name: 'Telas',
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
  // Projeto com a biblioteca de notas (tipo `nota`, flutuante), com a pasta `specs/notas/` ao lado.
  const notesDir = join(base, 'notas');
  for (const [path, text] of NOTES_FILES) {
    const file = join(notesDir, 'specs', 'notas', ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const bare = createProject({
    name: 'Notas',
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
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
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
  as: '$tela',
  name: 'Entrar',
  width: 390,
  height: 844,
  background: '#FFEBEE',
};

const button = (as: string, extra: Partial<Operation> = {}): Operation =>
  ({
    op: 'create_marking',
    as,
    container: '$tela',
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

describe('create_marking sem rect: lugar livre', () => {
  it('dois componentes iguais no mesmo container, no mesmo lote: lado a lado, os dois sem pai', async () => {
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
    // O primeiro nasce no centro do container (390 × 844) e o tamanho do componente se mantém.
    expect(a.rect).toEqual({ x: 135, y: 402, width: 120, height: 40 });
    expect(b.rect.width).toBe(120);
    expect(b.rect.height).toBe(40);
  });

  it('plan_changes e propose_changes usam o mesmo lote preparado: os mesmos retângulos', async () => {
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

  it('tipo flutuante sem near nem rect, com obstáculo no centro do canvas: nasce centrado em (0, 0), como hoje', async () => {
    const result = await run(
      [
        {
          op: 'create_marking',
          as: '$obstaculo',
          rect: { x: -100, y: -100, width: 200, height: 200 },
        } as Operation,
        {
          op: 'create_marking',
          as: '$nota',
          annotation: { type: 'notas/nota' },
        } as Operation,
      ],
      notes,
    );
    expect(result.errors).toEqual([]);
    const note = marking(result, '$nota');
    expect(note).toMatchObject({ floating: true, containerId: null, parentId: null });
    // A nota mede 240 × 120: centrada em (0, 0), por cima do obstáculo, sem buscar lugar.
    expect(note.rect).toEqual({ x: -120, y: -60, width: 240, height: 120 });
  });

  it('o caminho near continua igual: a nota vai para a margem do container, sem cobri-lo', async () => {
    const result = await run(
      [
        SCREEN,
        {
          op: 'create_marking',
          as: '$nota',
          annotation: { type: 'notas/nota' },
          near: '$tela',
        } as Operation,
      ],
      notes,
    );
    expect(result.errors).toEqual([]);
    const note = marking(result, '$nota');
    const screen = result.project.containers.find((c) => c.id === idOf(result, '$tela'))!;
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
