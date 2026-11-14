import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Mark legend in the review at 900×720 (#537): while open, it sits on top of the minimap,
// fully in view.
// pt-BR kept: shared fixture data (exemplo-completo proposal title 'Tela de Perfil e ajuste no Cadastro') asserted by tests/examples

test.use({ viewport: { width: 900, height: 720 } });

test('the mark legend sits on top of the minimap at 900×720', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  for (const key of ['Digit3', 'Digit7', 'Digit2', 'Digit1']) {
    await page.keyboard.press(`Control+Shift+${key}`);
  }
  await page
    .getByRole('button', { name: 'Review: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Read-only').first()).toBeVisible();
  // With the Proposals window enlarged, the canvas gets short and the legend reaches the minimap.
  await page.locator('[data-window="proposals"] [role="tree"]').focus();
  for (let i = 0; i < 24; i += 1) await page.keyboard.press('Control+Shift+ArrowUp');
  await page.getByRole('button', { name: 'Mark legend' }).click();
  const legend = page.locator('.review-legend');
  await expect(legend).toBeVisible();

  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.review-legend')!.getBoundingClientRect();
    const b = document.querySelector('.minimap')!.getBoundingClientRect();
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    if (left >= right || top >= bottom) return null;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return { onLegend: hit?.closest('.review-legend') !== null };
  });
  // The two overlap at 900×720; at the shared point, the legend is what shows.
  expect(overlap).not.toBeNull();
  expect(overlap?.onLegend).toBe(true);

  // Fully in view: no inner scrolling (R13.5; #552, AG4).
  const fit = await legend.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
  }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);

  // A dialog opened with the legend in view sits on top of it (--z-dialog > --z-popover).
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(legend).toBeVisible();
  const legendHit = await legend.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { onLegend: hit?.closest('.review-legend') !== null };
  });
  expect(legendHit.onLegend).toBe(false);
});

// Legend over Proposals (#598, JB1): with the canvas shorter than it, the legend leaves the
// canvas clip and drops over the Proposals window, whole, without going past the canvas
// column or the status bar.
test('the legend covers Proposals when the canvas is shorter than it', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  for (const key of ['Digit3', 'Digit7', 'Digit2', 'Digit1']) {
    await page.keyboard.press(`Control+Shift+${key}`);
  }
  await page
    .getByRole('button', { name: 'Review: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Read-only').first()).toBeVisible();

  // Enlarges the Proposals window until the canvas is shorter than the legend.
  await page.locator('[data-window="proposals"] [role="tree"]').focus();
  for (let i = 0; i < 24; i += 1) await page.keyboard.press('Control+Shift+ArrowUp');
  const toggle = page.getByRole('button', { name: 'Mark legend' });
  await toggle.click();
  const legend = page.locator('.review-legend');
  await expect(legend).toBeVisible();

  const m = await page.evaluate(() => {
    const el = document.querySelector('.review-legend')!;
    const l = el.getBoundingClientRect();
    const canvas = document.querySelector('[data-canvas-area]')!.getBoundingClientRect();
    const status = document.querySelector('.statusbar')!.getBoundingClientRect();
    const win = document
      .querySelector('[data-window="proposals"]')!
      .getBoundingClientRect();
    const left = Math.max(l.left, win.left);
    const right = Math.min(l.right, win.right);
    const top = Math.max(l.top, win.top);
    const bottom = Math.min(l.bottom, win.bottom);
    const overlaps = left < right && top < bottom;
    const hit = overlaps
      ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      : null;
    return {
      scroll: el.scrollHeight,
      client: el.clientHeight,
      legendBottom: l.bottom,
      statusTop: status.top,
      legendRight: l.right,
      legendLeft: l.left,
      canvasRight: canvas.right,
      canvasLeft: canvas.left,
      canvasHeight: canvas.height,
      legendHeight: l.height,
      overlaps,
      onLegend: hit?.closest('.review-legend') !== null && hit !== null,
    };
  });
  // The canvas is shorter than the legend: the premise of the test.
  expect(m.canvasHeight).toBeLessThan(m.legendHeight);
  expect(m.scroll).toBeLessThanOrEqual(m.client);
  expect(m.legendBottom).toBeLessThanOrEqual(m.statusTop);
  expect(m.overlaps).toBe(true);
  expect(m.onLegend).toBe(true);
  expect(m.legendRight).toBeLessThanOrEqual(m.canvasRight + 0.5);
  expect(m.legendLeft).toBeGreaterThanOrEqual(m.canvasLeft - 0.5);

  // A click on the canvas does not close it; Esc closes it and focus returns to the button.
  const box = (await page.locator('[data-canvas-area]').boundingBox())!;
  await page.mouse.click(box.x + box.width - 20, box.y + 20);
  await expect(legend).toBeVisible();
  await legend.getByRole('button', { name: 'Close legend' }).focus();
  await page.keyboard.press('Escape');
  await expect(legend).toBeHidden();
  await expect(toggle).toBeFocused();
});

// Default height of the bottom window in the review (#598, decision 5): at 900×720, with the four
// windows open, the list shows at least 3 whole rows and the shortcuts footer fits in the
// window (the same criterion as R4.14).
test('the Proposals window starts with 3 whole rows and the footer in view', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  for (const key of ['Digit3', 'Digit7', 'Digit2', 'Digit1']) {
    await page.keyboard.press(`Control+Shift+${key}`);
  }
  await page
    .getByRole('button', { name: 'Review: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Read-only').first()).toBeVisible();
  const m = await page.evaluate(() => {
    const win = document.querySelector('[data-window="proposals"]')!;
    const rows = [...win.querySelectorAll<HTMLElement>('[data-row]')];
    let list: HTMLElement | null = rows[0] ?? null;
    while (list && list.scrollHeight <= list.clientHeight + 1 && list.parentElement) {
      list = list.parentElement;
    }
    const area = (list ?? win).getBoundingClientRect();
    const full = rows.filter((row) => {
      const b = row.getBoundingClientRect();
      return b.top >= area.top - 1 && b.bottom <= area.bottom + 1;
    }).length;
    const footer = document.querySelector('.review-footer')!.getBoundingClientRect();
    const box = win.getBoundingClientRect();
    return { full, footerIn: footer.top >= box.top && footer.bottom <= box.bottom + 0.5 };
  });
  expect(m.full).toBeGreaterThanOrEqual(3);
  expect(m.footerIn).toBe(true);
});
