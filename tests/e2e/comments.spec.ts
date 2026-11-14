import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
  setMode,
  type Point,
} from './helpers';

// Comments stage, CM4: the conversation pins (hidden by default), the Conversations button, the
// Comment button and the click on the pin. The canvas publishes `data-pins` (how many pins it drew).

async function setIdentity(page: Page): Promise<void> {
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Marina Alves');
  await dialog.getByLabel('Email', { exact: true }).fill('marina@example.com');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

async function pins(host: Locator): Promise<number> {
  return Number((await host.getAttribute('data-pins')) ?? 0);
}

test('the pins are born hidden, Comment opens the draft and the click on the pin opens the conversation', async ({
  page,
}) => {
  await createProject(page, 'Comments');
  await addImage(page);
  await setIdentity(page);
  const host = page.locator('.canvas-host');
  const center = await canvasPoint(page);
  await drawMarking(page, center);
  await setMode(page, 'Navigate');
  const conversations = page.getByRole('button', { name: 'Conversations', exact: true });
  await expect(conversations).toHaveAttribute('aria-pressed', 'false');
  expect(await pins(host)).toBe(0);

  // Comment: arms the click, turns the pins on and, over the marking, opens the draft anchored to it.
  await page.getByRole('button', { name: 'Comment', exact: true }).first().click();
  await expect(conversations).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(center.x, center.y);
  const composer = page.getByRole('textbox', { name: /Comment as Marina Alves/ });
  await expect(composer).toBeVisible();
  await composer.fill('What is the variant?');
  await composer.press('Control+Enter');
  await expect.poll(() => pins(host)).toBe(1);

  // Turning Conversations off hides the pin (the conversation stays in Details).
  const elsewhere = await canvasPoint(page, 0.9);
  await page.mouse.click(elsewhere.x, elsewhere.y);
  await conversations.click();
  await expect(conversations).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => pins(host)).toBe(0);
  // Turning it on again brings the pin back.
  await conversations.click();
  await expect.poll(() => pins(host)).toBe(1);

  // The click on the pin (top right corner of the marking, outside) opens the conversation in Details.
  await page.mouse.click(center.x + 60 + 22, center.y - 40 - 10);
  await expect(page.getByText('What is the variant?')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: /Reply as Marina Alves/ }),
  ).toBeVisible();
});

test('Comment on an empty spot opens the draft at a point, with the dashed pin', async ({
  page,
}) => {
  await createProject(page, 'Comments point');
  await addImage(page);
  await setIdentity(page);
  const host = page.locator('.canvas-host');
  const empty = await canvasPoint(page, 0.15);
  await page.getByRole('button', { name: 'Comment', exact: true }).first().click();
  await page.mouse.click(empty.x, empty.y);
  await expect(
    page.getByRole('textbox', { name: /Comment as Marina Alves/ }),
  ).toBeVisible();
  // Nothing saved yet, but the draft shows the dashed pin.
  await expect.poll(() => pins(host)).toBe(1);
});

// ---------------------------------------------------------------------------------------------
// CM5: the citation editor (contenteditable with chips), in a real Chromium — jsdom does not
// cover selection or cursor. FOLDER project (an OPFS folder plays the chosen one).

const FOLDER = 'comments-e2e';
const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
const EDITOR = /Comment as|Reply as/;
const CHIP = 'span.citation-chip.citation-chip-editor';

async function openFolderProject(page: Page, name: string): Promise<void> {
  await page.addInitScript((folder) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(folder, { create: true });
    });
  }, FOLDER);
  await page.goto('/');
  await page.getByRole('button', { name: /Open folder/ }).click();
  await page.getByRole('textbox').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

/** Draws a marking at `fy`, names it and leaves it selected. */
async function namedMarking(page: Page, fy: number, name: string): Promise<Point> {
  const at = await canvasPoint(page, fy);
  await drawMarking(page, at);
  const field = page.getByLabel('Name', { exact: true }).first();
  await field.fill(name);
  await field.press('Enter');
  return at;
}

/** Opens the draft of a conversation anchored to the marking at `at`. */
async function openComposer(page: Page, at: Point): Promise<Locator> {
  await page.getByRole('button', { name: 'Comment', exact: true }).first().click();
  await page.mouse.click(at.x, at.y);
  const composer = page.getByRole('textbox', { name: EDITOR });
  await expect(composer).toBeVisible();
  await composer.focus();
  return composer;
}

/** The `comments/<id>.json` files of the project folder, already read. */
async function readThreads(page: Page): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    const comments = await dir.getDirectoryHandle('comments').catch(() => null);
    if (!comments) return [];
    const out: Record<string, unknown>[] = [];
    for await (const [name, handle] of comments.entries()) {
      if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      try {
        out.push(JSON.parse(await file.text()));
      } catch {
        // write in progress (file still incomplete): the next poll read picks it up
      }
    }
    return out;
  }, FOLDER);
}

const threadText = (threads: readonly Record<string, unknown>[]): string =>
  JSON.stringify(threads);

test('the @ opens the item list and Enter swaps the @term for a chip', async ({
  page,
}) => {
  await openFolderProject(page, 'Citations');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Door');
  const composer = await openComposer(page, at);

  await composer.pressSequentially('See @Doo');
  const picker = page.getByRole('listbox', { name: 'Items to cite' });
  await expect(picker).toBeVisible();
  await expect(composer).toHaveAttribute('aria-controls', /./);
  await expect(picker.getByRole('option').first()).toBeVisible();

  await composer.press('Enter');
  await expect(picker).toBeHidden();
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute('role', 'img');
  await expect(chip).toHaveAttribute('aria-label', 'Door, citation');
  await expect(chip).toHaveText('Door');
  // The `@Doo` is gone: the chip took its place.
  await expect(composer).not.toContainText('@Doo');
  await expect(composer).toContainText('See');
});

test('Backspace right after the chip deletes the whole chip', async ({ page }) => {
  await openFolderProject(page, 'Citations backspace');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Door');
  const composer = await openComposer(page, at);

  await composer.pressSequentially('@Doo');
  await composer.press('Enter');
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  // The cursor stays after the space that follows the chip: the first Backspace removes the space…
  await composer.press('Backspace');
  await expect(chip).toHaveCount(1);
  // …and the second, next to the chip, deletes the whole chip (not just one letter of the name).
  await composer.press('Backspace');
  await expect(chip).toHaveCount(0);
  await expect(composer).not.toContainText('Door');
});

/** Folder project with an SDUI "Input" annotation (`id` field filled in) and a marking. */
async function projectWithField(page: Page): Promise<Point> {
  await openFolderProject(page, 'Citations property');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Door');
  await applySpecialization(page, SDUI);
  await page.getByRole('button', { name: 'Add annotation to layer Componentes' }).click();
  await page.getByRole('button', { name: /^Input/ }).click();
  const id = page.getByLabel('id', { exact: true });
  await id.fill('input_name');
  await id.press('Enter');
  return at;
}

test('pasting the reference copied from a property becomes a chip', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const at = await projectWithField(page);
  // With no text selected in the field, Ctrl+C copies the property reference.
  await page.getByLabel('id', { exact: true }).press('Control+c');
  const reference = await page.evaluate(() => navigator.clipboard.readText());
  expect(reference).toMatch(new RegExp(`^mapping://${FOLDER}/a/[0-9a-f]{8}/f/id$`));

  const composer = await openComposer(page, at);
  await composer.pressSequentially('See ');
  await composer.press('Control+v');
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute('data-url', reference);
  await expect(chip).toHaveAttribute('aria-label', /, citation$/);
  // The pasted text did not stay as a loose URL.
  await expect(composer).not.toContainText('mapping://');
});

test('Ctrl+Enter sends and the file in comments/ keeps the markdown link', async ({
  page,
}) => {
  await openFolderProject(page, 'Citations send');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Door');
  const composer = await openComposer(page, at);

  await composer.pressSequentially('Check @Doo');
  await composer.press('Enter');
  await composer.pressSequentially('now');
  await composer.press('Control+Enter');

  await expect.poll(async () => (await readThreads(page)).length).toBe(1);
  const text = threadText(await readThreads(page));
  expect(text).toMatch(
    new RegExp(`Check \\[Door\\]\\(mapping://${FOLDER}/m/[0-9a-f]{8}\\) now`),
  );
  // The sent message shows the chip (button), not the markdown.
  const sent = page.getByRole('button', { name: 'Door, citation' });
  await expect(sent).toBeVisible();
  await expect(sent).toHaveClass(/citation-chip/);
});

test('accessible roles and names of the field, the chip and the list', async ({
  page,
}) => {
  await openFolderProject(page, 'Citations accessibility');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Door');
  await namedMarking(page, 0.7, 'Window');
  const composer = await openComposer(page, at);

  await expect(composer).toHaveAttribute('role', 'textbox');
  await expect(composer).toHaveAttribute('aria-multiline', 'true');
  // role=textbox does not allow aria-haspopup/aria-expanded; aria-controls only with the list open.
  await expect(composer).not.toHaveAttribute('aria-haspopup', /./);
  await expect(composer).not.toHaveAttribute('aria-expanded', /./);
  await expect(composer).not.toHaveAttribute('aria-controls', /./);
  await expect(composer).not.toHaveAttribute('aria-activedescendant', /./);

  await composer.pressSequentially('@');
  const picker = page.getByRole('listbox', { name: 'Items to cite' });
  await expect(picker).toBeVisible();
  const options = picker.getByRole('option');
  expect(await options.count()).toBeGreaterThan(1);
  await expect(composer).toHaveAttribute(
    'aria-controls',
    (await picker.getAttribute('id')) ?? '',
  );

  // The `aria-activedescendant` points to the active option (the selected one) and follows the arrows.
  const active = async (): Promise<string> => {
    const id = (await composer.getAttribute('aria-activedescendant')) ?? '';
    expect(id).not.toBe('');
    const option = picker.locator(`[id="${id}"]`);
    await expect(option).toHaveAttribute('role', 'option');
    await expect(option).toHaveAttribute('aria-selected', 'true');
    return id;
  };
  const first = await active();
  await composer.press('ArrowDown');
  const second = await active();
  expect(second).not.toBe(first);
  await composer.press('ArrowUp');
  expect(await active()).toBe(first);

  // After choosing, the chip is read as "<name>, citation" and the list closes.
  await composer.press('Enter');
  await expect(picker).toBeHidden();
  await expect(composer).not.toHaveAttribute('aria-controls', /./);
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  const name = await chip.textContent();
  await expect(chip).toHaveAttribute('aria-label', `${name}, citation`);
  await expect(page.getByRole('img', { name: `${name}, citation` })).toHaveCount(1);
});

test('the chip is live: renaming the target changes the name and deleting the target strikes the chip', async ({
  page,
}) => {
  await openFolderProject(page, 'Citations live');
  await addImage(page);
  await setIdentity(page);
  const target = await namedMarking(page, 0.7, 'Window');
  const anchor = await namedMarking(page, 1 / 3, 'Door');
  const composer = await openComposer(page, anchor);

  await composer.pressSequentially('See @Win');
  await composer.press('Enter');
  await composer.press('Control+Enter');
  const sent = page.getByRole('button', { name: 'Window, citation' });
  await expect(sent).toBeVisible();
  await expect
    .poll(async () => threadText(await readThreads(page)))
    .toContain('[Window](');

  // Rename the target: the message shows the current name.
  await page.mouse.click(target.x, target.y);
  const name = page.getByLabel('Name', { exact: true }).first();
  await name.fill('Side window');
  await name.press('Enter');
  await page.mouse.click(anchor.x, anchor.y);
  const renamed = page.getByRole('button', { name: 'Side window, citation' });
  await expect(renamed).toBeVisible();
  await expect(renamed).not.toHaveClass(/citation-chip-broken/);

  // Delete the target: the chip stays in the message, struck through.
  await page.mouse.click(target.x, target.y);
  await page.keyboard.press('Delete');
  await page.mouse.click(anchor.x, anchor.y);
  const broken = page.locator('button.citation-chip.citation-chip-broken');
  await expect(broken).toHaveCount(1);
});
