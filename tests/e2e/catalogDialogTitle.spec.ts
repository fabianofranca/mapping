// Stage #2035 (CL1-F9): the title of a dialog inside the Catalog tool window is vertically centered with the close X.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
const dir = join(process.cwd(), 'examples', 'libraries', 'data-model');
test('a dialog opened in a tool window centers its title with the close button (CL1-F9)', async ({
  page,
}) => {
  test.setTimeout(90000);
  const zip = new JSZip();
  const walk = (p: string): void => {
    for (const e of readdirSync(join(dir, p), { withFileTypes: true })) {
      const rel = p === '' ? e.name : `${p}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else zip.file(rel, readFileSync(join(dir, rel)));
    }
  };
  walk('');
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await page.goto('/');
  const { createProject, projectAction } = await import('./helpers');
  await createProject(page, 'Screens');
  await projectAction(page, 'Specializations');
  await page
    .locator('input[type=file][accept=".zip,application/zip"]')
    .setInputFiles({ name: 'l.zip', mimeType: 'application/zip', buffer });
  const confirm = page.getByRole('button', { name: 'Apply', exact: true });
  await confirm.waitFor();
  await page.waitForTimeout(2000);
  await confirm.click();
  await page.waitForTimeout(1500);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.keyboard.press('Control+Shift+9');
  await page
    .locator('.catalog-window select')
    .selectOption({ label: 'Data model' })
    .catch(() => {});
  await page.getByRole('button', { name: 'File formats' }).first().click();
  await page.waitForTimeout(1500);
  const dialog = page.getByRole('dialog');
  const box = async (selector: string) => {
    const b = await dialog.locator(selector).first().boundingBox();
    if (b === null) throw new Error(`no box for ${selector}`);
    return b.y + b.height / 2;
  };
  const title = await box('.dialog-title');
  expect(Math.abs(title - (await box('.dialog-header button')))).toBeLessThanOrEqual(1);
  expect(Math.abs(title - (await box('.dialog-header')))).toBeLessThanOrEqual(1);
});
