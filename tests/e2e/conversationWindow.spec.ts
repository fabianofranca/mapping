import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { addContainer, createMarking, createProject, serialize } from '../../src/model';
import { blocksPng } from './png';

// Stage #1881, phase CV1: the Conversation window stacked under Details in the right column.

const NOW = '2026-11-18T12:00:00.000Z';

async function zip(): Promise<Buffer> {
  let p = createProject({
    name: 'Conversation',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Components', color: '#1e88e5' },
  });
  p = addContainer(p, { id: 'I1', file: 'images/g.png', width: 800, height: 600 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    name: 'Strip',
    rect: { x: 10, y: 10, width: 300, height: 80 },
  });
  const z = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  z.file('mapping.json', serialize(p), opts);
  z.file('images/g.png', blocksPng(800, 600, [240, 240, 240], []), opts);
  return z.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 720 });
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({ name: 'p.zip', mimeType: 'application/zip', buffer: await zip() });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Conversation' }).click();
}

for (const width of [900, 1280]) {
  test(`Details and Conversation stack, no horizontal scroll, at ${width}x720`, async ({
    page,
  }) => {
    await open(page, width);
    const details = page.locator('[data-window="details"]');
    const conversation = page.locator('[data-window="conversation"]');
    await expect(details).toBeVisible();
    await expect(conversation).toBeVisible();
    await expect(conversation.getByRole('status')).toContainText('No conversation open');
    const [d, c] = await Promise.all([details.boundingBox(), conversation.boundingBox()]);
    expect(c!.y).toBeGreaterThanOrEqual(d!.y + d!.height - 1);
    expect(d!.height).toBeGreaterThanOrEqual(160);
    expect(Math.abs(c!.x - d!.x)).toBeLessThan(2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}

test('the splitter drags and the double click resets', async ({ page }) => {
  await open(page, 1280);
  const conversation = page.locator('[data-window="conversation"]');
  const splitter = conversation.locator('.tool-splitter');
  const height = async () => (await conversation.boundingBox())!.height;
  const initial = await height();
  const box = (await splitter.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 4 });
  await page.mouse.up();
  expect(await height()).toBeGreaterThan(initial + 40);
  await splitter.dblclick();
  expect(Math.abs((await height()) - initial)).toBeLessThan(2);
});
