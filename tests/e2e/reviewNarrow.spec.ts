import { expect, test } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Revisão de proposta a 900 px: o cabeçalho de decisão dos Detalhes e o rodapé de atalhos
// mostram os botões e as dicas por inteiro, sem rolagem horizontal.

test.use({ viewport: { width: 900, height: 800 } });

test('revisão a 900 px: decisão inteira nos Detalhes e rodapé sem corte', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+3');
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  // Uma marcação alterada pela proposta mostra o cabeçalho de decisão do item nos Detalhes.
  await page.locator('.tree-row', { hasText: 'Botão P' }).click();
  const header = page.locator('.review-header-actions').first();
  await expect(header).toBeVisible();
  if (process.env.LAYOUT_SHOTS)
    await page.screenshot({ path: `${process.env.LAYOUT_SHOTS}/review-900.png` });
  for (const b of await header.getByRole('button').all()) {
    const [clipped, box] = await Promise.all([
      b.evaluate((e) => e.scrollWidth - e.clientWidth),
      b.boundingBox(),
    ]);
    expect(clipped).toBeLessThanOrEqual(1);
    expect(box).not.toBeNull();
  }
  const body = page.locator('[data-window="details"] .tool-window-body');
  expect(await body.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
  const footer = page.locator('.review-footer');
  await expect(footer).toBeVisible();
  const fb = (await footer.boundingBox())!;
  for (const item of await footer.locator('span').all()) {
    const b = (await item.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(fb.x + fb.width + 0.5);
  }
});
