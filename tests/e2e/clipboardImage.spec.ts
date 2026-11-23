import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  createProject,
  drawMarking,
  exportMapping,
} from './helpers';
import { solidPng } from './png';

// Stage #2721, CE3: Ctrl+V asks "replace or add" with an image selected, the canvas menu item
// replaces from the clipboard, and "Export image…" saves the marking's PNG at full size.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/** Puts a solid PNG of `width` × `height` on the system clipboard (the page writes it). */
async function copyPng(page: Page, width: number, height: number): Promise<void> {
  const base64 = solidPng(width, height, [10, 120, 60]).toString('base64');
  await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }, base64);
}

/** Project with one image (400×800) and one marking, with the image selected. */
async function imageSelected(page: Page, name: string): Promise<void> {
  await createProject(page, name);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 0.25));
  // A click on the image away from the marking selects the image.
  const point = await canvasPoint(page, 0.8);
  await page.mouse.click(point.x, point.y);
}

const pasteDialog = (page: Page) => page.getByRole('dialog', { name: 'Paste image' });

test('Ctrl+V with an image selected asks; "Add as new" adds a container', async ({
  page,
}) => {
  await imageSelected(page, 'Paste add');
  await copyPng(page, 200, 400);
  await page.keyboard.press('Control+V');
  const dialog = pasteDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Add as new' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await exportMapping(page)).mapping.containers.length)
    .toBe(2);
});

test('Ctrl+V then "Replace the selected image" keeps the markings', async ({ page }) => {
  await imageSelected(page, 'Paste replace');
  const before = (await exportMapping(page)).mapping;
  await copyPng(page, 200, 400);
  await page.keyboard.press('Control+V');
  const dialog = pasteDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace the selected image' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await exportMapping(page)).mapping.containers[0]?.file)
    .not.toBe(before.containers[0]?.file);
  const after = (await exportMapping(page)).mapping;
  expect(after.containers).toHaveLength(1);
  expect(after.markings).toHaveLength(before.markings.length);
});

test('Ctrl+V and Cancel paste nothing', async ({ page }) => {
  await imageSelected(page, 'Paste cancel');
  await copyPng(page, 200, 400);
  await page.keyboard.press('Control+V');
  await expect(pasteDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pasteDialog(page)).toBeHidden();
  expect((await exportMapping(page)).mapping.containers).toHaveLength(1);
});

test('the canvas menu replaces the image with the clipboard image', async ({ page }) => {
  await imageSelected(page, 'Menu replace');
  const before = (await exportMapping(page)).mapping;
  await copyPng(page, 200, 400);
  const point = await canvasPoint(page, 0.8);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Replace with clipboard image' }).click();
  await expect
    .poll(async () => (await exportMapping(page)).mapping.containers[0]?.file)
    .not.toBe(before.containers[0]?.file);
  expect((await exportMapping(page)).mapping.markings).toHaveLength(
    before.markings.length,
  );
});

test('"Export image…" without a picker downloads <image>-<code>.png with the marking size', async ({
  page,
}) => {
  await page.addInitScript(() => Reflect.set(window, 'showSaveFilePicker', undefined));
  await createProject(page, 'Export image');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 0.25));
  const { mapping } = await exportMapping(page);
  const marking = mapping.markings[0];
  if (!marking) throw new Error('no marking');

  // The Export dialog stays open after the zip download: close it to reach the canvas.
  if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  const point = await canvasPoint(page, 0.25);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export image…' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^tela-[0-9a-z]+\.png$/);
  const png = await readFile(await file.path());
  expect(png.readUInt32BE(16)).toBe(Math.round(marking.rect.width));
  expect(png.readUInt32BE(20)).toBe(Math.round(marking.rect.height));
});
