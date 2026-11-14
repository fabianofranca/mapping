import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

// Status bar at 900 px with a long message (which shrinks) on the left ("1 accepted awaiting
// application"): the build version (on the right) is never cut; the left one is what truncates.
// jsdom has no layout; the measurement is in Chromium.

test.use({ viewport: { width: 900, height: 720 } });

test('the version is not cut when the left message is long', async ({ page }) => {
  await createProject(page, 'Bar');
  const bar = page.locator('.statusbar');
  await expect(bar).toBeVisible();
  const result = await bar.evaluate((el) => {
    const gap = el.querySelector('.statusbar-gap')!;
    const long = document.createElement('span');
    long.className = 'status-item status-item-s4';
    const text = document.createElement('span');
    text.className = 'status-item-text';
    text.textContent = 'x'.repeat(400);
    long.append(text);
    el.insertBefore(long, gap);
    const build = el.querySelector<HTMLElement>('.status-item-mono:last-child')!;
    return {
      cut: build.scrollWidth > build.clientWidth,
      inside: build.getBoundingClientRect().right <= el.getBoundingClientRect().right,
    };
  });
  expect(result).toEqual({ cut: false, inside: true });
});
