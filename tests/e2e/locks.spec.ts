import { expect, test, type Page } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  createProject,
  drag,
  drawMarking,
  exportMapping,
  selectedRect,
  type Point,
} from './helpers';

// Stage 2.5: lock of markings and images. When locked, the marking does not move, is not
// deleted, but stays selectable.

/** Cursor the browser shows over a point of the page. */
async function cursorAt(page: Page, p: Point): Promise<string> {
  return page.evaluate(
    ([x, y]) => getComputedStyle(document.elementFromPoint(x, y) ?? document.body).cursor,
    [p.x, p.y] as const,
  );
}

async function toggleLock(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lock marking', exact: true }).click();
}

test('a locked marking neither moves nor is deleted; unlocked, it goes back to normal', async ({
  page,
}) => {
  await createProject(page, 'Lock test');
  await addImage(page);
  const center = await canvasPoint(page);
  await drawMarking(page, center);
  const before = await selectedRect(page);

  await toggleLock(page);
  await expect(
    page.getByRole('button', { name: 'Lock marking', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // Details explains the lock in an icon with a hint ("About the lock", accessible description) and
  // disables what it blocks, but the name stays editable.
  await expect(
    page.getByRole('button', { name: 'About the lock' }),
  ).toHaveAccessibleDescription(/^Locked:/);
  await expect(page.getByLabel('X', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete marking' })).toBeDisabled();
  await expect(page.getByLabel('Name', { exact: true }).first()).toBeEnabled();

  await page.mouse.move(center.x, center.y);
  expect(await cursorAt(page, center)).toBe('not-allowed');

  // Dragging over it does not move it.
  await drag(page, center, { x: center.x + 60, y: center.y + 20 });
  expect(await selectedRect(page)).toEqual(before);

  // The Delete key does not delete (the delete dialog does not even open).
  await page.keyboard.press('Delete');
  expect(await selectedRect(page)).toEqual(before);

  const spot = center;

  // Even locked, it stays selectable: clicking outside and then on it selects it.
  await drag(page, { x: spot.x, y: spot.y + 200 }, { x: spot.x, y: spot.y + 200 });
  await drag(page, spot, spot);
  expect(await selectedRect(page)).toEqual(before);

  await toggleLock(page);
  await drag(page, spot, { x: spot.x + 60, y: spot.y });
  const after = await selectedRect(page);
  expect(after.x).toBeGreaterThan(before.x);
  expect({ w: after.width, h: after.height }).toEqual({
    w: before.width,
    h: before.height,
  });
});

test('the Alt+L shortcut locks and unlocks the selection, and locked goes to the mapping.json', async ({
  page,
}) => {
  await createProject(page, 'Shortcut');
  await addImage(page);
  const center = await canvasPoint(page);
  await drawMarking(page, center);

  await page.keyboard.press('Alt+L');
  const locked = await exportMapping(page);
  expect(locked.mapping.schemaVersion).toBe(20);
  expect(locked.mapping.markings.map((m) => m.locked)).toEqual([true]);
  expect(locked.mapping.containers.map((i) => i.locked)).toEqual([false]);
  // Download closes the export dialog; the selection stays on the marking.
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.keyboard.press('Alt+L');
  const unlocked = await exportMapping(page);
  expect(unlocked.mapping.markings.map((m) => m.locked)).toEqual([false]);
});

test('locked image: "lock all" and Delete disabled', async ({ page }) => {
  await createProject(page, 'Image project');
  await addImage(page);
  const center = await canvasPoint(page);
  await drawMarking(page, center);

  // Selects the image by clicking outside the marking.
  await drag(
    page,
    { x: center.x, y: center.y + 250 },
    { x: center.x, y: center.y + 250 },
  );
  await page.getByRole('button', { name: 'Lock all markings in this image' }).click();
  await expect(
    page.getByRole('button', { name: 'Unlock all markings in this image' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Lock image', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete container' })).toBeDisabled();

  const { mapping } = await exportMapping(page);
  expect(mapping.containers.map((i) => i.locked)).toEqual([true]);
  expect(mapping.markings.map((m) => m.locked)).toEqual([true]);
});
