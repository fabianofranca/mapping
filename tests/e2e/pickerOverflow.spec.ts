import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { addPerspective, createPage, serialize } from '../../src/model';
import { fixtureFiles, fixtureProject } from './proposalFixture';

// Stage #2897 (PO1): with many pages or perspectives, the Page menu and the perspective picker
// fit in the window (900×720), the list scrolls and the actions stay pinned below it.

test.use({ viewport: { width: 900, height: 720 } });

const PAGES = 30;
const VIEWS = 20;
const num = (n: number) => String(n).padStart(2, '0');

async function zipWithManyItems(): Promise<Buffer> {
  const files = fixtureFiles();
  let project = fixtureProject();
  for (let i = 1; i <= PAGES; i++) {
    project = createPage(project, { id: `PGX${i}`, name: `Page ${num(i)}` });
  }
  for (let i = 1; i <= VIEWS; i++) {
    project = addPerspective(project, {
      id: `PEX${i}`,
      name: `View ${num(i)}`,
      hiddenLayers: [],
      items: [],
    });
  }
  files.set('mapping.json', serialize(project));
  const zip = new JSZip();
  for (const [path, content] of files) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function openProject(page: Page) {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'store.zip',
      mimeType: 'application/zip',
      buffer: await zipWithManyItems(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

async function insideWindow(panel: Locator) {
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
}

interface Case {
  readonly trigger: RegExp;
  readonly list: string;
  readonly last: string;
  readonly create: string;
  readonly manage: string;
  readonly dialog: string;
  /** The action that opens `dialog`, and the ArrowDown presses from the selected row to it. */
  readonly opens: string;
  readonly downs: number;
}

const CASES: readonly Case[] = [
  {
    trigger: /^Page:/,
    list: 'Pages',
    last: `Page ${num(PAGES)}`,
    create: 'New page…',
    manage: 'Manage pages…',
    dialog: 'Manage pages',
    opens: 'New page…',
    downs: 1,
  },
  {
    trigger: /^Perspective:/,
    list: 'Perspectives',
    last: `View ${num(VIEWS)}`,
    create: 'New perspective…',
    manage: 'Manage perspectives…',
    dialog: 'Manage perspectives',
    opens: 'Manage perspectives…',
    downs: 2,
  },
];

for (const c of CASES) {
  test(`${c.list}: fits the window, scrolls, keeps the actions pinned`, async ({
    page,
  }) => {
    await openProject(page);
    const trigger = page.getByRole('button', { name: c.trigger });
    await trigger.click();
    const list = page.getByRole('listbox', { name: c.list });
    const panel = page.locator('.popover', { has: list });
    await expect(list).toBeVisible();
    await insideWindow(panel);
    await expect(page.getByRole('button', { name: c.create })).toBeInViewport();
    await expect(page.getByRole('button', { name: c.manage })).toBeInViewport();
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await list.getByRole('option', { name: new RegExp(c.last) }).click();
    await expect(list).toHaveCount(0);

    await trigger.click();
    const row = page
      .getByRole('listbox', { name: c.list })
      .getByRole('option', { name: new RegExp(c.last) });
    await expect(row).toBeFocused();
    await expect(row).toBeInViewport();
    await page.waitForTimeout(300);
    await expect(page.getByRole('listbox', { name: c.list })).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: c.create })).toBeFocused();
    for (let i = 1; i < c.downs; i++) await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: c.opens })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: c.dialog })).toBeVisible();
  });
}
