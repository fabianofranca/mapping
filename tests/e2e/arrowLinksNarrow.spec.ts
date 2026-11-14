import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// "Linked by arrow" section at 900 px (stage #658, LS1): with the name of the other end, the arrow's and the
// layer's all long, Details do not get a horizontal bar (like R11.12).

test.use({ viewport: { width: 900, height: 720 } });

const LONG = 'Very long name to check that the row does not create a horizontal bar';

async function openExample(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit3');
}

test('long labels in the Linked by arrow section do not create a horizontal bar in Details', async ({
  page,
}) => {
  await openExample(page);
  const tree = page.getByRole('list', { name: 'Marking tree' });
  await tree.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await page.getByRole('button', { name: 'Link to…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Link .* to…$/ });
  await picker.getByRole('option').first().click();
  await expect(picker).toBeHidden();

  // The arrow is born selected: give it a long name.
  await page.getByLabel('Name', { exact: true }).fill(LONG);
  await page.keyboard.press('Enter');
  await tree.getByRole('button', { name: 'Cadastrar', exact: true }).click();

  const section = page.getByRole('region', { name: 'Linked by arrow' });
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
