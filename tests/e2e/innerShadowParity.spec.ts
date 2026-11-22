// DX2 in a real Chromium: the inner shadow (CSS `inset`) drawn by Konva (renderScene) read pixel by
// pixel, and parity with the MCP raster (the same scene at 100% and 420%, within a per-channel
// tolerance written here). It does not open the app: it mounts Konva on a blank page, like
// gradientParity.spec.
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

/** A node of `type`, 100 × 50 at (10, 10), in a 120 × 70 scene, with a white fill. */
const box = (type: string, extra: object): object[] => [
  {
    type,
    width: 100,
    height: 50,
    anchors: { left: 10, top: 10 },
    fill: '#ffffff',
    ...extra,
  },
];

/** Per-channel tolerance (0 to 255), as in formatGapsParity: the raster blur is three box passes, not a Gaussian. */
const TOLERANCE = 24;
const OUTLIERS = 0.02;

function expectParity(konvaRgb: number[], rasterRgb: number[], limit = OUTLIERS): void {
  expect(konvaRgb.length).toBe(rasterRgb.length);
  let outliers = 0;
  for (let i = 0; i < konvaRgb.length; i += 3) {
    const far = [0, 1, 2].some(
      (c) => Math.abs(konvaRgb[i + c]! - rasterRgb[i + c]!) > TOLERANCE,
    );
    if (far) outliers++;
  }
  expect(outliers / (konvaRgb.length / 3)).toBeLessThan(limit);
}

const CASES: { name: string; scene: object[]; limit?: number }[] = [
  {
    name: 'a rounded rect with offset and blur',
    scene: box('rect', {
      cornerRadius: 12,
      shadow: { color: '#000000b0', x: 3, y: 4, blur: 8, inner: true },
    }),
  },
  {
    name: 'an ellipse with spread',
    scene: box('ellipse', {
      shadow: { color: '#c00000', blur: 4, spread: 6, inner: true },
    }),
    // The ellipse's curved edge antialiases differently in the raster (a 64-step polygon).
    limit: 0.05,
  },
  {
    name: 'an outer plus inner list',
    scene: box('rect', {
      cornerRadius: 6,
      shadow: [
        { color: '#0000ff80', y: 3, blur: 6, spread: 2 },
        { color: '#000000a0', x: 2, y: 2, blur: 5, inner: true },
        { color: '#ff0000', spread: 3, inner: true },
      ],
    }),
  },
];

for (const zoom of [1, 4.2]) {
  for (const { name, scene, limit } of CASES) {
    test(`parity with the raster at ${Math.round(zoom * 100)}%: ${name}`, async ({
      page,
    }) => {
      const drawn = await drawBoth(page, sceneOf(scene), 120, 70, zoom);
      expectParity(drawn.rgb, drawn.raster, limit);
    });
  }

  test(`at ${Math.round(zoom * 100)}% the inner shadow shades only inside the shape`, async ({
    page,
  }) => {
    const scene = sceneOf(
      box('rect', { shadow: { color: '#ff0000', spread: 5, inner: true } }),
    );
    const drawn = await drawBoth(page, scene, 120, 70, zoom);
    // On the ring (3 px inside the left edge): red. In the middle and outside the shape: white.
    expect(drawn.at(13 * zoom, 35 * zoom)).toEqual([255, 0, 0]);
    expect(drawn.at(60 * zoom, 35 * zoom)).toEqual([255, 255, 255]);
    expect(drawn.at(7 * zoom, 35 * zoom)).toEqual([255, 255, 255]);
  });
}
