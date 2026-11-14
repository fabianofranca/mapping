import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  createProject,
  drawMarking,
  selectedRect,
  type MappingJson,
  type Rect,
} from './helpers';

// Stage 3a.2, in a real Chromium: folder project (an OPFS folder stands in for the one
// chosen in `showDirectoryPicker`, with the same file API), external changes to
// mapping.json and the reference and crop copies to the clipboard.

const FOLDER = 'mapping-e2e';
const MIME = 'application/x-mapping-item+json';

/** Replaces the folder picker with an OPFS folder (the file API is the same). */
async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
}

/** Opens the app, picks the "folder" and creates the project in it. */
async function openFolderProject(page: Page, name = 'Folder'): Promise<void> {
  await stubFolderPicker(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Open folder/ }).click();
  await page.getByRole('textbox').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

type FolderMapping = Omit<MappingJson, 'markings'> & {
  readonly revision: number;
  readonly project: { readonly name: string };
  readonly markings: readonly (MappingJson['markings'][number] & {
    readonly name: string | null;
  })[];
};

async function readMapping(page: Page): Promise<FolderMapping> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    // The app may be rewriting the file at this instant: Chrome refuses the read
    // (NotReadableError) if the file changes between getFile() and text(). Try again.
    for (let attempt = 0; ; attempt++) {
      try {
        const file = await (await dir.getFileHandle('mapping.json')).getFile();
        return JSON.parse(await file.text());
      } catch (error) {
        if (
          attempt >= 20 ||
          !(error instanceof DOMException) ||
          error.name !== 'NotReadableError'
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }, FOLDER);
}

/**
 * Another program (the MCP, a text editor) rewrites the folder's mapping.json: bumps the
 * revision and changes whatever is asked. No `eval`: the app's CSP applies to `evaluate` too.
 */
async function externalEdit(
  page: Page,
  change: { readonly projectName?: string; readonly markingName?: string },
): Promise<void> {
  await page.evaluate(
    async ([folder, projectName, markingName]) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(folder);
      const handle = await dir.getFileHandle('mapping.json');
      const mapping = JSON.parse(await (await handle.getFile()).text());
      mapping.revision += 1;
      if (projectName) mapping.project.name = projectName;
      if (markingName) mapping.markings[0].name = markingName;
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(mapping, null, 2));
      await writable.close();
    },
    [FOLDER, change.projectName ?? '', change.markingName ?? ''] as const,
  );
}

async function allowClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Folder project with an image and a selected marking. */
async function withMarking(page: Page) {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  // Autosave waits for the debounce (`AUTOSAVE_DELAY_MS`).
  await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);
  return (await readMapping(page)).markings[0]!;
}

const toast = (page: Page, text: string) =>
  page.getByRole('status').filter({ hasText: text });

test('Ctrl+C copies the reference of the selected item, with the item data along', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);
  const marking = (await readMapping(page)).markings[0]!;

  await page.keyboard.press('Control+c');
  await expect(toast(page, 'Reference copied')).toBeVisible();

  const code = marking.id.replaceAll('-', '').slice(0, 8);
  // Only the URL, without the readable path.
  expect(await clipboardText(page)).toBe(`mapping://${FOLDER}/m/${code}`);

  // The app's own format goes along (only the app reads it; the text is what the chat receives).
  const custom = await page.evaluate(
    async ([mime]) => {
      const [item] = await navigator.clipboard.read();
      const type = `web ${mime}`;
      if (!item?.types.includes(type)) return null;
      return JSON.parse(await (await item.getType(type)).text());
    },
    [MIME] as const,
  );
  expect(custom).toMatchObject({
    format: 'mapping-item',
    kind: 'm',
    project: FOLDER,
    item: { id: marking.id },
  });
});

test('Ctrl+Alt+C copies the marking crop as PNG, in pixels of the original image', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  const rect: Rect = await selectedRect(page);

  await page.keyboard.press('Control+Alt+c');
  await expect(toast(page, 'Crop copied')).toBeVisible();

  const size = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    if (!item?.types.includes('image/png')) return null;
    const bitmap = await createImageBitmap(await item.getType('image/png'));
    return { width: bitmap.width, height: bitmap.height };
  });
  expect(size).toEqual({ width: rect.width, height: rect.height });
});

test('with focus on a text field, Ctrl+C copies the field text', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));

  const name = page.getByLabel('Name', { exact: true }).first();
  await name.fill('Front door');
  await name.press('Control+a');
  await page.keyboard.press('Control+c');

  expect(await clipboardText(page)).toBe('Front door');
  await expect(toast(page, 'Reference copied')).toHaveCount(0);
});

test('Details: copy reference and copy crop next to the ID', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  const marking = await withMarking(page);
  await page.getByRole('button', { name: 'Copy reference' }).first().click();
  await expect(toast(page, 'Reference copied')).toBeVisible();
  const code = marking.id.replaceAll('-', '').slice(0, 8);
  expect(await clipboardText(page)).toContain(`mapping://${FOLDER}/m/${code}`);

  await page.getByRole('button', { name: 'Copy crop' }).click();
  await expect(toast(page, 'Crop copied')).toBeVisible();
});

test('Details: copy reference with clipboard-write only asks no permission and writes the text', async ({
  page,
  context,
}) => {
  // Owner's scenario: the person never granted "see copied text and images" (clipboard-read).
  await context.grantPermissions(['clipboard-write']);
  const marking = await withMarking(page);
  await page.getByRole('button', { name: 'Copy reference' }).first().click();
  await expect(toast(page, 'Reference copied')).toBeVisible();

  // Only after the click does it grant reading, to check what was written.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const code = marking.id.replaceAll('-', '').slice(0, 8);
  const text = await clipboardText(page);
  expect(text).toMatch(/^mapping:\/\//);
  expect(text).toMatch(new RegExp(`/m/${code}$`));
});

test('Tree row menu (desktop) copies the reference', async ({ page, context }) => {
  await allowClipboard(context);
  await withMarking(page);

  await page.getByRole('button', { name: /^Actions for images\/tela\.webp/ }).click();
  await page.getByRole('menuitem', { name: 'Copy reference' }).click();
  await expect(toast(page, 'Reference copied')).toBeVisible();
  expect(await clipboardText(page)).toMatch(/^mapping:\/\/[^/]+\/i\/[0-9a-f]{8}$/);
});

test('right click on the canvas selects the item and opens the copy menu', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  await withMarking(page);
  const center = await canvasPoint(page);
  // Clears the selection to prove that the right click selects.
  await page.keyboard.press('Escape');

  await page.mouse.click(center.x, center.y, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Canvas item menu' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Copy reference' }).click();
  await expect(menu).toBeHidden();
  await expect(toast(page, 'Reference copied')).toBeVisible();
  expect(await clipboardText(page)).toMatch(/^mapping:\/\/[^/]+\/m\/[0-9a-f]{8}$/);
});

test('Help → Shortcuts lists the two copy shortcuts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'View keyboard shortcuts' }).click();
  const help = page.getByRole('dialog');
  await expect(help.getByText('Copy the reference of the selected item')).toBeVisible();
  await expect(help.getByText('Copy the crop of the selected marking')).toBeVisible();
});

// Formerly guide R6.2 (closing the tab in the middle of the write): the browser extension does not close
// the app tab, so the data-loss coverage comes from here.
test('closing the page right after editing does not lose the marking (R6.2)', async ({
  page,
  context,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));

  // Closes without waiting for the debounce. If the app warns ("Leave page?"), it chooses to stay, waits
  // for Saved and closes again; if the `pagehide` write is enough, the page closes at once.
  let warned = false;
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') warned = true;
    void dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  if (warned && !page.isClosed()) {
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    await page.close({ runBeforeUnload: true });
  }

  // Another tab of the same context (same OPFS and same recents) reopens the folder.
  const reopened = await context.newPage();
  await stubFolderPicker(reopened);
  await reopened.goto('/');
  await reopened.getByRole('button', { name: /Open folder/ }).click();
  await expect(reopened.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await expect.poll(async () => (await readMapping(reopened)).markings.length).toBe(1);
  const mapping = await readMapping(reopened);
  expect(mapping.markings[0]?.containerId).toBe(mapping.containers[0]?.id);
});

// Guide R6.1: rename (Enter) and, right after, start dragging and press Esc without
// releasing. The name write goes out ~250 ms after Enter (session debounce); the cancelled
// drag must reach neither the disk nor the screen. `lateEsc` waits for the write before the drag.
for (const lateEsc of [false, true]) {
  test(`rename and cancel the drag with Esc leaves the new name and the old rect (R6.1, Esc ${
    lateEsc ? 'after' : 'before'
  } the write)`, async ({ page }) => {
    const marking = await withMarking(page);
    const center = await canvasPoint(page);
    const before = await selectedRect(page);
    expect(marking.rect).toEqual(before);
    const base = (await readMapping(page)).revision;

    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Title R6');
    await name.press('Enter');
    if (lateEsc) {
      await expect
        .poll(async () => (await readMapping(page)).markings[0]?.name)
        .toBe('Title R6');
      await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    }

    // Button in the middle of the marking (far from the handles), moves well past the threshold and presses
    // Esc without releasing.
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y + 40, { steps: 6 });
    await page.mouse.move(center.x + 120, center.y + 80, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.move(center.x + 140, center.y + 90, { steps: 3 });
    await page.mouse.up();

    // Screen: the marking went back to its place and the new name stayed.
    await expect(name).toHaveValue('Title R6');
    expect(await selectedRect(page)).toEqual(before);

    // Disk: after Saved, new name with the old rect and a single write of new content.
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    await expect
      .poll(async () => (await readMapping(page)).markings[0]?.name)
      .toBe('Title R6');
    const saved = await readMapping(page);
    expect(saved.markings[0]?.rect).toEqual(marking.rect);
    expect(saved.revision).toBe(base + 1);
    // Nothing else is written afterwards (the drag position does not appear).
    await page.waitForTimeout(800);
    const later = await readMapping(page);
    expect(later.markings[0]?.rect).toEqual(marking.rect);
    expect(later.revision).toBe(base + 1);
  });
}

test.describe('external changes to mapping.json', () => {
  test('each write bumps the revision', async ({ page }) => {
    await withMarking(page);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const before = (await readMapping(page)).revision;
    await page.getByLabel('Name', { exact: true }).first().fill('Door');
    await page.getByLabel('Name', { exact: true }).first().press('Enter');
    await expect
      .poll(async () => (await readMapping(page)).revision)
      .toBeGreaterThan(before);
  });

  test('editing the file from outside reloads the app by itself, with a discreet notice', async ({
    page,
  }) => {
    await withMarking(page);
    await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);

    await externalEdit(page, { markingName: 'Edited from outside' });

    await expect(toast(page, 'Project updated from outside')).toBeVisible({
      timeout: 10_000,
    });
    // The selection stays on the same marking, now with the new name.
    await expect(page.getByLabel('Name', { exact: true }).first()).toHaveValue(
      'Edited from outside',
    );
  });

  test('editing from outside and on both sides opens the dialog; "Keep mine" writes over it', async ({
    page,
  }) => {
    await withMarking(page);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const name = page.getByLabel('Name', { exact: true }).first();

    // Local change not yet written (saving waits for the debounce) + external change.
    await name.fill('My marking');
    await name.press('Enter');
    await externalEdit(page, { projectName: 'Name from the other program' });
    const external = await readMapping(page);

    const dialog = page.getByRole('dialog', { name: 'Project changed outside the app' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Keep mine' }).click();
    await expect(dialog).toBeHidden();

    await expect
      .poll(async () => (await readMapping(page)).markings[0]?.name)
      .toBe('My marking');
    expect((await readMapping(page)).revision).toBe(external.revision + 1);
  });

  test('"Reload" discards the local changes and opens the file as it is', async ({
    page,
  }) => {
    await withMarking(page);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const name = page.getByLabel('Name', { exact: true }).first();

    await name.fill('My marking');
    await name.press('Enter');
    await externalEdit(page, { markingName: 'From the other program' });

    const dialog = page.getByRole('dialog', { name: 'Project changed outside the app' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Reload' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByLabel('Name', { exact: true }).first()).toHaveValue(
      'From the other program',
    );
    // Nothing was written over the external file.
    expect((await readMapping(page)).markings[0]?.name).toBe('From the other program');
  });
});

// Phase 6.6: folder recents on the home screen. Here the "folder" is from the OPFS, which the
// real picker never returns: the app does not store it (Chromium crashes the page when reading an
// OPFS handle back from IndexedDB). The flow of the list, the click and the notice is exercised with an
// entry written straight into the recents database, without a handle; opening through the handle is in the
// controller tests (fake handles: granted, prompt, denied, NotFoundError).
test.describe('folder recents', () => {
  async function closeProject(page: Page): Promise<void> {
    await page.getByRole('button', { name: /: project actions$/ }).click();
    await page.getByRole('menuitem', { name: 'Close project', exact: true }).click();
  }

  /** Writes a recents entry (project and folder name, no handle) into IndexedDB. */
  async function seedRecentFolder(page: Page, name: string, folderName: string) {
    await page.evaluate(
      async ([projectName, folder]) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('mapping-folders');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('folders', 'readwrite');
          tx.objectStore('folders').put({
            id: 'seeded',
            name: projectName,
            folderName: folder,
            usedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      [name, folderName] as const,
    );
  }

  test('an OPFS folder does not enter the recents, and the app keeps running', async ({
    page,
  }) => {
    await openFolderProject(page, 'Private');
    await addImage(page);
    await closeProject(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Private' })).toHaveCount(0);
  });

  test('at 900 px the table does not wrap the badge and buttons, does not scroll and the border is continuous', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 });
    await stubFolderPicker(page);
    await createProject(page, 'Local');
    await closeProject(page);
    await seedRecentFolder(page, 'Stored', 'stored-folder');
    await page.reload();
    const rows = page.locator('tr[data-recent]');
    await expect(rows).toHaveCount(2);
    const table = page.locator('.project-table');
    expect(await table.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const smHeight = (await page.locator('.button-sm').first().boundingBox())!.height;
    for (const row of await rows.all()) {
      for (const el of await row.locator('.badge, .button').all()) {
        const box = (await el.boundingBox())!;
        expect(box.height).toBeLessThanOrEqual(smHeight + 1);
        expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      }
    }
    // Outside the last row, all cells, the actions one included, have the bottom border.
    const widths = await rows
      .first()
      .locator('th, td')
      .evaluateAll((cells) => cells.map((c) => getComputedStyle(c).borderBottomWidth));
    expect(widths.every((w) => parseFloat(w) > 0)).toBe(true);
    // And the bottom of each cell matches the row's: the border is a continuous line.
    for (const row of await rows.all()) {
      const bottoms = await row
        .locator('th, td')
        .evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect().bottom));
      expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(0.5);
    }
  });

  test('the list brings the stored folder; without access, the notice has Locate folder… and Remove from list', async ({
    page,
  }) => {
    await stubFolderPicker(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
    await seedRecentFolder(page, 'Stored', 'stored-folder');

    // Another visit: the list comes from IndexedDB, with the badge and the folder name.
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: 'Stored' });
    await expect(row.getByText('Folder', { exact: true })).toBeVisible();
    await expect(row.getByText('stored-folder')).toBeVisible();

    await row.getByRole('button', { name: /^Open /, exact: false }).click();
    const dialog = page.getByRole('dialog', { name: 'Folder unavailable' });
    await expect(dialog).toBeVisible();

    // The chosen (empty) folder has no mapping.json: the notice stays, with the reason.
    await dialog.getByRole('button', { name: 'Locate folder…' }).click();
    await expect(dialog.getByRole('alert')).toContainText('has no mapping.json');

    await dialog.getByRole('button', { name: 'Remove from list' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Stored' })).toHaveCount(0);
  });
});
