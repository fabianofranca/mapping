import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// R13.10: a lista de Especializações mostra o nome da especialização ("Material 3 (Compose)"),
// não o id, no projeto Telas aberto do examples/proposta-componentes.zip.

test('Especializações mostra o nome da especialização, não o id', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'proposta-componentes.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/proposta-componentes.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.getByRole('button', { name: 'Especializações' }).first().click();
  const item = page.locator('.spec-list .spec-item');
  await expect(item).toHaveCount(1);
  await expect(item.locator('strong')).toHaveText('Material 3 (Compose)');
});
