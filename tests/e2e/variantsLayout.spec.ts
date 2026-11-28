import { expect, test, type Page } from '@playwright/test';
import { addImage, createProject } from './helpers';

// Variants section of the container Details (stage #2034, CL1, findings 3 and 4): a long row or menu
// item name ends with an ellipsis, and the "Link to variant…" menu stays inside Details.

const LONG_A =
  'Tablet landscape layout with a very long name that has to be cut with an ellipsis';
const LONG_B =
  'Watch face unlinked candidate also with a very long name to test the menu width';

/** Selects the Tree row at `index` and renames the container through the Details field. */
async function renameRow(page: Page, index: number, name: string): Promise<void> {
  await page
    .getByRole('list', { name: 'Marking tree' })
    .getByRole('listitem')
    .nth(index)
    .getByRole('button')
    .first()
    .click();
  const field = page.getByRole('textbox', { name: 'Name', exact: true }).first();
  await field.fill(name);
  await field.press('Enter');
}

async function setup(page: Page): Promise<void> {
  await createProject(page, 'Variants');
  for (let i = 0; i < 3; i++) await addImage(page);
  const details = page.getByRole('button', { name: 'Details', exact: true });
  if ((await details.getAttribute('aria-pressed')) !== 'true') await details.click();
  await renameRow(page, 0, 'Compact');
  await renameRow(page, 1, LONG_A);
  await renameRow(page, 2, LONG_B);
  await page
    .getByRole('list', { name: 'Marking tree' })
    .getByRole('button', { name: 'Compact', exact: true })
    .click();
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
]) {
  test(`variants row and link menu fit Details at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await setup(page);
    await page.getByRole('button', { name: 'Link to variant…' }).click();
    await page.getByRole('menuitem').filter({ hasText: 'Tablet landscape' }).click();
    const row = page.locator('.variants-row').first();
    const measure = await row.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      ellipsis: getComputedStyle(el).textOverflow,
    }));
    expect(measure.scroll).toBeLessThanOrEqual(measure.client);
    await page.getByRole('button', { name: 'Link to variant…' }).click();
    const list = page.locator('.menu-list').first();
    const box = await list.boundingBox();
    const panel = await page.locator('.variants-section').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(panel!.width + 1);
  });
}
