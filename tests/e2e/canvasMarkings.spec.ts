import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  drag,
  exportMapping,
  selectedRect,
  setMode,
  type Rect,
} from './helpers';

// Spatial markings stage, ME1: canvas marking and containment by geometry. The canvas
// publishes on the container (`.canvas-host`) the counts of what it has already drawn: `data-canvas-markings`
// is the one for the canvas markings.

/** Margin, in screen px, that the fit leaves around everything (`FIT_PADDING`). */
const FIT_PADDING = 24;

/** New container (Custom) with the given name, through the dialog. */
async function addContainer(page: Page, host: Locator, name: string): Promise<void> {
  const before = Number((await host.getAttribute('data-images')) ?? 0);
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', String(before + 1));
}

/** Fit all, waiting for the canvas to draw the new fit. */
async function fitAll(page: Page, host: Locator): Promise<void> {
  const before = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(host).toHaveAttribute('data-fits', String(before + 1));
}

/**
 * Where each container is on screen, right after Fit all: the positions come from the
 * exported `mapping.json` and the fit is the canvas one (`fitRect`: everything centered, with the
 * `FIT_PADDING` margin).
 */
async function containerRects(page: Page, host: Locator): Promise<Map<string, Rect>> {
  const { mapping } = await exportMapping(page);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas has no size');
  const canvas = mapping.containers.map((c) => ({
    id: c.id,
    x: c.placement.x,
    y: c.placement.y,
    width: c.width * c.placement.scale,
    height: c.height * c.placement.scale,
  }));
  const x0 = Math.min(...canvas.map((c) => c.x));
  const y0 = Math.min(...canvas.map((c) => c.y));
  const x1 = Math.max(...canvas.map((c) => c.x + c.width));
  const y1 = Math.max(...canvas.map((c) => c.y + c.height));
  const scale = Math.min(
    (box.width - 2 * FIT_PADDING) / (x1 - x0),
    (box.height - 2 * FIT_PADDING) / (y1 - y0),
  );
  const offsetX = box.x + box.width / 2 - ((x0 + x1) / 2) * scale;
  const offsetY = box.y + box.height / 2 - ((y0 + y1) / 2) * scale;
  return new Map(
    canvas.map((c) => [
      c.id,
      {
        x: offsetX + c.x * scale,
        y: offsetY + c.y * scale,
        width: c.width * scale,
        height: c.height * scale,
      },
    ]),
  );
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/**
 * Undo/Redo button of the bar: one click is one history step, like the shortcut, without depending
 * on where the focus ended up after exporting the zip.
 */
function historyButton(page: Page, name: 'Undo' | 'Redo') {
  return page.getByRole('button', { name: new RegExp(`^${name}`) }).first();
}

test('drawing in the empty space around two containers creates a canvas marking; undo reverts everything at once', async ({
  page,
}) => {
  await createProject(page, 'Canvas');
  const host = page.locator('.canvas-host');
  // Three screens side by side (dark, light and custom variations of the same screen).
  for (const name of ['Light', 'Dark', 'Custom']) await addContainer(page, host, name);
  await fitAll(page, host);
  await expect(host).toHaveAttribute('data-canvas-markings', '0');

  // Two containers whose box does not touch the third.
  const rects = await containerRects(page, host);
  const ids = [...rects.keys()];
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));
  const pair = pairs.find(([a, b]) => {
    const third = ids.find((id) => id !== a && id !== b);
    const box = union(rects.get(a) as Rect, rects.get(b) as Rect);
    return third !== undefined && !overlaps(box, rects.get(third) as Rect);
  });
  if (!pair) throw new Error('no pair of containers isolated from the third');
  const box = union(rects.get(pair[0]) as Rect, rects.get(pair[1]) as Rect);
  const third = rects.get(ids.find((id) => id !== pair[0] && id !== pair[1]) as string);

  // In the empty space: starts outside all containers and ends beyond the pair, without touching the third
  // (a margin of up to 8 px, at most half the gap to it).
  const gap = third
    ? Math.max(
        third.x - (box.x + box.width),
        box.x - (third.x + third.width),
        third.y - (box.y + box.height),
        box.y - (third.y + third.height),
      )
    : 16;
  const margin = Math.min(8, Math.floor(gap / 2));
  expect(margin).toBeGreaterThanOrEqual(2);
  await setMode(page, 'Draw');
  await drag(
    page,
    { x: box.x - margin, y: box.y - margin },
    { x: box.x + box.width + margin, y: box.y + box.height + margin },
  );
  await setMode(page, 'Navigate');
  await expect(host).toHaveAttribute('data-canvas-markings', '1');

  // On disk: the marking belongs to the canvas and the two containers have its `parentId`; the third does not.
  const { mapping } = await exportMapping(page);
  expect(mapping.markings).toHaveLength(1);
  const canvasMarking = mapping.markings[0];
  if (!canvasMarking) throw new Error('no canvas marking');
  expect(canvasMarking).toMatchObject({
    containerId: null,
    parentId: null,
    floating: false,
  });
  expect(Object.fromEntries(mapping.containers.map((c) => [c.id, c.parentId]))).toEqual(
    Object.fromEntries(
      ids.map((id) => [id, id === pair[0] || id === pair[1] ? canvasMarking.id : null]),
    ),
  );

  // Ctrl+Z undoes everything at once: the marking and the containment.
  await historyButton(page, 'Undo').click();
  await expect(host).toHaveAttribute('data-canvas-markings', '0');
  const undone = (await exportMapping(page)).mapping;
  expect(undone.markings).toHaveLength(0);
  expect(undone.containers.every((c) => c.parentId === null)).toBe(true);

  // And redo brings both things back.
  await historyButton(page, 'Redo').click();
  await expect(host).toHaveAttribute('data-canvas-markings', '1');
  const redone = (await exportMapping(page)).mapping;
  expect(redone.containers.filter((c) => c.parentId === canvasMarking.id)).toHaveLength(
    2,
  );
});

test('dragging a marking from one screen to the other makes it a marking of the other, with the same rect', async ({
  page,
}) => {
  await createProject(page, 'Storyboard');
  const host = page.locator('.canvas-host');
  for (const name of ['Quadro 1', 'Quadro 2']) await addContainer(page, host, name);
  await fitAll(page, host);
  const rects = await containerRects(page, host);
  const [first, second] = [...rects.keys()];
  if (first === undefined || second === undefined) throw new Error('no containers');
  const from = rects.get(first) as Rect;
  const to = rects.get(second) as Rect;

  // Draw a marking inside the first frame (the storyboard ball).
  const ball = {
    x: from.x + from.width * 0.3,
    y: from.y + from.height * 0.3,
    width: from.width * 0.25,
    height: from.width * 0.25,
  };
  await setMode(page, 'Draw');
  await drag(
    page,
    { x: ball.x, y: ball.y },
    { x: ball.x + ball.width, y: ball.y + ball.height },
  );
  await setMode(page, 'Navigate');
  const rect = await selectedRect(page);
  await expect(host).toHaveAttribute('data-canvas-markings', '0');

  // Take the marking to the same point of the second frame (both have the same resolution).
  const start = { x: ball.x + ball.width / 2, y: ball.y + ball.height / 2 };
  await drag(page, start, {
    x: start.x + (to.x - from.x),
    y: start.y + (to.y - from.y),
  });

  const { mapping } = await exportMapping(page);
  expect(mapping.markings).toHaveLength(1);
  const moved = mapping.markings[0];
  expect(moved?.containerId).toBe(second);
  // Same resolution: the same pixels (with a one pixel slack from the gesture rounding).
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs((moved?.rect[key] ?? Number.NaN) - rect[key])).toBeLessThanOrEqual(2);
  }
  expect(mapping.containers.every((c) => c.parentId === null)).toBe(true);

  // One Ctrl+Z returns the marking to the first frame.
  await historyButton(page, 'Undo').click();
  const undone = (await exportMapping(page)).mapping;
  expect(undone.markings[0]?.containerId).toBe(first);
});

test('releasing a drag below the minimum warns and creates nothing; clicking without dragging does not warn', async ({
  page,
}) => {
  await createProject(page, 'Aviso');
  const host = page.locator('.canvas-host');
  await addContainer(page, host, 'Tela');
  await fitAll(page, host);
  const rect = [...(await containerRects(page, host)).values()][0] as Rect;
  const { mapping } = await exportMapping(page);
  const image = mapping.containers[0];
  if (!image) throw new Error('no container');
  // Screen px per image px. A 7 screen px drag passes the threshold of 6 and stays below
  // the 8 image px when the zoom is greater than 7/8; the fit alone does not guarantee that.
  const perPixel = rect.width / image.width;
  expect(perPixel).toBeGreaterThan(0.75);
  const small = (6 + 8 * perPixel) / 2; // between the drag threshold and the minimum, in screen px
  expect(small / perPixel).toBeLessThan(8);
  const start = { x: rect.x + rect.width / 3, y: rect.y + rect.height / 3 };
  const warning = page.getByRole('status').filter({ hasText: 'Each side must be' });

  await setMode(page, 'Draw');
  await page.mouse.click(start.x, start.y);
  await expect(warning).toHaveCount(0);

  await drag(page, start, { x: start.x + small, y: start.y + small });
  await expect(warning).toContainText('at least 8 px.');
  expect((await exportMapping(page)).mapping.markings).toHaveLength(0);
});
