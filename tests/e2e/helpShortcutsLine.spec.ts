import { expect, test } from '@playwright/test';

// Ajuda › Atalhos: a linha de cada janela cabe numa linha a 900 px, com o nome mais
// longo (Árvore de marcações). jsdom não tem layout; a medição é no Chromium.

const CASES = [
  { locale: 'pt-BR', text: 'Ir para Árvore de marcações (com o foco, esconde)' },
  { locale: 'en-US', text: 'Go to Marking tree (hides when focused)' },
] as const;

for (const { locale, text } of CASES) {
  test.describe(locale, () => {
    test.use({ locale, viewport: { width: 900, height: 860 } });

    test(`a linha da Árvore cabe numa linha em ${locale}`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /^(Configurações|Settings)$/ }).click();
      await page
        .getByRole('button', {
          name: /^(Ver os atalhos de teclado|View keyboard shortcuts)$/,
        })
        .click();
      const cell = page.getByRole('dialog').getByRole('rowheader', { name: text });
      await expect(cell).toBeVisible();
      const lines = await cell.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        return tops.size;
      });
      expect(lines).toBe(1);
    });
  });
}
