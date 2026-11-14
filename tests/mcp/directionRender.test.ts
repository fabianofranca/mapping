import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { decodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { renderContainer, renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';

// R2 (#1096, decisão 3): `render_container` e `render_marking` com `direction` fixam a direção na
// imagem, como o `drawingMode`. Um componente com uma `row` de dois filhos coloridos sai
// espelhado em `rtl` (x' = largura − x − w, no espaço do componente); o container que fixa a
// direção também espelha sem `direction`, e o parâmetro vale sobre o que o container fixa.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        { id: 'pair', name: 'Par', component: 'components/pair.json', fields: [] },
      ],
    },
  ],
};

const RED = [220, 20, 20];
const BLUE = [20, 20, 220];
const swatch = (color: string) => ({
  type: 'frame',
  width: 20,
  height: 20,
  fill: color,
});
const PAIR = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'pair',
  name: 'Par',
  size: { width: 100, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'start' },
    children: [swatch('#DC1414'), swatch('#1414DC')],
  },
};

let base: string;
let roots: Roots;
let loaded: LoadedProject;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-direction-render-'));
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeFileSync(join(lib, 'components', 'pair.json'), JSON.stringify(PAIR));
  const parsed = parseSpecText(readFileSync(join(lib, 'lib.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
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

const PAIR_RECT = { x: 10, y: 10, width: 100, height: 40 };

function screen(extra: Record<string, unknown> = {}): Operation[] {
  return [
    {
      op: 'add_container',
      as: '$tela',
      width: 200,
      height: 80,
      background: '#FFFFFF',
      ...extra,
    } as Operation,
    {
      op: 'create_marking',
      as: '$par',
      container: '$tela',
      rect: PAIR_RECT,
      annotation: { type: 'lib/pair', values: {} },
    },
  ];
}

async function setup(operations: Operation[]) {
  const result: BatchResult = await runBatch(loaded, operations, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const id = (alias: string) => (result.aliases.get(alias) as { id: string }).id;
  return {
    refs,
    marking: result.project.markings.find((m) => m.id === id('$par'))!,
    container: result.project.containers.find((c) => c.id === id('$tela'))!,
  };
}

const pixel = (raster: Raster, x: number, y: number): number[] => {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 3)];
};

/** As cores do vermelho e do azul pelo centro de cada um dos dois filhos (relativo ao componente). */
function swatches(raster: Raster, originX: number): { red: number[]; blue: number[] } {
  return {
    red: pixel(raster, originX + 10, 30),
    blue: pixel(raster, originX + 30, 30),
  };
}

describe('render_container com direction', () => {
  it('ltr: o primeiro filho à esquerda; rtl: espelhado (x′ = largura − x − w)', async () => {
    const { refs, container } = await setup(screen());
    const ltr = (
      await decodeImage((await renderContainer(roots, refs, container, {})).image.bytes)
    ).raster;
    // O componente ocupa x de 10 a 110: vermelho em 10..30, azul em 30..50.
    expect(pixel(ltr, 20, 30)).toEqual(RED);
    expect(pixel(ltr, 40, 30)).toEqual(BLUE);
    expect(pixel(ltr, 100, 30)).toEqual([255, 255, 255]);

    const out = await renderContainer(roots, refs, container, { direction: 'rtl' });
    expect(out.json).toMatchObject({ direction: 'rtl' });
    const rtl = (await decodeImage(out.image.bytes)).raster;
    // Vermelho em 80..100 (110 − 10 − 20 = 80), azul em 60..80, vazio onde estava.
    expect(pixel(rtl, 90, 30)).toEqual(RED);
    expect(pixel(rtl, 70, 30)).toEqual(BLUE);
    expect(pixel(rtl, 20, 30)).toEqual([255, 255, 255]);
    expect(pixel(rtl, 40, 30)).toEqual([255, 255, 255]);
  });

  it('o container que fixa rtl espelha sem direction; direction fixa na imagem sobre o container', async () => {
    const { refs, container } = await setup(screen({ direction: 'rtl' }));
    expect(container.direction).toBe('rtl');
    const own = (
      await decodeImage((await renderContainer(roots, refs, container, {})).image.bytes)
    ).raster;
    expect(swatches(own, 10).red).not.toEqual(RED);
    expect(pixel(own, 90, 30)).toEqual(RED);
    expect(pixel(own, 70, 30)).toEqual(BLUE);

    const forced = (
      await decodeImage(
        (await renderContainer(roots, refs, container, { direction: 'ltr' })).image.bytes,
      )
    ).raster;
    expect(pixel(forced, 20, 30)).toEqual(RED);
    expect(pixel(forced, 40, 30)).toEqual(BLUE);
    const json = (await renderContainer(roots, refs, container, {})).json;
    expect(json).toMatchObject({ direction: null });
  });
});

describe('render_marking com direction', () => {
  it('desenha a marcação espelhada (a região é a dela: vermelho à direita)', async () => {
    const { refs, marking } = await setup(screen());
    const out = await renderMarking(roots, refs, marking, {
      direction: 'rtl',
      background: 'none',
    });
    expect(out.json).toMatchObject({ direction: 'rtl' });
    const { raster } = await decodeImage(out.image.bytes);
    expect(raster.width).toBe(100);
    expect(pixel(raster, 90, 20)).toEqual(RED);
    expect(pixel(raster, 70, 20)).toEqual(BLUE);
    expect(raster.data[(20 * 100 + 10) * 4 + 3]).toBe(0);
  });
});
