import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Closing a tool window never leaves focus on the body (stage #295, FJ1).
// pt-BR kept: shared fixture data (proposalFixture zip) asserted by tests/examples and tests/store

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

const activeTag = (page: Page) => page.evaluate(() => document.activeElement?.tagName);

test('Tree: closing by shortcut and by the X keeps focus off the body', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  const tree = page.getByRole('region', { name: 'Tree' });
  // If the Tree came open already, close it to start from the canvas.
  if (await tree.isVisible())
    await page.getByRole('button', { name: /Close.*Marking tree/ }).click();
  await page.getByRole('main', { name: 'Project canvas' }).focus();
  await page.keyboard.press('Control+Shift+1');
  await expect(tree).toBeFocused();
  await tree.getByRole('button').first().focus();
  await page.keyboard.press('Control+Shift+1');
  await expect(tree).toBeHidden();
  expect(await activeTag(page)).not.toBe('BODY');
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeFocused();

  // By the X, with the window opened from the strip: focus returns to the strip button.
  await page.getByRole('button', { name: 'Marking tree', exact: true }).click();
  await tree.getByRole('button').first().focus();
  await page.getByRole('button', { name: /Close.*Marking tree/ }).click();
  await expect(tree).toBeHidden();
  expect(await activeTag(page)).not.toBe('BODY');
  await expect(
    page.getByRole('button', { name: 'Marking tree', exact: true }),
  ).toBeFocused();
});
