import { expect, test } from '@playwright/test';
import { conversationZip } from './conversationFixture';
import { fixtureZip } from './proposalFixture';

// Stage #515 (FN2, finding 1 of the FN1 report): leaving the review through the button moves focus to
// the proposal's Review/Continue (Proposals window open) or to the canvas (closed); never to the
// body. The window swaps the review tree for the list after `review.close()`.

test.use({ viewport: { width: 1280, height: 860 } });

async function openFixture(
  page: import('@playwright/test').Page,
  zip: () => Promise<Buffer> = fixtureZip,
) {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await zip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

const activeTag = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      proposalAction: el?.hasAttribute('data-proposal-action') ?? false,
      composer: el?.hasAttribute('data-composer-field') ?? false,
      canvas: el?.getAttribute('aria-label') ?? '',
      body: el === document.body,
    };
  });

test('Exiting the review through the button, with Proposals open: focus on the proposal button (4 times)', async ({
  page,
}) => {
  await openFixture(page);
  await page.keyboard.press('Control+Shift+7');
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole('button', { name: /^(Review|Continue)/ })
      .first()
      .click();
    const exit = page.getByRole('button', { name: 'Exit review' });
    await expect(exit).toBeVisible();
    await exit.click();
    await expect(page.locator('[data-proposal-action]')).toHaveCount(1);
    await expect.poll(async () => (await activeTag(page)).proposalAction).toBe(true);
    await page.waitForTimeout(600);
    expect((await activeTag(page)).proposalAction).toBe(true);
  }
});

test('Exiting the review through the button, with Proposals closed: focus on the canvas', async ({
  page,
}) => {
  await openFixture(page);
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^(Review|Continue)/ })
    .first()
    .click();
  // Closes the Proposals window through the strip button, with the review in progress.
  await page.locator('[data-strip-window="proposals"]').click();
  await expect(page.locator('[data-window="proposals"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit review' }).click();
  await expect(page.getByRole('button', { name: 'Exit review' })).toHaveCount(0);
  await page.waitForTimeout(600);
  const state = await activeTag(page);
  expect(state.body).toBe(false);
  expect(state.canvas).toBe('Project canvas');
});

// Stage #1881 (CV3, decision 19): with the Conversation window open on a conversation the person
// can answer, the first target is its composer field, ahead of the proposal button.
test('Exiting the review with the Conversation window open on an open conversation: focus in its composer', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mapping.identity',
      JSON.stringify({ name: 'Marina Alves', email: 'marina@example.com' }),
    ),
  );
  await openFixture(page, conversationZip);
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /, citation$/ })
    .first()
    .click();
  const window = page.locator('[data-window="conversation"]');
  await expect(window).toBeVisible();
  await window.locator('[data-proposal-card]').getByRole('button').click();
  const exit = page.getByRole('button', { name: 'Exit review' });
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(exit).toHaveCount(0);
  await expect.poll(async () => (await activeTag(page)).composer).toBe(true);
  await page.waitForTimeout(600);
  const state = await activeTag(page);
  expect(state.composer).toBe(true);
  expect(state.proposalAction).toBe(false);
});
