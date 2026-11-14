import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, projectAction } from './helpers';

// Library stage, B5: Catalog opened from the home screen (no project) and from inside the project.

const PACKAGE_DIR = 'tests/fixtures/material3';

/** Zip of the Material 3 package, generated on the fly from the repository folder. */
async function packageZip(extraDoc?: {
  readonly path: string;
  readonly append: string;
}): Promise<Buffer> {
  const zip = new JSZip();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const rel = relative(PACKAGE_DIR, path);
        const bytes = readFileSync(path);
        zip.file(
          rel,
          extraDoc?.path === rel ? `${bytes.toString('utf8')}${extraDoc.append}` : bytes,
        );
      }
    }
  };
  walk(PACKAGE_DIR);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('Open library: list, Button page and playground that redraws', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[data-library-zip]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip(),
  });

  const screen = page.getByRole('main', { name: 'Library catalog' });
  await expect(screen).toBeVisible();
  await expect(screen.locator('.catalog-screen-title')).toHaveText(
    'Material Design 3 (baseline)',
  );

  // Validation at the top and the 15 components in the list, by layer.
  const validation = screen.getByRole('region', { name: 'Package validation' });
  await expect(validation).toContainText('0 error(s) and 2 warning(s)');
  const list = screen.getByRole('navigation', { name: 'Components' });
  await expect(list.locator('button[data-type-id]')).toHaveCount(15);

  // Search filters the list.
  await screen.getByRole('searchbox', { name: 'Search components' }).fill('chip');
  await expect(list.locator('button[data-type-id]')).toHaveCount(1);
  await screen.getByRole('searchbox', { name: 'Search components' }).fill('');
  await expect(list.locator('button[data-type-id]')).toHaveCount(15);

  // Button page.
  await list.locator('button[data-type-id="m3-button"]').click();
  const article = screen.getByRole('article', { name: 'Button' });
  await expect(article).toBeVisible();
  for (const heading of [
    'Document',
    'Properties',
    'Code',
    'Sources',
    'Gallery',
    'Playground',
  ]) {
    await expect(article.getByRole('heading', { name: heading })).toBeVisible();
  }

  // Playground: changing the Label changes the drawn image.
  const drawing = article.getByRole('img', { name: /Drawing of Button/ });
  await expect(drawing).toBeVisible();
  const before = await drawing.getAttribute('src');
  expect(before).toBeTruthy();
  const label = article.getByLabel('Label', { exact: true });
  await label.fill('Confirm purchase');
  await label.press('Enter');
  await expect
    .poll(() =>
      article.getByRole('img', { name: /Drawing of Button/ }).getAttribute('src'),
    )
    .not.toBe(before);

  // Restore values returns to the initial drawing.
  await article.getByRole('button', { name: 'Restore values' }).click();
  await expect
    .poll(() =>
      article.getByRole('img', { name: /Drawing of Button/ }).getAttribute('src'),
    )
    .toBe(before);

  // Back to the home screen.
  await screen.getByRole('button', { name: 'Back to the home screen' }).click();
  await expect(screen).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open library' })).toBeVisible();
});

test('Open library: only the list and the page scroll; link goes back to the top and the notice stays in view', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[data-library-zip]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip({
      path: 'docs/m3-button.md',
      append:
        '\n\n[See the Chip](mapping://material3/m3-chip)\n\n[Missing target](mapping://material3/does-not-exist)\n',
    }),
  });
  const screen = page.getByRole('main', { name: 'Library catalog' });
  await screen
    .getByRole('navigation', { name: 'Components' })
    .locator('button[data-type-id="m3-button"]')
    .click();
  const article = screen.getByRole('article', { name: 'Button' });
  await expect(article).toBeVisible();

  const detail = page.locator('.catalog-detail');
  const scrollDetail = () =>
    detail.evaluate((el) => {
      el.scrollTop = 400;
      return el.scrollTop;
    });
  expect(await scrollDetail()).toBeGreaterThan(0);
  // The window does not scroll: the component page does.
  expect(
    await page.evaluate(
      () => (document.scrollingElement?.scrollHeight ?? 0) <= window.innerHeight,
    ),
  ).toBe(true);

  await article.getByRole('link', { name: 'See the Chip' }).click();
  await expect(screen.getByRole('article', { name: 'Chip' })).toBeVisible();
  await expect.poll(() => detail.evaluate((el) => el.scrollTop)).toBe(0);

  // Link to a missing target: the notice stays inside the visible area.
  await screen
    .getByRole('navigation', { name: 'Components' })
    .locator('button[data-type-id="m3-button"]')
    .click();
  await expect(article).toBeVisible();
  expect(await scrollDetail()).toBeGreaterThan(0);
  await article.getByRole('link', { name: 'Missing target' }).click();
  await expect(page.locator('.catalog-notice')).toBeInViewport();
});

test('inside a project: apply the package, open the Catalog and add a component', async ({
  page,
}) => {
  await createProject(page, 'Screens');
  const host = page.locator('.canvas-host');

  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Settings');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();

  // Only the notes library, applied by default: the Catalog lists the Note and there is no
  // screen component yet. In the Palette, the Note (floating) is added on the canvas.
  await page.keyboard.press('Control+Shift+9');
  await expect(page.locator('button[data-type-id="nota"]')).toBeVisible();
  await expect(page.locator('button[data-type-id="m3-button"]')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Palette' }).click();
  await expect(page.getByRole('button', { name: 'Add to canvas: Nota' })).toHaveText(
    'Add to canvas',
  );
  await page.getByRole('tab', { name: 'Components' }).click();

  await projectAction(page, 'Specializations');
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip(),
  });
  const confirm = page.getByRole('button', { name: 'Apply', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();

  // Components tab, now with two libraries: pick Material 3, and the Button opens the
  // page in a dialog with Add to screen.
  await page
    .locator('.catalog-window select')
    .selectOption({ label: 'Material Design 3 (baseline)' });
  const entry = page.locator('button[data-type-id="m3-button"]');
  await expect(entry).toBeVisible();
  await entry.click();
  const pageDialog = page.getByRole('dialog', { name: 'Button' });
  await expect(pageDialog).toBeVisible();
  await pageDialog.getByRole('button', { name: 'Add to screen' }).click();
  await expect(host).toHaveAttribute('data-components', /^[1-9]/);
});
