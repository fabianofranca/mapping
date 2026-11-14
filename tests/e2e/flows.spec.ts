import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { join } from 'node:path';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
  exportMapping,
  openExport,
  selectedRect,
} from './helpers';

const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
// pt-BR kept: the example spec file is named 'modelo-de-dados.json' (examples/specs)
const MODELO = join(process.cwd(), 'examples', 'specs', 'modelo-de-dados.json');

test('new project → image → marking → annotation → zip with the mapping.json', async ({
  page,
}) => {
  await createProject(page, 'E2E project');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await page
    .getByRole('button', { name: /Add annotation to layer/ })
    .first()
    .click();
  await page.getByLabel('Annotation name').fill('Sign in button');
  await page.getByLabel('Annotation name').press('Enter');
  await page.getByRole('button', { name: '+ Pair' }).click();
  await page.getByLabel('Key').fill('action');
  await page.getByLabel('Key').press('Tab');
  await page.getByLabel('Value').fill('login');
  await page.getByLabel('Value').press('Enter');

  const { mapping, files } = await exportMapping(page);
  expect(mapping.schemaVersion).toBe(20);
  expect(files).toContain('images/tela.webp');
  expect(mapping.containers).toHaveLength(1);
  expect(mapping.containers[0]).toMatchObject({
    file: 'images/tela.webp',
    width: 400,
    height: 800,
  });
  expect(mapping.markings).toHaveLength(1);
  const marking = mapping.markings[0];
  if (!marking) throw new Error('no marking');
  expect(marking.containerId).toBe(mapping.containers[0]?.id);
  // The rectangle is in pixels of the original image, inside it.
  const { x, y, width, height } = marking.rect;
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(x + width).toBeLessThanOrEqual(400);
  expect(y + height).toBeLessThanOrEqual(800);
  expect(mapping.annotations).toHaveLength(1);
  expect(mapping.annotations[0]).toMatchObject({
    markingId: marking.id,
    name: 'Sign in button',
    type: null,
  });
  expect(mapping.annotations[0]?.entries.map((e) => [e.key, e.value])).toEqual([
    ['action', 'login'],
  ]);
});

test('SDUI example → Input with `dado` pointing to a free tuple', async ({ page }) => {
  await createProject(page, 'SDUI project');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, SDUI);

  // Free annotation with the `name: string` tuple (free layer).
  await page
    .getByRole('button', { name: 'Add annotation to layer Layer 1' })
    .first()
    .click();
  await page.getByLabel('Annotation name').fill('User');
  await page.getByLabel('Annotation name').press('Enter');
  await page.getByRole('button', { name: '+ Pair' }).click();
  await page.getByLabel('Key').fill('name');
  await page.getByLabel('Key').press('Tab');
  await page.getByLabel('Value').fill('string');
  await page.getByLabel('Value').press('Enter');

  // Input in the components layer.
  await page
    .getByRole('button', {
      // pt-BR kept: layer name of examples/specs/sdui.json
      name: 'Add annotation to layer Componentes',
    })
    .click();
  await page.getByRole('button', { name: /^Input/ }).click();
  await page.getByLabel('id', { exact: true }).fill('input_name');
  await page.getByLabel('id', { exact: true }).press('Enter');
  // Reference picker in a popup (B14): search and Enter picks.
  // pt-BR kept: field id `dado` of examples/specs/sdui.json
  const dado = page.getByRole('button', { name: /: dado$/ });
  await dado.click();
  await page.getByRole('combobox', { name: 'Search target' }).fill('name');
  await page.getByRole('combobox', { name: 'Search target' }).press('Enter');
  // A single arrow in the field: the icon (stage 7, O2); the text arrow stays in the hint.
  await expect(dado).toContainText('User.name');
  await expect(dado).not.toContainText('→');
  await expect(dado.locator('xpath=..').locator('[data-tooltip]')).toContainText(
    /→ User\.name/,
  );

  const { mapping } = await exportMapping(page);
  expect(mapping.specializations).toEqual(
    // The notes library comes already applied in every new project (ME3).
    [
      { id: 'notas', version: 3 },
      { id: 'sdui', version: 4 },
    ].map((s) => expect.objectContaining(s)),
  );
  const free = mapping.annotations.find((a) => a.type === null);
  const input = mapping.annotations.find((a) => a.type?.typeId === 'input');
  expect(free?.entries).toHaveLength(1);
  expect(input?.type).toEqual({ specId: 'sdui', typeId: 'input' });
  expect(input?.values).toMatchObject({
    id: 'input_name',
    dado: { annotationId: free?.id, entryId: free?.entries[0]?.id },
  });
});

test('checkbox and text of "Show components over photos" stay on the same line', async ({
  page,
}) => {
  await page.goto('/');
  // Settings is a dialog: button of the side column (desktop) or of the bar (phone).
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const check = page.getByLabel('Show components over photos');
  const text = page.locator('label.choice .choice-label').first();
  await expect(check).toBeVisible();
  const [c, s] = await Promise.all([check.boundingBox(), text.boundingBox()]);
  if (!c || !s) throw new Error('no bounding box');
  // Same vertical band (the boxes overlap) and the checkbox is to the left of the text.
  expect(c.y).toBeLessThan(s.y + s.height);
  expect(s.y).toBeLessThan(c.y + c.height);
  expect(c.x + c.width).toBeLessThanOrEqual(s.x + 1);
});

// R4: editor structure on the desktop (B1, B2, B8, B11, P4).
test('desktop: tool windows open, resize and are remembered', async ({ page }) => {
  await createProject(page, 'Windows');

  // Status bar and breadcrumbs with no selection.
  await expect(page.getByText('schema v20')).toBeVisible();
  await expect(page.locator('.crumbs')).toContainText('Nothing selected');

  // Tree and Details open by default; the List opens from the strip.
  const tree = page.getByRole('region', { name: 'Marking tree' });
  const list = page.getByRole('region', { name: 'Annotation list' });
  await expect(tree).toBeVisible();
  await expect(page.getByRole('region', { name: 'Details' })).toBeVisible();
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: 'Annotation list', exact: true }).click();
  await expect(list).toBeVisible();

  // Close from the header; reopen with the official shortcut (Ctrl+Shift+4).
  await page.getByRole('button', { name: 'Close the Annotation list window' }).click();
  await expect(list).toBeHidden();
  await page.keyboard.press('Control+Shift+Digit4');
  await expect(list).toBeVisible();

  // The bottom window has one tab per window (R7): Incomplete (5) and Diagnostics (6).
  await page.keyboard.press('Control+Shift+Digit5');
  await expect(page.getByRole('region', { name: 'Incomplete' })).toBeVisible();
  await expect(list).toBeHidden();
  await page.keyboard.press('Control+Shift+Digit6');
  await expect(page.getByRole('region', { name: 'Diagnostics' })).toBeVisible();
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(list).toBeVisible();

  // Ctrl+Shift+arrows resize the focused window, in steps of 16px.
  const width = () =>
    tree.evaluate((el: HTMLElement) => el.getBoundingClientRect().width);
  const before = await width();
  await tree.focus();
  await page.keyboard.press('Control+Shift+ArrowRight');
  expect(await width()).toBe(before + 16);

  // The layout is remembered: back to the home screen and open the project again.
  await page.getByRole('button', { name: /: project actions$/ }).click();
  await page.getByRole('menuitem', { name: 'Close project', exact: true }).click();
  await page.locator('[data-recent-open]').first().click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await expect(list).toBeVisible();
  expect(await width()).toBe(before + 16);
});

// R6: Tree and Layers as windows on the left (B3).
test('desktop: Tree and Layers share the left column', async ({ page }) => {
  await createProject(page, 'Layers project');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));

  const tree = page.getByRole('region', { name: 'Marking tree' });
  const layers = page.getByRole('region', { name: 'Layers', exact: true });
  await expect(tree).toBeVisible();
  await expect(layers).toBeVisible();
  const [t, l] = await Promise.all([tree.boundingBox(), layers.boundingBox()]);
  if (!t || !l) throw new Error('windows have no size');
  // Same width and Layers below the Tree.
  expect(l.width).toBe(t.width);
  expect(l.y).toBeGreaterThanOrEqual(t.y + t.height - 1);

  // New layer from the header; rename in the row itself. The new project already has the
  // Notes layer (notes library applied by default): the new one is the third.
  await layers.getByRole('button', { name: 'New layer' }).click();
  const names = layers.getByLabel('Layer name');
  await expect(names).toHaveCount(3);
  await names.nth(2).fill('Painting');
  await names.nth(2).press('Enter');
  await expect(names.nth(2)).toHaveValue('Painting');

  // The palette opens in a popover, changes the color and closes.
  await layers.getByRole('button', { name: 'Color of layer Painting' }).click();
  const palette = page.getByRole('group', { name: 'Color of layer Painting' });
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: '#1E88E5' }).click();
  await expect(palette).toBeHidden();

  // There is no active layer: no "Make active" nor chip, and any layer can be hidden.
  await expect(layers.getByRole('button', { name: /^Make active/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Layers \(active/ })).toHaveCount(0);
  const paintingBox = layers.getByRole('checkbox', { name: 'Show layer Painting' });
  await paintingBox.uncheck();
  await expect(paintingBox).not.toBeChecked();
  await paintingBox.check();

  // Delete is in the row menu and asks for confirmation.
  await layers.getByRole('button', { name: 'More actions for layer Painting' }).click();
  await page.getByRole('menuitem', { name: 'Delete layer' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(names).toHaveCount(2);

  // The "without annotation" mode is in the window footer.
  const mode = layers.getByLabel('Markings without annotations');
  await mode.selectOption('hide');
  await expect(mode).toHaveValue('hide');
  await mode.selectOption('dim');

  // Closing Layers leaves the Tree alone; Ctrl+Shift+2 reopens and focuses it.
  await page.getByRole('button', { name: 'Close the Layers window' }).click();
  await expect(layers).toBeHidden();
  await expect(tree).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit2');
  await expect(layers).toBeVisible();
  await expect(layers).toBeFocused();
});

test('desktop: the tree collapses nodes, collapses all and locates the selection', async ({
  page,
}) => {
  await createProject(page, 'Tree view');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page), { width: 160, height: 160 });
  await drawMarking(page, await canvasPoint(page, 0.7), { width: 80, height: 60 });

  const tree = page.getByRole('region', { name: 'Marking tree' });
  const rows = tree.locator('.tree-item');
  await expect(rows).toHaveCount(3);
  // The row height follows the desktop density (28px).
  const box = await rows.first().boundingBox();
  expect(box?.height).toBe(28);

  await tree.getByRole('button', { name: /^Collapse images\/tela/ }).click();
  await expect(rows).toHaveCount(1);
  await tree.getByRole('button', { name: /^Expand images\/tela/ }).click();
  await expect(rows).toHaveCount(3);

  await tree.getByRole('button', { name: 'Collapse all' }).click();
  await expect(rows).toHaveCount(1);
  // Locate opens the ancestors of the selection and focuses its row.
  await tree.getByRole('button', { name: 'Locate the selection in the tree' }).click();
  await expect(rows).toHaveCount(3);
  await expect(tree.locator('.tree-item[aria-current="true"]')).toBeFocused();
});

// R8: phone with a top bar, Panels, full screens and a three-height drawer (B6, B7).
test('desktop: Details with shortcuts, pair dragging and collapsible sections', async ({
  page,
}) => {
  await createProject(page, 'Details project');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  const details = page.getByRole('region', { name: 'Details' });

  // The layer's + creates the annotation, with focus on the name (Alt+N does nothing).
  await page.keyboard.press('Alt+KeyN');
  await expect(details.getByLabel('Annotation name')).toHaveCount(0);
  await details
    .getByRole('button', { name: /Add annotation to layer/ })
    .first()
    .click();
  const name = details.getByLabel('Annotation name');
  await expect(name).toBeFocused();
  await name.fill('Button');
  await name.press('Enter');

  // + Pair and Alt+Enter create pairs.
  await details.getByRole('button', { name: '+ Pair' }).click();
  await details.getByLabel('Key').fill('a');
  await details.getByLabel('Key').press('Tab');
  await details.getByLabel('Value').fill('1');
  await details.getByLabel('Value').press('Alt+Enter');
  const keys = details.getByLabel('Key');
  await expect(keys.nth(1)).toBeFocused();
  await keys.nth(1).fill('b');
  await keys.nth(1).press('Enter');
  await expect(keys).toHaveCount(2);

  // Drag pair "b" by its handle onto "a" (P6).
  const grip = details.getByRole('button', { name: 'Move pair b' });
  const target = details.getByRole('button', { name: 'Move pair a' });
  const from = await grip.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('no handles');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 5 });
  await page.mouse.up();
  await expect(keys.nth(0)).toHaveValue('b');
  await expect(keys.nth(1)).toHaveValue('a');

  // Marking section collapsed: shows the summary and hides the fields (B15).
  await details.getByRole('button', { name: /^Marking/ }).click();
  await expect(details.getByLabel('X', { exact: true })).toBeHidden();
  await expect(details.getByText(/^X \d+ · Y \d+ · \d+ × \d+ px$/)).toBeVisible();

  const { mapping } = await exportMapping(page);
  expect(mapping.annotations[0]?.entries.map((e) => e.key)).toEqual(['b', 'a']);
});

// R9: dialogs and home screen (B9, B10, B16, P8, P10).
test('home screen: actions, search and recents table', async ({ page }) => {
  await createProject(page, 'Car');
  await page.getByRole('button', { name: /: project actions$/ }).click();
  await page.getByRole('menuitem', { name: 'Close project', exact: true }).click();

  await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open zip/ })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('On this device');
  await expect(page.getByRole('complementary', { name: 'Home' })).toBeVisible();

  // The search ignores accents and case.
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('CAR');
  await expect(page.getByText('Car', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('zzz');
  await expect(page.getByText('No project found for "zzz".')).toBeVisible();
});

test('Help: search and Shortcuts section; Settings leads to it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog');

  // Theme as a segmented control.
  const theme = settings.getByRole('group', { name: 'Theme' });
  await theme.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await theme.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await settings.getByRole('button', { name: 'View keyboard shortcuts' }).click();
  const help = page.getByRole('dialog');
  await expect(
    help.getByRole('heading', { name: 'Keyboard shortcuts' }),
  ).toBeInViewport();
  await expect(help.getByText('Ctrl', { exact: true }).first()).toBeVisible();

  // "reference" is now also in the shortcuts (copy reference): use a term from other sections only.
  await help.getByRole('searchbox', { name: 'Search help' }).fill('specialization');
  await expect(help.getByRole('link', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  await help.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Export: the dialog shows the file and closes from the header', async ({ page }) => {
  await createProject(page, 'Exports');
  await addImage(page);
  await openExport(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.file-card')).toContainText('.zip');
  await expect(dialog.locator('.file-card')).toContainText('Zip file');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// Phase 6.1 (finding 7): in Chrome, Download opens "Save as" (`showSaveFilePicker`) and the
// "Unexported changes" notice only goes away after the zip is written. The picker is
// simulated: cancelling rejects with `AbortError`; saving returns an OPFS file, written
// by the real `createWritable`.
async function simulateSavePicker(page: Page, outcome: 'cancel' | 'save'): Promise<void> {
  await page.evaluate((outcome) => {
    Reflect.set(window, 'showSaveFilePicker', async (options: unknown) => {
      Reflect.set(window, '__savePickerOptions', options);
      if (outcome === 'cancel') throw new DOMException('cancelled', 'AbortError');
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle('exported.zip', { create: true });
    });
  }, outcome);
}

test('Export: cancelling "Save as" keeps "Unexported changes"', async ({ page }) => {
  await createProject(page, 'Cancels');
  await addImage(page);
  const statusbar = page.locator('.statusbar');
  await expect(statusbar).toContainText('Unexported changes');
  await simulateSavePicker(page, 'cancel');
  await openExport(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Download' }).click();
  await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(statusbar).toContainText('Unexported changes');
});

test('Export: saving through "Save as" writes the zip and clears the notice', async ({
  page,
}) => {
  await createProject(page, 'Saves');
  await addImage(page);
  const statusbar = page.locator('.statusbar');
  await expect(statusbar).toContainText('Unexported changes');
  await simulateSavePicker(page, 'save');
  await openExport(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Download' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(statusbar).not.toContainText('Unexported changes');
  const options = await page.evaluate(() => Reflect.get(window, '__savePickerOptions'));
  expect(options).toMatchObject({ suggestedName: expect.stringMatching(/\.zip$/) });
  const bytes = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle('exported.zip')).getFile();
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  });
  const zip = await JSZip.loadAsync(new Uint8Array(bytes));
  expect(Object.keys(zip.files)).toContain('mapping.json');
});

// Minimum height (AG4, #552): the notice also applies below 720 px of height, without unmounting.
test('short window: notice below 720 px of height and back when it grows', async ({
  page,
}) => {
  await createProject(page, 'Short');
  await page.setViewportSize({ width: 1280, height: 719 });
  await expect(
    page.getByRole('heading', { name: 'Open in a larger window' }),
  ).toBeVisible();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    page.getByRole('heading', { name: 'Open in a larger window' }),
  ).toHaveCount(0);
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
});

// Phase 5.8: desktop only. Below 900 px the app shows the notice in place of the editor,
// without unmounting anything; when widened, the editor returns with the same selection and zoom.
test('narrow window: notice in place of the editor and back when widened', async ({
  page,
}) => {
  await createProject(page, 'Narrow');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  const rect = await selectedRect(page);
  await page.keyboard.press('Control+Equal');
  const zoom = page.locator('.zoom-field').first();
  const zoomText = await zoom.textContent();
  const host = page.locator('.canvas-host');
  const fits = await host.getAttribute('data-fits');

  await page.setViewportSize({ width: 600, height: 860 });
  await expect(
    page.getByRole('heading', { name: 'Open in a larger window' }),
  ).toBeVisible();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 860 });
  await expect(
    page.getByRole('heading', { name: 'Open in a larger window' }),
  ).toHaveCount(0);
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await expect(zoom).toHaveText(zoomText ?? '');
  expect(await selectedRect(page)).toEqual(rect);
  // The canvas was neither remounted nor refitted.
  expect(await host.getAttribute('data-fits')).toBe(fits);
});

// Stage 6 (6.4), finding 2: hidden hints do not widen dialogs, windows or the editor.
// Measures the containers that scroll (overflow auto/scroll) and the `.editor` (which never scrolls).
async function horizontalOverflow(page: Page, root: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const found: string[] = [];
    for (const base of document.querySelectorAll<HTMLElement>(selector)) {
      for (const el of [base, ...base.querySelectorAll<HTMLElement>('*')]) {
        const overflowX = getComputedStyle(el).overflowX;
        const scrolls = overflowX === 'auto' || overflowX === 'scroll';
        if (!scrolls && !el.matches('.editor')) continue;
        if (el.scrollWidth > el.clientWidth || el.scrollLeft !== 0) {
          found.push(
            `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}x${el.clientWidth} (scrollLeft ${el.scrollLeft})`,
          );
        }
      }
    }
    return found;
  }, root);
}

test('no horizontal bar: Settings, windows and the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await horizontalOverflow(page, 'dialog[open]')).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();

  await createProject(page, 'No scrolling');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, SDUI);
  await page
    .getByRole('button', { name: /Add annotation to layer/ })
    .first()
    .click();
  await page.getByLabel('Annotation name').fill('Button');
  await page.getByLabel('Annotation name').press('Enter');
  expect(await horizontalOverflow(page, '.editor')).toEqual([]);

  // Scrolling each editor button into view (like the report's auto-scroll) does not shift it.
  await page.evaluate(() => {
    for (const b of document.querySelectorAll<HTMLElement>('.editor button')) {
      b.scrollIntoView({ block: 'nearest', inline: 'end' });
    }
  });
  expect(await horizontalOverflow(page, '.editor')).toEqual([]);
});

// Stage 6 (6.4), finding 3: with the Layers window short, the badge stays inside the row (the
// list scrolls instead of shrinking the rows). Finding 5: at the default width of Details, the
// table columns do not overlap.
test('specialization badge inside the row with the Layers window short', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await createProject(page, 'Badges');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, SDUI);
  await applySpecialization(page, MODELO);

  const layers = page.getByRole('region', { name: 'Layers', exact: true });
  const rows = layers.locator('.layer-row');
  // The previous six plus Notes (notes library applied by default).
  await expect(rows).toHaveCount(7);
  for (const row of await rows.all()) {
    const badge = row.locator('.layer-badge');
    if ((await badge.count()) === 0) continue;
    const [r, b] = await Promise.all([row.boundingBox(), badge.boundingBox()]);
    if (!r || !b) continue; // outside the visible area of the list (which scrolls)
    expect(b.y + b.height).toBeLessThanOrEqual(r.y + r.height + 0.5);
    // The specialization name shows in full (the hint only covers what does not fit in the panel).
    expect(
      await badge.evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
});

test('`atributos` table without overlapping columns at the default width of Details', async ({
  page,
}) => {
  await createProject(page, 'Table');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, MODELO);
  await page
    .getByRole('button', {
      // pt-BR kept: layer and type names of examples/specs/modelo-de-dados.json
      name: 'Add annotation to layer Classes',
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Classe/ })
    .click();
  const details = page.getByRole('region', { name: 'Details' });
  await details.getByRole('button', { name: '+ Row' }).click();
  // pt-BR kept: field labels `exemplo` and `obrigatório` of examples/specs/modelo-de-dados.json
  await details.getByLabel('exemplo (Row 1)').fill('ana@example.com');
  await details.getByLabel('exemplo (Row 1)').press('Enter');
  const required = details.getByRole('group', { name: 'obrigatório (Row 1)' });
  const [seg, example] = await Promise.all([
    required.boundingBox(),
    details.getByLabel('exemplo (Row 1)').boundingBox(),
  ]);
  if (!seg || !example) throw new Error('table has no size');
  expect(seg.x + seg.width).toBeLessThanOrEqual(example.x + 0.5);
});
