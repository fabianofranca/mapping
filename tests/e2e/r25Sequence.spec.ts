import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import type { Rect } from './helpers';

// R25.3 to R25.12 redone through the interface, in order, with the `m3-fiel` library. After
// each step the test reads mapping.json and checks the `rect` of ALL markings; in the steps
// whose Disk says "mapping.json does not change" the whole text (including `revision`) must be
// equal to that of the previous step. Regression: no marking moves without a request.
//
// Deviation from the script: R25.3 says "Apply folder…", but Playwright does not pick a folder;
// the equivalent is "Apply zip…" with the same content (the `m3-fiel` folder zipped).

const FOLDER = 'fiel-e2e';
const LIBRARY_DIR = 'libraries/material3-compose';

/** Builds `m3-fiel` (copy of the library + `fiel.mjs`) and returns its zip. */
async function fielZip(): Promise<Buffer> {
  const dir = join(mkdtempSync(join(tmpdir(), 'm3-fiel-')), 'm3-fiel');
  cpSync(LIBRARY_DIR, dir, { recursive: true });
  execFileSync('node', ['scripts/testing/fiel.mjs', dir, '4']);
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

// pt-BR kept: library data (m3-fiel/material3-compose field label 'Rótulo') asserted by tests/examples
async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
}

/** The raw text of the folder's mapping.json; retries if the app rewrites it at that moment. */
async function readRaw(page: Page): Promise<string> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    for (let attempt = 0; ; attempt++) {
      try {
        const file = await (await dir.getFileHandle('mapping.json')).getFile();
        return await file.text();
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

interface DiskMapping {
  readonly revision: number;
  readonly schemaVersion: number;
  readonly containers: readonly { readonly name: string; readonly background: string }[];
  readonly markings: readonly {
    readonly id: string;
    readonly rect: Rect;
    readonly parentId: string | null;
  }[];
  readonly annotations: readonly {
    readonly markingId: string;
    readonly type: { readonly typeId: string } | null;
    readonly values: Record<string, unknown> | null;
  }[];
}

const parse = (raw: string): DiskMapping => JSON.parse(raw) as DiskMapping;

/** Rects by component type (the annotation says which marking it is). */
function rectsByType(mapping: DiskMapping): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  for (const annotation of mapping.annotations) {
    const marking = mapping.markings.find((m) => m.id === annotation.markingId);
    if (marking && annotation.type) out[annotation.type.typeId] = marking.rect;
  }
  return out;
}

const RECTS = {
  card: { x: 30, y: 290, width: 200, height: 100 },
  'text-field': { x: 20, y: 180, width: 240, height: 56 },
  divider: { x: 20, y: 20, width: 140, height: 140 },
  'navigation-bar': { x: 300, y: 20, width: 240, height: 180 },
  'list-item': { x: 300, y: 220, width: 240, height: 120 },
  checkbox: { x: 300, y: 350, width: 240, height: 60 },
} satisfies Record<string, Rect>;

type Expected = Partial<Record<keyof typeof RECTS, Rect>>;

/** Waits for saving to settle ("Saved" and the `revision` stopped) and returns the raw text. */
async function settled(page: Page): Promise<string> {
  let last = -1;
  let stable = 0;
  await expect
    .poll(
      async () => {
        // Only counts with the status bar on "Saved": under load the edit save may not even have
        // started, and the stopped `revision` would be the one from before it.
        const saved = await page.getByText('Saved', { exact: true }).first().isVisible();
        const raw = await readRaw(page);
        const revision = parse(raw).revision;
        stable = saved && revision === last ? stable + 1 : 0;
        last = revision;
        return stable;
      },
      { intervals: [200], timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(3);
  return readRaw(page);
}

function expectRects(raw: string, expected: Expected, step: string): DiskMapping {
  const mapping = parse(raw);
  const found = rectsByType(mapping);
  expect(Object.keys(found).sort(), `${step}: markings`).toEqual(
    Object.keys(expected).sort(),
  );
  for (const [type, rect] of Object.entries(expected)) {
    expect(found[type], `${step}: rect of ${type}`).toEqual(rect);
  }
  expect(mapping.markings, `${step}: total markings`).toHaveLength(
    Object.keys(expected).length,
  );
  return mapping;
}

/** Zoom with Ctrl+wheel over the center of the selection box, until the width exceeds `min`. */
async function zoomSelectionTo(page: Page, minWidth: number): Promise<void> {
  const host = page.locator('.canvas-host');
  const box = async () => {
    const text = await host.getAttribute('data-selection-box');
    const hostBox = await host.boundingBox();
    if (!text || !hostBox) throw new Error('no selection box');
    const [x, y, w, h] = text.match(/-?\d+(\.\d+)?/g)!.map(Number) as [
      number,
      number,
      number,
      number,
    ];
    return { x: hostBox.x + x, y: hostBox.y + y, w, h };
  };
  for (let i = 0; i < 40; i++) {
    const b = await box();
    if (b.w > minWidth) return;
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForTimeout(60);
  }
  throw new Error(`the zoom did not exceed ${minWidth} px`);
}

/** Selects through the Tree (without touching the canvas) the marking whose type/name shows in the row. */
async function selectInTree(page: Page, name: string): Promise<void> {
  const rows = page.locator('.tree-row');
  // The Tree opens once (through the window strip button: the shortcut is ignored with focus in a field).
  if ((await rows.count()) === 0)
    await page.getByRole('button', { name: 'Marking tree', exact: true }).click();
  await rows.filter({ hasText: name }).first().click();
}

async function setPosition(page: Page, x: number, y: number): Promise<void> {
  for (const [label, value] of [
    ['X', x],
    ['Y', y],
  ] as const) {
    const field = page.getByRole('spinbutton', { name: label, exact: true });
    await field.fill(String(value));
    await field.press('Enter');
    await expect(field).toHaveValue(String(value));
  }
}

async function addFromPalette(page: Page, type: string, x: number, y: number) {
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  await page
    .getByRole('button', { name: new RegExp(`^Add to screen Screens: ${type}$`) })
    .click();
  await setPosition(page, x, y);
}

/** R25.3: pasta `fiel`, biblioteca m3-fiel aplicada e o container Telas (560x540, #DDEEFF). */
async function openTelas(page: Page): Promise<void> {
  await stubFolderPicker(page);
  await page.goto('/');

  // R25.3: open folder, apply m3-fiel, create the Screens container.
  await page.getByRole('button', { name: /Open folder/ }).click();
  await page.getByRole('textbox').fill('fiel');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();

  await page
    .locator('.main-bar')
    .getByRole('button', { name: 'Specializations', exact: true })
    .click();
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'm3-fiel.zip',
    mimeType: 'application/zip',
    buffer: await fielZip(),
  });
  const confirm = page.getByRole('button', { name: 'Apply', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();

  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Screens');
  await dialog.getByLabel('Preset size').selectOption({ label: 'Custom' });
  await dialog.getByLabel('Width', { exact: true }).fill('560');
  await dialog.getByLabel('Height', { exact: true }).fill('540');
  await dialog.getByLabel('Background color').fill('#DDEEFF');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
}

test.use({ actionTimeout: 10_000 });

test('R25.3 to R25.12: no marking moves without a request', async ({ page }) => {
  test.setTimeout(120_000);
  await openTelas(page);

  let raw = await settled(page);
  let mapping = expectRects(raw, {}, 'R25.3');
  expect(mapping.schemaVersion).toBe(20);
  expect(mapping.containers).toMatchObject([{ name: 'Screens', background: '#DDEEFF' }]);

  // R25.4: Card, Text field and Divider.
  await addFromPalette(page, 'Card', 30, 290);
  await addFromPalette(page, 'Text field', 20, 180);
  await addFromPalette(page, 'Divider', 20, 20);
  raw = await settled(page);
  const three: Expected = {
    card: RECTS.card,
    'text-field': RECTS['text-field'],
    divider: RECTS.divider,
  };
  expectRects(raw, three, 'R25.4');
  const host = page.locator('.canvas-host');
  await expect(host).toHaveAttribute('data-components', '3');

  // R25.5 to R25.7: zoom (Ctrl+wheel over the piece selected through the Tree), without touching it.
  let before = raw;
  for (const [step, name, width] of [
    ['R25.5', 'Divider', 300],
    ['R25.6', 'Text field', 480],
    ['R25.7', 'Card', 432],
  ] as const) {
    await selectInTree(page, name);
    await zoomSelectionTo(page, width);
    raw = await settled(page);
    expect(raw, `${step}: mapping.json does not change`).toBe(before);
    expectRects(raw, three, step);
    before = raw;
  }

  // R25.8: the three layout ones and rows A, B and C of the Navigation bar.
  await addFromPalette(page, 'Navigation bar', 300, 20);
  await addFromPalette(page, 'List item', 300, 220);
  await addFromPalette(page, 'Checkbox', 300, 350);
  await selectInTree(page, 'Navigation bar');
  for (const letter of ['A', 'B', 'C']) {
    await page.getByRole('button', { name: '+ Row' }).click();
    const cell = page.getByRole('textbox', { name: /^Rótulo \(Row \d\)$/ }).last();
    await cell.fill(letter);
    await cell.press('Enter');
  }
  raw = await settled(page);
  // R25.8: the Palette creates the Navigation bar in a free spot (the new piece neither covers nor coincides with
  // existing markings, issue #1087): the Card (30,290,200,100) stays put, without a parent, and does not
  // need to be given back; the Navigation bar goes to (300,20) without taking it along.
  mapping = expectRects(raw, RECTS, 'R25.8');
  const markingOf = (type: string) =>
    mapping.markings.find(
      (m) => m.id === mapping.annotations.find((a) => a.type?.typeId === type)?.markingId,
    );
  expect(markingOf('card')?.parentId, 'R25.8: the Card still has no parent').toBeNull();
  expect(
    markingOf('navigation-bar')?.parentId,
    'R25.8: the Navigation bar is born without a parent',
  ).toBeNull();
  const nav = mapping.annotations.find((a) => a.type?.typeId === 'navigation-bar');
  expect(
    (nav?.values?.['items'] as readonly { label: string }[]).map((r) => r.label),
  ).toEqual(['A', 'B', 'C']);
  before = raw;

  // R25.9 to R25.11: zoom on each piece, without touching the markings.
  for (const [step, name, width] of [
    ['R25.9', 'List item', 400],
    ['R25.10', 'Navigation bar', 440],
    ['R25.11', 'Checkbox', 360],
  ] as const) {
    await selectInTree(page, name);
    await zoomSelectionTo(page, width);
    raw = await settled(page);
    expect(raw, `${step}: mapping.json does not change`).toBe(before);
    expectRects(raw, RECTS, step);
    before = raw;
  }

  // R25.12: close and reopen the folder.
  await page.getByRole('button', { name: /project actions/ }).click();
  await page.getByRole('menuitem', { name: 'Close project' }).click();
  await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
  // An OPFS folder does not enter "Recent projects" (only the real picker's do);
  // reopening is picking the same folder again in "Open folder", which already has mapping.json.
  await page.getByRole('button', { name: /Open folder/ }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await expect(host).toHaveAttribute('data-components', '6');
  raw = await settled(page);
  expect(raw, 'R25.12: reopening does not rewrite mapping.json').toBe(before);
  expectRects(raw, RECTS, 'R25.12');
  expect(raw.match(/"(cap|join|sides|stroke|maxWidth|distribute)"/g)).toBeNull();
});

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The selection box in page pixels (position and size), from `data-selection-box`. */
async function selectionBox(page: Page): Promise<Box> {
  const host = page.locator('.canvas-host');
  const text = await host.getAttribute('data-selection-box');
  const hostBox = await host.boundingBox();
  if (!text || !hostBox) throw new Error('no selection box');
  const [x, y, w, h] = text.match(/-?\d+(\.\d+)?/g)!.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return { x: hostBox.x + x, y: hostBox.y + y, w, h };
}

/** Isolated Card at (30,290) and a Text field outside it at (300,20). */
async function cardAndField(page: Page): Promise<void> {
  await openTelas(page);
  await addFromPalette(page, 'Card', 30, 290);
  await addFromPalette(page, 'Text field', 300, 20);
  expectRects(
    await settled(page),
    { card: RECTS.card, 'text-field': { x: 300, y: 20, width: 240, height: 56 } },
    'setup',
  );
}

const cardRect = async (page: Page): Promise<Rect> =>
  rectsByType(parse(await settled(page)))['card']!;

for (const { name, ctrl, minWidth } of [
  { name: 'without Ctrl, fit zoom', ctrl: false, minWidth: 0 },
  { name: 'with Ctrl, fit zoom', ctrl: true, minWidth: 0 },
  { name: 'without Ctrl, high zoom', ctrl: false, minWidth: 800 },
  { name: 'with Ctrl, high zoom', ctrl: true, minWidth: 800 },
]) {
  test(`H4: drag starting over the Card (${name})`, async ({ page }) => {
    test.setTimeout(120_000);
    await cardAndField(page);
    await selectInTree(page, 'Card');
    if (minWidth > 0) await zoomSelectionTo(page, minWidth);
    const box = await selectionBox(page);
    const scale = box.w / 200;
    const before = await cardRect(page);
    const stepsPx = { dx: 37, dy: 23 };
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.w / 2 + stepsPx.dx,
      box.y + box.h / 2 + stepsPx.dy,
      {
        steps: 8,
      },
    );
    await page.mouse.up();
    if (ctrl) await page.keyboard.up('Control');
    const after = await cardRect(page);
    const delta = { dx: after.x - before.x, dy: after.y - before.y };
    // H4: the Card moves with the drag (documented behavior), the same with and without Ctrl and
    // at any zoom: delta = screen displacement / scale, rounded, with no snapping
    // to multiples of 10 and no jump.
    expect(delta.dx).toBe(Math.round(stepsPx.dx / scale));
    expect(delta.dy).toBe(Math.round(stepsPx.dy / scale));
    expect(after).toMatchObject({ width: 200, height: 100 });
  });
}

test('H5: Shift+click keeps the Card in the selection; editing the X of the other marking', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await cardAndField(page);
  await selectInTree(page, 'Card');
  await page
    .locator('.tree-row', { hasText: 'Text field' })
    .first()
    .click({ modifiers: ['Shift'] });
  // H5: with Card + Text field in the selection the panel is the multi-selection one and has no
  // Position field (no spinbutton); there is no way to edit the X of the other marking there.
  await expect(page.getByRole('group', { name: 'items selected' })).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  const raw = await settled(page);
  // Editing the X of the Text field alone (single selection) does not take the Card along.
  await selectInTree(page, 'Text field');
  await setPosition(page, 310, 20);
  const after = expectRects(
    await settled(page),
    { card: RECTS.card, 'text-field': { x: 310, y: 20, width: 240, height: 56 } },
    'H5',
  );
  expect(after.revision).toBeGreaterThan(parse(raw).revision);
});
