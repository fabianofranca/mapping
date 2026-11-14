import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// Details at 900 px with the project opened from a folder: the item header has the
// "Copy reference" button (it only exists with an origin folder) and no child exceeds the width of the
// panel, with no horizontal bar.

test.use({ viewport: { width: 900, height: 720 } });

const FOLDER = 'example-folder-e2e';

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

test('Details in review at 900 px without a horizontal bar with the project opened from a folder', async ({
  page,
}) => {
  await openExampleFolder(page);
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit7');
  await page.keyboard.press('Control+Shift+Digit2');
  await page.keyboard.press('Control+Shift+Digit1');
  await page
    // pt-BR kept: shared fixture data (examples/exemplo-completo.zip) asserted by other tests
    .getByRole('button', { name: 'Review: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Read-only').first()).toBeVisible();
  for (const box of await page.getByRole('checkbox', { name: /^Show layer / }).all()) {
    if ((await box.isChecked()) && (await box.isEnabled()))
      await box.uncheck({ force: true });
  }
  await page
    .getByRole('group', { name: 'Canvas view' })
    .getByRole('button', { name: 'Proposed', exact: true })
    .click();
  // pt-BR kept: shared fixture data (examples/exemplo-completo.zip) asserted by other tests
  await page.locator('.tree-row', { hasText: 'Dados da conta' }).first().click();
  await page.getByRole('button', { name: 'Show here' }).first().click();
  await expect(
    page.getByRole('button', { name: 'Copy reference' }).first(),
  ).toBeVisible();

  // Nothing in the panel goes past its right edge, and the annotation name field is not
  // squeezed (the Copy reference button only exists with an origin folder).
  const m = await page.evaluate(() => {
    const b = document.querySelector('[data-window="details"] .tool-window-body')!;
    const p = document.querySelector('.panel-details')!;
    const pr = p.getBoundingClientRect();
    const over = [...p.querySelectorAll<HTMLElement>('*')]
      .filter((e) => e.getBoundingClientRect().right > pr.right + 0.5)
      .map((e) => `${e.tagName}.${e.getAttribute('class')}`);
    const name = document.querySelector<HTMLElement>(
      '.annotation-header .annotation-name',
    );
    return {
      over,
      body: [b.scrollWidth, b.clientWidth],
      panel: [p.scrollWidth, p.clientWidth],
      nameWidth: name?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(m.over).toEqual([]);
  expect(m.body[0]).toBeLessThanOrEqual(m.body[1]!);
  expect(m.panel[0]).toBeLessThanOrEqual(m.panel[1]!);
  expect(m.nameWidth).toBeGreaterThanOrEqual(90);
});
