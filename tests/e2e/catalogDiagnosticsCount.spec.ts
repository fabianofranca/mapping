import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';

// #1894: the Catalog said "Valid package, no errors or warnings." while Diagnostics and the package
// window counted the warnings of the same package. The test reads the counts on screen, on the three
// paths that the directed retest of CL1 skipped, and requires the same number everywhere.
//
// Every zipped copy gets one warning of its own (one extra `params` entry on a type without
// `variants`, pointing to a name its base sheet lacks), so N is always above 0 and the test never
// depends on a fixed total: it holds whatever warnings the library itself gives.

const FOLDER = 'count-e2e';
const LIBRARY_DIR = 'libraries/material3-compose';
const SPEC_FILE = 'material3-compose.spec.json';
const LIBRARY_NAME = 'Material 3 (Compose)';
const COUNTS = /(\d+) error\(s\) and (\d+) warning\(s\)/;

interface SpecJson {
  layers: {
    annotationTypes: { id: string; code?: { compose?: Record<string, unknown> } }[];
  }[];
}

/** A copy of the library with one warning of its own (the `scaffold` type has no `variants`). */
function copyWithOwnWarning(withFiel: boolean): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'm3-count-')), 'm3-count');
  cpSync(LIBRARY_DIR, dir, { recursive: true });
  if (withFiel) execFileSync('node', ['scripts/testing/fiel.mjs', dir, '4']);
  const specPath = join(dir, SPEC_FILE);
  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as SpecJson;
  const type = spec.layers
    .flatMap((layer) => layer.annotationTypes)
    .find((t) => t.id === 'scaffold');
  const compose = type?.code?.compose;
  if (compose === undefined || compose['variants'] !== undefined)
    throw new Error('scaffold must be a type with code and without variants');
  compose['params'] = {
    ...(compose['params'] as Record<string, string>),
    width: 'noSuchParameter',
  };
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return dir;
}

async function zipOf(dir: string): Promise<Buffer> {
  const zip = new JSZip();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else zip.file(relative(dir, path), readFileSync(path));
    }
  };
  walk(dir);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const warningsIn = (text: string | null): number => {
  const match = COUNTS.exec(text ?? '');
  if (match === null) throw new Error(`no count in: ${text ?? '(empty)'}`);
  return Number(match[2]);
};

const warningsOf = async (locator: Locator): Promise<number> => {
  await expect(locator).toContainText(COUNTS);
  return warningsIn(await locator.textContent());
};

async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
}

test.use({ actionTimeout: 10_000 });

test('#1894 (a): R25 path, the package window, the Catalog and Diagnostics count the same', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const zip = await zipOf(copyWithOwnWarning(true));
  await stubFolderPicker(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Open folder/ }).click();
  await page.getByRole('textbox').fill('count');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();

  // Specializations › Apply zip…: the package window.
  await page
    .locator('.main-bar')
    .getByRole('button', { name: 'Specializations', exact: true })
    .click();
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'm3-fiel.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });
  const dialog = page.getByRole('dialog');
  const packageLine = dialog.getByText(COUNTS);
  const inPackageWindow = await warningsOf(packageLine);
  expect(inPackageWindow).toBeGreaterThan(0);
  test
    .info()
    .annotations.push({ type: 'package window', description: String(inPackageWindow) });
  const confirm = page.getByRole('button', { name: 'Apply', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  // Catalog (Ctrl+Shift+9), Components tab, as it opens: it opens on the first library of the
  // project (Notes, applied by default), whose own package is valid.
  await page.keyboard.press('Control+Shift+9');
  const select = page.locator('.catalog-window select');
  await expect(select).toBeVisible();
  const validation = page.getByRole('region', { name: 'Package validation' });
  await expect(validation).toBeVisible();
  const opensOn = await select.evaluate(
    (el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '',
  );
  const openingLine = ((await validation.textContent()) ?? '').trim();
  test.info().annotations.push({
    type: 'catalog opens on',
    description: `${opensOn}: ${openingLine}`,
  });

  // With Material 3 (Compose) chosen in the Library selector.
  await select.selectOption({ label: LIBRARY_NAME });
  const inCatalog = await warningsOf(validation);
  expect(inCatalog, 'Catalog with Material 3 chosen').toBe(inPackageWindow);

  // Diagnostics (Ctrl+Shift+6): the Library section.
  await page.keyboard.press('Control+Shift+6');
  const diagnostics = page
    .getByRole('region', { name: 'Library' })
    .getByText(new RegExp(`^${LIBRARY_NAME.replace(/[()]/g, '\\$&')}: `));
  expect(await warningsOf(diagnostics), 'Diagnostics, Library section').toBe(
    inPackageWindow,
  );
});

for (const [path, build] of [
  ['b', () => copyWithOwnWarning(true)],
  ['c', () => copyWithOwnWarning(false)],
] as const) {
  test(`#1894 (${path}): Open library, the Package validation line matches the package window`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const zip = await zipOf(build());

    // The same zip, applied to a project, gives the reference number (the package window).
    await stubFolderPicker(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Open folder/ }).click();
    await page.getByRole('textbox').fill('count');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    await page
      .locator('.main-bar')
      .getByRole('button', { name: 'Specializations', exact: true })
      .click();
    await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
      name: 'library.zip',
      mimeType: 'application/zip',
      buffer: zip,
    });
    const reference = await warningsOf(page.getByRole('dialog').getByText(COUNTS));
    expect(reference).toBeGreaterThan(0);
    test
      .info()
      .annotations.push({ type: 'package window', description: String(reference) });

    // Home screen › Open library: the standalone Catalog.
    await page.goto('/');
    await page.locator('input[data-library-zip]').setInputFiles({
      name: 'library.zip',
      mimeType: 'application/zip',
      buffer: zip,
    });
    const screen = page.getByRole('main', { name: 'Library catalog' });
    await expect(screen).toBeVisible();
    const line = screen.getByRole('region', { name: 'Package validation' });
    expect(await warningsOf(line), 'Open library, Package validation line').toBe(
      reference,
    );
  });
}
