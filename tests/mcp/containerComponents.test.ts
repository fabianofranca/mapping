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
import { decodeImage } from '../../mcp/image/codecs';
import { markingImage } from '../../mcp/imageTools';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { markingRow } from '../../mcp/views';
import { NOW } from '../model/fixtures';

// Container com componentes do Material 3 no MCP: o catálogo é lido ao carregar o projeto,
// as operações novas (add_blank_image, create_marking com annotation, move_marking) e o
// `minSize` valem no lote, e get_marking_image recorta o desenho simplificado.

const LIBRARY = resolve('examples/libraries/material3');
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;
let loaded: LoadedProject;

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
  base = mkdtempSync(join(tmpdir(), 'mapping-blank-'));
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

describe('catálogo ao carregar o projeto', () => {
  it('lê os componentes da pasta specs/material3', () => {
    const components = loaded.catalog.get('material3');
    expect(components?.version).toBe(1);
    expect(components?.problems).toEqual([]);
    expect([...(components?.byType.keys() ?? [])]).toContain('m3-button');
  });
});

describe('add_container e update_image', () => {
  it('cria a tela e edita fundo e tamanho; na foto, container-has-file', async () => {
    const result = await run([
      SCREEN,
      { op: 'update_image', image: '$tela', background: '#000000', height: 900 },
      { op: 'update_image', image: PHOTO, background: '#000000' },
      { op: 'update_image', image: PHOTO, width: 300 },
    ]);
    expect(result.errors.map((e) => [e.index, e.code])).toEqual([
      [2, 'container-has-file'],
      [3, 'container-has-file'],
    ]);
    const screen = result.project.containers.find((i) => i.name === 'Entrar');
    expect(screen).toMatchObject({
      file: null,
      width: 390,
      height: 900,
      background: '#000000',
    });
    expect(result.created[0]).toMatchObject({ kind: 'i', alias: '$tela' });
    expect(result.steps[0]?.description).toMatch(/container "Entrar".*390×844/);
  });
});

describe('add_blank_image (antiga)', () => {
  it('ainda cria o container, com aviso para usar add_container', async () => {
    const result = await run([{ ...SCREEN, op: 'add_blank_image' } as Operation]);
    expect(result.errors).toEqual([]);
    expect(result.project.containers.find((i) => i.name === 'Entrar')).toMatchObject({
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

describe('create_marking com annotation', () => {
  const ROW = {
    op: 'create_marking',
    as: '$row',
    annotationAs: '$rowNote',
    image: '$tela',
    annotation: { type: 'material3/m3-row' },
  } as const;
  const BUTTON = {
    op: 'create_marking',
    as: '$btn',
    image: '$tela',
    parent: '$row',
    annotation: { type: 'material3/m3-button', values: { label: 'Entrar' } },
  } as const;

  it('sem rect usa o tamanho do componente: o container no centro e o filho no slot', async () => {
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
    expect(button.rect).toMatchObject({ width: 120, height: 40 });
    expect(p.annotations.find((a) => a.id === noteId)).toMatchObject({
      markingId: rowId,
      type: { specId: 'material3', typeId: 'm3-row' },
    });
    expect(p.annotations.find((a) => a.markingId === buttonId)?.values).toMatchObject({
      label: 'Entrar',
    });
    expect(result.created.map((c) => [c.kind, c.alias])).toEqual([
      ['i', '$tela'],
      ['m', '$row'],
      ['a', '$rowNote'],
      ['m', '$btn'],
      ['a', undefined],
    ]);
    // O servidor nunca arruma e nunca grava desenho.
    expect(JSON.stringify(p)).not.toContain('"scene"');
  });

  it('rect abaixo do minSize do componente é recusado com o mínimo na mensagem', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        image: '$tela',
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

  it('sem componente (ou sem annotation) o rect continua obrigatório', async () => {
    const noRect = await run([
      SCREEN,
      { op: 'create_marking', image: '$tela' },
      {
        op: 'create_marking',
        image: '$tela',
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
        image: '$tela',
        rect: { x: 0, y: 0, width: 100, height: 50 },
        annotationAs: '$a',
      },
    ]);
    expect(lonely.errors.map((e) => e.code)).toEqual(['invalid-arguments']);
  });

  it('update_marking com rect respeita o minSize', async () => {
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
  image: '$tela',
  annotation: { type: 'material3/m3-button' },
};

describe('move_marking', () => {
  it('reordena entre as irmãs e fala do índice inválido', async () => {
    const second: Operation = { ...BUTTON_ON_SCREEN, as: '$btn2' };
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

describe('leitura: ordem, componente e minSize', () => {
  it('markingRow diz a ordem e, quando desenha, component e minSize', async () => {
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

describe('get_marking_image num container com componentes', () => {
  it('recorta o desenho simplificado: fundo, botão preenchido e texto em barras', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        as: '$btn',
        image: '$tela',
        rect: { x: 100, y: 200, width: 160, height: 56 },
        annotation: { type: 'material3/m3-button', values: { label: 'Entrar' } },
      },
    ]);
    expect(result.errors).toEqual([]);
    const next: LoadedProject = { ...loaded, project: result.project };
    const refs = new Refs(next);
    const id = (result.aliases.get('$btn') as { id: string }).id;
    const marking = result.project.markings.find((m) => m.id === id)!;
    const out = await markingImage(roots, refs, marking, { padding: 10 });
    expect(out.json).toMatchObject({
      drawing: 'simplified',
      drawingNote: expect.stringContaining('barras'),
      image: { file: null, blank: true, background: '#FFEBEE' },
      width: 180,
      height: 76,
    });
    const { raster } = await decodeImage(out.image.bytes);
    const at = (x: number, y: number) => [
      ...raster.data.subarray((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 3),
    ];
    // A margem é o fundo da tela; o botão tem outra cor, e o texto, uma terceira (barra).
    expect(at(2, 2)).toEqual([0xff, 0xeb, 0xee]);
    const fill = at(14, 38);
    expect(fill).not.toEqual([0xff, 0xeb, 0xee]);
    const colors = new Set<string>();
    for (let x = 12; x < 168; x++) colors.add(at(x, 38).join(','));
    expect(colors.size).toBeGreaterThan(1);
  });

  it('mode context mostra a tela inteira e continua com o fundo liso fora dos componentes', async () => {
    const result = await run([SCREEN, BUTTON_ON_SCREEN]);
    const refs = new Refs({ ...loaded, project: result.project });
    const id = (result.aliases.get('$btn') as { id: string }).id;
    const marking = result.project.markings.find((m) => m.id === id)!;
    const out = await markingImage(roots, refs, marking, { mode: 'context' });
    expect(out.json).toMatchObject({ mode: 'context', drawing: 'simplified' });
    const { raster } = await decodeImage(out.image.bytes);
    expect([raster.data[0], raster.data[1], raster.data[2]]).toEqual([0xff, 0xeb, 0xee]);
  });
});
