// FG5 (#2115) and FG6 (#2116): Konva × MCP raster parity of `scale`, `filter.grayscale` and the arc of
// an `ellipse` (the spinner), in a real Chromium. The
// pressed button (`scale` 0.96 on the root, with the Flag embedded) and the gray Flag
// (`filter: { grayscale: 1 }`) of `examples/libraries/drawing-keys/` are drawn by both renderers at 100%
// and 400%, over white, and compared pixel by pixel. The text nodes are left out (the raster without fonts
// draws bars where Konva draws glyphs). Does not open the app: mounts Konva on a blank page (like
// directionParity.spec).
//
// Tolerance, per channel (0 to 255): the two rasterizers antialias the edges differently, so the
// comparison is the mean absolute difference and the share of pixels that differ by more than
// `CHANNEL_TOLERANCE`. A real mismatch (a missing scale or filter) moves the ink by whole pixels or makes
// the colors differ by tens of levels over the whole shape, far above these limits.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

const CHANNEL_TOLERANCE = 24;
const MAX_MEAN_DIFF = 1.5;
const MAX_OUTLIER_SHARE = 0.03;

const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
// Instantiates the component and draws it on Konva and on the raster at \`zoom\`, over white; returns the
// pixel comparison (per channel) and the ink box (non-white pixels) of each.
window.draw = (component, values, width, height, zoom, tolerance) => {
  const { root } = instantiate(component, values, { x: 0, y: 0, width, height }, { measure: approximateMeasurer });
  const scene = { root, warnings: [] };
  const w = width * zoom; const h = height * zoom;
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: w, height: h });
  stage.scale({ x: zoom, y: zoom });
  const layer = new Layer();
  stage.add(layer);
  layer.add(renderScene(scene).root);
  layer.draw();
  const data = layer.getCanvas()._canvas.getContext('2d').getImageData(0, 0, w, h).data;
  host.remove();
  const target = createRaster(w, h);
  target.data.fill(255);
  paintScene(target, [scene], approximateMeasurer, { clip: { x: 0, y: 0, width: w, height: h }, scaleX: zoom, scaleY: zoom });
  const konva = new Uint8ClampedArray(w * h * 3);
  const raster = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      konva[i * 3 + c] = Math.round(data[i * 4 + c] * a + 255 * (1 - a));
      raster[i * 3 + c] = target.data[i * 4 + c];
    }
  }
  let sum = 0; let outliers = 0; let max = 0; let kGray = 0; let rGray = 0; let ink = 0;
  const box = (px) => {
    let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (px[i] < 250 || px[i + 1] < 250 || px[i + 2] < 250) {
        left = Math.min(left, x); right = Math.max(right, x + 1);
        top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
      }
    }
    return { left, right, top, bottom };
  };
  for (let i = 0; i < w * h; i++) {
    let off = false;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(konva[i * 3 + c] - raster[i * 3 + c]);
      sum += d; max = Math.max(max, d);
      if (d > tolerance) off = true;
    }
    if (off) outliers++;
    if (konva[i * 3] < 250 || konva[i * 3 + 1] < 250 || konva[i * 3 + 2] < 250) {
      ink++;
      if (Math.max(Math.abs(konva[i * 3] - konva[i * 3 + 1]), Math.abs(konva[i * 3 + 1] - konva[i * 3 + 2])) > 2) kGray++;
      if (Math.max(Math.abs(raster[i * 3] - raster[i * 3 + 1]), Math.abs(raster[i * 3 + 1] - raster[i * 3 + 2])) > 2) rGray++;
    }
  }
  return {
    meanDiff: sum / (w * h * 3),
    outlierShare: outliers / (w * h),
    maxDiff: max,
    ink,
    konvaColored: kGray,
    rasterColored: rGray,
    konvaBox: box(konva),
    rasterBox: box(raster),
  };
};
`;

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

let bundle = '';

type Box = { left: number; right: number; top: number; bottom: number };
type Drawn = {
  meanDiff: number;
  outlierShare: number;
  maxDiff: number;
  ink: number;
  konvaColored: number;
  rasterColored: number;
  konvaBox: Box;
  rasterBox: Box;
};
type Window = {
  draw: (
    c: object,
    v: object,
    w: number,
    h: number,
    zoom: number,
    tolerance: number,
  ) => Drawn;
};

type Json = Record<string, unknown>;
const LIB = 'examples/libraries/drawing-keys/components';
const read = (name: string): Json =>
  JSON.parse(readFileSync(`${LIB}/${name}.json`, 'utf8')) as Json;

/** The same tree without the text nodes (the raster draws bars in their place). */
function withoutText(node: Json): Json {
  const children = node['children'];
  if (!Array.isArray(children)) return node;
  return {
    ...node,
    children: (children as Json[])
      .filter((child) => child['type'] !== 'text')
      .map(withoutText),
  };
}

function textless(file: Json): Json {
  return { ...file, template: withoutText(file['template'] as Json) };
}

const FLAG_FIELDS = [
  { key: 'disabled', type: 'enum', required: false, default: 'false' },
  { key: 'label', type: 'string', required: false, default: 'OK' },
] as const;

const flag = textless(read('flag'));

/** The pressed button with the Flag node set to `disabled: 'true'`, so the embedded filter is also exercised. */
function pressedButton(disabled: boolean): Json {
  const button = textless(read('pressed-button'));
  const template = button['template'] as Json;
  const children = (template['children'] as Json[]).map((child) =>
    child['type'] === 'component'
      ? { ...child, values: { disabled: String(disabled) } }
      : child,
  );
  return {
    ...button,
    template: { ...template, children },
    resolvedComponents: { flag: { component: flag, fields: FLAG_FIELDS } },
  };
}

async function draw(
  page: Page,
  component: Json,
  values: Json,
  zoom: number,
): Promise<Drawn> {
  if (bundle === '') {
    const result = await build({
      stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
      plugins: [stubFonts],
    });
    bundle = result.outputFiles[0]!.text;
  }
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: bundle });
  const size = component['size'] as { width: number; height: number };
  return page.evaluate(
    ([c, v, w, h, z, tolerance]) =>
      (window as unknown as Window).draw(
        c as object,
        v as object,
        w as number,
        h as number,
        z as number,
        tolerance as number,
      ),
    [component, values, size.width, size.height, zoom, CHANNEL_TOLERANCE] as const,
  );
}

function expectParity(drawn: Drawn): void {
  expect(drawn.ink).toBeGreaterThan(0);
  expect(drawn.meanDiff).toBeLessThanOrEqual(MAX_MEAN_DIFF);
  expect(drawn.outlierShare).toBeLessThanOrEqual(MAX_OUTLIER_SHARE);
  // the ink boxes land within a pixel of each other
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    expect(Math.abs(drawn.konvaBox[edge] - drawn.rasterBox[edge])).toBeLessThanOrEqual(1);
  }
}

/** The spinner (an arc of 216 degrees, round caps, over a faint ring) at 48 × 48, to give the ring room. */
const spinner = { ...read('spinner'), size: { width: 48, height: 48 } };

for (const zoom of [1, 4]) {
  test(`spinner at ${zoom * 100}%: the arc with round caps is the same on Konva and raster`, async ({
    page,
  }) => {
    const drawn = await draw(page, spinner, { size: 'medium' }, zoom);
    expectParity(drawn);
    // the ring is blue (the arc) over the faint track: both renderers see colored ink
    expect(drawn.konvaColored).toBeGreaterThan(0);
    expect(drawn.rasterColored).toBeGreaterThan(0);
  });

  test(`gray flag at ${zoom * 100}%: Konva and raster match and every ink pixel is gray`, async ({
    page,
  }) => {
    const drawn = await draw(page, flag, { disabled: 'true' }, zoom);
    expectParity(drawn);
    expect(drawn.konvaColored).toBe(0);
    expect(drawn.rasterColored).toBe(0);
  });

  test(`colored flag at ${zoom * 100}%: Konva and raster match and the colors survive`, async ({
    page,
  }) => {
    const drawn = await draw(page, flag, { disabled: 'false' }, zoom);
    expectParity(drawn);
    expect(drawn.konvaColored).toBeGreaterThan(0);
    expect(drawn.rasterColored).toBeGreaterThan(0);
  });

  test(`pressed button at ${zoom * 100}%: scale 0.96 shrinks the ink the same way on both`, async ({
    page,
  }) => {
    const pressed = await draw(page, pressedButton(false), { state: 'pressed' }, zoom);
    expectParity(pressed);
    const idle = await draw(page, pressedButton(false), { state: 'idle' }, zoom);
    expectParity(idle);
    // scale 0.96 about the center: the ink is narrower than the idle one by 4%, on each renderer
    for (const key of ['konvaBox', 'rasterBox'] as const) {
      const pressedWidth = pressed[key].right - pressed[key].left;
      const idleWidth = idle[key].right - idle[key].left;
      expect(pressedWidth / idleWidth).toBeGreaterThan(0.94);
      expect(pressedWidth / idleWidth).toBeLessThan(0.98);
    }
  });

  test(`pressed button with a gray embedded flag at ${zoom * 100}%: filter and scale compose on both`, async ({
    page,
  }) => {
    const drawn = await draw(page, pressedButton(true), { state: 'pressed' }, zoom);
    expectParity(drawn);
  });
}
