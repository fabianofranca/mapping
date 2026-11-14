import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createMarking,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { decodeImage, encodeImage } from '../../mcp/image/codecs';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { imageFile, markingImage } from '../../mcp/imageTools';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { renderContainer, renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';
import { encodeJpegWithExif } from './images';

// CF9 (decisão 32): `render_marking` e `render_container`, o `get_marking_image` de um container sem
// arquivo com o mesmo desenho e as `fonts` da biblioteca no lugar da embutida.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
// Arquivo com a metade das dimensões registradas (100×50 contra 200×100).
const SMALL = 'bbbbbbbb-0000-4000-8000-000000000002';
const SMALL_MARKING = 'aaaaaaaa-0000-4000-8000-000000000002';
// JPEG de 40×20 com orientação EXIF 6 (vista como 20×40), registrado como 20×40.
const ROTATED = 'bbbbbbbb-0000-4000-8000-000000000003';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  icons: 'icons/set.json',
  fonts: [{ family: 'Acme', file: 'fonts/Acme.ttf' }],
  tokens: {
    modes: ['light', 'dark'],
    values: {
      bg: { light: '#ffffff', dark: '#202020' },
      fg: { light: '#000000', dark: '#ffffff' },
    },
  },
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'btn',
          name: 'Botão',
          component: 'components/btn.json',
          fields: [
            { key: 'label', type: 'string', default: 'Salvar' },
            { key: 'family', type: 'string', default: 'sans-serif' },
          ],
        },
        {
          id: 'badge',
          name: 'Selo',
          component: 'components/badge.json',
          fields: [{ key: 'icon', type: 'string', default: 'check' }],
        },
      ],
    },
  ],
};

const BUTTON = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'btn',
  name: 'Botão',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center' },
    fill: { $token: 'bg' },
    shadow: { color: 'rgba(0, 0, 0, 0.5)', y: 2, blur: 6 },
    children: [
      {
        type: 'text',
        text: { $field: 'label', default: 'Salvar' },
        font: { family: { $field: 'family' }, size: 14, weight: 400, lineHeight: 20 },
        color: { $token: 'fg' },
      },
    ],
  },
};

const BADGE = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'badge',
  name: 'Selo',
  size: { width: 48, height: 48 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center' },
    children: [
      {
        type: 'icon',
        name: { $field: 'icon' },
        color: '#000000',
        width: 24,
        height: 24,
      },
    ],
  },
};

let base: string;
let roots: Roots;
let loaded: LoadedProject;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-render-'));
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(lib, 'fonts'), { recursive: true });
  mkdirSync(join(lib, 'icons'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeFileSync(join(lib, 'components', 'btn.json'), JSON.stringify(BUTTON));
  writeFileSync(join(lib, 'components', 'badge.json'), JSON.stringify(BADGE));
  cpSync('tests/fixtures/icons/icons/set.json', join(lib, 'icons', 'set.json'));
  // "Acme" é a fonte mono em negrito: bem mais larga que a sans nos mesmos caracteres.
  cpSync('mcp/fonts/MappingMono-Bold.ttf', join(lib, 'fonts', 'Acme.ttf'));
  const photo = createRaster(200, 100);
  for (let i = 0; i < photo.data.length; i += 4) {
    photo.data.set([16, 160, 48, 255], i);
  }
  writeFileSync(join(dir, 'images', 'foto.png'), await encodeImage(photo, 'png'));
  // 100×50: faixa esquerda de 30 px vermelha, o resto verde.
  const small = createRaster(100, 50);
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 100; x++)
      small.data.set(x < 30 ? [200, 32, 32, 255] : [16, 160, 48, 255], (y * 100 + x) * 4);
  writeFileSync(join(dir, 'images', 'menor.png'), await encodeImage(small, 'png'));
  const rotated = createRaster(40, 20);
  rotated.data.fill(200);
  writeFileSync(join(dir, 'images', 'girada.jpg'), await encodeJpegWithExif(rotated, 6));
  const parsed = parseSpecText(readFileSync(join(lib, 'lib.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 200, height: 100 });
  p = addContainer(p, { id: SMALL, file: 'images/menor.png', width: 200, height: 100 });
  p = addContainer(p, { id: ROTATED, file: 'images/girada.jpg', width: 20, height: 40 });
  p = createMarking(p, {
    id: SMALL_MARKING,
    containerId: SMALL,
    rect: { x: 51, y: 0, width: 20, height: 20 },
    name: 'Faixa',
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

const SCREEN: Operation = {
  op: 'add_container',
  as: '$tela',
  width: 300,
  height: 200,
  background: '#FFEBEE',
};

function create(
  alias: string,
  rect: { x: number; y: number; width: number; height: number },
  values: Record<string, string> = {},
  type = 'lib/btn',
  container = '$tela',
): Operation {
  return {
    op: 'create_marking',
    as: alias,
    container,
    rect,
    annotation: { type, values },
  };
}

async function setup(operations: Operation[]) {
  const result: BatchResult = await runBatch(loaded, operations, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const marking = (alias: string) =>
    result.project.markings.find(
      (m) => m.id === (result.aliases.get(alias) as { id: string }).id,
    )!;
  const container = (alias: string) =>
    result.project.containers.find(
      (c) => c.id === (result.aliases.get(alias) as { id: string }).id,
    )!;
  return { refs, marking, container, project: result.project };
}

const luma = (raster: Raster, x: number, y: number) => {
  const i = (y * raster.width + x) * 4;
  return (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
};

/** A coluna mais à direita com tinta escura (texto preto sobre o fundo branco do botão). */
function rightmostInk(raster: Raster): number {
  let right = -1;
  for (let x = 0; x < raster.width; x++)
    for (let y = 0; y < raster.height; y++) if (luma(raster, x, y) < 100) right = x;
  return right;
}

const BTN_RECT = { x: 50, y: 60, width: 120, height: 40 };

describe('render_marking', () => {
  it('zoom 2 devolve o dobro da largura e da altura, com texto real', async () => {
    const { refs, marking } = await setup([SCREEN, create('$b', BTN_RECT)]);
    const one = await renderMarking(roots, refs, marking('$b'), {});
    const two = await renderMarking(roots, refs, marking('$b'), { zoom: 2 });
    expect(one.json).toMatchObject({ width: 120, height: 40, zoom: 1 });
    expect(two.json).toMatchObject({ width: 240, height: 80, zoom: 2 });
    const raster = (await decodeImage(two.image.bytes)).raster;
    expect(raster.width).toBe(240);
    let ink = 0;
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < 240; x++) if (luma(raster, x, y) < 100) ink++;
    expect(ink).toBeGreaterThan(40);
  });

  it('acima do limite de pixels falha com image-too-large, como get_marking_image', async () => {
    const { refs, container } = await setup([{ ...SCREEN, width: 2000, height: 2000 }]);
    await expect(
      renderContainer(roots, refs, container('$tela'), { zoom: 8 }),
    ).rejects.toMatchObject({ code: 'image-too-large' });
  });

  it('drawingMode "dark" pinta com os tokens do modo; modo desconhecido é erro', async () => {
    const { refs, marking } = await setup([SCREEN, create('$b', BTN_RECT)]);
    const light = (
      await decodeImage(
        (await renderMarking(roots, refs, marking('$b'), { background: 'none' })).image
          .bytes,
      )
    ).raster;
    const dark = (
      await decodeImage(
        (
          await renderMarking(roots, refs, marking('$b'), {
            drawingMode: 'dark',
            background: 'none',
          })
        ).image.bytes,
      )
    ).raster;
    expect(luma(light, 4, 4)).toBeGreaterThan(240);
    expect(luma(dark, 4, 4)).toBeLessThan(60);
    await expect(
      renderMarking(roots, refs, marking('$b'), { drawingMode: 'sepia' }),
    ).rejects.toMatchObject({ code: 'invalid-arguments' });
  });

  it('a sombra do botão aparece com a margem (padding)', async () => {
    const { refs, marking } = await setup([SCREEN, create('$b', BTN_RECT)]);
    const out = await renderMarking(roots, refs, marking('$b'), {
      padding: 10,
      background: 'none',
    });
    const { raster } = await decodeImage(out.image.bytes);
    // Logo abaixo do botão (y = 10 + 40 + 2): a sombra tem alfa > 0; longe dele, não.
    expect(raster.data[(52 * raster.width + 70) * 4 + 3]).toBeGreaterThan(10);
    expect(raster.data[(0 * raster.width + 0) * 4 + 3]).toBe(0);
  });

  it('fonts da biblioteca valem no lugar da embutida', async () => {
    const { refs, marking } = await setup([
      SCREEN,
      create('$sans', BTN_RECT, { label: 'iiiiii' }),
      create('$acme', { ...BTN_RECT, y: 120 }, { label: 'iiiiii', family: 'Acme' }),
    ]);
    const a = (
      await decodeImage(
        (await renderMarking(roots, refs, marking('$sans'), {})).image.bytes,
      )
    ).raster;
    const b = (
      await decodeImage(
        (await renderMarking(roots, refs, marking('$acme'), {})).image.bytes,
      )
    ).raster;
    expect(rightmostInk(b)).toBeGreaterThan(rightmostInk(a) + 8);
  });

  it('desenha o ícone do conjunto da biblioteca', async () => {
    const { refs, marking } = await setup([
      SCREEN,
      create('$i', { x: 20, y: 20, width: 48, height: 48 }, {}, 'lib/badge'),
    ]);
    const out = await renderMarking(roots, refs, marking('$i'), {});
    const { raster } = await decodeImage(out.image.bytes);
    let ink = 0;
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) if (luma(raster, x, y) < 100) ink++;
    expect(ink).toBeGreaterThan(20);
  });
});

describe('render_container', () => {
  it('background "image" pinta o arquivo do container; "none" é transparente', async () => {
    const { refs, project } = await setup([SCREEN]);
    const photo = project.containers.find((c) => c.id === PHOTO)!;
    const withImage = (
      await decodeImage((await renderContainer(roots, refs, photo, {})).image.bytes)
    ).raster;
    expect([...withImage.data.subarray(0, 4)]).toEqual([16, 160, 48, 255]);
    const none = (
      await decodeImage(
        (await renderContainer(roots, refs, photo, { background: 'none' })).image.bytes,
      )
    ).raster;
    expect(none.data[3]).toBe(0);
    expect(none.width).toBe(200);
  });

  it('container sem arquivo desenha os componentes sobre a cor de fundo', async () => {
    const { refs, container } = await setup([SCREEN, create('$b', BTN_RECT)]);
    const out = await renderContainer(roots, refs, container('$tela'), {});
    const { raster } = await decodeImage(out.image.bytes);
    expect(out.json).toMatchObject({ width: 300, height: 200, drawings: 1 });
    expect([...raster.data.subarray(0, 3)]).toEqual([0xff, 0xeb, 0xee]);
    expect(luma(raster, 60, 70)).toBeGreaterThan(240); // o botão branco
  });

  it('get_marking_image de um container sem arquivo tem o mesmo desenho do render_container', async () => {
    const { refs, marking, container } = await setup([SCREEN, create('$b', BTN_RECT)]);
    const full = (
      await decodeImage(
        (await renderContainer(roots, refs, container('$tela'), {})).image.bytes,
      )
    ).raster;
    const crop = (
      await decodeImage(
        (await markingImage(roots, refs, marking('$b'), { padding: 5, maxSize: 4096 }))
          .image.bytes,
      )
    ).raster;
    expect(crop.width).toBe(130);
    let different = 0;
    for (let y = 0; y < crop.height; y++) {
      for (let x = 0; x < crop.width; x++) {
        const a = (y * crop.width + x) * 4;
        const b = ((y + 55) * full.width + (x + 45)) * 4;
        for (let c = 0; c < 3; c++)
          if (crop.data[a + c] !== full.data[b + c]) different++;
      }
    }
    expect(different).toBe(0);
  });
});

describe('arquivo com dimensões diferentes do projeto e EXIF (achados 25 e 26 da CR do MCP)', () => {
  it('render_container e render_marking avisam, como get_marking_image', async () => {
    const { refs, project } = await setup([SCREEN]);
    const small = project.containers.find((c) => c.id === SMALL)!;
    const marking = project.markings.find((m) => m.id === SMALL_MARKING)!;
    const expected = expect.stringContaining('100×50, but the project records 200×100');
    const whole = await renderContainer(roots, refs, small, {});
    expect(whole.json.warning).toEqual(expected);
    const part = await renderMarking(roots, refs, marking, {});
    expect(part.json.warning).toEqual(expected);
    expect((await markingImage(roots, refs, marking, {})).json.warning).toEqual(expected);
    const matching = project.containers.find((c) => c.id === PHOTO)!;
    expect((await renderContainer(roots, refs, matching, {})).json).not.toHaveProperty(
      'warning',
    );
  });

  it('região que cai no meio de um pixel do arquivo não desalinha o fundo', async () => {
    const { refs, project } = await setup([SCREEN]);
    const marking = project.markings.find((m) => m.id === SMALL_MARKING)!;
    const out = await renderMarking(roots, refs, marking, {});
    const { raster } = await decodeImage(out.image.bytes);
    // A faixa vermelha termina em x = 60 do container: coluna 9 da saída (que começa em 51).
    const at = (x: number) =>
      [...raster.data.subarray((5 * raster.width + x) * 4)].slice(0, 3);
    expect(at(8)).toEqual([200, 32, 32]);
    expect(at(9)).toEqual([16, 160, 48]);
  });

  it('get_container_file de JPEG com orientação não devolve bytes que contradigam o JSON', async () => {
    const { refs, project } = await setup([SCREEN]);
    const rotated = project.containers.find((c) => c.id === ROTATED)!;
    const out = await imageFile(roots, refs, rotated, {});
    expect(out.json).toMatchObject({ width: 20, height: 40, recoded: true });
    const decoded = await decodeImage(out.image.bytes);
    expect(decoded.orientation).toBe(1);
    expect([decoded.raster.width, decoded.raster.height]).toEqual([20, 40]);
  });
});
