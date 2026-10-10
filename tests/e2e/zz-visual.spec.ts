import { expect, test } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// TEMPORÁRIO (não versionar): capturas para conferência visual.
const OUT = '/tmp/claude-0/-home-user-mapping/16d499c0-e1f8-55b4-ab7c-0c8640c51dd3/scratchpad/shots';

for (const theme of ['light', 'dark'] as const) {
  test(`visual ${theme}`, async ({ page }, info) => {
    const tag = `${info.project.name}-${theme}`;
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await page.locator('input[type=file][accept^=".zip"]').setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
    await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${tag}-01-editor.png` });
    const mobile = info.project.name === 'mobile';
    if (mobile) {
      await page.getByRole('button', { name: /^Painéis/ }).click();
      await page.getByRole('button', { name: /^Propostas/ }).click();
    } else {
      await page.keyboard.press('Control+Shift+7');
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${tag}-02-list.png` });
    await page.getByRole('button', { name: /^Revisar/ }).first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${tag}-03-review.png` });
    if (mobile) return;
    await page.getByRole('treeitem', { name: 'Botão Pagar' }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${tag}-04-item.png` });
    await page.getByRole('button', { name: 'Aceitar Checkout' }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole('treeitem', { name: 'Campo Cupom' }).click();
    await page.getByRole('button', { name: 'Rejeitar Campo Cupom' }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${tag}-05-decided.png` });
    await page.keyboard.press('p');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${tag}-06-current.png` });
    await page.keyboard.press('p');
    await page.keyboard.press('l');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${tag}-07-legend.png` });
    await page.keyboard.press('l');
    await page.getByRole('treeitem', { name: 'Carrinho' }).click();
    await page.getByRole('button', { name: 'Comparar antes e depois' }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${tag}-08-compare.png` });
  });
}
