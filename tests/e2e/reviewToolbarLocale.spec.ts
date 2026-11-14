import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// CL1 4.13: in pt-BR the text buttons of the toolbar ("Adicionar imagens", "Novo container")
// stay on one line (the control height), also during a proposal review at 1280 × 720.

test.use({ viewport: { width: 1280, height: 720 }, locale: 'pt-BR' });

test('pt-BR review: toolbar text buttons stay on a single line', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'full-example.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/full-example.zip'),
    });
  await expect(page.getByRole('main')).toBeVisible();
  await page.getByRole('button', { name: /^Propostas/ }).click();
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  for (const name of ['Adicionar imagens', 'Novo container']) {
    const box = await page.getByRole('button', { name }).first().boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.height, `${name} height`).toBeLessThanOrEqual(30);
  }
});
