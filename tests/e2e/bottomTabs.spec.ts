import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Bottom window: the six tabs stay visible and clickable at 900 and 1280 px, with
// any one of them active; the header actions never cover another tab.

const SHOTS = process.env.LAYOUT_SHOTS ?? '';
const TABS = ['List', 'Incomplete', 'Diagnostics', 'Proposals', 'Comments'] as const;
// Shortcut of each tab (Ctrl+Shift+N).
const KEYS: Record<(typeof TABS)[number], string> = {
  List: '4',
  Incomplete: '5',
  Diagnostics: '6',
  Proposals: '7',
  Comments: '0',
};

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  // Tree, Layers and Details open: the center gets as narrow as possible.
  for (const key of ['1', '2', '3']) await page.keyboard.press(`Control+Shift+${key}`);
}

for (const width of [900, 1280]) {
  test(`the six bottom window tabs stay in view at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 860 });
    await open(page);
    for (const active of TABS) {
      await page.keyboard.press(`Control+Shift+${KEYS[active]}`);
      const tablist = page
        .getByRole('tablist')
        .filter({ has: page.getByRole('tab', { name: 'Diagnostics' }) });
      await expect(tablist).toBeVisible();
      await expect(
        tablist.getByRole('tab', { name: active, exact: false }),
      ).toHaveAttribute('aria-selected', 'true');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tabs-${width}-${active}.png` });
      // They fit without internal horizontal scrolling.
      expect(await tablist.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
      // Nothing covers any tab: the element at its center is the tab itself (or a child).
      for (const name of TABS) {
        const tab = tablist.getByRole('tab', { name, exact: false });
        const box = await tab.boundingBox();
        expect(box, `${name} with ${active} active`).not.toBeNull();
        const covered = await tab.evaluate(
          (el, pt) => {
            const hit = document.elementFromPoint(pt.x, pt.y);
            return hit === null || !el.contains(hit);
          },
          { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
        );
        expect(covered, `${name} covered with ${active} active`).toBe(false);
      }
    }
  });
}

// CL1 (1.1): the counter does not stick to the label (4px gap, `--space-1`) and, in the worst case (counter
// on the tabs with a label, the Notices one with 2 digits), the six tabs stay whole at 900 and 1280 px.
const MIN_GAP = 4;

for (const width of [900, 1280]) {
  test(`bottom window tabs with space between label and counter at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 860 });
    await open(page);
    await page.keyboard.press('Control+Shift+6');
    const tablist = page
      .getByRole('tablist')
      .filter({ has: page.getByRole('tab', { name: 'Diagnostics' }) });
    await expect(tablist).toBeVisible();
    const metrics = await tablist.evaluate((list) => {
      const tabs = [...list.querySelectorAll<HTMLElement>('[role=tab]')];
      // The worst case: counter on every tab with a label (the Notices one with 2 digits).
      for (const tab of tabs) {
        if (tab.querySelector('.tab-badge, .tab-alert')) continue;
        // The icon-only tab (Comments) has no label: it stays out of the worst case.
        if (!(tab.textContent ?? '').trim()) continue;
        const badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.textContent = (tab.textContent ?? '').startsWith('Notices') ? '12' : '9';
        tab.append(badge);
      }
      const range = document.createRange();
      const rows = tabs.map((tab) => {
        const label = [...tab.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
        const badge = tab.querySelector<HTMLElement>('.tab-badge, .tab-alert');
        if (!label || !badge) return { name: tab.textContent ?? '', gap: null };
        range.selectNodeContents(label);
        return {
          name: tab.textContent ?? '',
          gap: badge.getBoundingClientRect().left - range.getBoundingClientRect().right,
        };
      });
      return {
        rows,
        overflow: list.scrollWidth > list.clientWidth,
        sizes: `${list.scrollWidth} > ${list.clientWidth}`,
      };
    });
    // No horizontal scroll: neither the first nor the last tab is cut off.
    expect(metrics.overflow, metrics.sizes).toBe(false);
    const withText = metrics.rows.filter((r) => r.gap !== null);
    expect(withText.length).toBeGreaterThanOrEqual(5);
    for (const row of withText)
      expect(row.gap, `label and counter: ${row.name}`).toBeGreaterThanOrEqual(MIN_GAP);
  });
}
