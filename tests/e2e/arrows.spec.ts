import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  drag,
  exportMapping,
  setMode,
  type MappingJson,
  type Point,
  type Rect,
} from './helpers';

// Spatial markings stage, ME4: the arrow (a marking that points) on the canvas. The canvas publishes on the
// container (`.canvas-host`) `data-arrows`, the count of arrows it has already drawn. The arrow is born by
// pulling the link handle of the selected marking to another marking; a right click on the stroke
// opens the menu with the style (Straight, Curve, Elbow) and Delete.

/** The `arrows` of `mapping.json` (the shared helper does not type it yet). */
interface ArrowJson {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly style: string;
  readonly points: readonly Point[];
  readonly locked: boolean;
}
type MappingWithArrows = MappingJson & { readonly arrows: readonly ArrowJson[] };

/** Distance (screen px) from the link handle to the right edge of the marking (`LINK_HANDLE_OFFSET`). */
const LINK_HANDLE_OFFSET = 14;
/** Margin, in screen px, that the fit leaves around everything (`FIT_PADDING`). */
const FIT_PADDING = 24;

/** New container (Custom) with the given name, through the dialog. */
async function addContainer(page: Page, host: Locator, name: string): Promise<void> {
  const before = Number((await host.getAttribute('data-images')) ?? 0);
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', String(before + 1));
}

/** Fit all, waiting for the canvas to draw the new fit. */
async function fitAll(page: Page, host: Locator): Promise<void> {
  const before = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(host).toHaveAttribute('data-fits', String(before + 1));
}

/** Where each container is on screen, right after Fit all (the positions come from `mapping.json`). */
async function containerRects(page: Page, host: Locator): Promise<Map<string, Rect>> {
  const { mapping } = await exportMapping(page);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas has no size');
  const canvas = mapping.containers.map((c) => ({
    id: c.id,
    x: c.placement.x,
    y: c.placement.y,
    width: c.width * c.placement.scale,
    height: c.height * c.placement.scale,
  }));
  const x0 = Math.min(...canvas.map((c) => c.x));
  const y0 = Math.min(...canvas.map((c) => c.y));
  const x1 = Math.max(...canvas.map((c) => c.x + c.width));
  const y1 = Math.max(...canvas.map((c) => c.y + c.height));
  const scale = Math.min(
    (box.width - 2 * FIT_PADDING) / (x1 - x0),
    (box.height - 2 * FIT_PADDING) / (y1 - y0),
  );
  const offsetX = box.x + box.width / 2 - ((x0 + x1) / 2) * scale;
  const offsetY = box.y + box.height / 2 - ((y0 + y1) / 2) * scale;
  return new Map(
    canvas.map((c) => [
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

/** The arrows of `mapping.json`, through Export; closes the dialog, which would otherwise cover the canvas. */
async function arrowsOf(page: Page): Promise<readonly ArrowJson[]> {
  const { mapping } = await exportMapping(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  return (mapping as MappingWithArrows).arrows;
}

/**
 * Two screens with one marking each, of the same size and at the same relative point of each screen:
 * returns the rectangle (screen px) of the two markings, in the order of the screens.
 */
async function twoMarkedScreens(page: Page, host: Locator): Promise<[Rect, Rect]> {
  for (const name of ['Tela A', 'Tela B']) await addContainer(page, host, name);
  await fitAll(page, host);
  const rects = [...(await containerRects(page, host)).values()];
  const marks: Rect[] = [];
  for (const screen of rects) {
    const mark = {
      x: screen.x + screen.width * 0.3,
      y: screen.y + screen.height * 0.3,
      width: screen.width * 0.25,
      height: screen.height * 0.2,
    };
    await setMode(page, 'Draw');
    await drag(
      page,
      { x: mark.x, y: mark.y },
      { x: mark.x + mark.width, y: mark.y + mark.height },
    );
    await setMode(page, 'Navigate');
    marks.push(mark);
  }
  const [first, second] = marks;
  if (!first || !second) throw new Error('no markings');
  return [first, second];
}

const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

test('pulling the link handle of a marking to another creates a curved arrow and selects it', async ({
  page,
}) => {
  await createProject(page, 'Arrows');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);
  await expect(host).toHaveAttribute('data-arrows', '0');

  // Select the first marking: the link handle appears outside the right edge.
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  const handle = {
    x: first.x + first.width + LINK_HANDLE_OFFSET,
    y: first.y + first.height / 2,
  };
  await drag(page, handle, centerOf(second));
  await expect(host).toHaveAttribute('data-arrows', '1');

  const { mapping } = await exportMapping(page);
  const arrows = (mapping as MappingWithArrows).arrows;
  expect(arrows).toHaveLength(1);
  expect(mapping.markings).toHaveLength(2);
  const [a, b] = mapping.markings;
  expect(arrows[0]).toMatchObject({ from: a?.id, to: b?.id, style: 'curve', points: [] });
  // Creating the arrow does not touch the markings.
  expect(a?.rect.width).toBeGreaterThan(0);
});

test('dropping the link handle outside a marking cancels', async ({ page }) => {
  await createProject(page, 'Arrows');
  const host = page.locator('.canvas-host');
  const [first] = await twoMarkedScreens(page, host);
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas has no size');
  await drag(
    page,
    { x: first.x + first.width + LINK_HANDLE_OFFSET, y: first.y + first.height / 2 },
    { x: box.x + 6, y: box.y + box.height - 6 },
  );
  await expect(host).toHaveAttribute('data-arrows', '0');
  expect(await arrowsOf(page)).toHaveLength(0);
});

test('the stroke menu switches the style (straight, curve, elbow), one entry each, and deletes', async ({
  page,
}) => {
  await createProject(page, 'Arrows');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await drag(
    page,
    { x: first.x + first.width + LINK_HANDLE_OFFSET, y: first.y + first.height / 2 },
    centerOf(second),
  );
  await expect(host).toHaveAttribute('data-arrows', '1');

  // The two markings have the same size: the middle of the stroke is the middle between the centers.
  const middle = {
    x: (centerOf(first).x + centerOf(second).x) / 2,
    y: (centerOf(first).y + centerOf(second).y) / 2,
  };
  const menu = page.getByRole('menu', { name: 'Canvas item menu' });
  for (const [label, style] of [
    ['Elbow', 'elbow'],
    ['Straight', 'straight'],
    ['Curve', 'curve'],
  ] as const) {
    await page.mouse.click(middle.x, middle.y, { button: 'right' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', { name: label }).click();
    await expect(menu).toBeHidden();
    expect((await arrowsOf(page))[0]?.style).toBe(style);
  }

  // The current style comes checked in the menu.
  await page.mouse.click(middle.x, middle.y, { button: 'right' });
  await expect(menu.getByRole('menuitemradio', { name: 'Curve' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await menu.getByRole('menuitem', { name: 'Delete arrow' }).click();
  await expect(host).toHaveAttribute('data-arrows', '0');
  expect(await arrowsOf(page)).toHaveLength(0);
});

test('in the stroke menu, the space between the check and the label is the usual one (6 px)', async ({
  page,
}) => {
  await createProject(page, 'Arrows');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await drag(
    page,
    { x: first.x + first.width + LINK_HANDLE_OFFSET, y: first.y + first.height / 2 },
    centerOf(second),
  );
  await expect(host).toHaveAttribute('data-arrows', '1');
  const middle = {
    x: (centerOf(first).x + centerOf(second).x) / 2,
    y: (centerOf(first).y + centerOf(second).y) / 2,
  };
  await page.mouse.click(middle.x, middle.y, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Canvas item menu' });
  await expect(menu).toBeVisible();
  const checked = menu.locator('[role=menuitemradio][aria-checked=true]');
  await expect(checked).toHaveCount(1);
  const space = await checked.evaluate((button) => {
    const icon = button.querySelector('.icon')!.getBoundingClientRect();
    const text = [...button.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)!;
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getBoundingClientRect().left - icon.right;
  });
  expect(space).toBe(6);
});

test('dragging the middle of the stroke creates a waypoint', async ({ page }) => {
  await createProject(page, 'Arrows');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await drag(
    page,
    { x: first.x + first.width + LINK_HANDLE_OFFSET, y: first.y + first.height / 2 },
    centerOf(second),
  );
  await expect(host).toHaveAttribute('data-arrows', '1');

  // The newly created arrow is selected: the handle of the middle of the segment sits on the stroke.
  const middle = {
    x: (centerOf(first).x + centerOf(second).x) / 2,
    y: (centerOf(first).y + centerOf(second).y) / 2,
  };
  await drag(page, middle, { x: middle.x, y: middle.y - 80 });
  await expect.poll(async () => (await arrowsOf(page))[0]?.points.length).toBe(1);
});

test('Link to… in Details creates the curved arrow without dragging (the tester agent path)', async ({
  page,
}) => {
  await createProject(page, 'Arrows');
  const host = page.locator('.canvas-host');
  const [first] = await twoMarkedScreens(page, host);
  await expect(host).toHaveAttribute('data-arrows', '0');

  // Select the first marking and open the picker through the Details button.
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await page.getByRole('button', { name: 'Link to…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Link .* to…$/ });
  await expect(picker).toBeVisible();
  // The marking itself does not appear: only the other one is offered.
  const options = picker.getByRole('option');
  await expect(options).toHaveCount(1);
  await options.first().click();
  await expect(picker).toBeHidden();
  await expect(host).toHaveAttribute('data-arrows', '1');

  const { mapping } = await exportMapping(page);
  const arrows = (mapping as MappingWithArrows).arrows;
  const [a, b] = mapping.markings;
  expect(arrows).toHaveLength(1);
  expect(arrows[0]).toMatchObject({ from: a?.id, to: b?.id, style: 'curve', points: [] });
});
