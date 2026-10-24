import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposedComponentsFixture';

// Etapa Proposto com componentes (PC1): a visão Proposto desenha os componentes que a
// proposta cria (de um tipo já aplicado e de um pacote que a proposta traz); a Atual não.
// O host do canvas publica `data-components` (quantos componentes foram desenhados).

async function importFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'telas.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

test('Proposto desenha os componentes que a proposta cria; Atual não', async ({
  page,
}) => {
  await importFixture(page);
  const host = page.locator('.canvas-host');

  // Janela Propostas (Ctrl+Shift+7) e Revisar: a revisão começa na visão Proposto.
  await page.keyboard.press('Control+Shift+7');
  await expect(page.getByText('Telas novas').first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();

  const view = page.getByRole('group', { name: 'Visão do canvas' });
  const proposed = view.getByRole('button', { name: 'Proposto', exact: true });
  const current = view.getByRole('button', { name: 'Atual', exact: true });
  await expect(proposed).toHaveAttribute('aria-pressed', 'true');

  // O tipo já aplicado e o do pacote da proposta (lido de proposals/<id>/) são desenhados.
  await expect(host).toHaveAttribute('data-components', '2');

  // Na Atual, nenhum dos dois existe ainda.
  await current.click();
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await expect(host).toHaveAttribute('data-components', '0');

  await proposed.click();
  await expect(host).toHaveAttribute('data-components', '2');
});
