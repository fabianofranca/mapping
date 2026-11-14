import { expect, test, type Page } from '@playwright/test';
import { exportZip, type MappingJson } from './helpers';
import {
  FIXTURE_PROPOSAL_ID,
  FIXTURE_PROPOSAL_TITLE,
  fixtureZip,
} from './proposalFixture';

// Stage 4 (phase 4.4): review and partially apply a proposal.
// The example zip (the same as examples/proposta-exemplo.zip) brings the project "Loja" with
// the proposal "Checkout a partir do Figma"; nothing here depends on the agent.
// pt-BR kept: shared fixture data (marking, image and proposal names) asserted by tests/e2e/proposalFixture.ts

const NOTE = 'The old header name was right.';

async function importFixture(page: Page): Promise<void> {
  // The Proposals window starts short (3 rows, #598); these flows need the whole list.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mapping.toolWindows', JSON.stringify({ bottomReview: 420 }));
    } catch {
      // No storage: the default applies.
    }
  });
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'store.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

/** Opens the Proposals window (Ctrl+Shift+7). */
async function openProposals(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+7');
}

const row = (page: Page, name: string) =>
  page.getByRole('treeitem', { name, exact: true });

test('review and partially apply a proposal', async ({ page }) => {
  await importFixture(page);

  // The proposal arrives in the Proposals window; Review opens review mode.
  await openProposals(page);
  await expect(page.getByText(FIXTURE_PROPOSAL_TITLE).first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await expect(page.getByText('Read-only').first()).toBeVisible();

  // Accepts the new image (with its marking) and the new item; rejects the header.
  await row(page, 'Confirmação')
    .getByRole('button', { name: /^Accept/ })
    .click();
  await row(page, 'Campo Cupom')
    .getByRole('button', { name: /^Accept/ })
    .click();
  await row(page, 'Cabeçalho')
    .getByRole('button', { name: /^Reject/ })
    .click();
  await row(page, 'Cabeçalho').click();

  // The rejection note lives in Details: the header's note button opens the field, which
  // saves when leaving it.
  await page.getByRole('button', { name: 'Add note' }).click();
  const note = page.getByRole('textbox', { name: 'Note for the agent', exact: true });
  await note.fill(NOTE);
  await note.blur();
  await expect(note).toHaveValue(NOTE);

  // Apply accepted · 4: the image and its marking, the coupon's marking and annotation.
  await page
    .getByRole('button', { name: /^Apply accepted · 4/ })
    .first()
    .click();
  await expect(page.getByText(/4 change\(s\) applied/).first()).toBeVisible();

  // With no pending accepted changes, exiting asks nothing.
  await page
    .getByRole('button', { name: /^Exit review/ })
    .first()
    .click();
  await expect(page.getByText('Read-only')).toHaveCount(0);

  const zip = await exportZip(page);
  const mapping = JSON.parse(
    (await zip.file('mapping.json')?.async('string')) ?? '{}',
  ) as MappingJson;
  const image = mapping.containers.find((i) => i.id === 'I3');
  expect(image?.file).toBe('images/confirmacao.png');
  expect(zip.file('images/confirmacao.png')).not.toBeNull();
  const markings = new Map(mapping.markings.map((m) => [m.id, m]));
  expect(markings.has('M7')).toBe(true);
  expect(markings.has('M8')).toBe(true);
  // Rejected and undecided ones stay as they were.
  expect(markings.get('M1')?.name).toBe('Cabeçalho');
  expect(markings.has('M5')).toBe(true);
  expect(mapping.layers.some((l) => l.id === 'L2')).toBe(false);
  expect(mapping.annotations.some((a) => a.id === 'A7')).toBe(true);

  // The proposal stays open, with the decisions, the note and the applied ones recorded.
  const proposal = JSON.parse(
    (await zip.file(`proposals/${FIXTURE_PROPOSAL_ID}/proposal.json`)?.async('string')) ??
      '{}',
  ) as {
    status: string;
    decisions: Record<string, { state: string }>;
    notes: readonly { text: string }[];
    applied: Record<string, unknown>;
    changes: readonly unknown[];
  };
  expect(proposal.status).toBe('open');
  expect(Object.keys(proposal.applied)).toHaveLength(4);
  expect(
    Object.values(proposal.decisions).filter((d) => d.state === 'rejected'),
  ).toHaveLength(1);
  expect(proposal.notes.map((n) => n.text)).toEqual([NOTE]);
  expect(Object.keys(proposal.decisions).length).toBeLessThan(proposal.changes.length);
});

test('deciding through Details: the item header, the field popover and the keyboard', async ({
  page,
}) => {
  await importFixture(page);
  await openProposals(page);
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();

  // The header decides the whole item (the created marking and annotation).
  await row(page, 'Campo Cupom').click();
  const header = page.getByRole('region', { name: 'Decision' });
  await expect(header.getByText('Marking created')).toBeVisible();
  await header.getByRole('button', { name: /^Accept [^:]+: Campo Cupom$/ }).click();
  await expect(header.getByText('2 accepted, 0 rejected, 0 undecided')).toBeVisible();

  // The field popover decides only the field; it stays open showing the decision.
  await row(page, 'Cabeçalho').click();
  const mark = page.getByRole('button', { name: /^Name: changed/ });
  await mark.click();
  const popover = page.getByRole('dialog', { name: 'Name · changed' });
  await popover.getByRole('button', { name: 'Reject: Name' }).click();
  await expect(mark).toHaveAttribute('data-state', 'rejected');
  await expect(popover).toBeVisible();
  await expect(popover.getByRole('status')).toHaveText('Name: rejected');

  // With focus on the marker, the keyboard decides the field: A accepts, Backspace clears.
  await page.keyboard.press('Escape');
  await expect(mark).toBeFocused();
  await page.keyboard.press('a');
  await expect(mark).toHaveAttribute('data-state', 'accepted');
  await page.keyboard.press('Backspace');
  await expect(mark).toHaveAttribute('data-state', 'undecided');
});

test('rejecting the creation through the marker takes the annotation along; Undo and accept through the card', async ({
  page,
}) => {
  await importFixture(page);
  await openProposals(page);
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await row(page, 'Campo Cupom').click();
  const header = page.getByRole('region', { name: 'Decision' });

  // The "+" marker is part of the creation: the panel says to decide in the header, and `R` with
  // focus on it rejects the marking creation.
  const part = page.getByRole('button', { name: /^Name: new, part of creating/ });
  await part.click();
  await expect(
    page
      .getByRole('dialog')
      .getByText('Part of creating the marking: decide in the header above.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(part).toBeFocused();
  await page.keyboard.press('r');
  await expect(
    header.getByText(/^1 change\(s\) rejected together: Annotation Input created/),
  ).toBeVisible();
  await expect(header.getByText('0 accepted, 2 rejected, 0 undecided')).toBeVisible();

  // Undo brings both back.
  await header.getByRole('button', { name: 'Undo' }).click();
  await expect(header.getByText('0 accepted, 0 rejected, 2 undecided')).toBeVisible();

  // Reject again and accept the annotation through its card (the creation comes back along).
  await part.focus();
  await page.keyboard.press('r');
  // The rejected creation: the panel shows what the proposal would create, and the annotation card
  // is still there, with the decision.
  const card = page.locator('[data-annotation]').first();
  await card.getByRole('button', { name: 'Accept Annotation Input created' }).click();
  await expect(header.getByText('2 accepted, 0 rejected, 0 undecided')).toBeVisible();
});

// Note suggested when rejecting the creation (R5.3, HANDOFF-REVIEW-DETAILS 5.5). Rejecting the
// created annotation swaps its card (it becomes "Creation rejected") and remounts the popover with the
// note field inside; Chrome fires `blur` on the field when removing it from the DOM (jsdom does not),
// and that `blur` erased the note request. It failed in three manual rounds with the component
// tests green. `click()` has `detail` 1; `dispatchEvent('click')`, `detail` 0, like
// a browser extension's click.
async function openCreatedAnnotation(page: Page) {
  await importFixture(page);
  await openProposals(page);
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await row(page, 'Campo Cupom').click();
  return page.locator('[data-annotation]').first();
}

const noteBox = (page: Page) =>
  page.getByRole('textbox', { name: 'Note for the agent', exact: true });

for (const mode of ['real click', 'synthetic click'] as const) {
  const press = (button: ReturnType<Page['locator']>) =>
    mode === 'real click' ? button.click() : button.dispatchEvent('click');

  test(`rejecting the created annotation through the card's ✕ opens the empty note with focus (${mode})`, async ({
    page,
  }) => {
    const card = await openCreatedAnnotation(page);
    await press(card.getByRole('button', { name: 'Reject Annotation Input created' }));
    await expect(card.getByText('Creation rejected')).toBeVisible();
    await expect(noteBox(page)).toBeFocused();
    await expect(noteBox(page)).toHaveValue('');
    // Empty, when leaving it disappears and focus does not fall on the body.
    await page.keyboard.press('Tab');
    await expect(noteBox(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(
      false,
    );
  });

  test(`rejecting the created annotation through the popover's Reject opens the empty note with focus (${mode})`, async ({
    page,
  }) => {
    const card = await openCreatedAnnotation(page);
    await card.getByRole('button', { name: /^Annotation Input created: new/ }).click();
    const popover = page.getByRole('dialog', { name: /^Annotation Input created/ });
    await press(popover.getByRole('button', { name: /^Reject/ }));
    await expect(card.getByText('Creation rejected')).toBeVisible();
    await expect(noteBox(page)).toBeFocused();
    await expect(noteBox(page)).toHaveValue('');
    // What is written saves when leaving the field (the marker starts saying "with a note").
    await noteBox(page).fill('The Input becomes a Text.');
    await page.keyboard.press('Tab');
    await expect(
      card.getByRole('button', { name: /^Annotation Input created: .*with a note/ }),
    ).toBeVisible();
  });
}

test('rejecting the created annotation by keyboard does not open the note or move focus to it', async ({
  page,
}) => {
  const card = await openCreatedAnnotation(page);
  const reject = card.getByRole('button', { name: 'Reject Annotation Input created' });
  await reject.focus();
  await page.keyboard.press('Enter');
  await expect(card.getByText('Creation rejected')).toBeVisible();
  await expect(noteBox(page)).toHaveCount(0);
  // The same in the popover: Enter on its Reject.
  await card.getByRole('button', { name: 'Accept Annotation Input created' }).click();
  await card.getByRole('button', { name: /^Annotation Input created: new/ }).click();
  const popover = page.getByRole('dialog', { name: /^Annotation Input created/ });
  await popover.getByRole('button', { name: /^Reject/ }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByText('Creation rejected')).toBeVisible();
  await expect(noteBox(page)).toHaveCount(0);
});

// Focus after deciding by keyboard (HANDOFF-REVIEW-DETAILS 5.5): rejecting the created
// annotation swaps the card (it becomes "Creation rejected") and the focused button leaves the DOM; Chrome
// sends focus to the body (jsdom does not). The new pair gives focus back to the equivalent control.
const focusedLabel = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el === document.body ? 'BODY' : (el?.getAttribute('aria-label') ?? null);
  });

test('rejecting the created annotation through the card ✕ with Enter keeps focus on the ✕; Enter again undoes', async ({
  page,
}) => {
  const card = await openCreatedAnnotation(page);
  await card.getByRole('button', { name: 'Reject Annotation Input created' }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByText('Creation rejected')).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Rejected: Annotation Input created' }),
  ).toBeFocused();
  expect(await focusedLabel(page)).not.toBe('BODY');
  await page.keyboard.press('Enter');
  await expect(card.getByText('Creation rejected')).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'Reject Annotation Input created' }),
  ).toBeFocused();
});

test('rejecting the creation through the popover Reject with Enter keeps focus on it; Enter again undoes', async ({
  page,
}) => {
  const card = await openCreatedAnnotation(page);
  await card.getByRole('button', { name: /^Annotation Input created: new/ }).click();
  const popover = page.getByRole('dialog', { name: /^Annotation Input created/ });
  await popover.getByRole('button', { name: /^Reject/ }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByText('Creation rejected')).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: /^Annotation Input created/ })
      .getByRole('button', { name: 'Reject: Annotation Input created' }),
  ).toBeFocused();
  expect(await focusedLabel(page)).not.toBe('BODY');
  await page.keyboard.press('Enter');
  await expect(card.getByText('Creation rejected')).toHaveCount(0);
  expect(await focusedLabel(page)).not.toBe('BODY');
});
