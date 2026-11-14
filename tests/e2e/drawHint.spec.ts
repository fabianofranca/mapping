import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addImage, canvasPoint, createProject, drag, setMode } from './helpers';

// Draw mode hint in the canvas bar (stage #810, AD1): it no longer floats over the
// image; it takes the place of "Nothing selected" and, at 900 px, shrinks with an ellipsis and `title`.

const HINT = 'Drag over an image to create a marking.';

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

async function drawAtLowZoom(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await page.getByRole('main', { name: 'Project canvas' }).click({
    position: { x: 4, y: 4 },
  });
  await page.keyboard.press('Escape');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+Minus');
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
]) {
  test(`Draw hint in the canvas bar at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openExample(page);
    await drawAtLowZoom(page);

    // No notice floating over the canvas.
    await expect(page.locator('.canvas-overlay .notice')).toHaveCount(0);
    await expect(page.locator('.canvas-hint')).toHaveCount(0);

    const empty = page.locator('.canvas-bar .crumbs-empty');
    await expect(empty).toHaveText(HINT);
    const e = await empty.evaluate((el) => ({
      cut: el.scrollWidth > el.clientWidth,
      ellipsis: getComputedStyle(el).textOverflow,
      title: el.getAttribute('title') ?? '',
    }));
    expect(e.title).toBe(HINT);
    if (e.cut) expect(e.ellipsis).toBe('ellipsis');

    // No canvas bar item goes past its edge.
    const overflow = await page.locator('.canvas-bar').evaluate((bar) => {
      const right = bar.getBoundingClientRect().right;
      return {
        scroll: bar.scrollWidth <= bar.clientWidth,
        inside: [...bar.querySelectorAll<HTMLElement>('.canvas-bar-end > *')].every(
          (c) => c.getBoundingClientRect().right <= right + 0.5,
        ),
      };
    });
    expect(overflow).toEqual({ scroll: true, inside: true });
    await expect(page.locator('.canvas-bar .zoom-field')).toBeVisible();
  });
}

// Short notice at the foot of the canvas (PV2, decision 7): "Each side must be at least 8 px."
// stays on the left, the width of the text, without going under the minimap or covering the top of the image.
// With Tree and Details open at 900×720 the canvas gets ~360 px and the foot ~200 px (CL1, 1.1):
// the notice wraps into two lines instead of being cut with an ellipsis.
for (const size of [
  { width: 1280, height: 720, panels: false },
  { width: 900, height: 720, panels: false },
  { width: 900, height: 720, panels: true },
  { width: 1440, height: 900, panels: false },
]) {
  test(`8 px notice at the foot of the canvas at ${size.width}×${size.height}${size.panels ? ' with Tree and Details' : ''}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await createProject(page, 'Notice');
    if (size.panels) {
      for (const name of ['Marking tree', 'Details']) {
        const toggle = page.getByRole('button', { name, exact: true });
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
      }
    }
    await addImage(page);
    // Zoom above 100%: 7 screen px are less than the 8 image px.
    for (let i = 0; i < 2; i++) await page.keyboard.press('Control+Equal');
    const start = await canvasPoint(page, 1 / 2);
    await setMode(page, 'Draw');
    await page.mouse.click(start.x, start.y);
    await drag(page, start, { x: start.x + 7, y: start.y + 7 });
    const box = (await page.getByRole('main', { name: 'Project canvas' }).boundingBox())!;

    const notice = page.locator('.canvas-overlay-foot .notice', {
      hasText: 'Each side must be at least 8 px.',
    });
    await expect(notice).toBeVisible();
    await expect(page.locator('.canvas-overlay .notice')).toHaveCount(0);
    const m = await notice.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const main = el.closest('main, [role=main]') ?? document.body;
      const c = main.getBoundingClientRect();
      const mini = document.querySelector('.minimap')?.getBoundingClientRect();
      return {
        left: r.left - c.left,
        width: r.width,
        canvasWidth: c.width,
        bottomGap: c.bottom - r.bottom,
        top: r.top - c.top,
        miniLeft: mini ? mini.left - c.left : null,
        right: r.right - c.left,
      };
    });
    // The whole text: nothing cut by `overflow` (CL1, finding 1.1).
    const cut = await notice.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(cut, JSON.stringify(m)).toBe(false);
    expect(m.left, JSON.stringify(m)).toBeLessThan(24);
    expect(m.width, JSON.stringify(m)).toBeLessThan(m.canvasWidth * 0.8);
    expect(m.bottomGap, JSON.stringify(m)).toBeLessThan(m.top);
    if (m.miniLeft !== null)
      expect(m.right, JSON.stringify(m)).toBeLessThanOrEqual(m.miniLeft);
    // Below the top of the fitted image: the notice does not cover the upper half of the canvas.
    expect(m.top, JSON.stringify(m)).toBeGreaterThan(box.height / 2);
  });
}
