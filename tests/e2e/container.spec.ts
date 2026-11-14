import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, exportMapping, projectAction } from './helpers';

// Library stage, B3: container and components drawn on the product canvas.

const PACKAGE_DIR = 'tests/fixtures/material3';

/** Zip of the Material 3 package, generated on the fly from the repository folder. */
async function packageZip(): Promise<Buffer> {
  const zip = new JSZip();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else zip.file(relative(PACKAGE_DIR, path), readFileSync(path));
    }
  };
  walk(PACKAGE_DIR);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('container with a Library component, with no saved drawing', async ({ page }) => {
  await createProject(page, 'Screens');
  const host = page.locator('.canvas-host');

  // New container (Custom, 360×800).
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Settings');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', '1');

  // Apply the Material 3 package through a zip.
  await projectAction(page, 'Specializations');
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip(),
  });
  const confirm = page.getByRole('button', { name: 'Apply', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();

  // Catalog window, Palette tab (Ctrl+Shift+9) and Add of a button.
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  await page.getByRole('button', { name: /^Add.*: Button$/ }).click();
  await expect(host).toHaveAttribute('data-components', /^[1-9]/);

  // The mapping.json keeps the marking and the annotation, nothing of the drawing.
  const { mapping } = await exportMapping(page);
  expect(mapping.schemaVersion).toBe(20);
  expect(mapping.containers).toHaveLength(1);
  expect(mapping.containers[0]).toMatchObject({ file: null, background: '#FFFFFF' });
  expect(mapping.markings).toHaveLength(1);
  expect(mapping.annotations.some((a) => a.type?.typeId === 'm3-button')).toBe(true);
  expect(JSON.stringify(mapping)).not.toMatch(/"(scene|drawing|root|children)"/);
});

test('dragging a type from the Palette to the canvas creates the instance where it lands', async ({
  page,
}) => {
  await createProject(page, 'Drag');
  const host = page.locator('.canvas-host');
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Home');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', '1');

  await projectAction(page, 'Specializations');
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip(),
  });
  const confirm = page.getByRole('button', { name: 'Apply', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();

  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  const item = page.locator('li.library-type').filter({
    has: page.getByRole('button', { name: /^Add.*: Button$/ }),
  });
  await expect(item).toHaveAttribute('draggable', 'true');
  // Fit all: the only container (360 × 800, tall) sits in the center of the view, with empty space on the sides.
  await page.getByRole('button', { name: 'Fit all' }).click();
  const canvas = page.getByRole('main', { name: 'Project canvas' });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no size');

  // Over the container (the center of the view, fitted): the instance is born in it.
  await item.dragTo(canvas, { targetPosition: { x: box.width / 2, y: box.height / 2 } });
  await expect(host).toHaveAttribute('data-components', /^[1-9]/);

  // In the empty space, to the left of the container (far from the snap): canvas marking.
  await item.dragTo(canvas, {
    targetPosition: { x: 24, y: box.height / 2 },
    force: true,
  });
  await expect(host).toHaveAttribute('data-components', '2');

  const { mapping } = await exportMapping(page);
  expect(mapping.markings).toHaveLength(2);
  expect(mapping.markings[0]?.containerId).toBe(mapping.containers[0]?.id);
  expect(mapping.markings[1]?.containerId).toBeNull();
});

test('a new project brings the notes library: Add › Note creates a floating post-it on the canvas', async ({
  page,
}) => {
  await createProject(page, 'Notes');
  const host = page.locator('.canvas-host');
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Home');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', '1');

  // With the container selected, a regular type would go into it; the note (floating) always goes
  // to the canvas, and the button label already says so.
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  const add = page.getByRole('button', {
    name: 'Add to canvas: Nota',
    exact: true,
  });
  await expect(add).toHaveText('Add to canvas');
  await add.click();
  await expect(host).toHaveAttribute('data-components', '1');

  // The mapping.json keeps the note as a floating canvas marking, outside the screen, with the
  // typed annotation and the Notes layer applied by default.
  const { mapping } = await exportMapping(page);
  expect(mapping.specializations).toEqual([expect.objectContaining({ id: 'notas' })]);
  expect(mapping.layers.some((l) => l.spec?.specId === 'notas')).toBe(true);
  expect(mapping.markings).toHaveLength(1);
  expect(mapping.markings[0]).toMatchObject({
    containerId: null,
    parentId: null,
    floating: true,
  });
  expect(mapping.annotations).toHaveLength(1);
  expect(mapping.annotations[0]?.type).toEqual({ specId: 'notas', typeId: 'nota' });
  expect(mapping.containers[0]?.parentId).toBeNull();
});
