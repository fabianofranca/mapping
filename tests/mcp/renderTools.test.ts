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

// CF9 (decision 32): `render_marking` and `render_container`, the `get_marking_image` of a container without
// a file with the same drawing and the library's `fonts` in place of the embedded one.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
// File with half the recorded dimensions (100×50 against 200×100).
const SMALL = 'bbbbbbbb-0000-4000-8000-000000000002';
const SMALL_MARKING = 'aaaaaaaa-0000-4000-8000-000000000002';
// 40×20 JPEG with EXIF orientation 6 (seen as 20×40), recorded as 20×40.
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
          name: 'Button',
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
  name: 'Button',
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
  // "Acme" is the bold mono font: much wider than the sans on the same characters.
  cpSync('mcp/fonts/MappingMono-Bold.ttf', join(lib, 'fonts', 'Acme.ttf'));
  const photo = createRaster(200, 100);
  for (let i = 0; i < photo.data.length; i += 4) {
    photo.data.set([16, 160, 48, 255], i);
  }
  writeFileSync(join(dir, 'images', 'foto.png'), await encodeImage(photo, 'png'));
  // 100×50: a 30 px red left strip, the rest green.
  const small = createRaster(100, 50);
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 100; x++)
      small.data.set(x < 30 ? [200, 32, 32, 255] : [16, 160, 48, 255], (y * 100 + x) * 4);
  writeFileSync(join(dir, 'images', 'menor.png'), await encodeImage(small, 'png'));
  const rotated = createRaster(40, 20);
  rotated.data.fill(200);
  writeFileSync(join(dir, 'images', 'girada.jpg'), await encodeJpegWithExif(rotated, 6));
  const parsed = parseSpecText(readFileSync(join(lib, 'lib.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
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
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
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

/** The rightmost column with dark ink (black text on the button's white background). */
function rightmostInk(raster: Raster): number {
  let right = -1;
  for (let x = 0; x < raster.width; x++)
    for (let y = 0; y < raster.height; y++) if (luma(raster, x, y) < 100) right = x;
  return right;
}

const BTN_RECT = { x: 50, y: 60, width: 120, height: 40 };

describe('render_marking', () => {
  it('zoom 2 returns double the width and height, with real text', async () => {
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

  it('above the pixel limit it fails with image-too-large, like get_marking_image', async () => {
    const { refs, container } = await setup([{ ...SCREEN, width: 2000, height: 2000 }]);
    await expect(
      renderContainer(roots, refs, container('$tela'), { zoom: 8 }),
    ).rejects.toMatchObject({ code: 'image-too-large' });
  });

  it('drawingMode "dark" paints with the mode\'s tokens; an unknown mode is an error', async () => {
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

  it("the button's shadow shows up with the margin (padding)", async () => {
    const { refs, marking } = await setup([SCREEN, create('$b', BTN_RECT)]);
    const out = await renderMarking(roots, refs, marking('$b'), {
      padding: 10,
      background: 'none',
    });
    const { raster } = await decodeImage(out.image.bytes);
    // Right below the button (y = 10 + 40 + 2): the shadow has alpha > 0; far from it, it does not.
    expect(raster.data[(52 * raster.width + 70) * 4 + 3]).toBeGreaterThan(10);
    expect(raster.data[(0 * raster.width + 0) * 4 + 3]).toBe(0);
  });

  it("the library's fonts apply in place of the embedded one", async () => {
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

  it("draws the icon from the library's set", async () => {
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
  it('background "image" paints the container\'s file; "none" is transparent', async () => {
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

  it('a container without a file draws the components over the background color', async () => {
    const { refs, container } = await setup([SCREEN, create('$b', BTN_RECT)]);
    const out = await renderContainer(roots, refs, container('$tela'), {});
    const { raster } = await decodeImage(out.image.bytes);
    expect(out.json).toMatchObject({ width: 300, height: 200, drawings: 1 });
    expect([...raster.data.subarray(0, 3)]).toEqual([0xff, 0xeb, 0xee]);
    expect(luma(raster, 60, 70)).toBeGreaterThan(240); // the white button
  });

  it('get_marking_image of a container without a file has the same drawing as render_container', async () => {
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

describe("file with dimensions different from the project's and EXIF (findings 25 and 26 of the MCP CR)", () => {
  it('render_container and render_marking warn, like get_marking_image', async () => {
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

  it('a region that falls in the middle of a file pixel does not misalign the background', async () => {
    const { refs, project } = await setup([SCREEN]);
    const marking = project.markings.find((m) => m.id === SMALL_MARKING)!;
    const out = await renderMarking(roots, refs, marking, {});
    const { raster } = await decodeImage(out.image.bytes);
    // The red strip ends at x = 60 of the container: column 9 of the output (which starts at 51).
    const at = (x: number) =>
      [...raster.data.subarray((5 * raster.width + x) * 4)].slice(0, 3);
    expect(at(8)).toEqual([200, 32, 32]);
    expect(at(9)).toEqual([16, 160, 48]);
  });

  it('get_container_file of a JPEG with orientation does not return bytes that contradict the JSON', async () => {
    const { refs, project } = await setup([SCREEN]);
    const rotated = project.containers.find((c) => c.id === ROTATED)!;
    const out = await imageFile(roots, refs, rotated, {});
    expect(out.json).toMatchObject({ width: 20, height: 40, recoded: true });
    const decoded = await decodeImage(out.image.bytes);
    expect(decoded.orientation).toBe(1);
    expect([decoded.raster.width, decoded.raster.height]).toEqual([20, 40]);
  });
});

// DX4 (stage #1903, decision 17): the `logo` type of the example library `drawing-extras` draws its
// three package images (PNG, JPEG and WebP) in `render_marking`, `render_container` and the
// `get_marking_image` of a container without a file. A remote `src` stays the placeholder, and an
// image that is missing, corrupt or changed on disk is the placeholder or the new file, with a warning.
describe('package images of the example library drawing-extras', () => {
  const EXAMPLE = join(__dirname, '../../examples/libraries/drawing-extras');
  // The quadrants of each image (top left, top right, bottom left, bottom right), from docs/logo.md.
  const PNG_COLORS = ['#E53935', '#43A047', '#1E88E5', '#FDD835'];
  const JPEG_COLORS = ['#8E24AA', '#00ACC1', '#FB8C00', '#6D4C41'];
  const WEBP_COLORS = ['#212121', '#F5F5F5', '#F06292', '#26A69A'];

  let pkgBase: string;
  let pkgRoots: Roots;
  let packageDir: string;

  beforeAll(() => {
    pkgBase = mkdtempSync(join(tmpdir(), 'mapping-package-render-'));
    const dir = join(pkgBase, 'telas');
    packageDir = join(dir, 'specs', 'drawing-extras');
    mkdirSync(join(dir, 'images'), { recursive: true });
    cpSync(EXAMPLE, packageDir, { recursive: true });
    const parsed = parseSpecText(
      readFileSync(join(EXAMPLE, 'drawing-extras.spec.json'), 'utf8'),
    );
    if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
    let p = createProject({
      name: 'Telas',
      now: NOW,
      firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
    });
    p = applySpecialization(p, parsed.spec, {
      packageSpecName: 'drawing-extras.spec.json',
    });
    writeFileSync(join(dir, 'mapping.json'), serialize(p));
    pkgRoots = new Roots([pkgBase]);
  });

  afterAll(() => rmSync(pkgBase, { recursive: true, force: true }));

  const RECT = { x: 20, y: 20, width: 360, height: 160 };

  async function open(values: Record<string, string>) {
    const project = await loadProject(pkgRoots, await findProject(pkgRoots, 'telas'));
    const result = await runBatch(
      project,
      [
        {
          op: 'add_container',
          as: '$tela',
          width: 400,
          height: 200,
          background: '#FFFFFF',
        },
        create('$logo', RECT, values, 'drawing-extras/logo'),
      ],
      io,
    );
    expect(result.errors).toEqual([]);
    const refs = new Refs({ ...project, project: result.project });
    const id = (alias: string) => (result.aliases.get(alias) as { id: string }).id;
    return {
      refs,
      marking: result.project.markings.find((m) => m.id === id('$logo'))!,
      container: result.project.containers.find((c) => c.id === id('$tela'))!,
    };
  }

  const decoded = async (image: { bytes: Uint8Array }) =>
    (await decodeImage(image.bytes)).raster;

  /** Pixels within `tolerance` of the color, and the mean x of them (where on the drawing it is). */
  function find(raster: Raster, hex: string, tolerance: number) {
    const want = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    let count = 0;
    let sumX = 0;
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        const at = (y * raster.width + x) * 4;
        const close = want.every(
          (w, c) => Math.abs(raster.data[at + c]! - w) <= tolerance,
        );
        if (close) {
          count++;
          sumX += x;
        }
      }
    }
    return { count, meanX: count === 0 ? -1 : sumX / count };
  }

  /** The JPEG is lossy: a wider tolerance for its decoded pixels (the PNG and the WebP are exact). */
  const EXACT = 6;
  const LOSSY = 28;
  const MIN_PIXELS = 300;

  function expectColors(raster: Raster, colors: string[], tolerance: number): number {
    const means = colors.map((hex) => {
      const found = find(raster, hex, tolerance);
      expect(found.count, hex).toBeGreaterThan(MIN_PIXELS);
      return found.meanX;
    });
    // Left quadrants sit left of the right ones.
    expect(means[0]!).toBeLessThan(means[1]!);
    expect(means[2]!).toBeLessThan(means[3]!);
    return (means[0]! + means[1]!) / 2;
  }

  it('render_marking draws the quadrant colors of the three formats, left to right', async () => {
    const { refs, marking } = await open({
      variant: 'jpeg',
      source: 'images/pattern.webp',
    });
    const out = await renderMarking(pkgRoots, refs, marking, {});
    const raster = await decoded(out.image);
    const png = expectColors(raster, PNG_COLORS, EXACT);
    const jpeg = expectColors(raster, JPEG_COLORS, LOSSY);
    const webp = expectColors(raster, WEBP_COLORS, EXACT);
    // The fixed PNG, the variant's JPEG and the field's WebP, in the order of the slots.
    expect(png).toBeLessThan(jpeg);
    expect(jpeg).toBeLessThan(webp);
    expect(out.json).not.toHaveProperty('warning');
  });

  it('the variant field picks the image: the png default shows the PNG twice and no JPEG', async () => {
    const { refs, marking } = await open({ source: 'images/logo.png' });
    const raster = await decoded(
      (await renderMarking(pkgRoots, refs, marking, {})).image,
    );
    expect(find(raster, JPEG_COLORS[0]!, LOSSY).count).toBe(0);
    expect(find(raster, PNG_COLORS[0]!, EXACT).count).toBeGreaterThan(2 * MIN_PIXELS);
  });

  it('render_container draws them too', async () => {
    const { refs, container } = await open({
      variant: 'jpeg',
      source: 'images/pattern.webp',
    });
    const raster = await decoded(
      (await renderContainer(pkgRoots, refs, container, {})).image,
    );
    expectColors(raster, PNG_COLORS, EXACT);
    expectColors(raster, JPEG_COLORS, LOSSY);
    expectColors(raster, WEBP_COLORS, EXACT);
  });

  it('get_marking_image of a container without a file draws them as well', async () => {
    const { refs, marking } = await open({
      variant: 'jpeg',
      source: 'images/pattern.webp',
    });
    const out = await markingImage(pkgRoots, refs, marking, {});
    expect(out.json).toMatchObject({ drawing: 'rendered' });
    const raster = await decoded(out.image);
    expectColors(raster, PNG_COLORS, EXACT);
    expectColors(raster, WEBP_COLORS, EXACT);
  });

  it('a remote src stays the placeholder', async () => {
    const { refs, marking } = await open({ source: 'https://example.com/pattern.webp' });
    const out = await renderMarking(pkgRoots, refs, marking, {});
    const raster = await decoded(out.image);
    // (Not the light quadrant #F5F5F5: it is within the tolerance of the node's own #F3F4F6 fill.)
    for (const hex of [WEBP_COLORS[0]!, WEBP_COLORS[2]!, WEBP_COLORS[3]!]) {
      expect(find(raster, hex, EXACT).count, hex).toBe(0);
    }
    // The package images of the same drawing are still there.
    expect(find(raster, PNG_COLORS[0]!, EXACT).count).toBeGreaterThan(MIN_PIXELS);
    expect(out.json).not.toHaveProperty('warning');
  });

  it('a path the package does not hold is the placeholder, with a warning', async () => {
    const { refs, marking } = await open({ source: 'images/nope.png' });
    const out = await renderMarking(pkgRoots, refs, marking, {});
    expect(out.json.warning).toEqual(expect.stringContaining('images/nope.png'));
    const raster = await decoded(out.image);
    expect(find(raster, PNG_COLORS[0]!, EXACT).count).toBeGreaterThan(MIN_PIXELS);
  });

  it('a corrupt image is the placeholder, with a warning, and the rest is drawn', async () => {
    writeFileSync(join(packageDir, 'images', 'broken.png'), 'not an image');
    const { refs, marking } = await open({ source: 'images/broken.png' });
    const out = await renderMarking(pkgRoots, refs, marking, {});
    expect(out.json.warning).toEqual(expect.stringContaining('images/broken.png'));
    const raster = await decoded(out.image);
    expect(find(raster, PNG_COLORS[0]!, EXACT).count).toBeGreaterThan(MIN_PIXELS);
  });

  it('an image beyond the 1 MB limit is the placeholder, without being decoded', async () => {
    // A valid PNG header followed by padding: the size alone refuses it.
    const png = readFileSync(join(EXAMPLE, 'images', 'logo.png'));
    writeFileSync(
      join(packageDir, 'images', 'heavy.png'),
      Buffer.concat([png, Buffer.alloc(1024 * 1024)]),
    );
    const { refs, marking } = await open({ source: 'images/heavy.png' });
    const out = await renderMarking(pkgRoots, refs, marking, {});
    expect(out.json.warning).toEqual(expect.stringContaining('1 MB'));
  });

  it('draws the new file when the image changes on disk', async () => {
    const swap = join(packageDir, 'images', 'swap.png');
    const red = createRaster(8, 8);
    for (let i = 0; i < 64; i++) red.data.set([200, 0, 0, 255], i * 4);
    writeFileSync(swap, await encodeImage(red, 'png'));
    const first = await open({ source: 'images/swap.png' });
    const before = await decoded(
      (await renderMarking(pkgRoots, first.refs, first.marking, {})).image,
    );
    expect(find(before, '#C80000', EXACT).count).toBeGreaterThan(MIN_PIXELS);
    // Another content (and size): the stamp changes, so the cached decode is dropped.
    const blue = createRaster(16, 16);
    for (let i = 0; i < 256; i++) blue.data.set([0, 0, 200, 255], i * 4);
    writeFileSync(swap, await encodeImage(blue, 'png'));
    const second = await open({ source: 'images/swap.png' });
    const after = await decoded(
      (await renderMarking(pkgRoots, second.refs, second.marking, {})).image,
    );
    expect(find(after, '#C80000', EXACT).count).toBe(0);
    expect(find(after, '#0000C8', EXACT).count).toBeGreaterThan(MIN_PIXELS);
  });
});
