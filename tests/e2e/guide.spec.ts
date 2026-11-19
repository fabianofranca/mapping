import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLE_DIR } from '../../scripts/guide/exampleDir';
import { watchViolations } from './helpers';

// Interactive guide (`dist/guide/`) and the example project of the home screen. They run against the
// final `dist/` (see playwright.config.ts): `npm run build` publishes `guide/` next to
// `index.html`. The browser locale is en-US, so the guide opens in English; pt-BR comes from the
// saved `mapping.locale` (the app's setting) or from a pt browser locale. The names of the example's
// screens, layers and perspectives are read from the example project, the guide's source of data.

interface ExampleData {
  readonly containers: readonly { id: string; name?: string; file: string | null }[];
  readonly layers: readonly { id: string; name: string }[];
  readonly markings: readonly { name?: string; containerId: string | null }[];
  readonly perspectives: readonly {
    name: string;
    items: readonly { root: string }[];
    hiddenLayers: readonly string[];
  }[];
}
const example = JSON.parse(
  readFileSync(join(EXAMPLE_DIR, 'mapping.json'), 'utf8'),
) as ExampleData;
const layerName = (id: string) => example.layers.find((l) => l.id === id)?.name ?? '';
const containerLabel = (c: ExampleData['containers'][number], noPhoto: string) =>
  `${c.name ?? c.file ?? c.id}${c.file ? '' : ` (${noPhoto})`}`;
const perspectiveTabs = (index: number, noPhoto: string) =>
  example.containers
    .filter((c) => example.perspectives[index]?.items.some((i) => i.root === c.id))
    .map((c) => containerLabel(c, noPhoto));

const STEPS = 14;
const EXAMPLE_PROPOSAL = 'Profile screen and Sign up tweak';

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
  test('loads in English with no error or CSP violation and Next walks through the 14 steps', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const violations = await watchViolations(page);
    await page.goto('/guide/');
    await expect(page).toHaveTitle('Mapping guide');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const steps = page.locator('#steps button');
    await expect(steps).toHaveCount(STEPS);
    const next = page.getByRole('button', { name: 'Next', exact: true });
    const previous = page.getByRole('button', { name: 'Previous', exact: true });
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

  test('opens in English with an English browser locale', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/guide/');
    await expect(page).toHaveTitle('Mapping guide');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-locale', 'en-US');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mapping guide');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    await expect(page.locator('#steps button').first()).toContainText(
      'Containers and markings',
    );
    // The shortcut table shows only the English rows.
    await expect(page.locator('tr[data-locale="en-US"]').first()).toBeVisible();
    await expect(page.locator('tr[data-locale="pt-BR"]').first()).toBeHidden();
    // The lock tag drawn on the canvas follows the locale too (not only the inspector flag).
    await page
      .locator('#steps button', { hasText: 'Locked and position to review' })
      .click();
    await expect(page.locator('.lock-tag').first()).toHaveText('locked');
    await context.close();
  });

  test('opens in pt-BR when the app saved mapping.locale = pt-BR', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mapping.locale', 'pt-BR'));
    await page.goto('/guide/');
    await expect(page).toHaveTitle('Guia do Mapping');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Guia do Mapping');
    await expect(
      page.getByRole('button', { name: 'Próximo', exact: true }),
    ).toBeVisible();
    await expect(page.locator('#steps button').first()).toContainText(
      'Containers e marcações',
    );
    await expect(page.locator('tr[data-locale="pt-BR"]').first()).toBeVisible();
    await expect(page.locator('tr[data-locale="en-US"]').first()).toBeHidden();
    await page
      .locator('#steps button', { hasText: 'Trancada e posição a revisar' })
      .click();
    await expect(page.locator('.lock-tag').first()).toHaveText('trancada');
  });

  test('a Portuguese browser locale opens it in pt-BR, and the saved language wins', async ({
    browser,
  }) => {
    const pt = await browser.newContext({ locale: 'pt-PT' });
    const ptPage = await pt.newPage();
    await ptPage.goto('/guide/');
    await expect(ptPage).toHaveTitle('Guia do Mapping');
    await pt.close();

    const en = await browser.newContext({ locale: 'pt-BR' });
    const enPage = await en.newPage();
    await enPage.addInitScript(() => localStorage.setItem('mapping.locale', 'en-US'));
    await enPage.goto('/guide/');
    await expect(enPage).toHaveTitle('Mapping guide');
    await en.close();
  });

  test('the old guia/ address redirects to the guide', async ({ page }) => {
    await page.goto('/guia/');
    await expect(page).toHaveURL(/\/guide\/$/);
    await expect(page).toHaveTitle('Mapping guide');
  });

  test('clicking a marking shows the annotations in the inspector', async ({ page }) => {
    await page.goto('/guide/');
    const first = example.containers[0];
    const name =
      example.markings.find((m) => m.containerId === first?.id && m.name)?.name ?? '';
    await page.getByRole('button', { name, exact: true }).first().click();
    await expect(page.locator('#insp h2')).toHaveText(name);
    await expect(page.locator('#insp .ann').first()).toBeVisible();
  });

  test('step 14 opens in the first perspective and the picker switches the tabs and chips', async ({
    page,
  }) => {
    await page.goto('/guide/');
    const tabs = page.locator('#tabs button');
    const chips = page.locator('#layers button');
    const picker = page.getByLabel('Perspective', { exact: true });
    const [first, second] = example.perspectives;
    const noPhoto = 'container with no photo';

    // In Main (steps 1 to 13) everything shows.
    await expect(picker).toHaveValue('');
    await expect(tabs).toHaveCount(example.containers.length);

    await page.locator('#steps button').nth(13).click();
    await expect(page.locator('#lesson h3')).toHaveText('Perspectives');
    await expect(picker.locator('option:checked')).toHaveText(first?.name ?? '');
    await expect(tabs).toHaveText(perspectiveTabs(0, noPhoto));
    for (const id of first?.hiddenLayers ?? []) {
      await expect(chips.filter({ hasText: layerName(id) })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }

    await picker.selectOption({ label: second?.name ?? '' });
    await expect(tabs).toHaveText(perspectiveTabs(1, noPhoto));
    await expect(page.locator('#layers button[aria-pressed=false]')).toHaveCount(0);

    await picker.selectOption({ label: 'Full' });
    await expect(tabs).toHaveCount(example.containers.length);
    await tabs.first().click();
    await expect(page.locator('#layers button[aria-pressed=false]')).toHaveCount(0);
  });

  test('follows the theme chosen in the app (mapping.theme)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mapping.theme', 'dark'));
    await page.goto('/guide/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('home screen: the Interactive guide link opens the page in another tab', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Interactive guide' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await expect(popup).toHaveURL(/\/guide\/index\.html$/);
    await expect(popup).toHaveTitle('Mapping guide');
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
    await expect(popup).toHaveURL(/\/guide\/index\.html$/);
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
        name: 'example.zip',
        mimeType: 'application/zip',
        buffer: readFileSync(`${EXAMPLE_DIR}.zip`),
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
