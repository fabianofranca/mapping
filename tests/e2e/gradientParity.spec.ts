// DX1 in a real Chromium: the linear, radial and angular gradients drawn by Konva (renderScene, with
// `createConicGradient` for the angular one), read pixel by pixel, and parity with the MCP raster
// (the same scene at 100% and 420%, within a per-channel tolerance written here). It does not open
// the app: it mounts Konva on a blank page, like shadowsGap.spec.
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

// Konva and the MCP raster run on the same page, from the same component. The raster font
// bytes (`font:*`) stay empty: the measurement here is the approximate one.
const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
// Instantiates the component and draws it in Konva and in the raster, at the requested zoom; the pixels (RGB) already
// composited over white.
window.draw = (component, width, height, zoom) => {
  const { root } = instantiate(component, {}, { x: 0, y: 0, width, height }, { measure: approximateMeasurer });
  const scene = { root, warnings: [] };
  const w = Math.round(width * zoom);
  const h = Math.round(height * zoom);
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: w, height: h });
  stage.scale({ x: zoom, y: zoom });
  const layer = new Layer();
  stage.add(layer);
  layer.add(renderScene(scene).root);
  layer.draw();
  const data = layer.getCanvas()._canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const konva = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    for (let c = 0; c < 3; c++) konva.push(Math.round(data[i + c] * a + 255 * (1 - a)));
  }
  host.remove();
  const target = createRaster(w, h);
  target.data.fill(255);
  paintScene(target, [scene], approximateMeasurer, { clip: { x: 0, y: 0, width: w, height: h }, scaleX: zoom, scaleY: zoom });
  const raster = [];
  for (let i = 0; i < target.data.length; i += 4) raster.push(target.data[i], target.data[i + 1], target.data[i + 2]);
  return { konva, raster };
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

async function load(page: Page): Promise<void> {
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
}

type Drawn = { konva: number[]; raster: number[] };
type Window = { draw: (c: object, w: number, h: number, zoom: number) => Drawn };

/** The RGB pixels of Konva and of the MCP raster, at the requested zoom. */
async function drawBoth(
  page: Page,
  component: object,
  w: number,
  h: number,
  zoom: number,
) {
  await load(page);
  const { konva, raster } = await page.evaluate(
    ([c, width, height, z]) =>
      (window as unknown as Window).draw(
        c as object,
        width as number,
        height as number,
        z as number,
      ),
    [component, w, h, zoom] as const,
  );
  const width = Math.round(w * zoom);
  return {
    raster,
    rgb: konva,
    at: (x: number, y: number): number[] => {
      const i = (Math.round(y) * width + Math.round(x)) * 3;
      return konva.slice(i, i + 3);
    },
  };
}

function sceneOf(children: object[], width = 120, height = 70): object {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 's',
    name: 'S',
    size: { width, height },
    template: { type: 'frame', children },
  };
}

const STOPS = [
  { offset: 0, color: '#ff0000' },
  { offset: 0.5, color: '#ffd400' },
  { offset: 1, color: '#0040ff' },
];

/** A rect filled by `fill`, 100 × 50 at (10, 10), in a 120 × 70 scene. */
const swatch = (fill: object): object[] => [
  { type: 'rect', width: 100, height: 50, anchors: { left: 10, top: 10 }, fill },
];

/** Per-channel tolerance (0 to 255) and the fraction of pixels that may exceed it (edges and the angular seam). */
const TOLERANCE = 8;
const OUTLIERS = 0.01;

function expectParity(konvaRgb: number[], rasterRgb: number[]): void {
  expect(konvaRgb.length).toBe(rasterRgb.length);
  let outliers = 0;
  for (let i = 0; i < konvaRgb.length; i += 3) {
    const far = [0, 1, 2].some(
      (c) => Math.abs(konvaRgb[i + c]! - rasterRgb[i + c]!) > TOLERANCE,
    );
    if (far) outliers++;
  }
  expect(outliers / (konvaRgb.length / 3)).toBeLessThan(OUTLIERS);
}

const GRADIENTS: { name: string; fill: object }[] = [
  { name: 'linear', fill: { type: 'linear', angle: 20, stops: STOPS } },
  {
    name: 'radial',
    fill: { type: 'radial', center: [0.3, 0.6], radius: 40, stops: STOPS },
  },
  {
    name: 'angular',
    fill: { type: 'angular', center: [0.5, 0.5], angle: 30, stops: STOPS },
  },
];

for (const zoom of [1, 4.2]) {
  for (const { name, fill } of GRADIENTS) {
    test(`parity with the raster at ${Math.round(zoom * 100)}%: ${name} gradient`, async ({
      page,
    }) => {
      const drawn = await drawBoth(page, sceneOf(swatch(fill)), 120, 70, zoom);
      expectParity(drawn.rgb, drawn.raster);
      // Konva painted the swatch (it is not the white page) and left the outside alone.
      expect(drawn.at(2, 2)).toEqual([255, 255, 255]);
      expect(drawn.at(60 * zoom, 35 * zoom)).not.toEqual([255, 255, 255]);
    });
  }

  test(`at ${Math.round(zoom * 100)}% the radial gradient starts with its first stop at the center`, async ({
    page,
  }) => {
    const fill = { type: 'radial', center: [0.5, 0.5], radius: 25, stops: STOPS };
    const drawn = await drawBoth(page, sceneOf(swatch(fill)), 120, 70, zoom);
    const [r, g, b] = drawn.at(60 * zoom, 35 * zoom);
    expect(r).toBeGreaterThan(235);
    expect(g).toBeLessThan(25);
    expect(b).toBeLessThan(25);
    // Beyond the radius the last stop continues.
    const [er, eg, eb] = drawn.at(15 * zoom, 15 * zoom);
    expect(er).toBeLessThan(25);
    expect(eg).toBeGreaterThan(40);
    expect(eg).toBeLessThan(90);
    expect(eb).toBeGreaterThan(235);
  });
}
