import { expect, test, type Page } from '@playwright/test';
import { watchViolations } from './helpers';

// Guia interativo (`dist/guia/`) e projeto de exemplo da tela inicial. Rodam contra o
// `dist/` final (ver playwright.config.ts): o `npm run build` publica `guia/` ao lado do
// `index.html`.

const STEPS = 12;
const EXAMPLE_PROPOSAL = 'Tela de Perfil e ajuste no Cadastro';

/** Erros de console e de página (uma falha de script do guia aparece aqui). */
function watchErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

test.describe('guia interativo', () => {
  test('carrega sem erro nem violação da CSP e o Próximo percorre os 12 passos', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const violations = await watchViolations(page);
    await page.goto('/guia/');
    await expect(page).toHaveTitle('Guia do Mapping');

    const steps = page.locator('#steps button');
    await expect(steps).toHaveCount(STEPS);
    const next = page.getByRole('button', { name: 'Próximo', exact: true });
    const previous = page.getByRole('button', { name: 'Anterior', exact: true });
    await expect(previous).toBeDisabled();
    for (let step = 0; step < STEPS; step++) {
      await expect(steps.nth(step)).toHaveClass(/\bon\b/);
      await expect(page.locator('#lesson h3')).toHaveText(
        (await steps.nth(step).locator('span').nth(1).textContent()) ?? '',
      );
      // Cada passo desenha a tela dele, com as marcações.
      await expect(page.locator('#svg .mk').first()).toBeVisible();
      if (step < STEPS - 1) await next.click();
    }
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(steps.nth(STEPS - 2)).toHaveClass(/\bon\b/);

    expect(errors).toEqual([]);
    expect(violations()).toEqual([]);
  });

  test('clicar numa marcação mostra as anotações no inspetor', async ({ page }) => {
    await page.goto('/guia/');
    await page.getByRole('button', { name: 'Formulário', exact: true }).click();
    await expect(page.locator('#insp h2')).toHaveText('Formulário');
    await expect(page.locator('#insp .ann').first()).toBeVisible();
  });

  test('segue o tema escolhido na app (mapping.theme)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mapping.theme', 'dark'));
    await page.goto('/guia/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('tela inicial: o link Guia interativo abre a página em outra aba', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Guia interativo' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await expect(popup).toHaveURL(/\/guia\/index\.html$/);
    await expect(popup).toHaveTitle('Guia do Mapping');
  });

  test('Ajuda: a primeira seção é o guia, com o link em outra aba', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
    const link = page.getByRole('link', { name: 'Abrir o guia interativo' });
    await expect(link).toBeVisible();
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await expect(popup).toHaveURL(/\/guia\/index\.html$/);
  });
});

test.describe('projeto de exemplo', () => {
  test('Abrir projeto de exemplo abre o editor com a proposta pendente para revisar', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir projeto de exemplo' }).click();
    await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();

    // A proposta de exemplo chega na janela Propostas (Ctrl+Shift+7) e abre para revisão.
    await page.keyboard.press('Control+Shift+7');
    await expect(page.getByText(EXAMPLE_PROPOSAL).first()).toBeVisible();
    await page
      .getByRole('button', { name: /^Revisar/ })
      .first()
      .click();
    await expect(page.getByText('Somente leitura').first()).toBeVisible();
  });
});
