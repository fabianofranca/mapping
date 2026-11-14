import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createProject, projectAction } from './helpers';

// CL1 (#1830, finding 1.1): the "Fields" table of the Carousel, in the Catalog dialog (820 px), fits
// without scrolling horizontally, without cutting the Description and without breaking the Type ("enum").

const sizes = [
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
  { width: 1591, height: 1052 },
];

for (const scheme of ['light', 'dark'] as const) {
  for (const size of sizes) {
    test(`Catalog › Carousel: Fields table fits in the dialog (${size.width}×${size.height}, ${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(size);
      await createProject(page, 'Carousel');
      await projectAction(page, 'Specializations');
      await page
        .locator('input[type=file][accept=".zip,application/zip"]')
        .setInputFiles({
          name: 'material3-compose.zip',
          mimeType: 'application/zip',
          buffer: readFileSync('examples/material3-compose.zip'),
        });
      const confirm = page.getByRole('button', { name: 'Apply', exact: true });
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Close', exact: true })
        .click();

      await page.keyboard.press('Control+Shift+9');
      await page.getByRole('tab', { name: 'Components' }).click();
      await page.getByLabel('Library').selectOption({ label: 'Material 3 (Compose)' });
      await page.locator('button[data-type-id="carousel"]').click();
      const dialog = page.getByRole('dialog', { name: 'Carousel' });
      await expect(dialog).toBeVisible();
      const wrap = dialog.locator('.catalog-table-wrap').first();
      await wrap.scrollIntoViewIfNeeded();
      const m = await wrap.evaluate((el) => {
        const cells = [
          ...el.querySelectorAll<HTMLElement>('tbody td:nth-child(3), tbody th'),
        ];
        // Lines of the cell text (the Range ignores the row height, stretched by the Description).
        const lines = (c: HTMLElement) => {
          const range = document.createRange();
          range.selectNodeContents(c);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        };
        const right = el.getBoundingClientRect().right;
        return {
          dialog: el.closest('dialog')?.getBoundingClientRect().width,
          scroll: el.scrollWidth,
          client: el.clientWidth,
          brokenCells: cells.filter((c) => lines(c) > 1).length,
          cutDescriptions: [
            ...el.querySelectorAll<HTMLElement>('tbody td:last-child'),
          ].filter((c) => c.getBoundingClientRect().right > right + 1).length,
        };
      });
      if (process.env.SHOT_DIR !== undefined)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/c${size.width}-${scheme}.png`,
        });
      expect(m.scroll).toBeLessThanOrEqual(m.client);
      expect(m.cutDescriptions).toBe(0);
      expect(m.brokenCells).toBe(0);
    });
  }
}
