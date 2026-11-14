import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import {
  addContainer,
  createMarking,
  createProject,
  serialize,
  setMarkingAnchor,
} from '../../src/model';
import { blocksPng } from './png';

// Anchor in the app (R4, stage #1096): the Anchor section of Details and Snap, in a narrow panel
// (900 px): the Offset fields fit, Side and Alignment save and Snap moves the marking
// and undoes in a single entry.

test.use({ viewport: { width: 900, height: 720 } });

const NOW = '2026-11-13T12:00:00.000Z';

/** A container with the `Target` and the `Anchored` (already anchored to it, far away, no component). */
async function anchoredZip(): Promise<Buffer> {
  let p = createProject({
    name: 'Anchor',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
  });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 800 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    name: 'Target',
    rect: { x: 400, y: 300, width: 200, height: 100 },
  });
  p = createMarking(p, {
    id: 'M2',
    containerId: 'I1',
    name: 'Anchored',
    rect: { x: 100, y: 100, width: 100, height: 40 },
  });
  p = setMarkingAnchor(p, 'M2', { to: 'M1' });
  const zip = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  zip.file('mapping.json', serialize(p), opts);
  zip.file('images/a.png', blocksPng(1000, 800, [240, 240, 240], []), opts);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

async function openAnchored(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'anchor.zip',
      mimeType: 'application/zip',
      buffer: await anchoredZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit2');
  await page.locator('.tree-row', { hasText: 'Anchored' }).first().click();
}

test('Anchor section: shows the anchor, saves side and alignment and Snap moves and undoes in one entry', async ({
  page,
}) => {
  await openAnchored(page);
  const section = page.getByRole('region', { name: 'Anchor' });
  await expect(section).toBeVisible();
  await expect(section.getByLabel('Anchored to', { exact: true })).toHaveValue('M1');
  const x = page.getByRole('spinbutton', { name: 'X', exact: true });
  const y = page.getByRole('spinbutton', { name: 'Y', exact: true });
  await expect(x).toHaveValue('100');
  await expect(y).toHaveValue('100');

  // The place defaults (no component): above and centered; Snap takes it to the anchor.
  await expect(section.getByRole('button', { name: 'Above' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await section.getByRole('button', { name: 'Snap to anchor' }).click();
  await expect(x).toHaveValue('450');
  await expect(y).toHaveValue('260');

  // Below the anchor (Y = 300 + 100): another change, another undo entry.
  await section.getByRole('button', { name: 'Below' }).click();
  await section.getByRole('button', { name: 'Snap to anchor' }).click();
  await expect(y).toHaveValue('400');

  // Focus leaves the field and Ctrl+Z undoes the top Snap in a single entry.
  await page.getByRole('heading', { name: 'Details' }).first().click();
  await page.keyboard.press('Control+z');
  await expect(y).toHaveValue('260');
  await expect(x).toHaveValue('450');
});

test('Anchor section at 900 px: both Offset fields fit whole', async ({ page }) => {
  await openAnchored(page);
  const section = page.getByRole('region', { name: 'Anchor' });
  const main = section.getByLabel('Distance from edge');
  const cross = section.getByLabel('Shift along the side');
  await main.fill('-1234');
  await main.press('Enter');
  await cross.fill('5678');
  await cross.press('Enter');
  for (const field of [main, cross]) {
    const m = await field.evaluate((e) => {
      const input = e as HTMLInputElement;
      return { scroll: input.scrollWidth, client: input.clientWidth };
    });
    expect(m.scroll).toBeLessThanOrEqual(m.client);
  }
  // The CI font leaves the field 2 px narrower than the local Chromium one: without slack, the "-1234"
  // gets cut. In the narrow panel the two fields stack, each with the whole column.
  const boxes = await Promise.all([main.boundingBox(), cross.boundingBox()]);
  const [mainBox, crossBox] = boxes;
  if (!mainBox || !crossBox) throw new Error('Offset fields without a box');
  expect(crossBox.y).toBeGreaterThan(mainBox.y + mainBox.height - 1);
  expect(Math.min(mainBox.width, crossBox.width)).toBeGreaterThan(80);
  await expect(main).toHaveValue('-1234');
  await expect(cross).toHaveValue('5678');
});
