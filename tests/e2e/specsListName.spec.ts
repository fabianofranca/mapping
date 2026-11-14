import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// R13.10: the Specializations list shows the specialization name ("Material 3 (Compose)"),
// not the id, in the Telas project opened from examples/proposta-componentes.zip.

test('Specializations shows the specialization name, not the id', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'proposta-componentes.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/proposta-componentes.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Specializations' }).first().click();
  const item = page.locator('.spec-list .spec-item');
  await expect(item).toHaveCount(1);
  await expect(item.locator('strong')).toHaveText('Material 3 (Compose)');
});
