import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposedComponentsFixture';

// Proposed-with-components stage (PC1): the Proposed view draws the components that the
// proposal creates (of an already applied type and of a package the proposal brings); Current does not.
// The canvas host publishes `data-components` (how many components were drawn).
// pt-BR kept: shared fixture data (proposal title 'Telas novas') asserted by tests/e2e/proposedComponentsFixture.ts

async function importFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'screens.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

test('Proposed draws the components that the proposal creates; Current does not', async ({
  page,
}) => {
  await importFixture(page);
  const host = page.locator('.canvas-host');

  // Proposals window (Ctrl+Shift+7) and Review: the review starts in the Proposed view.
  await page.keyboard.press('Control+Shift+7');
  await expect(page.getByText('Telas novas').first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await expect(page.getByText('Read-only').first()).toBeVisible();

  const view = page.getByRole('group', { name: 'Canvas view' });
  const proposed = view.getByRole('button', { name: 'Proposed', exact: true });
  const current = view.getByRole('button', { name: 'Current', exact: true });
  await expect(proposed).toHaveAttribute('aria-pressed', 'true');

  // The already applied type and the one from the proposal package (read from proposals/<id>/) are drawn.
  await expect(host).toHaveAttribute('data-components', '2');

  // In Current, neither of the two exists yet.
  await current.click();
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await expect(host).toHaveAttribute('data-components', '0');

  await proposed.click();
  await expect(host).toHaveAttribute('data-components', '2');
});
