// DX5 (stage #1903, decisions 7, 16, 17 and 18) in a real Chromium: the `logo` example of the
// `drawing-extras` library (a PNG, a JPEG and a WebP, `cover` and `contain`, a rounded corner) drawn by the
// app (`renderScene` with the images decoded from the file bytes by `createPackageImages`, that is
// `createImageBitmap`, no URL) against the MCP raster (the server's own codecs and painter, run in
// Node from a bundle). Only the pixels inside each image's box are compared, within a per-channel tolerance
// written here: the text differs by design (the page's fonts against the raster's). It does not
// open the app: it mounts Konva on a blank page, like gradientParity.spec.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';
import { wasmFiles } from '../../mcp/wasmFiles.mjs';

const LIBRARY = join(process.cwd(), 'examples/libraries/drawing-extras');
const SPEC_ID = 'drawing-extras';
const SIZE = { width: 360, height: 160 };
const VALUES = { variant: 'jpeg', source: 'images/pattern.webp' };
const IMAGES = ['images/logo.png', 'images/photo.jpg', 'images/pattern.webp'];

/** The `font:*` files stay empty (the text is not compared) and `wasm:*` is embedded as bytes. */
const stubFonts: Plugin = {
  name: 'font-stub',
  setup(b) {
    b.onResolve({ filter: /^font:/ }, (args) => ({
      path: args.path,
      namespace: 'font-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'font-stub' }, () => ({
      contents: 'export default new Uint8Array(0);',
      loader: 'js',
    }));
  },
};
const wasmBytes: Plugin = {
  name: 'wasm-bytes',
  setup(b) {
    const require = createRequire(import.meta.url);
    b.onResolve({ filter: /^wasm:/ }, (args) => {
      const file = (wasmFiles as Record<string, string>)[args.path];
      return file
        ? { path: require.resolve(file), namespace: 'wasm-bytes' }
        : { errors: [{ text: `unknown WebAssembly module: ${args.path}` }] };
    });
    b.onLoad({ filter: /.*/, namespace: 'wasm-bytes' }, (args) => ({
      contents: readFileSync(args.path),
      loader: 'binary',
    }));
  },
};

/** The MCP side, in Node: instantiate the component and paint it with the server's raster and codecs. */
const NODE_ENTRY = `
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { decodeImage } from './mcp/image/codecs';
import { paintScene } from './mcp/image/sceneRaster';

export function sceneOf(component, values) {
  const { root } = instantiate(component, values, { x: 0, y: 0, ...${JSON.stringify(SIZE)} }, { measure: approximateMeasurer });
  return { root, warnings: [] };
}

export async function paintRaster(scene, specId, files, zoom) {
  const decoded = new Map();
  for (const [path, bytes] of Object.entries(files)) {
    decoded.set(path, (await decodeImage(new Uint8Array(bytes))).raster);
  }
  const w = Math.round(${SIZE.width} * zoom);
  const h = Math.round(${SIZE.height} * zoom);
  const target = createRaster(w, h);
  target.data.fill(255);
  paintScene(target, [{ root: scene.root, specId }], approximateMeasurer, {
    clip: { x: 0, y: 0, width: w, height: h },
    scaleX: zoom,
    scaleY: zoom,
    images: { get: (spec, asset) => (spec === specId ? decoded.get(asset) : undefined), notes: [] },
  });
  const rgb = [];
  for (let i = 0; i < target.data.length; i += 4) rgb.push(target.data[i], target.data[i + 1], target.data[i + 2]);
  return rgb;
}
`;

/** The app side, in the page: the real path of the app, bytes -> createImageBitmap -> Konva. */
const PAGE_ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { createPackageImages } from './src/storage/packageImages';
Konva.autoDrawEnabled = false;

const assetsOf = (node, out = new Set()) => {
  for (const paint of node.fills) if (paint.type === 'image' && paint.asset) out.add(paint.asset);
  for (const child of node.children ?? []) assetsOf(child, out);
  return out;
};
const boxesOf = (node, byId, out = []) => {
  if (node.fills.some((paint) => paint.type === 'image' && paint.asset)) {
    const at = byId.get(node.id).getAbsolutePosition();
    out.push({ id: node.id, x: at.x, y: at.y, width: node.width, height: node.height });
  }
  for (const child of node.children ?? []) boxesOf(child, byId, out);
  return out;
};

window.draw = async (scene, specId, files, zoom) => {
  const bytes = (path) => Uint8Array.from(atob(files[path]), (c) => c.charCodeAt(0));
  const images = createPackageImages({
    read: async (_spec, asset) => (files[asset] ? bytes(asset).buffer : null),
  });
  const cited = [...assetsOf(scene.root)];
  // Decoding is asynchronous: until the bitmaps are ready the drawing is the placeholder.
  const placeholder = renderScene(scene, { specId, packageImage: (s, a) => images.resolve(s, a) });
  const loadingImages = placeholder.root.find('Image').length;
  const deadline = Date.now() + 10000;
  while (cited.some((a) => images.resolve(specId, a).state !== 'ready')) {
    if (Date.now() > deadline) throw new Error('package images did not decode');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const w = Math.round(scene.root.width * zoom);
  const h = Math.round(scene.root.height * zoom);
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: w, height: h });
  stage.scale({ x: zoom, y: zoom });
  const layer = new Layer();
  stage.add(layer);
  const drawn = renderScene(scene, { specId, packageImage: (s, a) => images.resolve(s, a) });
  layer.add(drawn.root);
  layer.draw();
  const data = layer.getCanvas()._canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const rgb = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    for (let c = 0; c < 3; c++) rgb.push(Math.round(data[i + c] * a + 255 * (1 - a)));
  }
  const boxes = boxesOf(scene.root, drawn.byId);
  host.remove();
  return { rgb, boxes, loadingImages, drawnImages: drawn.root.find('Image').length, warnings: drawn.warnings };
};
`;

interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
type PageDraw = (
  scene: object,
  specId: string,
  files: Record<string, string>,
  zoom: number,
) => Promise<{
  rgb: number[];
  boxes: Box[];
  loadingImages: number;
  drawnImages: number;
  warnings: unknown[];
}>;
interface NodeSide {
  sceneOf(component: object, values: object): object;
  paintRaster(
    scene: object,
    specId: string,
    files: Record<string, number[]>,
    zoom: number,
  ): Promise<number[]>;
}

let pageBundle = '';
let nodeSide: NodeSide | null = null;

async function nodeModule(): Promise<NodeSide> {
  if (nodeSide) return nodeSide;
  const result = await build({
    stdin: { contents: NODE_ENTRY, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    // Not `esnext`: the `binary` loader would then emit `Uint8Array.fromBase64`, which Node 22 lacks.
    target: 'es2022',
    plugins: [stubFonts, wasmBytes],
  });
  const file = join(mkdtempSync(join(tmpdir(), 'package-image-parity-')), 'raster.cjs');
  writeFileSync(file, result.outputFiles[0]!.text);
  nodeSide = createRequire(import.meta.url)(file) as NodeSide;
  return nodeSide;
}

async function loadPage(page: Page): Promise<void> {
  if (pageBundle === '') {
    const result = await build({
      stdin: { contents: PAGE_ENTRY, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
      plugins: [stubFonts],
    });
    pageBundle = result.outputFiles[0]!.text;
  }
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: pageBundle });
}

const component = JSON.parse(
  readFileSync(join(LIBRARY, 'components/logo.json'), 'utf8'),
) as object;
const bytesOf = (path: string): Buffer => readFileSync(join(LIBRARY, path));

async function both(page: Page, zoom: number) {
  const side = await nodeModule();
  const scene = side.sceneOf(component, VALUES);
  const raster = await side.paintRaster(
    scene,
    SPEC_ID,
    Object.fromEntries(IMAGES.map((path) => [path, [...bytesOf(path)]])),
    zoom,
  );
  await loadPage(page);
  const base64 = Object.fromEntries(
    IMAGES.map((path) => [path, bytesOf(path).toString('base64')]),
  );
  const app = await page.evaluate(
    ([s, spec, files, z]) =>
      (window as unknown as { draw: PageDraw }).draw(
        s as object,
        spec as string,
        files as Record<string, string>,
        z as number,
      ),
    [scene, SPEC_ID, base64, zoom] as const,
  );
  return { raster, app, width: Math.round(SIZE.width * zoom) };
}

/** Per-channel difference inside a box, away from the rounded corners' antialiased edge (inset 2 px). */
function compare(
  app: number[],
  raster: number[],
  width: number,
  box: Box,
  zoom: number,
): { within: number; mean: number; worst: number; pixels: number } {
  const inset = 2 * zoom;
  const x0 = Math.ceil(box.x + inset);
  const y0 = Math.ceil(box.y + inset);
  const x1 = Math.floor(box.x + box.width - inset);
  const y1 = Math.floor(box.y + box.height - inset);
  let pixels = 0;
  let within = 0;
  let sum = 0;
  let worst = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 3;
      const diff = [0, 1, 2].map((c) =>
        Math.abs((app[i + c] ?? 0) - (raster[i + c] ?? 0)),
      );
      const max = Math.max(...diff);
      pixels++;
      sum += diff[0]! + diff[1]! + diff[2]!;
      worst = Math.max(worst, max);
      if (max <= TOLERANCE.channel) within++;
    }
  }
  return { within: within / pixels, mean: sum / (pixels * 3), worst, pixels };
}

/**
 * The tolerance, per channel: the browser's and the server's decoders (libjpeg-turbo against mozjpeg, the
 * JPEG one slightly off) and the two resamplers do not match bit by bit. At least `share` of the
 * pixels inside each image must be within `channel`, and the mean difference under `mean`.
 */
const TOLERANCE = { channel: 16, share: 0.97, mean: 2 };

for (const zoom of [1, 3]) {
  test(`the app draws the logo example's package images like the MCP raster (zoom ${zoom})`, async ({
    page,
  }) => {
    const { raster, app, width } = await both(page, zoom);
    // Three images drawn from the bytes, each in a box: no URL, no placeholder left.
    expect(app.loadingImages).toBe(0);
    expect(app.drawnImages).toBe(3);
    expect(app.boxes.map((b) => b.id)).toHaveLength(3);
    expect(app.warnings).toEqual([]);
    for (const box of app.boxes) {
      const stats = compare(app.rgb, raster, width, box, zoom);
      expect(stats.pixels, `${box.id} has pixels`).toBeGreaterThan(100);
      expect(
        stats.within,
        `${box.id} share within ${TOLERANCE.channel}`,
      ).toBeGreaterThanOrEqual(TOLERANCE.share);
      expect(stats.mean, `${box.id} mean difference`).toBeLessThanOrEqual(TOLERANCE.mean);
    }
  });
}

test('the three formats really differ from the placeholder and from each other', async ({
  page,
}) => {
  const { app, width } = await both(page, 1);
  // A guard against comparing two empty drawings: every image box holds more than one color.
  for (const box of app.boxes) {
    const colors = new Set<string>();
    for (let y = Math.ceil(box.y); y < box.y + box.height; y++) {
      for (let x = Math.ceil(box.x); x < box.x + box.width; x++) {
        const i = (y * width + x) * 3;
        colors.add(`${app.rgb[i]},${app.rgb[i + 1]},${app.rgb[i + 2]}`);
      }
    }
    expect(colors.size, `${box.id} colors`).toBeGreaterThan(3);
  }
});
