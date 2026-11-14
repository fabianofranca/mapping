import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  drag,
  exportMapping,
  setMode,
  type Point,
  type Rect,
} from './helpers';

// Stage View, VZ3: the view mode and the "Show on canvas" panel. The canvas publishes on the
// container ()  and , what it has already drawn.

/** Distance (screen px) from the link handle to the right edge of the marking (). */
const LINK_HANDLE_OFFSET = 14;
/** Margin, in screen px, that the framing leaves around everything (). */
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

/** Enquadrar tudo, esperando o canvas desenhar o enquadramento novo. */
async function fitAll(page: Page, host: Locator): Promise<void> {
  const before = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(host).toHaveAttribute('data-fits', String(before + 1));
}

/** Where each container is on screen, right after Fit all (the positions come from ). */
async function containerRects(page: Page, host: Locator): Promise<Map<string, Rect>> {
  const { mapping } = await exportMapping(page);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas sem tamanho');
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

/**
 * Duas telas com uma marcação cada, do mesmo tamanho e no mesmo ponto relativo de cada tela:
 * devolve o retângulo (px de tela) das duas marcações, na ordem das telas.
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
    await setMode(page, 'Navegar');
    marks.push(mark);
  }
  const [first, second] = marks;
  if (!first || !second) throw new Error('no markings');
  return [first, second];
}

const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const panel = (page: Page) => page.getByRole('dialog', { name: 'Show on canvas' });
const box = (page: Page, name: string) =>
  panel(page).getByRole('checkbox', { name, exact: false });

test('enter, uncheck Outline and a layer with a drawing, Screens only, Esc, and the choice comes back on reopening', async ({
  page,
}) => {
  await createProject(page, 'View');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);

  // An arrow between the two markings and a Note (layer with a drawing).
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await drag(
    page,
    {
      x: first.x + first.width + LINK_HANDLE_OFFSET,
      y: first.y + first.height / 2,
    },
    centerOf(second),
  );
  await expect(host).toHaveAttribute('data-arrows', '1');
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  await page
    .getByRole('button', { name: 'Add to canvas: Nota', exact: true })
    .click();
  await expect(host).toHaveAttribute('data-components', '1');

  // Enter: the button is pressed, Draw is disabled and the panel opens with focus inside.
  const view = page.getByRole('button', { name: 'View', exact: true });
  await view.click();
  await expect(view).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Draw' })).toBeDisabled();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByText(/^View mode: view only/)).toBeVisible();
  await expect(box(page, 'Marking outlines')).not.toBeChecked();

  // Outline unchecked: the arrows are still in view.
  await box(page, 'Marking outlines').check();
  await box(page, 'Marking outlines').uncheck();
  await expect(host).toHaveAttribute('data-arrows', '1');

  // Layer with a drawing unchecked: the drawing disappears.
  await box(page, 'Notas').uncheck();
  await expect(host).toHaveAttribute('data-components', '0');

  // Screens only: no arrows; Show all brings them back.
  await panel(page).getByRole('button', { name: 'Screens only' }).click();
  await expect(host).toHaveAttribute('data-arrows', '0');
  await panel(page).getByRole('button', { name: 'Show all' }).click();
  await expect(host).toHaveAttribute('data-arrows', '1');
  await expect(host).toHaveAttribute('data-components', '1');
  await panel(page).getByRole('button', { name: 'Screens only' }).click();
  await box(page, 'Notas').uncheck();

  // Esc closes the panel first; the second one leaves the mode.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(view).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(view).toHaveAttribute('aria-pressed', 'false');

  // Nothing was saved by the mode; the choice comes back when the project is reopened.
  const { mapping } = await exportMapping(page);
  expect(mapping.markings.length).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /: project actions$/ }).click();
  await page.getByRole('menuitem', { name: 'Close project', exact: true }).click();
  await page.locator('[data-recent-open]').first().click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(box(page, 'Setas')).not.toBeChecked();
  await expect(box(page, 'Notas')).not.toBeChecked();
});
