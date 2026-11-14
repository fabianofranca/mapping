import { expect, test, type Page } from '@playwright/test';
import { addImage, canvasPoint, createProject, drawMarking, setMode } from './helpers';
import { readFileSync } from 'node:fs';
import { fixtureZip } from './proposalFixture';

// Status bar and canvas path (stage #675): at 900×720 the short states (Saved, the
// target, Read-only) stay whole, the long texts shrink with ellipsis and tooltip,
// nothing goes past the edge and schema and channel disappear; at 1440×900 they come back. jsdom has no layout.

// pt-BR kept: shared fixture data (proposalFixture 'Banner promoção'; exemplo-completo 'Cadastro', 'Formulário', 'Cadastrar') asserted by tests/examples and tests/store
const LONG_NAME = 'Order confirmation button with a name that is far too long to fit';

interface ItemReport {
  readonly text: string;
  readonly title: string;
  readonly cut: boolean;
  readonly ellipsis: boolean;
  readonly inside: boolean;
}

/** Measures each `.status-item-text` of the bar: cut without ellipsis, tooltip and whether it fits. */
async function measureBar(page: Page) {
  return page.locator('.statusbar').evaluate((bar) => {
    const edge = bar.getBoundingClientRect().right;
    const items: ItemReport[] = [];
    for (const el of bar.querySelectorAll<HTMLElement>('.status-item')) {
      const text = el.querySelector<HTMLElement>('.status-item-text');
      const node = text ?? el;
      const r = el.getBoundingClientRect();
      items.push({
        text: (node.textContent ?? '').trim(),
        title: el.getAttribute('title') ?? node.getAttribute('title') ?? '',
        cut: node.scrollWidth > node.clientWidth,
        ellipsis: text !== null && getComputedStyle(text).textOverflow === 'ellipsis',
        inside: r.width === 0 || r.right <= edge + 0.5,
      });
    }
    return { items, scrolls: bar.scrollWidth > bar.clientWidth };
  });
}

function expectBarHealthy(report: Awaited<ReturnType<typeof measureBar>>) {
  expect(report.scrolls).toBe(false);
  for (const item of report.items) {
    expect(item.inside, `"${item.text}" goes past the edge`).toBe(true);
    if (item.cut) {
      expect(item.ellipsis, `"${item.text}" cut without ellipsis`).toBe(true);
      expect(item.title, `"${item.text}" without tooltip`).toContain(item.text);
    }
  }
}

async function expectWhole(page: Page, text: RegExp) {
  const item = page.locator('.statusbar .status-item', { hasText: text }).first();
  await expect(item).toBeVisible();
  const [scroll, client] = await item.evaluate((el) => {
    const node = el.querySelector<HTMLElement>('.status-item-text') ?? el;
    return [node.scrollWidth, node.clientWidth];
  });
  expect(scroll, `"${text}" cut (${scroll} > ${client})`).toBeLessThanOrEqual(client);
}

async function selectLongMarking(page: Page) {
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await page.keyboard.press('Control+Shift+Digit3');
  await page.getByLabel('Name', { exact: true }).first().fill(LONG_NAME);
  await page.keyboard.press('Enter');
}

test.describe('at 900×720', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('local project with "Unexported changes" and a long selection name', async ({
    page,
  }) => {
    await createProject(page, 'Bar');
    await selectLongMarking(page);
    await setMode(page, 'Navigate');
    const bar = page.locator('.statusbar');
    await expect(bar).toContainText('Unexported changes');
    await expectWhole(page, /^Saved$/);
    await expectWhole(page, /^On this device$/);
    expectBarHealthy(await measureBar(page));
    await expect(bar.locator('.status-wide:visible')).toHaveCount(0);
  });

  test('review with "1 accepted change awaiting apply": Read-only whole and path', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
      .setInputFiles({
        name: 'loja.zip',
        mimeType: 'application/zip',
        buffer: await fixtureZip(),
      });
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    await page.keyboard.press('Control+Shift+7');
    await page
      .getByRole('button', { name: /^Review/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: /^Accept/ })
      .first()
      .click();
    const bar = page.locator('.statusbar');
    await expect(bar).toContainText('awaiting apply');
    await expectWhole(page, /Read-only/);
    await expectWhole(page, /^Saved$|^Folder$|^On this device$/);
    expectBarHealthy(await measureBar(page));
    await expect(bar.locator('.status-wide:visible')).toHaveCount(0);
    // The canvas path ends before the review controls.
    const crumbs = page.locator('.crumbs');
    const end = page.locator('.canvas-bar-end');
    const [crumbsRight, endLeft] = await Promise.all([
      crumbs.evaluate((e) => e.getBoundingClientRect().right),
      end.evaluate((e) => e.getBoundingClientRect().left),
    ]);
    expect(crumbsRight).toBeLessThanOrEqual(endLeft + 0.5);
    for (const name of await page.locator('.crumb-name').all()) {
      const [cut, title] = await name.evaluate((e) => [
        e.scrollWidth > e.clientWidth,
        e.getAttribute('title') ?? '',
      ]);
      if (cut) expect(title).not.toBe('');
    }
  });
});

test.describe('review at 900×720 with the four windows open (BS2)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('path with ellipsis and tooltip, bar inside the column, whole zoom', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
      .setInputFiles({
        name: 'loja.zip',
        mimeType: 'application/zip',
        buffer: await fixtureZip(),
      });
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    for (const key of ['1', '2', '3', '7'])
      await page.keyboard.press(`Control+Shift+${key}`);
    await page
      .getByRole('button', { name: /^Review/ })
      .first()
      .click();
    await expect(page.locator('.review-canvas-controls')).toBeVisible();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const q = (s: string) => bar.querySelector<HTMLElement>(s)!;
      const crumbs = q('.crumbs');
      const name = bar.querySelector<HTMLElement>('.crumb-name');
      return {
        crumbsWidth: crumbs.clientWidth,
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
        endRight: q('.canvas-bar-end').getBoundingClientRect().right,
        barRight: bar.getBoundingClientRect().right,
        nameCut: name ? name.scrollWidth > name.clientWidth : false,
        nameTitle: name?.getAttribute('title') ?? '',
        nameEllipsis: name ? getComputedStyle(name).textOverflow : '',
      };
    });
    expect(m.crumbsWidth, JSON.stringify(m)).toBeGreaterThan(0);
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    expect(m.endRight, JSON.stringify(m)).toBeLessThanOrEqual(m.barRight + 0.5);
    const empty = page.locator('.crumbs-empty');
    if ((await empty.count()) > 0) {
      const e = await empty.evaluate((el) => ({
        cut: el.scrollWidth > el.clientWidth,
        ellipsis: getComputedStyle(el).textOverflow,
        title: el.getAttribute('title') ?? '',
      }));
      if (e.cut) expect(e.ellipsis).toBe('ellipsis');
      expect(e.title).not.toBe('');
    }
    if (m.nameCut) {
      expect(m.nameEllipsis).toBe('ellipsis');
      expect(m.nameTitle).not.toBe('');
    }
    await expect(page.locator('.canvas-bar .zoom-field')).toBeVisible();
  });

  test('readable path: letters and ellipsis, not just the separators (BS3)', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
      .setInputFiles({
        name: 'loja.zip',
        mimeType: 'application/zip',
        buffer: await fixtureZip(),
      });
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    for (const key of ['1', '2', '3', '7'])
      await page.keyboard.press(`Control+Shift+${key}`);
    await page
      .getByRole('button', { name: /^Review/ })
      .first()
      .click();
    await expect(page.locator('.review-canvas-controls')).toBeVisible();
    await page
      .getByRole('button', { name: /^Current$/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: 'Banner promoção', exact: true })
      .first()
      .click();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const crumbs = bar.querySelector<HTMLElement>('.crumbs')!;
      const items = [...crumbs.querySelectorAll<HTMLElement>('.crumb-item')];
      return {
        crumbsWidth: crumbs.clientWidth,
        items: items.length,
        lastName:
          items.at(-1)?.querySelector<HTMLElement>('.crumb-name')?.clientWidth ?? 0,
        lastCut: (() => {
          const n = items.at(-1)?.querySelector<HTMLElement>('.crumb-name');
          return n ? n.scrollWidth > n.clientWidth : false;
        })(),
        lastEllipsis: getComputedStyle(
          items.at(-1)!.querySelector<HTMLElement>('.crumb-name')!,
        ).textOverflow,
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
        zoomWhole: (() => {
          const z = bar.querySelector<HTMLElement>('.zoom-field')!;
          return z.scrollWidth <= z.clientWidth && z.clientWidth > 0;
        })(),
      };
    });
    expect(m.items, JSON.stringify(m)).toBeGreaterThanOrEqual(2);
    // The selection (last run) shows 2 to 3 letters, with an ellipsis if cut.
    // The BC2 "⋯" costs ~22 px + gaps from the selection (before 90 and 40); the full path is in the "…".
    expect(m.crumbsWidth, JSON.stringify(m)).toBeGreaterThanOrEqual(60);
    expect(m.lastName, JSON.stringify(m)).toBeGreaterThanOrEqual(16);
    if (m.lastCut) expect(m.lastEllipsis, JSON.stringify(m)).toBe('ellipsis');
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    expect(m.zoomWhole, JSON.stringify(m)).toBe(true);
  });
});

test.describe('at 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('review with the four windows: the last run shrinks last (PV2)', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
      .setInputFiles({
        name: 'loja.zip',
        mimeType: 'application/zip',
        buffer: await fixtureZip(),
      });
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    for (const key of ['1', '2', '3', '7'])
      await page.keyboard.press(`Control+Shift+${key}`);
    await page
      .getByRole('button', { name: /^Review/ })
      .first()
      .click();
    await expect(page.locator('.review-canvas-controls')).toBeVisible();
    await page
      .getByRole('button', { name: /^Current$/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: 'Banner promoção', exact: true })
      .first()
      .click();
    const m = await page.locator('.crumbs').evaluate((crumbs) => {
      const items = [...crumbs.querySelectorAll<HTMLElement>('.crumb-item')];
      // How much of each name is hidden (the shrinking is proportional to `flex-shrink`).
      const hidden = (el: HTMLElement) => {
        const n = el.querySelector<HTMLElement>('.crumb-name');
        return n ? Math.max(0, n.scrollWidth - n.clientWidth) : 0;
      };
      const last = items.at(-1)!;
      return {
        items: items.length,
        lastHidden: hidden(last),
        othersHidden: items.slice(0, -1).map(hidden),
        othersAtMost32: items
          .slice(0, -1)
          .every((i) => i.getBoundingClientRect().width <= 32.5),
      };
    });
    expect(m.items, JSON.stringify(m)).toBeGreaterThanOrEqual(2);
    // The last run is whole, or the others are already at 32 px or less, or it loses
    // less than each of the others that are cut.
    const lastBest =
      m.lastHidden === 0 ||
      m.othersAtMost32 ||
      m.othersHidden.every((h) => h === 0 || h >= m.lastHidden);
    expect(lastBest, JSON.stringify(m)).toBe(true);
  });

  test('schema and channel show', async ({ page }) => {
    await createProject(page, 'Bar');
    const bar = page.locator('.statusbar');
    await expect(bar.locator('.status-wide:visible')).toHaveCount(2);
    await expect(bar).toContainText('schema v');
    expectBarHealthy(await measureBar(page));
  });
});

// BC1 (#1064): in the narrow canvas bar the path collapses the middle into a "…" that opens the full
// path; in the wide one, nothing changes. jsdom has no layout: the measurement is here.

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
}

async function selectCadastrar(page: Page): Promise<void> {
  const tree = page.getByRole('list', { name: 'Marking tree' });
  await tree.getByRole('button', { name: 'Cadastrar', exact: true }).click();
}

test.describe('collapsed path at 900×720 outside the review (BC1)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('Canvas › … › Cadastrar; Enter on the "…" opens the full path and Esc returns the focus', async ({
    page,
  }) => {
    await openExample(page);
    for (const key of ['1', '2', '7', '3'])
      await page.keyboard.press(`Control+Shift+Digit${key}`);
    await selectCadastrar(page);
    const more = page.getByRole('button', { name: 'Show full path' });
    await expect(more).toBeVisible();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const items = [...bar.querySelectorAll<HTMLElement>('.crumb-item')];
      const last = items.at(-1)!.querySelector<HTMLElement>('.crumb-name')!;
      return {
        middle: items.slice(1, -1).map((el) => el.getBoundingClientRect().width),
        last: last.clientWidth,
        lastTitle: last.getAttribute('title') ?? '',
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
      };
    });
    expect(m.middle.length, JSON.stringify(m)).toBeGreaterThan(0);
    expect(
      m.middle.every((w) => w === 0),
      JSON.stringify(m),
    ).toBe(true);
    expect(m.last, JSON.stringify(m)).toBeGreaterThanOrEqual(40);
    expect(m.lastTitle).toBe('Cadastrar');
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    await more.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Full path' });
    await expect(menu.getByRole('menuitem')).toHaveCount(4);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Canvas',
      'Cadastro',
      'Formulário',
      'Cadastrar',
    ]);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
  });
});

test.describe('full path at 1440×900 (BC1)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('without "…": all runs visible, as today', async ({ page }) => {
    await openExample(page);
    await selectCadastrar(page);
    await expect(page.getByRole('button', { name: 'Show full path' })).toBeHidden();
    const widths = await page
      .locator('.crumbs .crumb-item')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(widths.length).toBeGreaterThanOrEqual(4);
    expect(widths.every((w) => w > 0)).toBe(true);
  });
});

// BC2 (#1065): in the narrow review the controls that disappear go into a "⋯" at the end of the bar.

async function openReview(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  for (const key of ['1', '2', '3', '7'])
    await page.keyboard.press(`Control+Shift+${key}`);
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await expect(page.locator('.review-canvas-controls')).toBeVisible();
}

const MORE = 'More controls';

test.describe('the review "⋯" at 900×720 (BC2)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('visible and inside the column, with the whole zoom; opens the items and each one works', async ({
    page,
  }) => {
    await openReview(page);
    const more = page.getByRole('button', { name: MORE });
    await expect(more).toBeVisible();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const zoom = bar.querySelector<HTMLElement>('.zoom-field')!;
      const review = bar.querySelector<HTMLElement>('.review-canvas-controls')!;
      return {
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
        zoomWhole: zoom.scrollWidth <= zoom.clientWidth && zoom.clientWidth > 0,
        reviewWidth: review.getBoundingClientRect().width,
        moreRight: bar
          .querySelector('[aria-label="More controls"]')!
          .getBoundingClientRect().right,
        barRight: bar.getBoundingClientRect().right,
      };
    });
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    expect(m.zoomWhole, JSON.stringify(m)).toBe(true);
    expect(m.reviewWidth, JSON.stringify(m)).toBeGreaterThan(0);
    expect(m.moreRight, JSON.stringify(m)).toBeLessThanOrEqual(m.barRight + 0.5);

    await more.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: MORE });
    await expect(menu.locator('[role^="menuitem"]')).toHaveCount(5);
    const names = await menu.locator('[role^="menuitem"]').allInnerTexts();
    expect(names[0]).toContain('Conversations');
    expect(names[1]).toContain('View');
    expect(names[2]).toContain('Show on canvas');
    expect(names[3]).toContain('Fit all');

    // Fit all through the menu changes the zoom.
    const zoom = page.locator('.canvas-bar .zoom-field');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Equal');
    await page.keyboard.press('Control+Equal');
    const zoomed = await zoom.innerText();
    await more.click();
    await menu.getByRole('menuitem', { name: /Fit all/ }).click();
    await expect.poll(() => zoom.innerText()).not.toBe(zoomed);

    // View through the menu turns the mode on; the panel opens anchored on the "⋯", inside the window.
    await more.click();
    await menu.getByRole('menuitemcheckbox', { name: /View/ }).click();
    const panel = page.getByRole('dialog', { name: 'Show on canvas' });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const anchor = await more.boundingBox();
    const view = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(view.width);
    expect(box!.y).toBeGreaterThanOrEqual(anchor!.y);
    expect(Math.abs(box!.x + box!.width - (anchor!.x + anchor!.width))).toBeLessThan(
      view.width,
    );
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(more).toBeFocused();
  });
});

test.describe('without the "⋯" outside the review and in the wide bar (BC2)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('outside the review at 900×720: the four buttons in view', async ({ page }) => {
    await createProject(page, 'Bar');
    await expect(page.getByRole('button', { name: MORE })).toBeHidden();
    for (const name of ['Conversations', 'View', 'Show on canvas', 'Fit all'])
      await expect(
        page.locator('.canvas-bar').getByRole('button', { name }),
      ).toBeVisible();
  });
});

test.describe('without the "⋯" at 1440×900 (BC2)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('in the review and outside it the buttons stay in view', async ({ page }) => {
    await openReview(page);
    await expect(page.getByRole('button', { name: MORE })).toBeHidden();
    for (const name of ['Conversations', 'View', 'Show on canvas', 'Fit all'])
      await expect(
        page.locator('.canvas-bar').getByRole('button', { name }),
      ).toBeVisible();
  });
});
