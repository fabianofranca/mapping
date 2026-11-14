import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { watchViolations } from './helpers';

// Interactive guide (`dist/guia/`) and the example project of the home screen. They run against the
// final `dist/` (see playwright.config.ts): `npm run build` publishes `guia/` next to
// `index.html`.
// pt-BR kept: the guide is in pt-BR only (its titles, steps, layer and tab names are asserted verbatim),
// and so is the example project (proposal title)

const STEPS = 14;
const EXAMPLE_PROPOSAL = 'Tela de Perfil e ajuste no Cadastro';

/** Console and page errors (a script failure in the guide shows up here). */
function watchErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

test.describe('interactive guide', () => {
  test('loads with no error or CSP violation and Next walks through the 14 steps', async ({
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
      // Each step draws its screen, with the markings.
      await expect(page.locator('#svg .mk').first()).toBeVisible();
      if (step < STEPS - 1) await next.click();
    }
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(steps.nth(STEPS - 2)).toHaveClass(/\bon\b/);

    expect(errors).toEqual([]);
    expect(violations()).toEqual([]);
  });

  test('clicking a marking shows the annotations in the inspector', async ({ page }) => {
    await page.goto('/guia/');
    await page.getByRole('button', { name: 'Formulário', exact: true }).click();
    await expect(page.locator('#insp h2')).toHaveText('Formulário');
    await expect(page.locator('#insp .ann').first()).toBeVisible();
  });

  test('step 14 opens in the Dados perspective and the picker switches the tabs and chips', async ({
    page,
  }) => {
    await page.goto('/guia/');
    const tabs = page.locator('#tabs button');
    const chips = page.locator('#layers button');
    const picker = page.getByLabel('Perspectiva', { exact: true });

    // In Principal (steps 1 to 13) everything shows.
    await expect(picker).toHaveValue('');
    await expect(tabs).toHaveCount(4);

    await page.locator('#steps button').nth(13).click();
    await expect(page.locator('#lesson h3')).toHaveText('Perspectivas');
    await expect(picker.locator('option:checked')).toHaveText('Dados');
    await expect(tabs).toHaveText(['Cadastro', 'Login']);
    for (const name of ['Componentes', 'Eventos', 'Dúvidas']) {
      await expect(chips.filter({ hasText: name })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    await expect(chips.filter({ hasText: 'Telas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await picker.selectOption({ label: 'Material 3' });
    await expect(tabs).toHaveText([
      'Configurações (container sem foto)',
      'Detalhes do pedido (container sem foto)',
    ]);
    await expect(page.locator('#layers button[aria-pressed=false]')).toHaveCount(0);

    await picker.selectOption({ label: 'Principal' });
    await expect(tabs).toHaveCount(4);
    await page.getByRole('tab', { name: 'Cadastro' }).click();
    await expect(page.locator('#layers button[aria-pressed=false]')).toHaveCount(0);
  });

  test('follows the theme chosen in the app (mapping.theme)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mapping.theme', 'dark'));
    await page.goto('/guia/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('home screen: the Interactive guide link opens the page in another tab', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Interactive guide (in Portuguese)' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await expect(popup).toHaveURL(/\/guia\/index\.html$/);
    await expect(popup).toHaveTitle('Guia do Mapping');
  });

  test('Help: the first section is the guide, with the link in another tab', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    const link = page.getByRole('link', { name: 'Open the interactive guide' });
    await expect(link).toBeVisible();
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await expect(popup).toHaveURL(/\/guia\/index\.html$/);
  });
});

test.describe('example project', () => {
  test('Open zip with the example opens the editor with the pending proposal to review', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
      .setInputFiles({
        name: 'exemplo-completo.zip',
        mimeType: 'application/zip',
        buffer: readFileSync('examples/exemplo-completo.zip'),
      });
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();

    // The example proposal arrives in the Proposals window (Ctrl+Shift+7) and opens for review.
    await page.keyboard.press('Control+Shift+7');
    await expect(page.getByText(EXAMPLE_PROPOSAL).first()).toBeVisible();
    await page
      .getByRole('button', { name: /^Review/ })
      .first()
      .click();
    await expect(page.getByText('Read-only').first()).toBeVisible();
  });
});
