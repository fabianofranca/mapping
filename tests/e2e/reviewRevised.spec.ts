import JSZip from 'jszip';
import { expect, test, type Page } from '@playwright/test';
import {
  addNote,
  prepareRevision,
  proposalFilePath,
  proposalImagePath,
  renameMarking,
  reviseProposal,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import {
  FIXTURE_IMAGES,
  fixtureFiles,
  fixtureProject,
  fixtureProposal,
} from './proposalFixture';

// CP3 (#644): the agent's revision in the app. "Fixture 5" is written here: the sample
// proposal, with the header rename rejected, a note on the banner removal, and then
// revised as the MCP would write it (the header name is swapped and the removal is withdrawn).
// pt-BR kept: shared fixture data (proposalFixture names such as 'Cabeçalho do checkout', 'Botão Pagar') asserted by tests/examples and tests/store

const REVISED_AT = '2026-11-07T10:00:00.000Z';

function revisedProposal(): Proposal {
  const project = fixtureProject();
  const base = fixtureProposal(project);
  const rename = base.changes.find((c) => c.entity === 'marking' && c.field === 'name');
  const removal = base.changes.find(
    (c) => c.entity === 'marking' && c.entityId === 'M5' && c.kind === 'remove',
  );
  if (!rename || !removal) throw new Error('expected changes missing');
  let p: Proposal = {
    ...base,
    decisions: { [rename.id]: { state: 'rejected', at: REVISED_AT } },
  };
  p = addNote(
    p,
    { level: 'change', id: removal.id },
    'The banner stays.',
    REVISED_AT,
    'N-banner',
  );
  const prep = prepareRevision(project, p, [removal.id]);
  if (!prep.ok) throw new Error(prep.error.code);
  const after = renameMarking(prep.proposed, 'M1', 'Checkout top');
  const result = reviseProposal(project, p, {
    drop: [removal.id],
    at: REVISED_AT,
    after,
  });
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.proposal, revision: p.revision + 1 };
}

async function revisedZip(): Promise<Buffer> {
  const proposal = revisedProposal();
  expect(proposal.formatVersion).toBe(5);
  const files = fixtureFiles();
  files.set(proposalFilePath(proposal.id), serializeProposal(proposal));
  for (const file of ['images/confirmacao.png', 'images/carrinho-v2.png'] as const) {
    files.set(proposalImagePath(proposal.id, file), FIXTURE_IMAGES[file]);
  }
  const zip = new JSZip();
  for (const [path, content] of files) {
    zip.file(path, content, { date: new Date(REVISED_AT), compression: 'DEFLATE' });
  }
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

async function openRevised(page: Page): Promise<void> {
  await page.setViewportSize({ width: 900, height: 720 });
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await revisedZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+7');
}

test('agent revision in the app: badge, filter, before the revision and note of the withdrawn change', async ({
  page,
}) => {
  await openRevised(page);

  // The Proposals window says how many changes to check.
  await expect(page.getByText(/Revised · \d+ to check/).first()).toBeVisible();
  await page
    .getByRole('button', { name: /^(Review|Continue)/ })
    .first()
    .click();
  await expect(page.locator('.review-levels')).toBeVisible();

  // The badge on the row of the swapped change.
  const renamed = page.getByRole('treeitem', { name: 'Name, Revised', exact: true });
  await expect(renamed).toBeVisible();
  await expect(renamed).toContainText('Checkout top');
  await expect(renamed.locator('.flag', { hasText: /^Revised/ })).toBeVisible();

  // The note of the withdrawn change moved up to the proposal notes (the tree root row).
  await page
    .getByRole('treeitem', { name: /^Checkout a partir do Figma/ })
    .first()
    .click();
  await expect(
    page.getByText(/From the withdrawn change: .*Banner promoção/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Note for the agent' }).first(),
  ).toHaveValue('The banner stays.');

  // Filters › Revised only (N): only the revised ones stay.
  const total = await page.locator('.review-row').count();
  await page.getByRole('button', { name: /^Filters/ }).click();
  const only = page.getByRole('checkbox', { name: /^Revised only \(\d+\)$/ });
  await only.check();
  await page.keyboard.press('Escape');
  const rows = page.locator('.review-row');
  await expect(renamed).toBeVisible();
  await expect(rows.filter({ hasText: 'Botão Pagar' })).toHaveCount(0);
  expect(await rows.count()).toBeLessThan(total);

  // The "Before the revision" block in the details of the swapped change.
  await renamed.click();
  const before = page.locator('.revised-before').first();
  await expect(before).toBeVisible();
  await expect(before).toContainText('Before the revision');
  await expect(before).toContainText('The agent had proposed');
  await expect(before).toContainText('Cabeçalho do checkout');
  await expect(before).toContainText('You had rejected');
});
