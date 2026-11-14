import { expect, test, type Page } from '@playwright/test';
import { addImage, createProject, drawMarking, canvasPoint } from './helpers';

// The view keeps its center and scale when the canvas changes size (#1337): opening or closing
// the Tree or the Details does not change the zoom or what is in the middle of the canvas.

const TREE = 'Control+Shift+Digit1';
const DETAILS = 'Control+Shift+Digit3';

async function reading(page: Page) {
  const host = page.locator('.canvas-host');
  const [x = 0, y = 0, scale = 1] = ((await host.getAttribute('data-viewport')) ?? '')
    .split(' ')
    .map(Number);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas sem tamanho');
  return {
    width: box.width,
    scale,
    cx: (box.width / 2 - x) / scale,
    cy: (box.height / 2 - y) / scale,
  };
}

/** Waits two animation frames: the canvas draws at most once per frame. */
async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Reads the view only after two consecutive readings (separated by frames) match. */
async function settled(page: Page) {
  let last = '';
  await expect
    .poll(async () => {
      await frames(page);
      const r = await reading(page);
      const key = JSON.stringify(r);
      const same = key === last;
      last = key;
      return same;
    })
    .toBe(true);
  return reading(page);
}

test('opening and closing the Tree and the Details keeps the scale and the center', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await createProject(page, 'Center');
  await addImage(page);
  const spot = await canvasPoint(page, 0.3);
  await drawMarking(page, { x: spot.x - 40, y: spot.y }, { width: 60, height: 40 });
  const host = page.locator('.canvas-host');
  const tree = page.getByRole('region', { name: 'Tree' });
  const details = page.locator('section[data-window="details"]');

  // Starts with no windows, with focus on the canvas.
  const canvas = page.locator('main[data-canvas-area]');
  if (await tree.isVisible())
    await tree.getByRole('button', { name: /Close.*Marking tree/ }).click();
  if (await details.isVisible())
    await details.getByRole('button', { name: /Close.*Details/ }).click();
  await canvas.focus();
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  await expect(host).toHaveAttribute('data-viewport', /.+/);

  // The two zooms only count once drawn: reads the view when it stops changing.
  const start = await settled(page);
  expect(start.scale).toBeGreaterThan(0);

  const steps: Array<() => Promise<void>> = [
    async () => {
      await canvas.focus();
      await page.keyboard.press(TREE);
      await expect(tree).toBeVisible();
    },
    async () => {
      await canvas.focus();
      await page.keyboard.press(DETAILS);
      await expect(details).toBeVisible();
    },
    async () => {
      await tree.getByRole('button', { name: /Close.*Marking tree/ }).click();
      await expect(tree).toBeHidden();
    },
    async () => {
      await details.getByRole('button', { name: /Close.*Details/ }).click();
      await expect(details).toBeHidden();
    },
  ];
  const widths = new Set<number>([start.width]);
  for (const step of steps) {
    await step();
    // Waits for the canvas to settle at the new size before reading.
    const now = await settled(page);
    widths.add(now.width);
    expect(now.scale).toBeCloseTo(start.scale, 6);
    expect(Math.abs(now.cx - start.cx)).toBeLessThan(1);
    expect(Math.abs(now.cy - start.cy)).toBeLessThan(1);
  }
  expect(widths.size).toBeGreaterThan(1);
});
