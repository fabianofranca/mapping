import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, exportMapping, projectAction } from './helpers';

// D2 (#1104): the Density field in the container Details and in New container, the suggestion from the
// preset sizes and Apply, in the real app.

const PACKAGE_DIR = 'tests/fixtures/material3';

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

test('3x capture: suggestion, Apply, undo in one entry and density saving', async ({
  page,
}) => {
  await createProject(page, 'Capture');

  // Material 3 package (brings the preset size Celular 360 × 800).
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

  // New container 1080 × 2400: the Density field exists, comes at 1x and does not save the key.
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Capture 3x');
  await dialog.getByLabel('Width').fill('1080');
  await dialog.getByLabel('Height').fill('2400');
  await expect(dialog.getByLabel('Density', { exact: true })).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();

  // Details: the suggestion appears (1080 = 3 × 360) and Apply saves it.
  const details = page.locator('.props');
  const density = details.getByLabel('Density', { exact: true });
  await expect(density).toHaveValue('1');
  // pt-BR kept: 'Celular' is the preset name of the shared fixture tests/fixtures/material3
  await expect(details.getByText('Suggestion: 3x (Celular 360 × 800)')).toBeVisible();
  await details.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(density).toHaveValue('3');
  await expect(details.getByText(/Suggestion/)).toBeHidden();
  await expect(details.getByRole('button', { name: 'Apply', exact: true })).toBeHidden();

  // Ctrl+Z goes back in a single entry (focus outside a field).
  await page.getByRole('heading', { name: 'Details' }).first().click();
  await page.keyboard.press('Control+z');
  await expect(density).toHaveValue('1');
  // pt-BR kept: 'Celular' is the preset name of the shared fixture tests/fixtures/material3
  await expect(details.getByText('Suggestion: 3x (Celular 360 × 800)')).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(density).toHaveValue('3');

  // Custom accepts 2.625 and refuses 0.2.
  await density.selectOption('custom');
  const custom = details.getByLabel('Custom density');
  await custom.fill('0.2');
  await custom.press('Enter');
  await expect(details.getByRole('alert')).toHaveText('Use a number from 0.5 to 8.');
  await custom.fill('2.625');
  await custom.press('Enter');
  await expect(details.getByRole('alert')).toBeHidden();
  await expect(custom).toHaveValue('2.625');

  const { mapping } = await exportMapping(page);
  expect(mapping.schemaVersion).toBe(20);
  expect(mapping.containers).toHaveLength(1);
  expect(mapping.containers[0]).toMatchObject({
    width: 1080,
    height: 2400,
    density: 2.625,
  });
});

test('New container saves the chosen density', async ({ page }) => {
  await createProject(page, 'Density');
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Screen');
  await dialog.getByLabel('Density', { exact: true }).selectOption('2');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  const { mapping } = await exportMapping(page);
  expect(mapping.containers[0]).toMatchObject({ density: 2 });
});
