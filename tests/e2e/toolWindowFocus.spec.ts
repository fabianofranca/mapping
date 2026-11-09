import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Fechar uma janela de ferramenta nunca deixa o foco no body (etapa #295, FJ1).

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
}

const activeTag = (page: Page) => page.evaluate(() => document.activeElement?.tagName);

test('Árvore: fechar pelo atalho e pelo X mantém o foco fora do body', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  const tree = page.getByRole('region', { name: 'Árvore' });
  // Se a Árvore já veio aberta, fecha para começar do canvas.
  if (await tree.isVisible())
    await page.getByRole('button', { name: /Fechar.*Árvore/ }).click();
  await page.getByRole('main', { name: 'Canvas do projeto' }).focus();
  await page.keyboard.press('Control+Shift+1');
  await expect(tree).toBeFocused();
  await tree.getByRole('button').first().focus();
  await page.keyboard.press('Control+Shift+1');
  await expect(tree).toBeHidden();
  expect(await activeTag(page)).not.toBe('BODY');
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeFocused();

  // Pelo X, com a janela aberta pela faixa: o foco volta ao botão da faixa.
  await page.getByRole('button', { name: 'Árvore de marcações', exact: true }).click();
  await tree.getByRole('button').first().focus();
  await page.getByRole('button', { name: /Fechar.*Árvore/ }).click();
  await expect(tree).toBeHidden();
  expect(await activeTag(page)).not.toBe('BODY');
  await expect(
    page.getByRole('button', { name: 'Árvore de marcações', exact: true }),
  ).toBeFocused();
});
