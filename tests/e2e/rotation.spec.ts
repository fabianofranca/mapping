// Per-node `rotation` (EX3) in a real Chromium: the Konva drawing (renderScene) with the color of a
// point inside and outside a rectangle rotated 45°, the frame clip that rotates along with it and the hover
// (the rotated shape). It does not open the app: it mounts Konva on a blank page, like textMetrics.
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';

const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene, sceneIdOf } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
Konva.autoDrawEnabled = false;
// Instantiates the component (100 × 100), draws it in Konva and returns the pixel and hover readings.
window.draw = (children) => {
  const component = {
    format: 'mapping-component', formatVersion: 4, id: 'r', name: 'R', size: { width: 100, height: 100 },
    template: { type: 'frame', layout: { type: 'row', align: 'center', justify: 'center' }, children },
  };
  const { root } = instantiate(component, {}, { x: 0, y: 0, width: 100, height: 100 }, { measure: approximateMeasurer });
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: 100, height: 100 });
  const layer = new Layer();
  stage.add(layer);
  layer.add(renderScene({ root, warnings: [] }).root);
  layer.draw();
  const canvas = layer.getCanvas()._canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, 100, 100).data;
  window.pixel = (x, y) => {
    const i = (y * 100 + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  window.hover = (x, y) => {
    const shape = stage.getIntersection({ x, y });
    return shape ? sceneIdOf(shape) ?? null : null;
  };
};
`;

let bundle = '';

async function load(page: Page): Promise<void> {
  if (bundle === '') {
    const result = await build({
      stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
    });
    bundle = result.outputFiles[0]!.text;
  }
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: bundle });
}

type Pixel = [number, number, number, number];
type Window = {
  draw: (children: object[]) => void;
  pixel: (x: number, y: number) => Pixel;
  hover: (x: number, y: number) => string | null;
};

async function draw(page: Page, children: object[]): Promise<void> {
  await load(page);
  await page.evaluate((c) => (window as unknown as Window).draw(c), children);
}

const pixel = (page: Page, x: number, y: number): Promise<Pixel> =>
  page.evaluate(([px, py]) => (window as unknown as Window).pixel(px!, py!), [x, y]);
const hover = (page: Page, x: number, y: number): Promise<string | null> =>
  page.evaluate(([px, py]) => (window as unknown as Window).hover(px!, py!), [x, y]);

const bar = (rotation: number) => ({
  type: 'rect',
  name: 'bar',
  width: 60,
  height: 20,
  fill: '#ff0000',
  rotation,
});

test('a rectangle rotated 45° paints inside and leaves out what the unrotated one would cover', async ({
  page,
}) => {
  await draw(page, [bar(45)]);
  // 60 × 20 centrado em (50, 50): o eixo comprido vai para a diagonal descendente.
  expect(await pixel(page, 50, 50)).toEqual([255, 0, 0, 255]);
  expect(await pixel(page, 64, 64)).toEqual([255, 0, 0, 255]); // inside only when rotated
  expect(await pixel(page, 36, 36)).toEqual([255, 0, 0, 255]);
  expect(await pixel(page, 22, 42)).toEqual([0, 0, 0, 0]); // unrotated corner, outside the rotated one
  expect(await pixel(page, 78, 58)).toEqual([0, 0, 0, 0]);
  expect(await pixel(page, 64, 36)).toEqual([0, 0, 0, 0]); // outside both
});

test('without rotation the rectangle stays axis-aligned', async ({ page }) => {
  await draw(page, [bar(0)]);
  expect(await pixel(page, 22, 42)).toEqual([255, 0, 0, 255]);
  expect(await pixel(page, 64, 64)).toEqual([0, 0, 0, 0]);
});

test('the frame clip rotates with it and what goes past the diamond disappears', async ({
  page,
}) => {
  await draw(page, [
    {
      type: 'frame',
      name: 'window',
      clip: true,
      width: 40,
      height: 40,
      rotation: 45,
      children: [{ type: 'rect', width: 200, height: 200, fill: '#0000ff' }],
    },
  ]);
  expect(await pixel(page, 50, 50)).toEqual([0, 0, 255, 255]);
  expect(await pixel(page, 50, 25)).toEqual([0, 0, 255, 255]);
  expect(await pixel(page, 31, 31)).toEqual([0, 0, 0, 0]); // corner of the unrotated square
  expect(await pixel(page, 80, 50)).toEqual([0, 0, 0, 0]);
});

test('hover finds the node by its rotated shape; outside it, the frame behind', async ({
  page,
}) => {
  await draw(page, [bar(45)]);
  const inside = await hover(page, 64, 64); // inside only when rotated
  expect(inside).not.toBeNull();
  expect(inside).not.toBe('c/root');
  expect(await hover(page, 36, 36)).toBe(inside);
  expect(await hover(page, 22, 42)).toBe('c/root'); // corner of the unrotated rectangle
  expect(await hover(page, 64, 36)).toBe('c/root');
});
