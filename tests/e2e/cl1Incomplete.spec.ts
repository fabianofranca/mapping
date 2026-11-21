import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// CL1 (#2482), G1-4: at the minimum window (900 × 720) with the Details open, the Incomplete reasons
// wrap between words: no word of a reason breaks mid-word.

test.use({ viewport: { width: 900, height: 720 } });

test('Incomplete reasons wrap between words with the Details open at 900 × 720', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'full-example.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/full-example.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  // Tree, Layers, Details and Incomplete open, as in the tester's window.
  for (const key of ['1', '2', '3', '5'])
    await page.keyboard.press(`Control+Shift+${key}`);
  const table = page.locator('.incomplete-table');
  await expect(table).toBeVisible();

  const broken = await table.evaluate((root) => {
    const found: string[] = [];
    for (const cell of root.querySelectorAll<HTMLElement>('.list-cell')) {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        // The layer name under the marking already cuts with an ellipsis (its full text is the title).
        if (node.parentElement?.closest('.incomplete-layer-line')) continue;
        const text = node.textContent ?? '';
        for (const match of text.matchAll(/[^\s-]+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index ?? 0);
          range.setEnd(node, (match.index ?? 0) + match[0].length);
          // A word on one line has one client rect; a mid-word break gives one per line.
          if (range.getClientRects().length > 1) found.push(match[0]);
        }
      }
    }
    return found;
  });
  expect(broken).toEqual([]);
});
