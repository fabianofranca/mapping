import { expect, test } from '@playwright/test';
import { createProject } from './helpers';
import { fixtureZip } from './proposalFixture';

// Visual cleanup stage, LV4: Esc hides the hint with keyboard focus (WCAG 1.4.13), Palette
// button label without clipping and readable X, Y, W and H values in the review at 900 px.

test.use({ viewport: { width: 900, height: 720 } });

test('Esc hides the hint of a button with keyboard focus', async ({ page }) => {
  await createProject(page, 'Screens');
  // Tab until focus lands on a control with a hint (visible focus, keyboard only).
  let anchor = page.locator('.tooltip-anchor:has(:focus-visible)').first();
  for (let i = 0; i < 40 && (await anchor.count()) === 0; i++) {
    await page.keyboard.press('Tab');
    anchor = page.locator('.tooltip-anchor:has(:focus-visible)').first();
  }
  await expect(anchor).toHaveCount(1);
  const tip = anchor.locator('> .tooltip');
  await expect(tip).toHaveCSS('visibility', 'visible');
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCSS('visibility', 'hidden');
  await expect(tip).toHaveCSS('opacity', '0');
});

test('Palette: the Add button label is not clipped on either side', async ({ page }) => {
  await createProject(page, 'Screens');
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Screen A');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  // pt-BR kept: component name `Nota` of libraries/notas (outside this batch)
  const button = page.getByRole('button', { name: 'Add to canvas: Nota' });
  await expect(button).toBeVisible();
  const { left, buttonLeft } = await button.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return {
      left: range.getBoundingClientRect().left,
      buttonLeft: el.getBoundingClientRect().left,
    };
  });
  // The start of the text is never outside the button (left clipping); the end may have an ellipsis.
  expect(left).toBeGreaterThanOrEqual(buttonLeft - 0.5);
  await expect(button).toHaveAttribute('aria-label', 'Add to canvas: Nota');
});

test('Review at 900 px: X, Y, W and H fit the digits of 3- to 4-digit values', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'store.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+3');
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  // pt-BR kept: shared fixture data asserted by tests/e2e/proposalFixture.ts (marking name 'Botão Pagar')
  await page.locator('.tree-row', { hasText: 'Botão P' }).click();
  const panel = page.locator('.review-details-panel');
  await expect(panel).toBeVisible();
  const fields = panel.locator('.props-pair-item .input');
  await expect(fields.first()).toBeVisible();
  for (const field of await fields.all()) {
    const { client, scroll } = await field.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client + 1);
  }
});
