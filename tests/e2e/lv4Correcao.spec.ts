import { expect, test } from '@playwright/test';
import { createProject } from './helpers';
import { fixtureZip } from './proposalFixture';

// Etapa limpeza visual, LV4: Esc esconde a dica com foco de teclado (WCAG 1.4.13), rótulo
// do botão da Paleta sem corte e valores de X, Y, L e A legíveis na revisão a 900 px.

test.use({ viewport: { width: 900, height: 860 } });

test('Esc esconde a dica de um botão com foco de teclado', async ({ page }) => {
  await createProject(page, 'Telas');
  // Tab até o foco cair num controle com dica (foco visível, só de teclado).
  let anchor = page.locator('.tooltip-anchor:has(:focus-visible)').first();
  for (let i = 0; i < 40 && (await anchor.count()) === 0; i++) {
    await page.keyboard.press('Tab');
    anchor = page.locator('.tooltip-anchor:has(:focus-visible)').first();
  }
  await expect(anchor).toHaveCount(1);
  const tip = anchor.locator('> .tooltip');
  await expect(tip).toHaveCSS('visibility', 'visible');
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCSS('visibility', 'hidden');
  await expect(tip).toHaveCSS('opacity', '0');
});

test('Paleta: o rótulo do botão Adicionar não é cortado dos dois lados', async ({
  page,
}) => {
  await createProject(page, 'Telas');
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Tela A');
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Paleta' }).click();
  const button = page.getByRole('button', { name: 'Adicionar no canvas: Nota' });
  await expect(button).toBeVisible();
  const { left, buttonLeft } = await button.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return {
      left: range.getBoundingClientRect().left,
      buttonLeft: el.getBoundingClientRect().left,
    };
  });
  // O início do texto nunca fica fora do botão (corte à esquerda); o fim pode ter reticências.
  expect(left).toBeGreaterThanOrEqual(buttonLeft - 0.5);
  await expect(button).toHaveAttribute('aria-label', 'Adicionar no canvas: Nota');
});

test('Revisão a 900 px: X, Y, L e A cabem os dígitos de valores de 3 a 4 dígitos', async ({
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
  await page.locator('.tree-row', { hasText: 'Botão P' }).click();
  const panel = page.locator('.review-details-panel');
  await expect(panel).toBeVisible();
  const fields = panel.locator('.props-pair-item .input');
  await expect(fields.first()).toBeVisible();
  for (const field of await fields.all()) {
    const { client, scroll } = await field.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client + 1);
  }
});
