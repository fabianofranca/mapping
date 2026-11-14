import { expect, test } from '@playwright/test';

// Help › Shortcuts: each window's row fits on one line at 900 px, with the longest
// name (Marking tree). jsdom has no layout; the measurement is in Chromium.

const CASES = [
  // pt-BR kept: the object of the test is the width of the pt-BR text of the shortcuts row
  { locale: 'pt-BR', text: 'Ir para Árvore de marcações (com o foco, esconde)' },
  { locale: 'en-US', text: 'Go to Marking tree (hides when focused)' },
] as const;

for (const { locale, text } of CASES) {
  test.describe(locale, () => {
    test.use({ locale, viewport: { width: 900, height: 720 } });

    test(`the Tree row fits on one line in ${locale}`, async ({ page }) => {
      await page.goto('/');
      // pt-BR kept: the same spec runs in pt-BR, where the button is `Configurações`
      await page.getByRole('button', { name: /^(Configurações|Settings)$/ }).click();
      await page
        // pt-BR kept: the same spec runs in pt-BR
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
