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

// O catálogo de componentes do lote acompanha as especializações do lote (etapa Fonte e
// preview, FP2; bug #746): depois de apply/update/remove_specialization, create_marking vê o
// componente da versão que a operação acabou de ler (preview, minSize, rect opcional), e avisa
// quando o tipo declara componente que o lote não achou.

const LIBRARY = resolve('tests/fixtures/material3');
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;

function material3Spec(version: number): string {
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('material3 inválida');
  return JSON.stringify({ ...parsed.spec, version }, null, 2);
}

/** Cópia da biblioteca Material 3 numa pasta, na versão pedida. */
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

/** Projeto em pasta, sem a biblioteca (`withLibrary` false) ou com a v1 aplicada. */
async function openProject(name: string, withLibrary: boolean): Promise<LoadedProject> {
  const dir = join(base, name);
  mkdirSync(join(dir, 'specs'), { recursive: true });
  let p = baseProject();
  if (withLibrary) {
    cpSync(join(base, 'lib1'), join(dir, 'specs', 'material3'), { recursive: true });
    const parsed = parseSpecText(material3Spec(1));
    if (!parsed.ok) throw new Error('material3 inválida');
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
  readSource: () => Promise.reject(new Error('sem arquivos')),
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

describe('create_marking com values parciais (preview completa o resto)', () => {
  it('(a) caminho simples: a biblioteca já aplicada ao abrir', async () => {
    const result = await run(await openProject('simples', true), [BUTTON]);
    expect(result.errors).toEqual([]);
    const { annotation, issues } = buttonOf(result);
    expect(annotation.values).toMatchObject({ label: 'Label', variant: 'tonal' });
    expect(issues).toEqual([]);
  });

  it('(b) depois de update_specialization no mesmo lote', async () => {
    const result = await run(await openProject('atualiza', true), [
      { op: 'update_specialization', file: join(base, 'lib2') },
      BUTTON,
    ]);
    expect(result.errors).toEqual([]);
    const { annotation, issues } = buttonOf(result);
    expect(annotation.values).toMatchObject({ label: 'Label', variant: 'tonal' });
    expect(issues).toEqual([]);
  });

  it('(c) depois de apply_specialization no mesmo lote', async () => {
    const result = await run(await openProject('aplica', false), [
      { op: 'apply_specialization', file: join(base, 'lib1') },
      BUTTON,
    ]);
    expect(result.errors).toEqual([]);
    const { annotation, issues } = buttonOf(result);
    expect(annotation.values).toMatchObject({ label: 'Label', variant: 'tonal' });
    expect(issues).toEqual([]);
  });
});

describe('o catálogo do lote acompanha apply/update/remove_specialization', () => {
  it('depois de apply_specialization, sem rect usa o tamanho inicial do componente', async () => {
    const result = await run(await openProject('aplica-sem-rect', false), [
      { op: 'apply_specialization', file: join(base, 'lib1') },
      BUTTON,
    ]);
    expect(result.errors).toEqual([]);
    expect(buttonOf(result).marking.rect).toMatchObject({ width: 120, height: 40 });
  });

  it('depois de update_specialization, um rect menor que o minSize é recusado com o mínimo', async () => {
    const result = await run(await openProject('atualiza-min', true), [
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

  it('depois de remove_specialization o tipo não existe mais', async () => {
    const result = await run(await openProject('remove', true), [
      { op: 'remove_specialization', specId: 'material3', mode: 'delete' },
      BUTTON,
    ]);
    expect(result.errors.map((e) => [e.index, e.code])).toEqual([[1, 'unknown-type']]);
  });
});

describe('create_annotation com type numa marcação existente', () => {
  it('só os default do tipo: sem o preview do componente', async () => {
    const result = await run(await openProject('anota', true), [
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

describe('nota quando o tipo declara componente e o lote não o acha', () => {
  const MARKING: Operation = {
    op: 'create_marking',
    as: '$btn',
    container: PHOTO,
    rect: { x: 10, y: 10, width: 120, height: 40 },
    annotation: { type: 'material3/m3-button' },
  };

  it('arquivo do componente ausente na pasta do projeto: a nota diz o motivo', async () => {
    const loaded = await openProject('sem-botao', true);
    rmSync(join(base, 'sem-botao', 'specs', 'material3', 'components', 'm3-button.json'));
    const reopened = await loadProject(roots, await findProject(roots, 'sem-botao'));
    expect(loaded.catalog.get('material3')?.problems).toEqual([]);
    const result = await run(reopened, [MARKING]);
    expect(result.errors).toEqual([]);
    const note = result.deprecations.find((d) => d.index === 0);
    expect(note?.message).toMatch(
      /^o tipo material3\/m3-button declara componente, mas arquivo ausente \(.*m3-button\.json\): a anotação foi criada sem o preview e sem o tamanho mínimo$/,
    );
    // A anotação existe, só com os default.
    expect(buttonOf(result).annotation.values).not.toHaveProperty('label', 'Label');
  });

  it('componente carregado: sem nota', async () => {
    const result = await run(await openProject('com-botao', true), [MARKING]);
    expect(result.deprecations.filter((d) => d.code === 'ignored-argument')).toEqual([]);
  });
});
