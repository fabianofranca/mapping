import { expect, test, type Locator, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Layout in a narrow window (1098 × 698, DPR 1.25, Tree and Details open): tabs,
// actions and list rows must not overlap or produce horizontal scrolling.

test.use({ viewport: { width: 1098, height: 860 }, deviceScaleFactor: 1.25 });

// Folder for the screenshots (optional, for manual checking only).
const SHOTS = process.env.LAYOUT_SHOTS ?? '';

type Box = { x: number; y: number; width: number; height: number };

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'store.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+1');
  await page.keyboard.press('Control+Shift+3');
}

// A font wider than any machine's (CI uses other fonts): the table must not depend on it.
async function widerFont(page: Page): Promise<void> {
  // The CSP forbids inline <style>; the CSSOM (adopted sheet) is allowed.
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.list-table { letter-spacing: 0.08em; font-size: 1.1em }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/layout-${name}.png` });
}

async function boxes(loc: Locator): Promise<Box[]> {
  const out: Box[] = [];
  for (const el of await loc.all()) {
    const b = await el.boundingBox();
    if (b) out.push(b);
  }
  return out;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5
  );
}

function expectNoOverlap(list: readonly Box[]): void {
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      expect(overlaps(list[i]!, list[j]!)).toBe(false);
}

test('bottom window tabs do not go under the actions', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+6');
  const win = page.locator('[data-window="diagnostics"]');
  await expect(win).toBeVisible();
  await shot(page, 'diagnostics');
  const tablist = win.getByRole('tablist');
  const strip = (await boxes(tablist))[0]!;
  // Window too narrow even for the tabs: only they scroll (nothing is drawn outside the strip).
  await expect(tablist).toHaveCSS('overflow-x', 'auto');
  const actions = await boxes(win.locator('.tool-window-head > :not(.tool-window-tabs)'));
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) {
    // Next to the tabs or, without width, on a line below (bottomTabs.spec.ts).
    expect(overlaps(a, strip)).toBe(false);
  }
});

test('bottom window at 900 px: whole tabs, actions covering none', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await open(page);
  await page.keyboard.press('Control+Shift+6');
  const win = page.locator('[data-window="diagnostics"]');
  await expect(win).toBeVisible();
  const tablist = win.getByRole('tablist');
  expect(await tablist.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
  const tabs = await boxes(win.getByRole('tab'));
  for (const a of await boxes(win.locator('.tool-window-head > :not(.tool-window-tabs)')))
    for (const tab of tabs) expect(overlaps(a, tab)).toBe(false);
});

test('the chosen tab stays visible when the tab list is narrowed afterwards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await open(page);
  await page.keyboard.press('Control+Shift+6');
  // The tabs belong to the same bottom window: the list is the one with the Diagnostics tab.
  const tablist = page
    .getByRole('tablist')
    .filter({ has: page.getByRole('tab', { name: 'Diagnostics' }) });
  await expect(tablist).toBeVisible();
  // Wide: all tabs fit and Diagnostics is chosen.
  expect(await tablist.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
  // Narrows the strip afterwards (what a smaller window does); the CSP forbids inline <style>,
  // the CSSOM (adopted sheet) is allowed.
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      '.tool-window-bottom .tool-window-tabs { flex: none; width: 150px }',
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  await expect
    .poll(async () => tablist.evaluate((e) => e.scrollWidth > e.clientWidth))
    .toBe(true);
  await expect
    .poll(async () => {
      const strip = (await boxes(tablist))[0]!;
      const tab = (await boxes(tablist.getByRole('tab', { selected: true })))[0]!;
      return tab.x >= strip.x - 0.5 && tab.x + tab.width <= strip.x + strip.width + 0.5;
    })
    .toBe(true);
});

test('Proposals window and review list without overlapping texts', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+7');
  const row = page.locator('.proposal-row').first();
  await expect(row).toBeVisible();
  await shot(page, 'proposals');
  const title = (await row.locator('.proposal-row-title b').boundingBox())!;
  expect(title.width).toBeGreaterThan(60);
  expectNoOverlap(
    await boxes(
      row.locator(
        '.proposal-row-title b, .proposal-row-title .flag, .proposal-row-meta, .proposal-row-counts, .proposal-row-action',
      ),
    ),
  );

  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  // pt-BR kept: shared fixture data (proposal title) asserted by tests/e2e/proposalFixture.ts
  await page.getByRole('button', { name: 'Accept Checkout a partir do Figma' }).click();
  await page
    .getByRole('button', { name: /^Apply accepted/ })
    .first()
    .click();
  await expect(page.getByText(/change\(s\) applied/).first()).toBeVisible();
  await shot(page, 'review');
  for (const r of await page.locator('.review-row').all()) {
    const cells = await boxes(r.locator(':scope > *'));
    expectNoOverlap(cells);
    // What does not fit in the name is clipped in the label, never drawn over the summary.
    const clipped = await r
      .locator('.review-row-name')
      .evaluate((e) => e.scrollWidth - e.clientWidth);
    expect(clipped).toBeLessThanOrEqual(1);
    const rb = (await r.boundingBox())!;
    for (const c of cells)
      expect(c.x + c.width).toBeLessThanOrEqual(rb.x + rb.width + 0.5);
  }
});

test('Incomplete without horizontal scrolling', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+5');
  const win = page.locator('[data-window="incomplete"]');
  await expect(win).toBeVisible();
  await widerFont(page);
  await shot(page, 'incomplete');
  const over = await win
    .locator('.tool-window-body, .list-scroll')
    .evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
  expect(over.length).toBeGreaterThan(0);
  for (const d of over) expect(d).toBeLessThanOrEqual(0);
});

test('List without horizontal scrolling', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+4');
  const win = page.locator('[data-window="list"]');
  await expect(win.locator('.list-row').first()).toBeVisible();
  await widerFont(page);
  await shot(page, 'list');
  const over = await win
    .locator('.tool-window-body, .list-scroll')
    .evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
  for (const d of over) expect(d).toBeLessThanOrEqual(0);
});

test('windows opened wide and then narrowing the window: nothing falls off the screen', async ({
  page,
}) => {
  // Saved layout of a wide window (Details at the maximum); with a saved layout the
  // compact desktop does not collapse Details, so only the width adjustment accommodates it.
  await page.addInitScript(() => {
    localStorage.setItem(
      'mapping.toolWindows',
      JSON.stringify({ open: ['tree', 'layers', 'details'], left: 271, right: 560 }),
    );
  });
  await page.setViewportSize({ width: 1540, height: 860 });
  await open(page);
  await page.keyboard.press('Control+Shift+6');
  await expect(page.locator('[data-window="diagnostics"]')).toBeVisible();
  expect((await page.locator('[data-window="details"]').boundingBox())!.width).toBe(560);
  for (const width of [1100, 902, 900]) {
    await page.setViewportSize({ width, height: 860 });
    await expect(page.locator('[data-window="details"]')).toBeVisible();
    await expect
      .poll(async () => {
        const out: number[] = [];
        for (const id of ['tree', 'details', 'diagnostics']) {
          const b = (await page.locator(`[data-window="${id}"]`).boundingBox())!;
          out.push(b.x + b.width);
        }
        return Math.max(...out) <= width + 0.5;
      })
      .toBe(true);
    const canvas = (await page
      .getByRole('main', { name: 'Project canvas' })
      .boundingBox())!;
    expect(canvas.width).toBeGreaterThanOrEqual(319.5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
