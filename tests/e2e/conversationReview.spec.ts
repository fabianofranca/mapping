import { expect, test, type Page } from '@playwright/test';
import { conversationFiles, revisedFixtureProposal } from './conversationFixture';
import { FIXTURE_PROPOSAL_TITLE } from './proposalFixture';

// Stage #1881, phase CV3: the conversation stays writable during the review, the card follows the
// agent's revision and leaving the review puts the focus back in the composer. FOLDER project (an
// OPFS folder plays the chosen one) so that a proposal file can be rewritten on disk the way
// `revise_proposal` does.

test.use({ viewport: { width: 1280, height: 860 } });

const FOLDER = 'conversation-review-e2e';

/** Seeds the OPFS folder with the fixture and makes it the folder chosen in "Open folder". */
async function openFolder(page: Page): Promise<void> {
  const files = [...conversationFiles()].map(([path, data]) => ({
    path,
    data: [...(typeof data === 'string' ? Buffer.from(data) : data)],
  }));
  await page.addInitScript(
    ([name, list]) => {
      localStorage.setItem(
        'mapping.identity',
        JSON.stringify({ name: 'Marina Alves', email: 'marina@example.com' }),
      );
      Reflect.set(window, 'showDirectoryPicker', async () => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(name, { create: true });
        for (const f of list) {
          const parts = f.path.split('/');
          let d = dir;
          for (const part of parts.slice(0, -1))
            d = await d.getDirectoryHandle(part, { create: true });
          const h = await d.getFileHandle(parts[parts.length - 1]!, { create: true });
          const w = await h.createWritable();
          await w.write(new Uint8Array(f.data));
          await w.close();
        }
        return dir;
      });
    },
    [FOLDER, files] as const,
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Open folder/ }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

/** Writes a file into the folder, as the MCP server does outside the app. */
async function writeOutside(page: Page, path: string, content: string): Promise<void> {
  await page.evaluate(
    async ([folder, file, text]) => {
      const root = await navigator.storage.getDirectory();
      let dir = await root.getDirectoryHandle(folder);
      const parts = file!.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      const handle = await dir.getFileHandle(parts[parts.length - 1]!, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text!);
      await writable.close();
    },
    [FOLDER, path, content] as const,
  );
}

const conversation = (page: Page) => page.locator('[data-window="conversation"]');
const card = (page: Page) => conversation(page).locator('[data-proposal-card]');

/** Proposals window → "from the conversation" chip → the conversation shows in the window. */
async function openLinkedConversation(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /, citation$/ })
    .first()
    .click();
  await expect(conversation(page)).toBeVisible();
  await expect(card(page)).toBeVisible();
}

test('card Review, write during the review, agent revision, Exit: focus in the composer and the notice', async ({
  page,
}) => {
  await openFolder(page);
  await openLinkedConversation(page);

  // The card's Review keeps the conversation in the window.
  await card(page)
    .getByRole('button', { name: `Review: ${FIXTURE_PROPOSAL_TITLE}` })
    .click();
  await expect(page.getByRole('button', { name: 'Exit review' })).toBeVisible();
  await expect(conversation(page)).toBeVisible();
  await expect(card(page).getByText('In review')).toBeVisible();
  await expect(card(page).getByRole('button')).toHaveCount(0);
  await expect(conversation(page)).toContainText('linked to the proposal under review');

  // Writing during the review.
  const field = conversation(page).getByRole('textbox', { name: /Reply as/ });
  await field.click();
  await field.pressSequentially('Move the header 8 px to the left');
  await field.press('Control+Enter');
  await expect(conversation(page)).toContainText('Move the header 8 px to the left');
  await expect(conversation(page).getByRole('button', { name: 'Resolve' })).toBeVisible();

  // The agent revises the same proposal on disk: the card says so, without taking the focus.
  await field.click();
  const revised = revisedFixtureProposal();
  await writeOutside(page, revised.path, revised.content);
  await expect(card(page).getByText(/^Revised · \d+ to check$/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(card(page).getByText('In review')).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.activeElement?.hasAttribute('data-composer-field'),
    ),
  ).toBe(true);

  // Leaving the review: the focus goes to the composer and Details offers the way back.
  await page.getByRole('button', { name: 'Exit review' }).click();
  await expect(page.getByRole('button', { name: 'Exit review' })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.hasAttribute('data-composer-field')),
    )
    .toBe(true);
  const details = page.locator('[data-window="details"]');
  await expect(
    details.getByText(`The proposal "${FIXTURE_PROPOSAL_TITLE}" is still open.`),
  ).toBeVisible();

  // Review goes back; dismiss hides the notice.
  await details.getByRole('button', { name: /^Review/ }).click();
  await expect(page.getByRole('button', { name: 'Exit review' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit review' }).click();
  await details.getByRole('button', { name: 'Dismiss' }).click();
  await expect(details.getByText(/is still open\.$/)).toHaveCount(0);
});
