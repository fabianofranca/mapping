// DG7 (stage #2915, decision 14) in a real Chromium: the components of the `examples/libraries/drawing-fidelity/`
// package drawn by the app (`renderScene` on Konva) against the MCP raster (`paintScene`), the same scene at 100%
// and 300%, plus the probes of the test script (the Link's ring, the Scroll's scrollbar, the Header's blur, the Divider's
// bottom stroke, the Corner card's corners and the Signal's shadows). The fonts stay empty (the text is not compared).
// The Photo (a package image) is covered by `packageImageParity.spec.ts`. It does not open the app: it mounts Konva
// on a blank page, like `innerShadowParity.spec.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

const LIBRARY = join(process.cwd(), 'examples/libraries/drawing-fidelity');
const read = (path: string): unknown =>
  JSON.parse(readFileSync(join(LIBRARY, path), 'utf8'));

const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { parseIconsFile } from './src/model/components/icons';
import { splitOverlay } from './src/model/components/overlay';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;

window.draw = (component, values, icons, zoom) => {
  const parsed = parseIconsFile(icons);
  const { root } = instantiate(
    component,
    values,
    { x: 0, y: 0, width: component.size.width, height: component.size.height },
    { measure: approximateMeasurer, ...(parsed.ok ? { icons: parsed.set } : {}) },
  );
  const scene = { root, warnings: [] };
  const w = Math.round(component.size.width * zoom);
  const h = Math.round(component.size.height * zoom);
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: w, height: h });
  stage.scale({ x: zoom, y: zoom });
  const layer = new Layer();
  stage.add(layer);
  const drawn = renderScene(scene);
  layer.add(drawn.root);
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
  // As the server does (containerDrawing.ts): the bases first, then each overlay above them.
  const { base, overlay } = splitOverlay(root);
  const drawings = overlay === undefined ? [scene] : [{ root: base, warnings: [] }, { root: overlay, warnings: [] }];
  paintScene(target, drawings, approximateMeasurer, { clip: { x: 0, y: 0, width: w, height: h }, scaleX: zoom, scaleY: zoom });
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

type Component = { size: { width: number; height: number }; template: object };
type Window = {
  draw: (
    c: object,
    values: object,
    icons: unknown,
    zoom: number,
  ) => { konva: number[]; raster: number[] };
};

const component = (id: string): Component => read(`components/${id}.json`) as Component;
const ICONS = read('icons/icons.json');

async function drawBoth(page: Page, c: Component, values: object, zoom: number) {
  await load(page);
  const { konva, raster } = await page.evaluate(
    ([comp, vals, icons, z]) =>
      (window as unknown as Window).draw(
        comp as object,
        vals as object,
        icons,
        z as number,
      ),
    [c, values, ICONS, zoom] as const,
  );
  const width = Math.round(c.size.width * zoom);
  const at = (rgb: number[], x: number, y: number): number[] => {
    const i = (Math.round(y * zoom) * width + Math.round(x * zoom)) * 3;
    return rgb.slice(i, i + 3);
  };
  return {
    konva,
    raster,
    app: (x: number, y: number) => at(konva, x, y),
    png: (x: number, y: number) => at(raster, x, y),
  };
}

const hexOf = (hex: string): number[] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Each channel within `tolerance` of the hex color (the app's ±3 and the PNG's ±4 of decision 14). */
function near(actual: number[], hex: string, tolerance: number, label: string): void {
  const want = hexOf(hex);
  for (let c = 0; c < 3; c++)
    expect(
      Math.abs(actual[c]! - want[c]!),
      `${label} channel ${c}: ${actual}`,
    ).toBeLessThanOrEqual(tolerance);
}

const sum = (rgb: number[]): number => rgb[0]! + rgb[1]! + rgb[2]!;

/** The share of pixels whose channels differ by more than the tolerance (the blur is a box pass in the raster). */
function expectParity(
  konva: number[],
  raster: number[],
  width: number,
  zoom: number,
  skip?: { x: number; y: number; width: number; height: number },
  tolerance = 24,
  share = 0.03,
): void {
  expect(konva.length).toBe(raster.length);
  let far = 0;
  for (let i = 0; i < konva.length; i += 3) {
    // The text differs by design (the page's fonts against the raster's): its box is left out.
    const x = ((i / 3) % (width * zoom)) / zoom;
    const y = Math.floor(i / 3 / (width * zoom)) / zoom;
    if (
      skip &&
      x >= skip.x &&
      x < skip.x + skip.width &&
      y >= skip.y &&
      y < skip.y + skip.height
    )
      continue;
    if ([0, 1, 2].some((c) => Math.abs(konva[i + c]! - raster[i + c]!) > tolerance))
      far++;
  }
  expect(far / (konva.length / 3)).toBeLessThan(share);
}

/** The Scroll with a content block as wide as the area, listed after the scrollbar (what the child marking is in the app). */
function scrollWithBlock(overlay: boolean): Component {
  const scroll = component('scroll') as Component & { template: { children: object[] } };
  const children = scroll.template.children.map((child) => ({ ...child })) as Record<
    string,
    unknown
  >[];
  const slot = children.findIndex((c) => c.type === 'slot');
  children.splice(slot, 1);
  // A block that comes after the scrollbar in the template is above it, unless the scrollbar has `overlay`.
  children.push({
    type: 'rect',
    name: 'block',
    width: 200,
    height: 48,
    fill: '#93C5FD',
    anchors: { left: 0, top: 0 },
  });
  const bar = children.find((c) => c.name === 'scrollbar')!;
  if (!overlay) delete bar.overlay;
  return { ...scroll, template: { ...scroll.template, children } };
}

/** The Header with two 40-high blocks (`#DC2626` over `#2563EB`) under the bar, as the child markings are. */
function headerWithBlocks(): Component {
  const header = component('header') as Component & { template: { children: object[] } };
  const children = header.template.children.map((child) => ({ ...child })) as Record<
    string,
    unknown
  >[];
  const slot = children.findIndex((c) => c.type === 'slot');
  children.splice(
    slot,
    1,
    {
      type: 'rect',
      name: 'red',
      width: 200,
      height: 40,
      fill: '#DC2626',
      anchors: { left: 0, top: 0 },
    },
    {
      type: 'rect',
      name: 'blue',
      width: 200,
      height: 40,
      fill: '#2563EB',
      anchors: { left: 0, top: 40 },
    },
  );
  return { ...header, template: { ...header.template, children } };
}

for (const zoom of [1, 3]) {
  const pct = Math.round(zoom * 100);

  test(`the Corner card's corners follow the fields, in the app and in the PNG (${pct}%)`, async ({
    page,
  }) => {
    const card = component('corner-card');
    const sheet = await drawBoth(page, card, { top: 'round', bottom: 'square' }, zoom);
    const flipped = await drawBoth(page, card, { top: 'square', bottom: 'round' }, zoom);
    for (const side of ['app', 'png'] as const) {
      // Round top: the corner pixel is the white background. Square bottom: the stroke reaches the corner.
      expect(sum(sheet[side](0.5, 0.5)), `${side} round top`).toBe(765);
      expect(sum(sheet[side](0.5, 95)), `${side} square bottom`).toBeLessThan(700);
      expect(sum(flipped[side](0.5, 0.5)), `${side} square top`).toBeLessThan(700);
      expect(sum(flipped[side](0.5, 95)), `${side} round bottom`).toBe(765);
    }
    expectParity(sheet.konva, sheet.raster, 160, zoom, {
      x: 30,
      y: 30,
      width: 100,
      height: 36,
    });
    expectParity(flipped.konva, flipped.raster, 160, zoom, {
      x: 30,
      y: 30,
      width: 100,
      height: 36,
    });
  });

  test(`the Signal's shadows follow the size and the ring's inner shadow darkens its edge (${pct}%)`, async ({
    page,
  }) => {
    const signal = component('signal');
    const small = await drawBoth(page, signal, { size: 's' }, zoom);
    const large = await drawBoth(page, signal, { size: 'l' }, zoom);
    for (const side of ['app', 'png'] as const) {
      // Below the base (it ends at y 68): the large shadow (y 8, blur 16) is darker than the small one (y 2, blur 4).
      expect(sum(large[side](48, 76)), `${side} below the base`).toBeLessThan(
        sum(small[side](48, 76)) - 20,
      );
    }
    expectParity(small.konva, small.raster, 96, zoom);
    expectParity(large.konva, large.raster, 96, zoom);
  });

  test(`the Divider's bottom stroke follows the arcs and leaves the sides alone (${pct}%)`, async ({
    page,
  }) => {
    const divider = await drawBoth(
      page,
      component('divider'),
      { elevated: 'true' },
      zoom,
    );
    for (const side of ['app', 'png'] as const) {
      near(
        divider[side](100, 15),
        '#1F2937',
        side === 'app' ? 3 : 4,
        `${side} bottom middle`,
      );
      expect(sum(divider[side](4, 14)), `${side} bottom arc`).toBeLessThan(500);
      // Middle of the left side: the stroke tapers to 0, the pill's fill shows.
      near(divider[side](0.7, 8), '#F3F4F6', 8, `${side} left side`);
    }
    expectParity(divider.konva, divider.raster, 200, zoom);
  });

  test(`the Link's focus ring has its own inner radius (stroke.cornerRadius) (${pct}%)`, async ({
    page,
  }) => {
    const focused = await drawBoth(page, component('link'), { focused: 'true' }, zoom);
    const plain = await drawBoth(page, component('link'), { focused: 'false' }, zoom);
    for (const side of ['app', 'png'] as const) {
      // The ring sits 2 px outside the box (`offset` 2, 2 px wide, `align` inside), so inside the box only its inner
      // rounded corner shows: radius 2, centered 2 px in. The corner pixel is the ring's, the one 1 px in is not.
      expect(sum(focused[side](0, 0)), `${side} ring at the corner`).toBeLessThan(600);
      expect(sum(focused[side](1, 1)), `${side} inside the inner arc`).toBe(765);
      expect(sum(plain[side](0, 0)), `${side} no ring`).toBe(765);
    }
    expectParity(focused.konva, focused.raster, 80, zoom, {
      x: 8,
      y: 6,
      width: 64,
      height: 20,
    });
  });

  test(`the Scroll's scrollbar is drawn above the content block and without overlay it is hidden (${pct}%)`, async ({
    page,
  }) => {
    const over = await drawBoth(page, scrollWithBlock(true), {}, zoom);
    const under = await drawBoth(page, scrollWithBlock(false), {}, zoom);
    for (const side of ['app', 'png'] as const) {
      near(
        over[side](194, 30),
        '#6B7280',
        side === 'app' ? 3 : 4,
        `${side} scrollbar over the block`,
      );
      near(
        over[side](194, 90),
        '#6B7280',
        side === 'app' ? 3 : 4,
        `${side} scrollbar below the block`,
      );
      // The control: without `overlay` a block that comes after the scrollbar hides it.
      near(under[side](194, 30), '#93C5FD', side === 'app' ? 3 : 4, `${side} no overlay`);
      near(over[side](100, 200), '#F9FAFB', side === 'app' ? 3 : 4, `${side} background`);
    }
    expectParity(over.konva, over.raster, 200, zoom);
    expectParity(under.konva, under.raster, 200, zoom);
  });

  test(`the Header's bar blurs the blocks under it and leaves them sharp below it (${pct}%)`, async ({
    page,
  }) => {
    const header = await drawBoth(page, headerWithBlocks(), {}, zoom);
    for (const side of ['app', 'png'] as const) {
      // Below the bar (it ends at y 56): the blue block is sharp.
      near(
        header[side](100, 70),
        '#2563EB',
        side === 'app' ? 3 : 4,
        `${side} sharp block`,
      );
      // At the border between the two blocks (y 40), under the bar: the two colors mixed, tinted by the white bar (≈ D9C7DC).
      near(header[side](100, 40), '#D9C7DC', 14, `${side} mixed border`);
      // Far from the border, under the bar, the red is only tinted (≈ F4BEBE), not the sharp red.
      expect(header[side](100, 5)[0], `${side} tinted red`).toBeGreaterThan(220);
    }
    expectParity(header.konva, header.raster, 200, zoom, undefined, 32, 0.04);
  });
}
