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

// Container com componentes do Material 3 no MCP: o catálogo é lido ao carregar o projeto,
// as operações novas (add_container, create_marking com annotation, move_marking) e o
// `minSize` valem no lote, e get_marking_image recorta o desenho simplificado.

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

describe('add_container e update_container', () => {
  it('cria o container e edita fundo e tamanho; na foto, container-has-file', async () => {
    const result = await run([
      SCREEN,
      { op: 'update_container', container: '$tela', background: '#000000', height: 900 },
      { op: 'update_container', container: PHOTO, background: '#000000' },
      { op: 'update_container', container: PHOTO, width: 300 },
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
    container: '$tela',
    annotation: { type: 'material3/m3-row' },
  } as const;
  const BUTTON = {
    op: 'create_marking',
    as: '$btn',
    container: '$tela',
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
        container: '$tela',
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
      { op: 'create_marking', container: '$tela' },
      {
        op: 'create_marking',
        container: '$tela',
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
        container: '$tela',
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
  container: '$tela',
  annotation: { type: 'material3/m3-button' },
};

describe('move_marking', () => {
  it('reordena entre as irmãs e fala do índice inválido', async () => {
    // Fora do primeiro (o pai sai da geometria): senão a segunda nasceria dentro da primeira.
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
        container: '$tela',
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
      drawing: 'rendered',
      drawingNote: expect.stringContaining('texto real'),
      container: { file: null, background: '#FFEBEE' },
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
    expect(out.json).toMatchObject({ mode: 'context', drawing: 'rendered' });
    const { raster } = await decodeImage(out.image.bytes);
    expect([raster.data[0], raster.data[1], raster.data[2]]).toEqual([0xff, 0xeb, 0xee]);
  });
});

describe('marcação do canvas e pai pela geometria (ME1)', () => {
  const idOf = (result: BatchResult, alias: string) =>
    (result.aliases.get(alias) as { id: string }).id;

  it('create_marking sem container cria a marcação do canvas, com rect negativo', async () => {
    const result = await run([
      {
        op: 'create_marking',
        as: '$m',
        name: 'Solta',
        rect: { x: -50, y: -20, width: 100, height: 60 },
      },
    ]);
    expect(result.errors).toEqual([]);
    const marking = result.project.markings.find((m) => m.id === idOf(result, '$m'))!;
    expect(marking.containerId).toBeNull();
    expect(marking.rect).toEqual({ x: -50, y: -20, width: 100, height: 60 });
    const refs = new Refs({ ...loaded, project: result.project });
    expect(refs.label('m', marking.id)).toBe('Canvas › Solta');
    expect(markingRow(refs, marking)).toMatchObject({ container: 'Canvas' });
  });

  it('`parent` em create_marking e update_marking gera aviso e o pai é o da geometria', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        as: '$a',
        container: '$tela',
        rect: { x: 0, y: 0, width: 200, height: 200 },
      },
      {
        op: 'create_marking',
        as: '$b',
        container: '$tela',
        rect: { x: 300, y: 300, width: 50, height: 50 },
      },
      {
        op: 'create_marking',
        as: '$c',
        container: '$tela',
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

  it('get_marking_image numa marcação do canvas dá erro claro', async () => {
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

describe('replace_container respeita o minSize do componente (#953)', () => {
  it('a marcação do botão (48×40) não encolhe abaixo do mínimo ao trocar por imagem menor', async () => {
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
    // 100×60 em (40,20) viraria 50×30: o botão pede 48×40, então cresce em volta do centro.
    expect(button?.rect.width).toBeGreaterThanOrEqual(48);
    expect(button?.rect.height).toBeGreaterThanOrEqual(40);
    expect(button?.needsReview).toBe(true);
  });
});

describe('create_marking com inside (filha no slot)', () => {
  const COLUMN = {
    op: 'create_marking',
    as: '$col',
    container: '$tela',
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

  it('Column com 3 Buttons sem rect: empilhados com o gap do slot e o pai é a Column', async () => {
    const batch = [SCREEN, COLUMN, child('$b1'), child('$b2'), child('$b3')];
    const result = await run(batch);
    expect(result.errors).toEqual([]);
    expect(result.invariantIssues).toEqual([]);
    const column = marking(result, '$col');
    const buttons = ['$b1', '$b2', '$b3'].map((a) => marking(result, a));
    expect(buttons.map((b) => b.parentId)).toEqual([column.id, column.id, column.id]);
    // O padding da Column começa em 0 e o gap em 8: 40 de altura + 8 entre elas.
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
      [120, 40],
      [120, 40],
      [120, 40],
    ]);
    expect(result.deprecations).toEqual([]);
    // O plan_changes e o propose_changes usam o mesmo lote preparado (`prepareBatch`).
    const plan = await planChanges(roots, loaded.location, batch, () => Date.parse(NOW));
    expect(plan.valid).toBe(true);
    const hex = (line: unknown) => String(line).replace(/\b[0-9a-f]{8}\b/g, '#');
    expect((plan.summary as string[]).map(hex)).toEqual(
      result.steps.map((s) => hex(`${s.index}. ${s.description}`)),
    );
  });

  it('com rect, o rect dá só o tamanho (x e y são ignorados)', async () => {
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

  it('rect menor que o minSize do componente continua rect-too-small', async () => {
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 20, height: 20 } }),
    ]);
    expect(codes(result)).toEqual(['rect-too-small']);
  });

  it('slot cheio: aceita, presa ao componente, com o aviso de que não coube', async () => {
    // O `$b1` ocupa a largura toda e deixa só 20 de altura: não sobra lugar livre para o `$b2` (40).
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 380, height: 180 } }),
      child('$b2'),
    ]);
    expect(result.errors).toEqual([]);
    const warning = result.deprecations.find((d) => d.index === 3);
    expect(warning).toMatchObject({ code: 'ignored-argument', op: 'create_marking' });
    expect(warning?.message).toMatch(/não coube no slot de/);
    expect(warning?.message).toMatch(/aumente o componente ou use Arrumar na app/);
  });

  it('slot cheio e a filha cai dentro de uma irmã: o aviso diz também em quem ficou', async () => {
    const result = await run([
      SCREEN,
      COLUMN,
      child('$b1', { rect: { x: 0, y: 0, width: 380, height: 200 } }),
      child('$b2'),
    ]);
    expect(result.errors).toEqual([]);
    expect(marking(result, '$b2').parentId).toBe(idOf(result, '$b1'));
    const warning = result.deprecations.find((d) => d.index === 3);
    expect(warning?.message).toMatch(/não coube no slot de/);
    expect(warning?.message).toMatch(/ficou dentro de/);
  });

  it('coube no slot, mas o pai gravado é uma irmã (não a última): o aviso diz em quem ficou', async () => {
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
        // `$a` cobre o slot a partir de y + 15; `$b` (a última filha) fica em cima, fora de `$a`.
        plain('$a', { ...col, y: col.y + 15, height: col.height - 15 }),
        plain('$b', { x: col.x, y: col.y, width: 40, height: 10 }),
        { ...child('$c'), inside: colRef } as Operation,
      ],
      seeded,
    );
    expect(result.errors).toEqual([]);
    expect(marking(result, '$c').parentId).toBe(idOf(result, '$a'));
    const warning = result.deprecations.find((d) => d.index === 2);
    expect(warning).toMatchObject({ code: 'ignored-argument', op: 'create_marking' });
    expect(warning?.message).toMatch(/ficou dentro de/);
  });

  it('rect maior que o slot: o tamanho encolhe ao slot, com aviso', async () => {
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

  it('alvo que não desenha componente com slot: invalid-parent', async () => {
    const result = await run([
      SCREEN,
      { ...COLUMN, annotation: { type: 'material3/m3-button' } },
      child('$b1'),
    ]);
    expect(codes(result)).toEqual(['invalid-parent']);
  });

  it('alvo sem anotação de componente (marcação comum): invalid-parent', async () => {
    const result = await run([
      SCREEN,
      {
        op: 'create_marking',
        as: '$col',
        container: '$tela',
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      child('$b1'),
    ]);
    expect(codes(result)).toEqual(['invalid-parent']);
  });

  it('container informado e diferente do do alvo: invalid-parent; igual ao do alvo vale', async () => {
    const other: Operation = {
      op: 'add_container',
      as: '$outra',
      name: 'Outra',
      width: 390,
      height: 844,
      background: '#FFFFFF',
    };
    const divergent = await run([
      SCREEN,
      other,
      COLUMN,
      child('$b1', { container: '$outra' }),
    ]);
    expect(codes(divergent)).toEqual(['invalid-parent']);
    const same = await run([SCREEN, other, COLUMN, child('$b1', { container: '$tela' })]);
    expect(same.errors).toEqual([]);
  });

  it('alvo do canvas: a filha nasce no canvas, no slot dele', async () => {
    const result = await run([{ ...COLUMN, container: undefined }, child('$b1')]);
    expect(result.errors).toEqual([]);
    const column = marking(result, '$col');
    const button = marking(result, '$b1');
    expect(button.containerId).toBeNull();
    expect(button.parentId).toBe(column.id);
  });

  it('inside sem annotation, ou com tipo sem componente: invalid-arguments', async () => {
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

  it('inside junto com near: invalid-arguments', async () => {
    const result = await run([SCREEN, COLUMN, child('$b1', { near: '$tela' })]);
    expect(codes(result)).toEqual(['invalid-arguments']);
  });

  it('inside com referência que não existe: invalid-ref', async () => {
    const result = await run([SCREEN, { ...child('$b1'), inside: '???' } as Operation]);
    expect(codes(result)).toEqual(['invalid-ref']);
  });

  it('inside de uma marcação que já está no projeto', async () => {
    const first = await run([SCREEN, COLUMN]);
    expect(first.errors).toEqual([]);
    const colRef = `mapping://telas/m/${idOf(first, '$col')}`;
    const seeded: LoadedProject = { ...loaded, project: first.project };
    const result = await run([{ ...child('$b1'), inside: colRef } as Operation], seeded);
    expect(result.errors).toEqual([]);
    expect(marking(result, '$b1').parentId).toBe(idOf(first, '$col'));
  });

  it('parent continua ignorado com aviso, também junto de inside', async () => {
    const result = await run([SCREEN, COLUMN, child('$b1', { parent: '$col' })]);
    expect(result.errors).toEqual([]);
    expect(result.deprecations.map((d) => [d.index, d.code])).toContainEqual([
      2,
      'ignored-argument',
    ]);
  });
});
