import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  exportMapping,
  drag,
  setMode,
  type MappingJson,
  type Point,
  type Rect,
} from './helpers';

// Perspectives stage, PE3: the interface flow. Main bar picker, dialogs
// (New, Manage, Delete), right-click menu, "Came from…" notice in Details.
// At 900×720 (minimum window), with no horizontal bar on any of these screens.

interface PerspectiveJson {
  readonly id: string;
  readonly name: string;
  readonly items: readonly {
    readonly root: string;
    readonly x: number;
    readonly y: number;
  }[];
}
interface ArrivalJson {
  readonly root: string;
  readonly fromName: string;
}
type MappingWithPerspectives = MappingJson & {
  readonly arrows: readonly unknown[];
  readonly perspectives: readonly PerspectiveJson[];
  readonly arrivals: readonly ArrivalJson[];
};

/** Margin, in screen px, that the fit leaves around everything (`FIT_PADDING`). */
const FIT_PADDING = 24;
/** Extra slack with an arrival mark (`ARRIVAL_FIT_EXTRA`). */
const ARRIVAL_FIT_EXTRA = 48;

test.use({ viewport: { width: 900, height: 720 } });

/** The exported `mapping.json`, with the perspectives; closes the dialog, which would otherwise cover the canvas. */
async function readMapping(page: Page): Promise<MappingWithPerspectives> {
  const { mapping } = await exportMapping(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  return mapping as MappingWithPerspectives;
}

async function noHorizontalScroll(page: Page, within?: Locator): Promise<void> {
  const page_ = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(page_.scroll).toBeLessThanOrEqual(page_.inner);
  if (within) {
    const box = await within.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(box.scroll).toBeLessThanOrEqual(box.client);
  }
}

async function addContainer(page: Page, host: Locator, name: string): Promise<void> {
  const before = Number((await host.getAttribute('data-images')) ?? 0);
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', String(before + 1));
}

async function fitAll(page: Page, host: Locator): Promise<void> {
  const before = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(host).toHaveAttribute('data-fits', String(before + 1));
}

/** Where each box is on the screen after Fit all (`boxes` in canvas units). */
async function toScreen(
  host: Locator,
  boxes: readonly (Rect & { readonly id: string })[],
  padding = FIT_PADDING,
): Promise<Map<string, Rect>> {
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas has no size');
  const x0 = Math.min(...boxes.map((c) => c.x));
  const y0 = Math.min(...boxes.map((c) => c.y));
  const x1 = Math.max(...boxes.map((c) => c.x + c.width));
  const y1 = Math.max(...boxes.map((c) => c.y + c.height));
  const scale = Math.min(
    (box.width - 2 * padding) / (x1 - x0),
    (box.height - 2 * padding) / (y1 - y0),
  );
  const offsetX = box.x + box.width / 2 - ((x0 + x1) / 2) * scale;
  const offsetY = box.y + box.height / 2 - ((y0 + y1) / 2) * scale;
  return new Map(
    boxes.map((c) => [
      c.id,
      {
        x: offsetX + c.x * scale,
        y: offsetY + c.y * scale,
        width: c.width * scale,
        height: c.height * scale,
      },
    ]),
  );
}

const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The main bar picker button (the accessible name carries the open perspective). */
const trigger = (page: Page, name: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^Perspective: ${name},`) });

async function openPerspective(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /^Perspective: / }).click();
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
  await expect(trigger(page, name)).toBeVisible();
}

test('perspectives: create, send, move inside it, arrival in Main, delete and undo', async ({
  page,
}) => {
  await createProject(page, 'Perspectives test');
  const host = page.locator('.canvas-host');
  // Details open from the start: opening it later would change the canvas size.
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  for (const name of ['Screen A', 'Screen B', 'Screen C'])
    await addContainer(page, host, name);
  await fitAll(page, host);

  // One marking in A and another in B, linked by an arrow (Details → Link to…).
  const first = await readMapping(page);
  const canvasBoxes = first.containers.map((c) => ({
    id: c.id,
    x: c.placement.x,
    y: c.placement.y,
    width: c.width * c.placement.scale,
    height: c.height * c.placement.scale,
  }));
  const screens = await toScreen(host, canvasBoxes);
  const [idA, idB, idC] = first.containers.map((c) => c.id);
  if (!idA || !idB || !idC) throw new Error('containers are missing');
  for (const id of [idA, idB]) {
    const s = screens.get(id)!;
    await setMode(page, 'Draw');
    await drag(
      page,
      { x: s.x + s.width * 0.3, y: s.y + s.height * 0.3 },
      { x: s.x + s.width * 0.6, y: s.y + s.height * 0.5 },
    );
    await setMode(page, 'Navigate');
  }
  const sA = screens.get(idA)!;
  await page.mouse.click(sA.x + sA.width * 0.45, sA.y + sA.height * 0.4);
  await page.getByRole('button', { name: 'Link to…', exact: true }).click();
  await page
    .getByRole('dialog', { name: /^Link .* to…$/ })
    .getByRole('option')
    .first()
    .click();
  await expect(host).toHaveAttribute('data-arrows', '1');

  // New perspective… from the picker, starting empty.
  await trigger(page, 'Main').click();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'New perspective…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New perspective' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill('Review');
  await dialog.getByLabel('Start from').selectOption({ label: 'Empty' });
  await noHorizontalScroll(page, dialog);
  await dialog.getByRole('button', { name: 'Create perspective' }).click();
  await expect(dialog).toBeHidden();
  // The new one stays open.
  await expect(trigger(page, 'Review')).toBeVisible();
  let mapping = await readMapping(page);
  expect(mapping.perspectives.map((p) => p.name)).toEqual(['Review']);
  expect(mapping.perspectives[0]?.items).toHaveLength(0);

  // Back to Main and sends Screen A through the right-click menu.
  await openPerspective(page, 'Main');
  await fitAll(page, host);
  await page.mouse.click(sA.x + sA.width * 0.9, sA.y + sA.height * 0.9, {
    button: 'right',
  });
  const menu = page.getByRole('menu', { name: 'Canvas item menu' });
  await menu.getByRole('menuitem', { name: 'Send to perspective' }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Review/ }).click();
  await expect
    .poll(async () => (await readMapping(page)).perspectives[0]?.items.length)
    .toBe(1);
  await page.keyboard.press('Escape');
  mapping = await readMapping(page);
  const sent = mapping.perspectives[0]?.items[0];
  expect(sent?.root).toBe(idA);
  const before = mapping.containers.find((c) => c.id === idA)!.placement;

  // Inside the perspective: dragging the root changes its position, not Main's.
  await openPerspective(page, 'Review');
  await fitAll(page, host);
  const own = mapping.containers.find((c) => c.id === idA)!;
  const inPerspective = await toScreen(host, [
    {
      id: idA,
      x: sent!.x,
      y: sent!.y,
      width: own.width * own.placement.scale,
      height: own.height * own.placement.scale,
    },
  ]);
  const a = inPerspective.get(idA)!;
  await page.mouse.click(centerOf(a).x, a.y + a.height * 0.95);
  await drag(
    page,
    { x: centerOf(a).x, y: a.y + a.height * 0.95 },
    { x: centerOf(a).x + 60, y: a.y + a.height * 0.95 + 40 },
  );
  await expect
    .poll(async () => {
      const m = await readMapping(page);
      const item = m.perspectives[0]?.items[0];
      return item ? item.x !== sent!.x || item.y !== sent!.y : false;
    })
    .toBe(true);
  mapping = await readMapping(page);
  expect(mapping.containers.find((c) => c.id === idA)!.placement).toEqual(before);

  // Creating an item inside the perspective: it shows up in Main with the "Came from Review" mark.
  await addContainer(page, host, 'Screen D');
  mapping = await readMapping(page);
  expect(mapping.arrivals).toHaveLength(1);
  expect(mapping.arrivals[0]?.fromName).toBe('Review');
  const idD = mapping.arrivals[0]!.root;
  expect(mapping.containers.some((c) => c.id === idD)).toBe(true);

  await openPerspective(page, 'Main');
  await fitAll(page, host);
  mapping = await readMapping(page);
  const principalScreens = await toScreen(
    host,
    mapping.containers.map((c) => ({
      id: c.id,
      x: c.placement.x,
      y: c.placement.y,
      width: c.width * c.placement.scale,
      height: c.height * c.placement.scale,
    })),
    // With an arrival mark, Fit all leaves slack for the strip's label.
    FIT_PADDING + ARRIVAL_FIT_EXTRA,
  );
  const d = principalScreens.get(idD)!;
  await page.mouse.click(centerOf(d).x, centerOf(d).y);
  const notice = page.locator('.arrival-notice');
  await expect(notice).toContainText('Came from Review');
  await noHorizontalScroll(page, notice);
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();
  expect((await readMapping(page)).arrivals).toHaveLength(0);

  // Manage → Delete → confirm; Ctrl+Z undoes.
  await trigger(page, 'Main').click();
  await page.getByRole('button', { name: 'Manage perspectives…' }).click();
  const manage = page.getByRole('dialog', { name: 'Manage perspectives' });
  await expect(manage).toBeVisible();
  await noHorizontalScroll(page, manage);
  await manage.getByRole('button', { name: 'Delete Review' }).click();
  const del = page.getByRole('alertdialog', { name: /^Delete the perspective Review/ });
  await expect(del).toBeVisible();
  await noHorizontalScroll(page, del);
  await del.getByRole('button', { name: 'Delete perspective' }).click();
  await expect(del).toBeHidden();
  if (await manage.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await readMapping(page)).perspectives).toHaveLength(0);

  await page
    .locator('.canvas-host')
    .focus()
    .catch(() => undefined);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readMapping(page)).perspectives.map((p) => p.name))
    .toEqual(['Review']);
});
