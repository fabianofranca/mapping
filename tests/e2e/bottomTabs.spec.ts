import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Janela inferior: as quatro abas ficam visíveis e clicáveis em 900 e 1280 px, com
// qualquer uma ativa; as ações do cabeçalho nunca cobrem outra aba.

const SHOTS = process.env.LAYOUT_SHOTS ?? '';
const TABS = ['Lista', 'Incompletas', 'Diagnóstico', 'Propostas'] as const;
// Atalho de cada aba (Ctrl+Shift+N).
const KEYS: Record<(typeof TABS)[number], string> = {
  Lista: '4',
  Incompletas: '5',
  Diagnóstico: '6',
  Propostas: '7',
};

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  // Árvore, Camadas e Detalhes abertos: o centro fica o mais estreito possível.
  for (const key of ['1', '2', '3']) await page.keyboard.press(`Control+Shift+${key}`);
}

for (const width of [900, 1280]) {
  test(`as quatro abas da janela inferior ficam à vista em ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    for (const active of TABS) {
      await page.keyboard.press(`Control+Shift+${KEYS[active]}`);
      const tablist = page
        .getByRole('tablist')
        .filter({ has: page.getByRole('tab', { name: 'Diagnóstico' }) });
      await expect(tablist).toBeVisible();
      await expect(
        tablist.getByRole('tab', { name: active, exact: false }),
      ).toHaveAttribute('aria-selected', 'true');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tabs-${width}-${active}.png` });
      // Cabem sem rolagem horizontal interna.
      expect(await tablist.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
      // Nada cobre nenhuma aba: o elemento no centro dela é ela mesma (ou um filho).
      for (const name of TABS) {
        const tab = tablist.getByRole('tab', { name, exact: false });
        const box = await tab.boundingBox();
        expect(box, `${name} com ${active} ativa`).not.toBeNull();
        const covered = await tab.evaluate(
          (el, pt) => {
            const hit = document.elementFromPoint(pt.x, pt.y);
            return hit === null || !el.contains(hit);
          },
          { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
        );
        expect(covered, `${name} coberta com ${active} ativa`).toBe(false);
      }
    }
  });
}
