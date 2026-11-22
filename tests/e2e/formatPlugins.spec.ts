import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { canvasPoint, createProject, exportMapping, watchViolations } from './helpers';

// Stage #2035 (AF3): Export in a format runs the specialization's plugin in the sandbox of the
// page (a hidden `sandbox="allow-scripts"` iframe that starts a Worker per call). These tests run
// against the final `dist/index.html`, over http and over `file://`, with the real CSP and
// Trusted Types, and require that nothing the plugin does produces a violation or leaves the page.

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
const LIBRARY = join(FIXTURES, 'format-library');
const PLUGINS = join(FIXTURES, 'plugins');
const DIST = join(process.cwd(), 'dist');
// The plugins of the executor tests that the browser also runs, as extra formats of the package.
const EXTRA = [
  'escape-browser',
  'loop',
  'throws',
  'module',
  'promise',
  'big-output',
] as const;
const PROJECT = 'Format project';
const SAVE_PICKER_OFF = () => Reflect.set(window, 'showSaveFilePicker', undefined);

interface SpecJson {
  fileFormats: Record<string, unknown>[];
}

/** The package: the `format-library` fixture plus the fixture plugins as extra formats. */
async function packageZip(): Promise<Buffer> {
  const zip = new JSZip();
  const spec = JSON.parse(
    readFileSync(join(LIBRARY, 'format-library.spec.json'), 'utf8'),
  ) as SpecJson;
  for (const id of EXTRA) {
    spec.fileFormats.push({
      id,
      name: id,
      extension: 'txt',
      plugin: `plugins/${id}.js`,
      contract: 1,
    });
    zip.file(`plugins/${id}.js`, readFileSync(join(PLUGINS, `${id}.js`)));
  }
  zip.file('format-library.spec.json', JSON.stringify(spec, null, 2));
  zip.file('plugins/notes.js', readFileSync(join(LIBRARY, 'plugins', 'notes.js')));
  for (const name of readdirSync(join(LIBRARY, 'examples')))
    zip.file(`examples/${name}`, readFileSync(join(LIBRARY, 'examples', name)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** Specializations › Apply zip…, confirming the package window. */
async function applyPackage(
  page: Page,
  zip: Buffer,
  name = 'format-library.zip',
): Promise<void> {
  await page
    .locator('.main-bar')
    .getByRole('button', { name: 'Specializations', exact: true })
    .click();
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name,
    mimeType: 'application/zip',
    buffer: zip,
  });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
}

async function openFormatDialog(page: Page, format: string) {
  await page.getByRole('button', { name: /: project actions$/ }).click();
  await page.getByRole('menuitem', { name: 'Export in a format…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export in a format' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel('Format')
    .selectOption({ label: `Format library › ${format} (.txt)` });
  return dialog;
}

/** Export in a format › Export: the result of the plugin, as the dialog that follows shows it. */
async function runFormat(page: Page, format: string) {
  const dialog = await openFormatDialog(page, format);
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  return dialog;
}

/** After a successful run: Download (`openProject` removed the save picker), and the downloaded text. */
async function downloadText(page: Page): Promise<{ name: string; text: string }> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const done = await download;
  return {
    name: done.suggestedFilename(),
    text: await readFile((await done.path()) ?? '', 'utf8'),
  };
}

async function openProject(page: Page, url: string) {
  const violations = await watchViolations(page);
  await createProject(page, PROJECT, url);
  await applyPackage(page, await packageZip());
  // Before the dialogs open: without the picker the app downloads with `<a download>`, which Playwright captures.
  await page.evaluate(SAVE_PICKER_OFF);
  return violations;
}

const FILE_URL = pathToFileURL(join(DIST, 'index.html')).href;

for (const [where, url] of [
  ['http', '/'],
  ['file://', FILE_URL],
] as const) {
  test.describe(`Export in a format (${where})`, () => {
    test.use({ actionTimeout: 10_000 });

    test('notes: the file gets the project name and the plugin text, with no violation', async ({
      page,
    }) => {
      const violations = await openProject(page, url);
      await runFormat(page, 'Notes');
      await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
      const file = await downloadText(page);
      expect(file.name).toBe(`${PROJECT}.txt`);
      expect(file.text).toBe('\n');
      expect(violations()).toEqual([]);
    });

    test('escape-browser: no request leaves the page and the globals are absent', async ({
      page,
    }) => {
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      const violations = await openProject(page, url);
      await runFormat(page, 'escape-browser');
      await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
      const file = await downloadText(page);
      expect(JSON.parse(file.text)).toEqual({
        found: [],
        fetch: 'threw',
        indexedDB: 'threw',
      });
      expect(requests.filter((u) => u.includes('example.invalid'))).toEqual([]);
      expect(violations()).toEqual([]);
      // The app's own storage stays intact: the project is still there after the run.
      await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    });
  });
}

test.describe('Export in a format: failures', () => {
  test.use({ actionTimeout: 10_000 });

  test('loop: plugin-timeout within the limit plus margin, the page keeps responding and the next export works', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openProject(page, '/');
    const dialog = await runFormat(page, 'loop');
    await expect(dialog.getByRole('alert')).toContainText('time limit of 5 s', {
      timeout: 15_000,
    });
    // The page was never blocked: a click on the canvas goes through.
    const point = await canvasPoint(page);
    await page.mouse.click(point.x, point.y);
    await dialog
      .getByLabel('Format')
      .selectOption({ label: 'Format library › Notes (.txt)' });
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible({
      timeout: 15_000,
    });
    expect((await downloadText(page)).text).toBe('\n');
  });

  test('throws: plugin-failed with the message and line:column', async ({ page }) => {
    await openProject(page, '/');
    const dialog = await runFormat(page, 'throws');
    await expect(dialog.getByRole('alert')).toContainText(
      /The plugin failed: Error: boom from the plugin: throws \(line 8, column \d+\)/,
    );
  });

  test('module: plugin-failed (an ES module is a syntax error in a classic script)', async ({
    page,
  }) => {
    await openProject(page, '/');
    const dialog = await runFormat(page, 'module');
    await expect(dialog.getByRole('alert')).toContainText('The plugin failed:');
  });

  test('promise: plugin-output-invalid', async ({ page }) => {
    await openProject(page, '/');
    const dialog = await runFormat(page, 'promise');
    await expect(dialog.getByRole('alert')).toContainText(
      'returned something the app cannot use',
    );
  });

  test('big-output: plugin-limit', async ({ page }) => {
    await openProject(page, '/');
    const dialog = await runFormat(page, 'big-output');
    await expect(dialog.getByRole('alert')).toContainText('went past a limit');
  });
});

// Stage #2035 (AF4): Import from a format. Preview runs `parse` in the sandbox on the projection of the
// project and shows what would be created and changed; Import applies that result in one undo entry.

const DATA_MODEL = join(process.cwd(), 'examples', 'libraries', 'data-model');
const NOTES_TEXT = 'Alpha\n  color=red\nBeta\n';

async function openImportDialog(page: Page, format: string, extension: string) {
  await page.getByRole('button', { name: /: project actions$/ }).click();
  await page.getByRole('menuitem', { name: 'Import from a format…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from a format' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Format').selectOption({ label: format });
  await expect(dialog.locator('input[type=file]')).toHaveAttribute(
    'accept',
    `.${extension}`,
  );
  return dialog;
}

/** The counts the preview table shows: `{ Containers: ['1', '0'], … }` (created, changed). */
async function previewCounts(dialog: Locator): Promise<Record<string, string[]>> {
  const rows = dialog.getByRole('table').locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const counts: Record<string, string[]> = {};
  for (const row of await rows.all()) {
    const cells = await row.locator('th, td').allTextContents();
    counts[cells[0] ?? ''] = cells.slice(1);
  }
  return counts;
}

async function previewFile(dialog: Locator, name: string, text: string) {
  await dialog.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
}

/** Export → Download reads `mapping.json`; the export dialog closes itself, so the keyboard goes back to the app. */
const countOf = async (page: Page) => {
  const { mapping } = await exportMapping(page);
  await expect(page.getByRole('dialog')).toBeHidden();
  return {
    containers: mapping.containers.length,
    markings: mapping.markings.length,
    annotations: mapping.annotations.length,
  };
};

const undoKey = (page: Page) => page.keyboard.press('Control+z');
const redoKey = (page: Page) => page.keyboard.press('Control+Shift+z');

for (const [where, url] of [
  ['http', '/'],
  ['file://', FILE_URL],
] as const) {
  test.describe(`Import from a format (${where})`, () => {
    test.use({ actionTimeout: 10_000 });

    test('notes: preview counts, Import, Ctrl+Z, Ctrl+Y, and re-importing creates nothing new', async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const violations = await openProject(page, url);
      const before = await countOf(page);
      const dialog = await openImportDialog(page, 'Format library › Notes (.txt)', 'txt');
      await expect(
        dialog.getByRole('button', { name: 'Import', exact: true }),
      ).toBeDisabled();
      await previewFile(dialog, 'notes.txt', NOTES_TEXT);
      expect(await previewCounts(dialog)).toEqual({
        Containers: ['1', '0'],
        Markings: ['2', '0'],
        Annotations: ['2', '0'],
        Arrows: ['0', '0'],
      });
      await dialog.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(dialog).toBeHidden();
      const imported = await countOf(page);
      expect(imported).toEqual({
        containers: before.containers + 1,
        markings: before.markings + 2,
        annotations: before.annotations + 2,
      });

      // One Ctrl+Z restores the project before the import; Ctrl+Y brings it back.
      await undoKey(page);
      expect(await countOf(page)).toEqual(before);
      await redoKey(page);
      expect(await countOf(page)).toEqual(imported);

      // The same file again creates nothing new: it only changes (the annotations it finds by title).
      const again = await openImportDialog(page, 'Format library › Notes (.txt)', 'txt');
      await previewFile(again, 'notes.txt', NOTES_TEXT);
      expect(await previewCounts(again)).toEqual({
        Containers: ['0', '0'],
        Markings: ['0', '0'],
        Annotations: ['0', '2'],
        Arrows: ['0', '0'],
      });
      expect(violations()).toEqual([]);
    });

    test('a file with another extension is refused, with no run', async ({ page }) => {
      await openProject(page, url);
      const dialog = await openImportDialog(page, 'Format library › Notes (.txt)', 'txt');
      await previewFile(dialog, 'notes.json', '{}');
      await expect(dialog.getByRole('alert')).toContainText('Choose a .txt file');
      await expect(
        dialog.getByRole('button', { name: 'Import', exact: true }),
      ).toBeDisabled();
    });
  });
}

test.describe('Import from a format: a library from a zip', () => {
  test.use({ actionTimeout: 10_000 });

  test('data-model: the OpenAPI example imports, undoes and redoes in one step each', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const violations = await watchViolations(page);
    await createProject(page, PROJECT, '/');
    const zip = new JSZip();
    const add = (dir: string) => {
      for (const entry of readdirSync(join(DATA_MODEL, dir), { withFileTypes: true })) {
        const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
        if (entry.isDirectory()) add(path);
        else zip.file(path, readFileSync(join(DATA_MODEL, path)));
      }
    };
    add('');
    await applyPackage(
      page,
      await zip.generateAsync({ type: 'nodebuffer' }),
      'data-model.zip',
    );
    await page.evaluate(SAVE_PICKER_OFF);
    const before = await countOf(page);
    const dialog = await openImportDialog(page, 'Data model › OpenAPI (.yaml)', 'yaml');
    await previewFile(
      dialog,
      'shop.openapi.yaml',
      readFileSync(join(DATA_MODEL, 'examples', 'shop.openapi.yaml'), 'utf8'),
    );
    const counts = await previewCounts(dialog);
    expect(counts).toEqual({
      Containers: ['1', '0'],
      Markings: ['6', '0'],
      Annotations: ['6', '0'],
      Arrows: ['0', '0'],
    });
    expect(Number(counts['Annotations']?.[0])).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog).toBeHidden();
    const imported = await countOf(page);
    expect(imported.containers).toBe(
      before.containers + Number(counts['Containers']?.[0]),
    );
    expect(imported.annotations).toBe(
      before.annotations + Number(counts['Annotations']?.[0]),
    );
    await undoKey(page);
    expect(await countOf(page)).toEqual(before);
    await redoKey(page);
    expect(await countOf(page)).toEqual(imported);
    expect(violations()).toEqual([]);
  });
});
