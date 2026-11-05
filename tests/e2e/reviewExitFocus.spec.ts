import { expect, test } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Etapa #515 (FN2, achado 1 do relato da FN1): sair da revisão pelo botão leva o foco ao
// Revisar/Continuar da proposta (janela Propostas aberta) ou ao canvas (fechada); nunca ao
// body. A janela troca a árvore da revisão pela lista depois do `review.close()`.

test.use({ viewport: { width: 1280, height: 850 } });

async function openFixture(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

const activeTag = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      proposalAction: el?.hasAttribute('data-proposal-action') ?? false,
      canvas: el?.getAttribute('aria-label') ?? '',
      body: el === document.body,
    };
  });

test('Sair da revisão pelo botão, com Propostas aberta: foco no botão da proposta (4 vezes)', async ({
  page,
}) => {
  await openFixture(page);
  await page.keyboard.press('Control+Shift+7');
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole('button', { name: /^(Revisar|Continuar)/ })
      .first()
      .click();
    const exit = page.getByRole('button', { name: 'Sair da revisão' });
    await expect(exit).toBeVisible();
    await exit.click();
    await expect(page.locator('[data-proposal-action]')).toHaveCount(1);
    await expect.poll(async () => (await activeTag(page)).proposalAction).toBe(true);
    await page.waitForTimeout(600);
    expect((await activeTag(page)).proposalAction).toBe(true);
  }
});

test('Sair da revisão pelo botão, com Propostas fechada: foco no canvas', async ({
  page,
}) => {
  await openFixture(page);
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^(Revisar|Continuar)/ })
    .first()
    .click();
  // Fecha a janela Propostas pelo botão da faixa, com a revisão em curso.
  await page.getByRole('button', { name: /^Esconder Propostas/ }).click();
  await expect(page.locator('[data-window="proposals"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair da revisão' }).click();
  await expect(page.getByRole('button', { name: 'Sair da revisão' })).toHaveCount(0);
  await page.waitForTimeout(600);
  const state = await activeTag(page);
  expect(state.body).toBe(false);
  expect(state.canvas).toBe('Canvas do projeto');
});
