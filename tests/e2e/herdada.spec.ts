// MF3 in a real Chromium: the inherited color (`provide` in the parent's `slot`, `$provided` in the child)
// drawn by Konva (renderScene), read pixel by pixel, and the parity with the MCP raster (the same
// scene at 100% and 420%, within a per-channel tolerance written here). It does not open the app: it mounts Konva
// on a blank page, like shadowsGap.spec.
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

// The parent and the child are instantiated as the drawing cache does: what the parent offers
// (`provides`) becomes the child's `provided`, which goes as a child of the parent's frame. The bytes of
// the raster fonts (`font:*`) stay empty (the scene has no text).
const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
const measure = { measure: approximateMeasurer };
// The parent drawn in the whole box with the child (of the component \`child\`, if any) in \`rect\`; without
// \`parent\`, only the child, with no ancestor. Returns the pixels (RGB, over white) of Konva and of the raster.
window.draw = ({ parent, parentValues, child, rect, width, height, zoom }) => {
  const box = { x: 0, y: 0, width, height };
  let provided;
  let root;
  if (parent) {
    const top = instantiate(parent, parentValues ?? {}, box, measure);
    provided = top.provides;
    root = top.root;
  } else {
    root = instantiate({ ...child, template: { type: 'frame', layout: { type: 'none' }, children: [] } }, {}, box, measure).root;
  }
  const inner = instantiate(child, {}, rect, { ...measure, ...(provided ? { provided } : {}) });
  const scene = { root: { ...root, children: [...root.children, inner.root] }, warnings: [] };
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
  return { konva, raster, provided: provided ?? null };
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

interface Request {
  parent?: object;
  parentValues?: Record<string, string>;
  child: object;
  rect: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
  zoom: number;
}
type Drawn = {
  konva: number[];
  raster: number[];
  provided: Record<string, string> | null;
};
type Window = { draw: (request: Request) => Drawn };

/** The RGB pixels of Konva and of the MCP raster, at the requested zoom. */
async function drawBoth(page: Page, request: Request) {
  await load(page);
  const { konva, raster, provided } = await page.evaluate(
    (r) => (window as unknown as Window).draw(r),
    request,
  );
  const width = Math.round(request.width * request.zoom);
  const at = (rgb: number[], x: number, y: number): number[] => {
    const i = (Math.round(y) * width + Math.round(x)) * 3;
    return rgb.slice(i, i + 3);
  };
  return {
    konva,
    raster,
    provided,
    at: (x: number, y: number) => at(konva, x, y),
    rasterAt: (x: number, y: number) => at(raster, x, y),
  };
}

const COMPONENT = { format: 'mapping-component', formatVersion: 4 };

/** The parent: a cream frame of 120 × 70 with a `slot` that offers `content-color` (field `ink`, or blue). */
const PARENT = {
  ...COMPONENT,
  id: 'card',
  name: 'Card',
  size: { width: 120, height: 70 },
  template: {
    type: 'frame',
    fill: '#FFF8E1',
    layout: { type: 'none' },
    children: [
      {
        type: 'slot',
        name: 'content',
        anchors: { left: 4, top: 4, right: 4, bottom: 4 },
        layout: { type: 'none' },
        provide: { 'content-color': { $field: 'ink', default: '#1976D2' } },
      },
    ],
  },
};

/** The child: a 60 × 20 bar that reads `content-color` (green without an ancestor) and a fixed black dot. */
const CHILD = {
  ...COMPONENT,
  id: 'bar',
  name: 'Bar',
  size: { width: 60, height: 20 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'rect',
        name: 'bar',
        anchors: { left: 0, top: 0 },
        width: 40,
        height: 20,
        fill: { $provided: 'content-color', default: '#2E7D32' },
        cornerRadius: 4,
      },
      {
        type: 'rect',
        name: 'dot',
        anchors: { left: 48, top: 6 },
        width: 8,
        height: 8,
        fill: '#000000',
      },
    ],
  },
};

const RECT = { x: 20, y: 25, width: 60, height: 20 };
const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const GREEN = [0x2e, 0x7d, 0x32];
const BLACK = [0, 0, 0];
const CARD = [0xff, 0xf8, 0xe1];

/** Per-channel tolerance (0 to 255) and the fraction of pixels that may exceed it (rounded borders). */
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

const request = (extra: Partial<Request> = {}): Request => ({
  parent: PARENT,
  child: CHILD,
  rect: RECT,
  width: 120,
  height: 70,
  zoom: 1,
  ...extra,
});

for (const zoom of [1, 4.2]) {
  test(`parity with the raster at ${Math.round(zoom * 100)}%: the child inherits the parent's color`, async ({
    page,
  }) => {
    const drawn = await drawBoth(page, request({ zoom }));
    expectParity(drawn.konva, drawn.raster);
    // The bar (x from 20 to 60, y from 25 to 45) is blue: the `default` of the parent's `ink`.
    expect(drawn.at(40 * zoom, 35 * zoom)).toEqual(BLUE);
    expect(drawn.rasterAt(40 * zoom, 35 * zoom)).toEqual(BLUE);
    expect(drawn.at(72 * zoom, 35 * zoom)).toEqual(BLACK); // the dot reads nothing
  });
}

test('the parent field changes the child color, and the rest of the drawing stays as it was', async ({
  page,
}) => {
  const before = await drawBoth(page, request());
  const after = await drawBoth(page, request({ parentValues: { ink: '#D32F2F' } }));
  expect(before.provided).toEqual({ 'content-color': '#1976D2' });
  expect(after.provided).toEqual({ 'content-color': '#D32F2F' });
  expect(before.at(40, 35)).toEqual(BLUE);
  expect(after.at(40, 35)).toEqual(RED);
  expect(after.rasterAt(40, 35)).toEqual(RED);
  expect(after.at(72, 35)).toEqual(BLACK);
  expect(after.at(5, 5)).toEqual(CARD);
  expectParity(after.konva, after.raster);
});

test('without an ancestor that offers the color, the child default applies', async ({
  page,
}) => {
  const drawn = await drawBoth(page, request({ parent: undefined }));
  expect(drawn.provided).toBeNull();
  expect(drawn.at(40, 35)).toEqual(GREEN);
  expect(drawn.rasterAt(40, 35)).toEqual(GREEN);
  expectParity(drawn.konva, drawn.raster);
});

test('the parent empty `ink` field offers its default, not the previous ink', async ({
  page,
}) => {
  const drawn = await drawBoth(page, request({ parentValues: { ink: '' } }));
  expect(drawn.provided).toEqual({ 'content-color': '#1976D2' });
  expect(drawn.at(40, 35)).toEqual(BLUE);
});
