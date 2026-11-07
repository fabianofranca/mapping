import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Seção "Ligado por seta" a 900 px (etapa #658, LS1): com o nome da outra ponta, o da seta e o
// da camada compridos, os Detalhes não ganham barra horizontal (como o R11.12).

test.use({ viewport: { width: 900, height: 720 } });

const LONG = 'Nome muito comprido para conferir que a linha não cria barra horizontal';

async function openExample(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit3');
}

test('rótulos longos na seção Ligado por seta não criam barra horizontal nos Detalhes', async ({
  page,
}) => {
  await openExample(page);
  const tree = page.getByRole('list', { name: 'Árvore de marcações' });
  await tree.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await page.getByRole('button', { name: 'Ligar a…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Ligar .* a…$/ });
  await picker.getByRole('option').first().click();
  await expect(picker).toBeHidden();

  // A seta nasce selecionada: dá um nome comprido a ela.
  await page.getByLabel('Nome', { exact: true }).fill(LONG);
  await page.keyboard.press('Enter');
  await tree.getByRole('button', { name: 'Cadastrar', exact: true }).click();

  const section = page.getByRole('region', { name: 'Ligado por seta' });
  await expect(section).toBeVisible();
  await expect(section.getByRole('listitem')).toHaveCount(1);
  await expect(section.locator('.arrow-link-name')).toHaveText(LONG);
  const panel = page.locator('.tab-panel').filter({ has: section });
  const sizes = await panel.first().evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  const row = await section.getByRole('listitem').evaluate((el) => {
    const right = el.getBoundingClientRect().right;
    return [...el.querySelectorAll('*')].every(
      (child) => child.getBoundingClientRect().right <= right + 0.5,
    );
  });
  expect(row).toBe(true);
});
