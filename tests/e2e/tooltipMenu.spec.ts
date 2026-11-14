import { expect, test } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// The side bar tooltip does not cover the open project menu (900 px).
// pt-BR kept: shared fixture data (proposalFixture zip) asserted by tests/examples and tests/store

test.use({ viewport: { width: 900, height: 720 } });

test('side bar tooltip disappears while the project menu is open', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  const strip = page.locator('.tool-strip-left .tooltip-anchor').first();
  // Without the menu: the tooltip shows on hover.
  await strip.hover();
  await expect(strip.locator('.tooltip')).toBeVisible();

  await page.getByRole('button', { name: /: project actions$/ }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Close project', exact: true }),
  ).toBeVisible();
  await strip.hover();
  await expect(strip.locator('.tooltip')).toBeHidden();
  // The menu item stays free for the click (nothing covers it).
  const item = page.getByRole('menuitem', { name: 'Close project', exact: true });
  const box = (await item.boundingBox())!;
  const covered = await item.evaluate(
    (el, pt) => !el.contains(document.elementFromPoint(pt.x, pt.y)),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(covered).toBe(false);
});
