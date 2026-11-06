import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Legenda das marcas na revisão a 900×860 (#537): enquanto aberta, fica por cima do minimapa,
// inteira à vista.

test.use({ viewport: { width: 900, height: 860 } });

test('a legenda das marcas fica por cima do minimapa a 900×860', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  for (const key of ['Digit3', 'Digit7', 'Digit2', 'Digit1']) {
    await page.keyboard.press(`Control+Shift+${key}`);
  }
  await page
    .getByRole('button', { name: 'Revisar: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();
  await page.getByRole('button', { name: 'Legenda das marcas' }).click();
  const legend = page.locator('.review-legend');
  await expect(legend).toBeVisible();

  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.review-legend')!.getBoundingClientRect();
    const b = document.querySelector('.minimap')!.getBoundingClientRect();
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    if (left >= right || top >= bottom) return null;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return { onLegend: hit?.closest('.review-legend') !== null };
  });
  // Os dois se sobrepõem a 900×860; no ponto em comum, quem aparece é a legenda.
  expect(overlap).not.toBeNull();
  expect(overlap?.onLegend).toBe(true);

  // Inteira à vista: sem rolagem interna (R13.5; #552, AG4).
  const fit = await legend.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
  }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
});
