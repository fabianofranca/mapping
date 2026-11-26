// LG3 (#2837): Konva × MCP raster parity of the library-gaps examples, in a real Chromium. `brand-badge`
// (icon with a linear and a radial gradient, under a circular `clip`) and `hsl-swatch` (`hsl()` and `hsla()`
// colors) of `examples/libraries/library-gaps/` are drawn by both renderers over white and probed at the points
// their docs name. Both renderers must give the same color within `CHANNEL_TOLERANCE` per channel, and the
// color the example promises (the corners outside the clip stay the tile color; the ramp runs red to blue).
// Does not open the app: mounts Konva on a blank page (like formatGapsParity.spec).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

const CHANNEL_TOLERANCE = 4;

const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
// Draws the component on Konva and on the raster at \`zoom\`, over white, and reads each probe (image pixels).
window.probe = (component, values, icons, width, height, zoom, probes) => {
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
  return probes.map(([x, y]) => {
    const px = Math.floor(x * zoom + zoom / 2);
    const py = Math.floor(y * zoom + zoom / 2);
    const i = (py * w + px) * 4;
    const a = data[i + 3] / 255;
    return {
      konva: [0, 1, 2].map((c) => Math.round(data[i + c] * a + 255 * (1 - a))),
      raster: [0, 1, 2].map((c) => target.data[i + c]),
    };
  });
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

type Json = Record<string, unknown>;
type Sample = { konva: number[]; raster: number[] };
type Window = {
  probe: (
    component: object,
    values: object,
    icons: object,
    width: number,
    height: number,
    zoom: number,
    probes: number[][],
  ) => Sample[];
};

const LIB = 'examples/libraries/library-gaps';
const read = (path: string): Json =>
  JSON.parse(readFileSync(`${LIB}/${path}`, 'utf8')) as Json;

async function probe(
  page: Page,
  component: Json,
  icons: Json,
  zoom: number,
  probes: number[][],
): Promise<Sample[]> {
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
    ([c, i, w, h, z, p]) =>
      (window as unknown as Window).probe(
        c as object,
        {},
        i as object,
        w as number,
        h as number,
        z as number,
        p as number[][],
      ),
    [component, icons, size.width, size.height, zoom, probes] as const,
  );
}

/** Each channel of `actual` within `tolerance` of `expected`. */
function near(actual: number[], expected: number[], tolerance: number): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) =>
    expect(Math.abs(value - expected[i]!)).toBeLessThanOrEqual(tolerance),
  );
}

/**
 * The probes of the doc: image pixel, the color the example promises and how far a pixel may be from it.
 * The radial gradient has no flat center: the pixel next to (24, 24) is already a little darker.
 */
type Expected = readonly [x: number, y: number, color: number[], tolerance?: number];

const BRAND: readonly Expected[] = [
  [12, 24, [191, 0, 64]],
  [36, 24, [64, 0, 191]],
  [24, 24, [255, 255, 255], 32],
  [2, 2, [255, 255, 255]],
];

const HSL: readonly Expected[] = [
  [48, 24, [0, 128, 255]],
  [72, 24, [128, 64, 128]],
  [10, 24, [0, 128, 0]],
  [24, 24, [255, 255, 255]],
];

const icons = read('icons/icons.json');

for (const zoom of [1, 4]) {
  for (const [name, expected] of [
    ['brand-badge', BRAND],
    ['hsl-swatch', HSL],
  ] as const) {
    test(`${name} at ${zoom * 100}%: Konva and raster agree and match the example`, async ({
      page,
    }) => {
      const component = read(`components/${name}.json`);
      const samples = await probe(
        page,
        component,
        icons,
        zoom,
        expected.map(([x, y]) => [x, y]),
      );
      samples.forEach((sample, i) => {
        near(sample.konva, sample.raster, CHANNEL_TOLERANCE);
        near(sample.konva, expected[i]![2], expected[i]![3] ?? CHANNEL_TOLERANCE);
      });
    });
  }
}

test('brand-badge: the corners outside the circle show no paint on either renderer', async ({
  page,
}) => {
  const component = read('components/brand-badge.json');
  const corners = [
    [1, 1],
    [46, 1],
    [1, 46],
    [46, 46],
  ];
  const samples = await probe(page, component, icons, 4, corners);
  for (const sample of samples) {
    near(sample.konva, [255, 255, 255], CHANNEL_TOLERANCE);
    near(sample.raster, [255, 255, 255], CHANNEL_TOLERANCE);
  }
});

// The arc of a clip is the one place where the sweep flag is read: a full circle (two half arcs) looks the
// same with the flag flipped, so this clip is a quarter disc centered on the top-left corner (a single arc,
// clockwise from (24, 0) to (0, 24) through (17, 17)). Konva's `ellipse` and the raster's flattening must
// keep the same quarter.
test('a quarter-disc clip keeps the same quarter on both renderers', async ({ page }) => {
  const quarter = {
    ...icons,
    icons: {
      brand: {
        clip: { d: 'M0 0H24A24 24 0 0 1 0 24Z' },
        paths: [{ d: 'M0 0h24v24H0z', fill: true }],
      },
    },
  };
  const component = {
    ...read('components/brand-badge.json'),
    template: {
      type: 'frame',
      layout: { type: 'row', align: 'center', justify: 'center' },
      fill: '#FFFFFF',
      children: [
        { type: 'icon', name: 'brand', color: '#000000', width: 48, height: 48 },
      ],
    },
  };
  const samples = await probe(page, component, quarter, 4, [
    [6, 6],
    [30, 6],
    [6, 30],
    [40, 40],
  ]);
  const inside = [0, 0, 0];
  const outside = [255, 255, 255];
  const wanted = [inside, inside, inside, outside];
  samples.forEach((sample, i) => {
    near(sample.konva, wanted[i]!, CHANNEL_TOLERANCE);
    near(sample.raster, wanted[i]!, CHANNEL_TOLERANCE);
  });
});
