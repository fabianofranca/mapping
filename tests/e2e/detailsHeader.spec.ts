import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { avisosZip } from './avisosFixture';

// Details headers and menus (stage #552, AG1): the annotation name field goes whole
// to the 2nd line when everything does not fit, with copy and trash together on the 1st; the layer header
// only shrinks the name after the badge; the space between icon and label in menus; the legend over
// the minimap.

async function openZip(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({ name, mimeType: 'application/zip', buffer });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

const FOLDER = 'example-folder-ag1';

/** Unzips the example into an OPFS folder and makes it the folder chosen in "Open folder". */
async function openExampleFolder(page: Page): Promise<void> {
  const zip = await JSZip.loadAsync(readFileSync('examples/exemplo-completo.zip'));
  const files: { path: string; data: number[] }[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir) files.push({ path, data: [...(await entry.async('uint8array'))] });
  }
  await page.addInitScript(
    ([name, list]) => {
      Reflect.set(window, 'showDirectoryPicker', async () => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(name, { create: true });
        for (const f of list) {
          const parts = f.path.split('/');
          let d = dir;
          for (const part of parts.slice(0, -1))
            d = await d.getDirectoryHandle(part, { create: true });
          const h = await d.getFileHandle(parts[parts.length - 1]!, { create: true });
          const w = await h.createWritable();
          await w.write(new Uint8Array(f.data));
          await w.close();
        }
        return dir;
      });
    },
    [FOLDER, files] as const,
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Open folder/ }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

/** Does the field placeholder fit in its usable width? (measured by the text, without the `...`). */
async function placeholderFits(page: Page): Promise<{
  readonly placeholder: string;
  readonly text: number;
  readonly inner: number;
}> {
  return page
    .locator('.annotation-header .annotation-name')
    .first()
    .evaluate((e) => {
      const input = e as HTMLInputElement;
      const style = getComputedStyle(input);
      const probe = document.createElement('span');
      probe.style.font = style.font;
      probe.style.visibility = 'hidden';
      probe.style.position = 'absolute';
      probe.style.whiteSpace = 'pre';
      probe.textContent = input.placeholder;
      document.body.append(probe);
      const text = probe.getBoundingClientRect().width;
      probe.remove();
      const inner =
        input.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      return { placeholder: input.placeholder, text, inner };
    });
}

test.describe('annotation header in Details', () => {
  test('at 360 px, the placeholder fits whole in the Card and the Simple (with badge)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await openZip(page, 'avisos.zip', await avisosZip());
    await page.keyboard.press('Control+Shift+Digit3');
    for (const name of ['Card', 'Simple']) {
      await page.locator('.tree-row', { hasText: name }).first().click();
      const header = page.locator('.annotation-header').first();
      await expect(header.locator('.annotation-name')).toBeVisible();
      const width = await page.locator('.panel-details').evaluate((e) => e.clientWidth);
      expect(width, name).toBeLessThanOrEqual(360);
      const m = await placeholderFits(page);
      expect(m.placeholder).toBe('Instance label (optional)');
      expect(m.text, name).toBeLessThanOrEqual(m.inner);
    }
  });

  test('by folder at 900 px, copy and trash stay together on the 1st line and the name goes down', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 });
    await openExampleFolder(page);
    await page.keyboard.press('Control+Shift+Digit3');
    // pt-BR kept: shared fixture data (examples/exemplo-completo.zip) asserted by other tests
    for (const name of ['Barra', 'Chip Dados']) {
      await page.locator('.tree-row', { hasText: name }).first().click();
      const header = page.locator('.annotation-header').first();
      await expect(header.getByRole('button', { name: 'Copy reference' })).toBeVisible();
      const m = await header.evaluate((h) => {
        const top = (e: Element | null) => e?.getBoundingClientRect().top ?? -1;
        const copy = h.querySelector('[aria-label="Copy reference"]');
        const trash = h.querySelector('.icon-button-danger');
        const panel = document.querySelector('.panel-details')!;
        return {
          copy: top(copy),
          trash: top(trash),
          name: top(h.querySelector('.annotation-name')),
          scroll: [panel.scrollWidth, panel.clientWidth],
        };
      });
      expect(m.copy, name).toBe(m.trash);
      expect(m.name, name).toBeGreaterThan(m.copy);
      expect(m.scroll[0], name).toBeLessThanOrEqual(m.scroll[1]!);
    }

    // With a wide window, everything fits on one line and the header is the usual one.
    await page.setViewportSize({ width: 1592, height: 720 });
    const handle = page.getByRole('separator', { name: /Details/ });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x - 400, box.y + 100, { steps: 5 });
    await page.mouse.up();
    // pt-BR kept: shared fixture data (examples/exemplo-completo.zip: the marking is named 'E-mail')
    await page.locator('.tree-row', { hasText: 'E-mail' }).first().click();
    const height = await page
      .locator('.annotation-header')
      .first()
      .evaluate((h) => h.getBoundingClientRect().height);
    expect(height).toBeLessThan(40);
    await expect(page.locator('.annotation-header.is-split')).toHaveCount(0);
  });
});
