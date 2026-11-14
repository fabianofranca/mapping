import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, projectAction } from './helpers';
import { fixtureZip } from './proposalFixture';

// Tester leftovers stage, CL1: findings of the visual pass at 900×720 (the minimum window).

test.use({ viewport: { width: 900, height: 720 } });

const PACKAGE_DIR = 'libraries/material3-compose';

/** Zip of the Material 3 (Compose) package, generated on the fly from the repository folder. */
async function packageZip(): Promise<Buffer> {
  const zip = new JSZip();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else zip.file(relative(PACKAGE_DIR, path), readFileSync(path));
    }
  };
  walk(PACKAGE_DIR);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function openWithLibrary(page: Page): Promise<void> {
  await createProject(page, 'Space');
  await projectAction(page, 'Specializations');
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'material3-compose.zip',
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
}

test('1.1 Palette: readable type name and whole Add button on every row', async ({
  page,
}) => {
  await openWithLibrary(page);
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  await expect(page.locator('.library-type').first()).toBeVisible();
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.library-type')].flatMap((row) =>
      [...row.querySelectorAll<HTMLElement>('[class*="library-type-"]')]
        .filter((el) => el.scrollWidth > el.clientWidth)
        .map(
          (el) => `${el.textContent} ${el.className} ${el.scrollWidth}>${el.clientWidth}`,
        ),
    ),
  );
  expect(cut).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

/** Loose words (text node without spaces) that the browser splits across more than one line. */
async function brokenWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? '').trim();
        // With a space or hyphen the browser may break there, on purpose; the defect is in the middle of the word.
        if (text === '' || /[\s-]/.test(text)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        if (tops.size > 1) out.push(text);
      }
    }
    return out;
  }, selector);
}

test('1.3 Catalog: words of the Fields table and of the list do not break in the middle', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[data-library-zip]').setInputFiles({
    name: 'material3-compose.zip',
    mimeType: 'application/zip',
    buffer: await packageZip(),
  });
  const screen = page.getByRole('main', { name: 'Library catalog' });
  const entries = screen
    .getByRole('navigation', { name: 'Components' })
    .locator('button[data-type-id]');
  await expect.poll(() => entries.count()).toBeGreaterThan(10);
  expect(await brokenWords(page, '.catalog-entry-name')).toEqual([]);
  const count = await entries.count();
  const broken: string[] = [];
  for (let i = 0; i < count; i++) {
    await entries.nth(i).click();
    const name = (await entries.nth(i).getAttribute('data-type-id')) ?? String(i);
    await expect(screen.getByRole('article')).toBeVisible();
    for (const w of await brokenWords(
      page,
      '.catalog-page .markdown td, .catalog-page .markdown th, .catalog-table:not([data-variants]) td, .catalog-table:not([data-variants]) th',
    ))
      broken.push(`${name}: ${w}`);
  }
  expect(broken).toEqual([]);

  // Narrow list (like the Catalog window one): no component name breaks in the middle.
  await screen.locator('.catalog-list').evaluate((el) => (el.style.width = '200px'));
  expect(await brokenWords(page, '.catalog-entry-name')).toEqual([]);
});

test('1.4 Tree + Details: the cut has a hint and the summary of the empty layer is not cut', async ({
  page,
}) => {
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
  // pt-BR kept: shared fixture data (proposalFixture.ts) asserted by other e2e specs
  await page.locator('.tree-row', { hasText: 'Cabeçalho' }).first().click();
  await page.keyboard.press('Control+Shift+3');
  await expect(page.locator('.layer-group-empty').first()).toBeVisible();
  const report = await page.evaluate(() => {
    const cutNoTip: string[] = [];
    const sel = '.tool-window-title, .tree-label, .layer-name, .layer-group-name';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      const tip =
        el.getAttribute('title') ?? el.closest('[title]')?.getAttribute('title');
      if (!tip) cutNoTip.push(`${el.className}: ${el.textContent ?? ''}`);
    }
    const summaryCut = [
      ...document.querySelectorAll<HTMLElement>(
        '.layer-group-empty, .layer-group-summary',
      ),
    ]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent ?? '');
    return { cutNoTip, summaryCut };
  });
  expect(report.cutNoTip).toEqual([]);
  expect(report.summaryCut).toEqual([]);
});

/** Palette rows (CL2, 1.1a): name without a break in the middle of the word, one-line button, no side scrolling. */
async function paletteReport(page: Page): Promise<{
  width: number;
  brokenNames: string[];
  wrappedButtons: number;
  cut: string[];
  scrollX: boolean;
}> {
  const base = await page.evaluate(() => {
    const win = document.querySelector<HTMLElement>(
      'section.tool-window[aria-label="Catalog"]',
    )!;
    const body = win.querySelector<HTMLElement>('.tool-window-body')!;
    const heights = [...win.querySelectorAll<HTMLElement>('.library-type > button')].map(
      (b) => b.getBoundingClientRect().height,
    );
    const single = Math.min(...heights);
    const wrapped = heights.filter((h) => h > single + 2);
    const cut = [...win.querySelectorAll<HTMLElement>('[class*="library-type-"]')]
      .filter((el) => el.scrollWidth > el.clientWidth)
      .map((el) => `${el.textContent} ${el.scrollWidth}>${el.clientWidth}`);
    return {
      width: Math.round(win.getBoundingClientRect().width),
      wrappedButtons: wrapped.length,
      cut,
      scrollX: body.scrollWidth > body.clientWidth,
    };
  });
  return { ...base, brokenNames: await brokenWords(page, '.library-type-name') };
}

test('1.1a Palette with Details open and closed: whole name, whole button, no side scrolling', async ({
  page,
}) => {
  await openWithLibrary(page);
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  await expect(page.locator('.library-type').first()).toBeVisible();
  const closed = await paletteReport(page);
  await page.keyboard.press('Control+Shift+3');
  await expect(page.locator('section.tool-window[aria-label="Details"]')).toBeVisible();
  const open = await paletteReport(page);
  for (const r of [closed, open]) {
    expect(r.brokenNames).toEqual([]);
    expect(r.wrappedButtons).toBe(0);
    expect(r.cut).toEqual([]);
    expect(r.scrollX).toBe(false);
  }
});
