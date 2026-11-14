// R1 (#1096): Konva × MCP raster parity of the reading direction, in a real Chromium. The ink
// box (bbox of the painted pixels) of the icon and of the path mirrored in rtl differs ≤ 0.5 px between
// the two; rtl text with align right/left lands on the same physical side (the ink edge, ≤ 2 px:
// the raster without fonts draws bars, Konva draws the glyphs). Known limit: the glyphs come out in the order
// of the text, without bidi. Does not open the app: mounts Konva on a blank page (like shadowsGap.spec).
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
// Instantiates the component (with the direction and the icons) and draws on Konva and on the raster; returns the
// ink box (dark pixels on white) of each.
window.draw = (component, width, height, direction, icons) => {
  const options = { measure: approximateMeasurer, icons, ...(direction ? { direction } : {}) };
  const { root } = instantiate(component, {}, { x: 0, y: 0, width, height }, options);
  const scene = { root, warnings: [] };
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width, height });
  const layer = new Layer();
  stage.add(layer);
  layer.add(renderScene(scene).root);
  layer.draw();
  const data = layer.getCanvas()._canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const box = (get) => {
    let left = Infinity; let right = -Infinity;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (get(y * width + x) < 128) { left = Math.min(left, x); right = Math.max(right, x + 1); }
    }
    return { left, right };
  };
  const konva = box((i) => { const a = data[i * 4 + 3] / 255; return data[i * 4 + 1] * a + 255 * (1 - a); });
  host.remove();
  const target = createRaster(width, height);
  target.data.fill(255);
  paintScene(target, [scene], approximateMeasurer, { clip: { x: 0, y: 0, width, height }, scaleX: 1, scaleY: 1 });
  return { konva, raster: box((i) => target.data[i * 4 + 1]) };
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

type Ink = { left: number; right: number };
type Drawn = { konva: Ink; raster: Ink };
type Window = {
  draw: (c: object, w: number, h: number, d: string | undefined, i: object) => Drawn;
};

const ICONS = {
  viewBox: [24, 24],
  icons: {
    back: {
      mirror: true,
      paths: [{ d: 'M2 4L20 4L20 10L2 10Z', fill: true }],
    },
  },
};

async function draw(page: Page, children: object[], direction?: 'rtl'): Promise<Drawn> {
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
  const component = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 's',
    name: 'S',
    size: { width: 60, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children },
  };
  return page.evaluate(
    ([c, d, i]) =>
      (window as unknown as Window).draw(c as object, 60, 40, d as never, i as object),
    [component, direction, ICONS] as const,
  );
}

const icon = { type: 'icon', name: 'back', width: 24, height: 24, color: '#000000' };
const path = {
  type: 'path',
  name: 'p',
  d: 'M2 0L20 0L20 10L2 10Z',
  viewBox: [24, 10],
  width: 48,
  height: 20,
  mirror: true,
  fill: '#000000',
};

for (const [label, node, rtl] of [
  ['icon', icon, { left: 40, right: 58 }],
  ['path', path, { left: 20, right: 56 }],
] as const) {
  test(`${label} mirrored in rtl: the Konva and raster ink differ ≤ 0.5 px`, async ({
    page,
  }) => {
    const drawn = await draw(page, [node], 'rtl');
    expect(Math.abs(drawn.konva.left - drawn.raster.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(drawn.konva.right - drawn.raster.right)).toBeLessThanOrEqual(0.5);
    expect(drawn.raster).toEqual(rtl);
  });

  test(`${label} in ltr: the same parity, without mirroring`, async ({ page }) => {
    const drawn = await draw(page, [node]);
    expect(Math.abs(drawn.konva.left - drawn.raster.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(drawn.konva.right - drawn.raster.right)).toBeLessThanOrEqual(0.5);
  });
}

for (const align of ['right', 'left'] as const) {
  test(`rtl text with align ${align}: the ink lands on the same physical side`, async ({
    page,
  }) => {
    const text = {
      type: 'text',
      name: 't',
      text: 'HHH',
      width: 60,
      height: 20,
      color: '#000000',
      font: { family: 'sans-serif', size: 12, align, lineHeight: 14 },
    };
    const drawn = await draw(page, [text], 'rtl');
    const edge = align === 'right' ? 'right' : 'left';
    expect(Math.abs(drawn.konva[edge] - drawn.raster[edge])).toBeLessThanOrEqual(2);
    // and it is indeed the requested side: the ink touches the edge, far from the opposite one
    expect(
      Math.abs(drawn.raster[edge] - (align === 'right' ? 60 : 0)),
    ).toBeLessThanOrEqual(2);
  });
}
