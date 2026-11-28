// RT4 of #2916: Konva × MCP raster parity of the inline icon run, a shifted chip and a text that shrinks
// to fit, in a real Chromium. A component with a two-path icon between two text runs, a chip with a
// `baselineShift`, and a `font.fit: "shrink"` text whose width moves the marker after it is drawn by
// both renderers at 100% and 400%, over white, and compared pixel by pixel with the same tolerances as
// `formatGapsParity.spec.ts`. The glyphs are left out (the raster without fonts draws bars where Konva
// draws glyphs): every text is drawn in the color of what it sits on (white on white, the chip's own
// color on the chip), so only the icon, the chip's background and the position of the marker show.
// Does not open the app: mounts Konva on a blank page (like `formatGapsParity.spec.ts`).
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
window.draw = (component, values, width, height, zoom, tolerance, icons) => {
  const { root } = instantiate(component, values, { x: 0, y: 0, width, height }, { measure: approximateMeasurer, icons });
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
    icons: object,
  ) => Drawn;
};

type Json = Record<string, unknown>;

/** A two-path icon with no gradient: a stroked check with round caps and a filled square. */
const ICONS = {
  viewBox: [24, 24],
  icons: {
    tick: {
      paths: [
        { d: 'M3 13l6 6L21 5', stroke: true, width: 3, cap: 'round' },
        { d: 'M3 3h6v6H3z', fill: true },
      ],
    },
  },
};

const SIZE = { width: 200, height: 40 };

/**
 * A row of three: the shrinking text (white on white; `maxWidth` 80, so it takes the first size of
 * `fitSizes` that fits and the marker after it moves with its width), a blue marker, and the rich
 * text with the icon run between two runs and a chip raised by `baselineShift`.
 */
function component(extra: Json = {}): Json {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'rich-runs',
    name: 'Rich runs',
    size: SIZE,
    template: {
      type: 'frame',
      name: 'root',
      layout: { type: 'row', align: 'center', gap: 6, padding: [0, 6] },
      children: [
        {
          type: 'text',
          name: 'amount',
          text: 'Total 12345',
          color: '#ffffff',
          width: 'hug',
          maxWidth: 80,
          font: { size: 20, fit: 'shrink', fitSizes: [16, 12] },
        },
        {
          type: 'rect',
          name: 'marker',
          width: 10,
          height: 10,
          fill: '#2255cc',
        },
        {
          type: 'text',
          name: 'rich',
          width: 'hug',
          color: '#ffffff',
          font: { size: 14, lineHeight: 20 },
          runs: [
            { text: 'ab ', color: '#ffffff' },
            { icon: 'tick', size: 20, color: '#cc2222', ...extra },
            { text: ' ', color: '#ffffff' },
            {
              text: 'sup',
              color: '#22aa55',
              background: '#22aa55',
              radius: 4,
              padding: [2, 4],
              baselineShift: 4,
            },
          ],
        },
      ],
    },
  };
}

async function draw(page: Page, file: Json, zoom: number): Promise<Drawn> {
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
  return page.evaluate(
    ([c, w, h, z, tolerance, icons]) =>
      (window as unknown as Window).draw(
        c as object,
        {},
        w as number,
        h as number,
        z as number,
        tolerance as number,
        icons as object,
      ),
    [file, SIZE.width, SIZE.height, zoom, CHANNEL_TOLERANCE, ICONS] as const,
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

for (const zoom of [1, 4]) {
  test(`inline icon, shifted chip and shrunk text at ${zoom * 100}%: Konva and raster match`, async ({
    page,
  }) => {
    const drawn = await draw(page, component(), zoom);
    expectParity(drawn);
    // the icon is red, the chip green and the marker blue: both renderers see colored ink
    expect(drawn.konvaColored).toBeGreaterThan(0);
    expect(drawn.rasterColored).toBeGreaterThan(0);
  });

  test(`icon baselineShift at ${zoom * 100}%: both renderers move the icon the same way`, async ({
    page,
  }) => {
    const base = await draw(page, component(), zoom);
    const raised = await draw(page, component({ baselineShift: 12 }), zoom);
    expectParity(raised);
    // raised past the chip, the icon becomes the topmost ink of the row
    for (const key of ['konvaBox', 'rasterBox'] as const) {
      expect(raised[key].top).toBeLessThan(base[key].top);
    }
  });
}
