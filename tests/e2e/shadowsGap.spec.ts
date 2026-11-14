// MF2 in a real Chromium: the shadow list with `spread` and the outline with a rounded gap
// (`stroke.gap`) drawn by Konva (renderScene), read pixel by pixel, and parity with the
// MCP raster (the same scene at 100% and 420%, within a per-channel tolerance written here). It does not open
// the app: it mounts Konva on a blank page, like rotation.spec.
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

/** The card with two shadows with `spread` (the upper one blue, the lower one black, both blurred). */
const card = (fill: string, shadow: object[]): object => ({
  type: 'rect',
  name: 'card',
  width: 60,
  height: 30,
  anchors: { left: 30, top: 18 },
  cornerRadius: 8,
  fill,
  shadow,
});

const TWO = [
  { color: '#0000ff99', y: 2, blur: 4, spread: 2 },
  { color: '#000000aa', y: 8, blur: 8, spread: -1 },
];

/** Per-channel tolerance (0 to 255) and fraction of pixels that may exceed it (edges and blur). */
const TOLERANCE = 40;
const OUTLIERS = 0.02;

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

for (const zoom of [1, 4.2]) {
  test(`parity with the raster at ${Math.round(zoom * 100)}%: two shadows with spread`, async ({
    page,
  }) => {
    const scene = sceneOf([card('#ffffff', TWO)]);
    const drawn = await drawBoth(page, scene, 120, 70, zoom);
    expectParity(drawn.rgb, drawn.raster);
    // Both show: below the card the black one reaches (further away) and above only the blue one.
    const below = drawn.at(60 * zoom, (18 + 30 + 9) * zoom);
    const above = drawn.at(60 * zoom, (18 - 3) * zoom);
    expect(below[0] ?? 255).toBeLessThan(250);
    expect(above[2] ?? 0).toBeGreaterThan(above[0] ?? 255);
  });

  test(`parity with the raster at ${Math.round(zoom * 100)}%: outline with a rounded gap`, async ({
    page,
  }) => {
    const scene = sceneOf([
      {
        type: 'frame',
        name: 'outline',
        anchors: { left: 10, top: 20, right: 10, bottom: 10 },
        cornerRadius: 6,
        stroke: {
          color: '#cc0000',
          width: 2,
          align: 'inside',
          gap: { node: 'label', padding: 4 },
        },
      },
      {
        // A rectangle, not a text: the test raster has no font bytes and draws a
        // bar in place of the letter, so parity would compare a Konva letter with a raster bar.
        // What the test measures is the outline gap around the label.
        type: 'rect',
        name: 'label',
        width: 26,
        height: 12,
        anchors: { left: 20, top: 12 },
        fill: '#000000',
      },
    ]);
    const drawn = await drawBoth(page, scene, 120, 70, zoom);
    expectParity(drawn.rgb, drawn.raster);
  });
}

test('the gap: the color in the gap is the background one and the corner is rounded', async ({
  page,
}) => {
  const scene = sceneOf([
    {
      type: 'frame',
      name: 'outline',
      anchors: { left: 10, top: 20, right: 10, bottom: 10 },
      cornerRadius: 6,
      stroke: {
        color: '#cc0000',
        width: 2,
        align: 'inside',
        gap: { node: 'label', padding: 4 },
      },
    },
    {
      type: 'rect',
      name: 'label',
      width: 30,
      height: 12,
      anchors: { left: 24, top: 14 },
    },
  ]);
  const drawn = await drawBoth(page, scene, 120, 70, 1);
  // The top side of the outline is at y = 20 (the line goes from 20 to 22); the gap is x from 20 to 58.
  expect(drawn.at(40, 21)).toEqual([255, 255, 255]);
  expect(drawn.at(80, 21)).toEqual([204, 0, 0]);
  // The top-left corner is rounded: the straight corner point (10, 20) stays white.
  expect(drawn.at(10, 20)).toEqual([255, 255, 255]);
});

test('a shape with a translucent fill does not change color with several shadows', async ({
  page,
}) => {
  const away = [
    { color: '#000000', x: 70, blur: 0 },
    { color: '#0000ff', x: -70, blur: 0, spread: 1 },
  ];
  const scene = sceneOf([card('#ff000080', away)], 200, 70);
  const drawn = await drawBoth(page, scene, 200, 70, 1);
  // Half red over white; a second drawing of the shape would give 25% (#ff4040).
  const centre = drawn.at(60, 33);
  expect(centre[0]).toBe(255);
  expect(Math.abs((centre[1] ?? 0) - 127)).toBeLessThanOrEqual(1);
  expect(Math.abs((centre[2] ?? 0) - 127)).toBeLessThanOrEqual(1);
});

test('the shadow shape does not appear anywhere outside the shadow', async ({ page }) => {
  const scene = sceneOf([card('#ffffff', TWO)]);
  const drawn = await drawBoth(page, scene, 120, 70, 1);
  // The corner of the canvas, far from the card and the shadows, stays white.
  expect(drawn.at(2, 2)).toEqual([255, 255, 255]);
  expect(drawn.at(117, 67)).toEqual([255, 255, 255]);
});
