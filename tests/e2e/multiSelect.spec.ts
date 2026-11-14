import { expect, test, type Page } from '@playwright/test';
import {
  createProject,
  drag,
  exportMapping,
  setMode,
  type Point,
  type Rect,
} from './helpers';

// Multiple selection (SM1): Ctrl/Cmd+click joins items and the arrows move the selection, with one
// undo entry per press. SM2: Shift+drag selects by rectangle.

/** Fit margin around everything, in screen px (`FIT_PADDING`). */
const FIT_PADDING = 24;

async function addContainer(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
}

async function closeExport(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

/** Creates a project with a container and two markings inside it; returns the screen points. */
async function twoMarkings(
  page: Page,
  name: string,
): Promise<{
  spots: Point[];
  sizeW: number;
  sizeH: number;
  centers: Point[];
  screen: Rect;
}> {
  await createProject(page, name);
  const host = page.locator('.canvas-host');
  await addContainer(page, 'Screen');
  const fitsBefore = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(host).toHaveAttribute('data-fits', String(fitsBefore + 1));

  const first = (await exportMapping(page)).mapping.containers[0];
  const box = await host.boundingBox();
  if (!first || !box) throw new Error('no container or canvas');
  const width = first.width * first.placement.scale;
  const height = first.height * first.placement.scale;
  const scale = Math.min(
    (box.width - 2 * FIT_PADDING) / width,
    (box.height - 2 * FIT_PADDING) / height,
  );
  const screen: Rect = {
    x: box.x + box.width / 2 - (width * scale) / 2,
    y: box.y + box.height / 2 - (height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
  const sizeW = screen.width * 0.2;
  const sizeH = screen.height * 0.2;
  const spots = [0.2, 0.6].map((fx) => ({
    x: screen.x + screen.width * fx,
    y: screen.y + screen.height * (fx === 0.2 ? 0.25 : 0.55),
  }));
  await setMode(page, 'Draw');
  for (const s of spots) {
    await drag(page, s, { x: s.x + sizeW, y: s.y + sizeH });
  }
  await setMode(page, 'Navigate');
  const centers = spots.map((s) => ({ x: s.x + sizeW / 2, y: s.y + sizeH / 2 }));
  return { spots, sizeW, sizeH, centers, screen };
}

test('Ctrl/Cmd+click joins two items and the arrow moves the selection in one undo entry', async ({
  page,
}) => {
  const { centers } = await twoMarkings(page, 'Arrows project');
  const before = (await exportMapping(page)).mapping.markings;
  expect(before).toHaveLength(2);
  await closeExport(page);

  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0);
  await page.keyboard.up('ControlOrMeta');
  await expect(page.getByText('2 items selected').first()).toBeVisible();

  await page.keyboard.press('ArrowRight');
  const moved = (await exportMapping(page)).mapping.markings;
  await closeExport(page);
  for (const m of before) {
    expect(moved.find((n) => n.id === m.id)?.rect.x).toBe(m.rect.x + 1);
  }

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const rects = (await exportMapping(page)).mapping.markings.map((m) => m.rect);
      await closeExport(page);
      return rects;
    })
    .toEqual(before.map((m) => m.rect));
});

/** Shift+drag from `from` to `to` (moves in steps, to pass the threshold). */
async function shiftDrag(
  page: Page,
  from: Point,
  to: Point,
  release = true,
): Promise<void> {
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  if (release) {
    await page.mouse.up();
    await page.keyboard.up('Shift');
  }
}

test('Shift+drag around two markings selects both, in Navigate and in Draw', async ({
  page,
}) => {
  const { spots, sizeW, sizeH, centers } = await twoMarkings(page, 'Rectangle');
  const [s0, s1] = spots;
  if (!s0 || !s1) throw new Error('no points');
  // Far from the handles of the already selected item (22 px reach), otherwise the gesture resizes.
  const around = { x: s0.x - 40, y: s0.y - 40 };
  const end = { x: s1.x + sizeW + 40, y: s1.y + sizeH + 40 };
  const count = async (): Promise<number> => {
    const n = (await exportMapping(page)).mapping.markings.length;
    await closeExport(page);
    return n;
  };

  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await expect(page.getByText('2 items selected')).toBeHidden();
  await shiftDrag(page, around, end);
  await expect(page.getByText('2 items selected').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await setMode(page, 'Draw');
  expect(await count()).toBe(2);
  await shiftDrag(page, around, end);
  await expect(page.getByText('2 items selected').first()).toBeVisible();
  expect(await count()).toBe(2);
});

test('Esc in the middle of the Shift+drag cancels the rectangle and does not change the selection', async ({
  page,
}) => {
  const { spots, sizeW, sizeH, centers } = await twoMarkings(page, 'Cancel');
  const [s0, s1] = spots;
  if (!s0 || !s1) throw new Error('no points');
  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await shiftDrag(
    page,
    { x: s0.x - 10, y: s0.y - 10 },
    { x: s1.x + sizeW + 10, y: s1.y + sizeH + 10 },
    false,
  );
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByText('2 items selected')).toBeHidden();
});
