import { expect, test, type Page } from '@playwright/test';
import { createProject, drag, exportMapping, setMode, type Rect } from './helpers';

// Parent marking stage: the Wrap button in the multi-selection summary creates a marking that
// wraps the selected ones, with a margin, and makes them its children (one undo entry).

/** Margin from the set to the parent marking, in container px (`WRAP_MARGIN`). */
const MARGIN = 8;
/** Framing margin around everything, in screen px (`FIT_PADDING`). */
const FIT_PADDING = 24;

async function addContainer(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
}

async function closeExport(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

/** New project with one container and two separate markings (nothing selected). */
async function twoMarkings(page: Page, name: string) {
  await createProject(page, name);
  const host = page.locator('.canvas-host');
  await addContainer(page, 'Screen');
  const fitsBefore = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(host).toHaveAttribute('data-fits', String(fitsBefore + 1));

  // Where the container is on screen (only one: it takes the framing, centered).
  const first = (await exportMapping(page)).mapping.containers[0];
  const box = await host.boundingBox();
  if (!first || !box) throw new Error('no container or canvas');
  const width = first.width * first.placement.scale;
  const height = first.height * first.placement.scale;
  const scale = Math.min(
    (box.width - 2 * FIT_PADDING) / width,
    (box.height - 2 * FIT_PADDING) / height,
  );
  const screen: Rect = {
    x: box.x + box.width / 2 - (width * scale) / 2,
    y: box.y + box.height / 2 - (height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };

  // Two separate markings, one on each side of the center.
  const sizeW = screen.width * 0.2;
  const sizeH = screen.height * 0.2;
  const spots = [0.2, 0.6].map((fx) => ({
    x: screen.x + screen.width * fx,
    y: screen.y + screen.height * (fx === 0.2 ? 0.25 : 0.55),
  }));
  await setMode(page, 'Desenhar');
  for (const s of spots) {
    await drag(page, s, { x: s.x + sizeW, y: s.y + sizeH });
  }
  await setMode(page, 'Navegar');
  const centers = spots.map((s) => ({ x: s.x + sizeW / 2, y: s.y + sizeH / 2 }));

  const before = (await exportMapping(page)).mapping;
  expect(before.markings).toHaveLength(2);

  return { host, first, screen, centers, before };
}

test('Wrap creates the parent marking of the two selected ones and undo reverts everything', async ({
  page,
}) => {
  const { first, centers, before } = await twoMarkings(page, 'Wrap');

  // The Export dialog stays open after downloading: close it to click on the canvas.
  await closeExport(page);

  // Click on the first one and Shift+click on the second one.
  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await expect(page.getByText('1 of 2')).toBeVisible();
  await page.keyboard.down('Shift');
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0);
  await page.keyboard.up('Shift');

  await expect(page.getByText('2 items selected').first()).toBeVisible();
  await page.getByRole('button', { name: 'Wrap', exact: true }).click();
  await expect(page.getByText('2 items selected')).toHaveCount(0);
  if (process.env.WRAP_SHOT) await page.screenshot({ path: process.env.WRAP_SHOT });

  const { mapping } = await exportMapping(page);
  await closeExport(page);
  expect(mapping.markings).toHaveLength(3);
  const children = before.markings;
  const parent = mapping.markings.find((m) => !children.some((c) => c.id === m.id));
  if (!parent) throw new Error('no new marking');
  const kids = mapping.markings.filter((m) => m.id !== parent.id);
  expect(parent.containerId).toBe(first.id);
  expect(parent.parentId).toBeNull();
  for (const k of kids) {
    expect(k.containerId).toBe(first.id);
    expect(k.parentId).toBe(parent.id);
  }
  const x0 = Math.min(...kids.map((k) => k.rect.x));
  const y0 = Math.min(...kids.map((k) => k.rect.y));
  const x1 = Math.max(...kids.map((k) => k.rect.x + k.rect.width));
  const y1 = Math.max(...kids.map((k) => k.rect.y + k.rect.height));
  const left = Math.max(x0 - MARGIN, 0);
  const top = Math.max(y0 - MARGIN, 0);
  const right = Math.min(x1 + MARGIN, first.width);
  const bottom = Math.min(y1 + MARGIN, first.height);
  expect(parent.rect).toEqual({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });

  // Ctrl+Z: back to the two markings, without a parent.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const count = (await exportMapping(page)).mapping.markings.length;
      await closeExport(page);
      return count;
    })
    .toBe(2);
  const undone = (await exportMapping(page)).mapping;
  await closeExport(page);
  expect(undone.markings.every((m) => m.parentId === null)).toBe(true);
});

test('Ctrl+G with a container selected creates the canvas marking around it', async ({
  page,
}) => {
  const { first, screen } = await twoMarkings(page, 'Shortcut');
  await closeExport(page);
  // With no markings on top: the click in the middle of the container selects only it.
  const markings = (await exportMapping(page)).mapping.markings;
  await closeExport(page);
  expect(markings).toHaveLength(2);
  await page.mouse.click(screen.x + screen.width * 0.9, screen.y + screen.height * 0.9);

  await page.keyboard.press('ControlOrMeta+g');

  const { mapping } = await exportMapping(page);
  await closeExport(page);
  expect(mapping.markings).toHaveLength(3);
  const wrap = mapping.markings.find((m) => !markings.some((o) => o.id === m.id));
  if (!wrap) throw new Error('no new marking');
  expect(wrap.containerId).toBeNull();
  expect(wrap.floating).toBe(false);
  const container = mapping.containers.find((c) => c.id === first.id);
  expect(container?.parentId).toBe(wrap.id);
  expect(wrap.rect).toEqual({
    x: first.placement.x - MARGIN,
    y: first.placement.y - MARGIN,
    width: first.width * first.placement.scale + 2 * MARGIN,
    height: first.height * first.placement.scale + 2 * MARGIN,
  });

  // Ctrl+Z desfaz o envolvimento.
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => {
      const count = (await exportMapping(page)).mapping.markings.length;
      await closeExport(page);
      return count;
    })
    .toBe(2);
});

test('Wrap through the right button with two items selected', async ({ page }) => {
  const { first, centers, before } = await twoMarkings(page, 'Menu');
  await closeExport(page);
  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await page.keyboard.down('Shift');
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0);
  await page.keyboard.up('Shift');
  await expect(page.getByText('2 items selected').first()).toBeVisible();

  // The right button over a selection item keeps the selection; the menu wraps the two.
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0, { button: 'right' });
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Wrap' }).click();
  await expect(page.getByText('2 items selected')).toHaveCount(0);

  const { mapping } = await exportMapping(page);
  await closeExport(page);
  expect(mapping.markings).toHaveLength(3);
  const parent = mapping.markings.find(
    (m) => !before.markings.some((o) => o.id === m.id),
  );
  if (!parent) throw new Error('no new marking');
  expect(parent.containerId).toBe(first.id);
  for (const m of mapping.markings.filter((x) => x.id !== parent.id)) {
    expect(m.parentId).toBe(parent.id);
  }
});

// The entry shortcut (Ctrl+G) sits to the right of the button, near the edge, and not stuck to the
// label (#468, AC1): the higher-specificity rule zeroed the `margin-left: auto`.
test('the Ctrl+G shortcut of the Wrap menu sits to the right of the entry', async ({
  page,
}) => {
  const { centers } = await twoMarkings(page, 'Shortcut');
  await closeExport(page);
  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await page.keyboard.down('Shift');
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0);
  await page.keyboard.up('Shift');
  await expect(page.getByText('2 items selected').first()).toBeVisible();
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0, { button: 'right' });
  const item = page.getByRole('menu').getByRole('menuitem', { name: 'Wrap' });
  await expect(item).toBeVisible();
  const geo = await item.evaluate((el) => {
    const kbd = el.querySelector<HTMLElement>('.menu-shortcut')!;
    return {
      right: el.getBoundingClientRect().right,
      kbdRight: kbd.getBoundingClientRect().right,
      padding: Number.parseFloat(getComputedStyle(el).paddingRight),
    };
  });
  // Ends at the button's inner edge (the slack is the right padding plus the border).
  expect(geo.right - geo.kbdRight).toBeLessThanOrEqual(geo.padding + 2);
});
