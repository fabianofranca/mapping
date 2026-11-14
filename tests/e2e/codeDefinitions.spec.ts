import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addImage,
  canvasPoint,
  drawMarking,
  exportMapping,
  projectAction,
} from './helpers';

// Stages 3b.3, 9 and Instantiation code (R3 of the tester guide): update the SDUI to the
// version with `repo` (formatVersion 5), the specialization `repo` read-only in Settings
// with only the local path editable, the "Definition" row in Details ("Open in repository" already
// from the specialization, with nothing configured, just the `href`: no navigation, and "Copy
// path"), the Screen without a code field, importing an old specialization with the
// `codeRef` field (ignored, with a warning) and the local clone edited from outside in `mapping.json`.

// pt-BR kept: shared fixture data (examples/specs/sdui.json: layers Telas and Componentes, fields nome and rota)
// asserted by other tests; the labels below that mention them are data, not UI.
const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
const FOLDER = 'code-mapping';
const ANDROID_REPO = {
  url: 'https://github.com/org/app-android',
  urlTemplate: 'https://github.com/org/app-android/blob/main/{path}',
  ref: 'v1.2.0',
};
const DS_BUTTON_KT = 'app/src/main/java/com/app/ds/DSButton.kt';
const DS_BUTTON_SWIFT = 'App/DesignSystem/DSButton.swift';

/** Swaps the folder picker for an OPFS folder (the file API is the same). */
async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
}

async function openFolderProject(page: Page): Promise<void> {
  await stubFolderPicker(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Open folder/ }).click();
  await page.getByRole('textbox').fill('Script 3b');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

/** Takes the current SDUI (formatVersion 11) back to what v5 knows: no groups, roles, external document or `migrations`. */
function downgradeToV5(spec: Record<string, unknown>): void {
  delete spec.docRepos;
  delete spec.migrations;
  const layers = spec.layers as {
    groups?: unknown;
    annotationTypes: Record<string, unknown>[];
  }[];
  for (const layer of layers) {
    delete layer.groups;
    for (const type of layer.annotationTypes) {
      delete type.groups;
      delete type.childRoles;
      delete type.childRolesLabel;
      delete type.doc;
      if (type.allowedChildren) {
        type.allowedChildren =
          type.id === 'input' ? ['validation'] : ['action', 'feedback'];
      }
    }
  }
}

/** The SDUI v1 (no platforms, `code` or Telas layer): the starting point of step 1. */
async function sduiV1(): Promise<Buffer> {
  const spec = JSON.parse(await readFile(SDUI, 'utf8')) as Record<string, unknown>;
  downgradeToV5(spec);
  const layers = (spec.layers as { id: string; annotationTypes: object[] }[])
    .filter((layer) => layer.id !== 'telas')
    .map((layer) => ({
      ...layer,
      annotationTypes: layer.annotationTypes.map((type) => {
        const copy = { ...(type as Record<string, unknown>) };
        delete copy.code;
        return copy;
      }),
    }));
  delete spec.platforms;
  return Buffer.from(JSON.stringify({ ...spec, formatVersion: 1, version: 1, layers }));
}

/**
 * The current SDUI (formatVersion 5) with `repo` only on `android` (with `urlTemplate`) and the other
 * platforms without `repo`, so the walkthrough does not depend on what the example declares.
 */
async function sduiV5(): Promise<Buffer> {
  const spec = JSON.parse(await readFile(SDUI, 'utf8')) as {
    formatVersion: number;
    platforms: { id: string; repo?: unknown }[];
  };
  downgradeToV5(spec as unknown as Record<string, unknown>);
  spec.formatVersion = 5;
  for (const platform of spec.platforms) {
    if (platform.id === 'android') platform.repo = ANDROID_REPO;
    else delete platform.repo;
  }
  return Buffer.from(JSON.stringify(spec));
}

const specInput = (page: Page) =>
  page.locator('input[type=file][accept=".json,application/json"]');

/** Applies the SDUI v1 and updates to v2 through the dialog (step 1 of the script). */
async function updateSduiToV2(page: Page): Promise<void> {
  await projectAction(page, 'Specializations');
  await specInput(page).setInputFiles({
    name: 'sdui-v1.json',
    mimeType: 'application/json',
    buffer: await sduiV1(),
  });
  await expect(
    page.getByRole('status').filter({ hasText: /^"SDUI" applied/ }),
  ).toBeVisible();
  // No platforms in v1.
  await expect(page.getByText('Platforms', { exact: true })).toHaveCount(0);

  // The file goes straight to the input (without opening the browser's native chooser).
  // One row per specialization (the notes library comes already applied): the SDUI is the last.
  await expect(
    page.getByRole('button', { name: 'Update version…' }).last(),
  ).toBeVisible();
  await specInput(page).setInputFiles({
    name: 'sdui.json',
    mimeType: 'application/json',
    buffer: await sduiV5(),
  });
  const confirm = page.getByRole('dialog', { name: 'Update "SDUI"?' });
  await expect(confirm).toContainText('New layers: Telas');
  await confirm.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /version \d+/ })).toBeVisible();
}

async function closeDialog(page: Page): Promise<void> {
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Close', exact: true })
    .click();
}

async function openSettings(page: Page): Promise<void> {
  await projectAction(page, 'Settings');
  await expect(
    page.getByRole('heading', { name: 'Repositories', exact: true }),
  ).toBeVisible();
}

/** Settings → Repositories: the local path of the `android` clone (the `repo` comes from the spec). */
async function configureLocalPath(page: Page): Promise<void> {
  await openSettings(page);
  const android = page.getByRole('group', { name: 'Android' });
  const local = android.getByLabel('Local path of the root');
  await local.fill('../../..');
  await local.press('Enter');
  await expect(local).toHaveValue('../../..');
}

/** Marking with the SDUI applied (nothing in Settings), a Button and the `Signup` Screen. */
async function createAnnotations(page: Page, withLocalPath = false): Promise<void> {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  if (withLocalPath) {
    await configureLocalPath(page);
    await closeDialog(page);
  }
  await page.getByRole('button', { name: 'Add annotation to layer Telas' }).click();
  await page.getByRole('button', { name: /^Screen/ }).click();
  await page.getByLabel('nome', { exact: true }).fill('Signup');
  await page.getByLabel('nome', { exact: true }).press('Enter');
  await page.getByLabel('rota', { exact: true }).fill('/signup');
  await page.getByLabel('rota', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Add annotation to layer Componentes' }).click();
  await page.getByRole('button', { name: /^Button/ }).click();
  await page.getByLabel('id', { exact: true }).fill('btn_signup');
  await page.getByLabel('id', { exact: true }).press('Enter');
  await page.getByLabel('texto', { exact: true }).fill('Sign up');
  await page.getByLabel('texto', { exact: true }).press('Enter');
}

/** The entries of the "Definition" row in Details (one per platform with `path`). */
const definitions = (page: Page) => page.locator('[data-definition]');

test('step 1: updating the SDUI to v2 shows the Telas layer and the platforms', async ({
  page,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);

  // The platforms of each specialization: name, id and language; the Android `repo` as a link.
  const specs = page.getByRole('dialog', { name: 'Specializations' });
  await expect(specs.getByText('Android · android · kotlin')).toBeVisible();
  await expect(specs.getByText('iOS · ios · swift')).toBeVisible();
  const repoLink = specs.getByRole('link', { name: ANDROID_REPO.url });
  await expect(repoLink).toHaveAttribute('href', ANDROID_REPO.url);
  await expect(repoLink).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(specs.getByText('ref v1.2.0')).toBeVisible();
  // The example has no field of the removed type: nothing to warn about.
  await expect(specs.getByText(/^Ignored fields/)).toHaveCount(0);
  await closeDialog(page);

  // The Telas layer came with the update (the Layers panel lists all of them).
  await expect(
    page.getByRole('button', { name: 'Add annotation to layer Telas' }),
  ).toBeVisible();
  const { mapping } = await exportMapping(page);
  expect(mapping.layers.map((l) => l.name)).toContain('Telas');
  expect(mapping.schemaVersion).toBe(20);
});

test('step 2: the specialization repo is read-only and only the local path is editable', async ({
  page,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  await openSettings(page);

  // Android declares the `repo`: plain link and ref, read-only; no address field.
  const android = page.getByRole('group', { name: 'Android' });
  const link = android.getByRole('link', { name: ANDROID_REPO.url });
  await expect(link).toHaveAttribute('href', ANDROID_REPO.url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(android.getByText('ref v1.2.0')).toBeVisible();
  await expect(android.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByLabel('File address')).toHaveCount(0);

  // iOS does not declare it: discreet text, no warning.
  const ios = page.getByRole('group', { name: 'iOS' });
  await expect(
    ios.getByText('The specialization does not declare the repository of this platform.'),
  ).toBeVisible();
  await expect(ios.getByRole('status')).toHaveCount(0);
  await expect(ios.getByRole('link')).toHaveCount(0);

  const local = android.getByLabel('Local path of the root');
  await local.fill('/abs/olute');
  await local.press('Enter');
  await expect(android.getByRole('alert')).toContainText(
    'relative to the project folder',
  );
  await local.fill('../../..');
  await local.press('Enter');
  await expect(android.getByRole('alert')).toHaveCount(0);
  await expect(local).toHaveValue('../../..');

  // Clear removes only the local clone: the specialization repo stays.
  await android.getByRole('button', { name: 'Clear the repository of Android' }).click();
  await expect(local).toHaveValue('');
  await expect(
    android.getByRole('button', { name: 'Clear the repository of Android' }),
  ).toBeDisabled();
  await expect(link).toBeVisible();
  await closeDialog(page);
  const { mapping } = await exportMapping(page);
  expect(mapping).toMatchObject({ platformRepos: {} });
});

test('step 3: "Definition" of the Button ("Open in repository" and "Copy path") and the Screen without a code field', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Nothing configured in Settings: the link already comes from the specialization.
  await createAnnotations(page);

  // Button selected in Details: one row per platform with `path`.
  await expect(page.getByText('Definition', { exact: true })).toBeVisible();
  await expect(definitions(page).first()).toBeVisible();
  const android = page.locator('[data-definition="android"]');
  const ios = page.locator('[data-definition="ios"]');
  await expect(android.locator('.code-definition-name')).toHaveText(
    'Android · DSButton.kt',
  );
  await expect(ios.locator('.code-definition-name')).toHaveText('iOS · DSButton.swift');

  // The link is a plain one, in another tab, without the `#L{line}` (the path has no line).
  const open = android.getByRole('link', { name: /^Open in repository/ });
  await expect(open).toHaveAttribute(
    'href',
    `https://github.com/org/app-android/blob/main/${DS_BUTTON_KT}`,
  );
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  // iOS does not declare repo in the specialization: no link, but with "Copy path".
  await expect(ios.getByRole('link')).toHaveCount(0);
  await ios.getByRole('button', { name: /^Copy path/ }).click();
  await expect(ios.getByRole('status')).toHaveText('Path copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DS_BUTTON_SWIFT);
  await android.getByRole('button', { name: /^Copy path/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DS_BUTTON_KT);

  // No implementation field in the Screen nor in what was saved.
  await expect(page.getByText('implementation')).toHaveCount(0);
  const { mapping } = await exportMapping(page);
  expect(mapping).toMatchObject({
    schemaVersion: 20,
    platformRepos: {},
  });
  const screen = mapping.annotations.find((a) => a.type?.typeId === 'screen');
  expect(screen?.values).toEqual({ nome: 'Signup', rota: '/signup' });
});

test('step 4: an old specialization with a codeRef field is applied without it, with a warning', async ({
  page,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await projectAction(page, 'Specializations');
  await specInput(page).setInputFiles({
    name: 'sdui-old.json',
    mimeType: 'application/json',
    buffer: await sduiWithCodeRef(),
  });
  await expect(
    page.getByRole('status').filter({ hasText: /^"SDUI" applied/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /^Ignored fields: screen\.implementation\./ }),
  ).toBeVisible();
  await closeDialog(page);

  // The Screen is born only with the fields of the current format.
  await page.getByRole('button', { name: 'Add annotation to layer Telas' }).click();
  await page.getByRole('button', { name: /^Screen/ }).click();
  await expect(page.getByLabel('nome', { exact: true })).toBeVisible();
  await expect(page.getByText('implementation')).toHaveCount(0);
  const { mapping } = await exportMapping(page);
  const screen = mapping.annotations.find((a) => a.type?.typeId === 'screen');
  expect(Object.keys(screen?.values ?? {})).toEqual(['nome', 'rota']);
});

test('step 5: local clone edited from outside (JSON) reaches Settings; the link does not change', async ({
  page,
}) => {
  await createAnnotations(page);
  // Wait for the last edit to reach the disk: with a pending write, the outside change
  // becomes the conflict dialog instead of the reload.
  await expect
    .poll(async () => {
      const m = await readMapping(page);
      return m.annotations.find((a) => a.type?.typeId === 'button')?.values?.texto;
    })
    .toBe('Sign up');

  await setAndroidLocalPath(page, '../../other');
  await expect(
    page.getByRole('status').filter({ hasText: 'Project updated from outside' }),
  ).toBeVisible({ timeout: 10_000 });
  await openSettings(page);
  await expect(
    page.getByRole('group', { name: 'Android' }).getByLabel('Local path of the root'),
  ).toHaveValue('../../other');
  await closeDialog(page);
  // The address belongs to the specialization: the "Definition" link stays.
  await expect(page.locator('[data-definition="android"]').getByRole('link')).toHaveCount(
    1,
  );
});

/** The SDUI with the removed field (`codeRef`) back in the Screen, like the old specializations. */
async function sduiWithCodeRef(): Promise<Buffer> {
  const spec = JSON.parse(await readFile(SDUI, 'utf8')) as {
    layers: { annotationTypes: { id: string; fields: object[] }[] }[];
  };
  const screen = spec.layers
    .flatMap((l) => l.annotationTypes)
    .find((t) => t.id === 'screen');
  screen?.fields.push({
    key: 'implementation',
    label: 'implementation',
    type: 'codeRef',
  });
  return Buffer.from(JSON.stringify(spec));
}

async function readMapping(page: Page): Promise<{
  revision: number;
  annotations: {
    type: { typeId: string } | null;
    values: Record<string, unknown> | null;
  }[];
}> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    const file = await (await dir.getFileHandle('mapping.json')).getFile();
    return JSON.parse(await file.text());
  }, FOLDER);
}

/** Another program writes the local clone of `android` in `mapping.json` (text edit). */
async function setAndroidLocalPath(page: Page, localPath: string): Promise<void> {
  await page.evaluate(
    async ({ folder, next }) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(folder);
      const handle = await dir.getFileHandle('mapping.json');
      const mapping = JSON.parse(await (await handle.getFile()).text());
      mapping.revision += 1;
      mapping.platformRepos.android = { localPath: next };
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(mapping, null, 2));
      await writable.close();
    },
    { folder: FOLDER, next: localPath },
  );
}
