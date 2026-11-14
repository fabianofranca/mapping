import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

// Phase 5.4: visible build id and errors that escape the handlers in Diagnostics.

/** `abc1234 · 2026-10-10` (or `dev · …` in a build without git). */
const BUILD_ID = /^([0-9a-f]{7}|dev) · \d{4}-\d{2}-\d{2}$/;

async function aboutBuildId(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const about = page.getByRole('region', { name: 'About' });
  await expect(about).toBeVisible();
  const id = (await about.getByTestId('build-id').textContent()) ?? '';
  expect(id).toMatch(BUILD_ID);
  await expect(about.getByRole('button', { name: 'Copy' })).toBeVisible();
  return id;
}

test('the build id appears in the Settings "About" and in the status bar', async ({
  page,
}) => {
  await page.goto('/');
  const id = await aboutBuildId(page);
  await page.keyboard.press('Escape');

  await createProject(page, 'Build');
  const bar = page.getByRole('contentinfo', { name: 'Status bar' });
  await expect(bar.getByText(id, { exact: true })).toBeVisible();
});

test('a loose rejected promise appears in Diagnostics', async ({ page }) => {
  await createProject(page, 'Errors');
  await page.evaluate(() => {
    void Promise.reject(new Error('loose promise in the handler'));
  });

  await page.keyboard.press('Control+Shift+Digit6');
  await expect(page.getByText('loose promise in the handler')).toBeVisible();
  await expect(page.getByText('window', { exact: true })).toBeVisible();
});
