import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Revisão a 900×720 e 1280×720: a coluna Resumo da lista mostra os contadores inteiros, e
// o diálogo Comparar mantém as ações da troca à vista, sem rolar o corpo.

async function openReview(page: Page) {
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
}

for (const size of [
  { width: 900, height: 720 },
  { width: 1280, height: 720 },
]) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('a coluna Resumo não corta os contadores', async ({ page }) => {
      await openReview(page);
      const counts = page.locator('.review-row-summary .review-counts').first();
      await expect(counts).toBeVisible();
      const { cell, content } = await counts.evaluate((e) => ({
        cell: e.parentElement!.clientWidth,
        content: e.scrollWidth,
      }));
      expect(cell).toBeGreaterThanOrEqual(content);
    });

    test('Aceitar/Rejeitar a troca ficam à vista no Comparar, sem rolar', async ({
      page,
    }) => {
      await openReview(page);
      await page.locator('.tree-row', { hasText: 'Carrinho' }).first().click();
      await page
        .getByRole('button', { name: /Arquivo da imagem/ })
        .first()
        .click();
      await page
        .getByRole('button', { name: /^Comparar/ })
        .first()
        .click();
      const accept = page.getByRole('button', { name: /^Aceitar a troca/ });
      await expect(accept).toBeVisible();
      // As ações não ficam dentro do corpo que rola (rodapé fixo do diálogo) e cabem na janela.
      await expect(
        page.locator('dialog[open] .dialog-body').getByRole('button', {
          name: /^Aceitar a troca/,
        }),
      ).toHaveCount(0);
      const box = await accept.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    });
  });
}
