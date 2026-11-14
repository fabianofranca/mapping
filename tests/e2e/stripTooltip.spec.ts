import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

// The tooltip of the side strip buttons comes out beside the button, not below it, where it covered the
// content of the open window (the Catalog search, #497, AC1).

test('the left strip tooltip shows to the right of the button, without going under it', async ({
  page,
}) => {
  await createProject(page, 'Strip');
  const button = page.locator('.tool-strip-left [data-strip-window]').first();
  await button.hover();
  const tip = button
    .locator('xpath=ancestor::*[contains(@class,"tooltip-anchor")]')
    .locator('.tooltip');
  await expect(tip).toBeVisible();
  const [b, t] = await Promise.all([button.boundingBox(), tip.boundingBox()]);
  if (!b || !t) throw new Error('no geometry');
  expect(t.x).toBeGreaterThanOrEqual(b.x + b.width);
  // Centered on the button's vertical: it does not drop over the next button or over the window.
  expect(Math.abs(t.y + t.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(2);
});
