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

// CP3 (#644): a revisão do agente na app. A "fixture 5" é escrita aqui: a proposta de
// exemplo, com o renomear do cabeçalho rejeitado, uma nota na remoção do banner, e então
// revisada como o MCP a gravaria (o nome do cabeçalho é trocado e a remoção é retirada).

const REVISED_AT = '2026-11-07T10:00:00.000Z';

function revisedProposal(): Proposal {
  const project = fixtureProject();
  const base = fixtureProposal(project);
  const rename = base.changes.find((c) => c.entity === 'marking' && c.field === 'name');
  const removal = base.changes.find(
    (c) => c.entity === 'marking' && c.entityId === 'M5' && c.kind === 'remove',
  );
  if (!rename || !removal) throw new Error('mudanças esperadas ausentes');
  let p: Proposal = {
    ...base,
    decisions: { [rename.id]: { state: 'rejected', at: REVISED_AT } },
  };
  p = addNote(
    p,
    { level: 'change', id: removal.id },
    'O banner fica.',
    REVISED_AT,
    'N-banner',
  );
  const prep = prepareRevision(project, p, [removal.id]);
  if (!prep.ok) throw new Error(prep.error.code);
  const after = renameMarking(prep.proposed, 'M1', 'Topo do checkout');
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
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+7');
}

test('revisão do agente na app: selo, filtro, antes da revisão e nota da mudança retirada', async ({
  page,
}) => {
  await openRevised(page);

  // A janela Propostas avisa quantas mudanças conferir.
  await expect(page.getByText(/Revisada · \d+ para conferir/).first()).toBeVisible();
  await page
    .getByRole('button', { name: /^(Revisar|Continuar)/ })
    .first()
    .click();
  await expect(page.locator('.review-levels')).toBeVisible();

  // O selo na linha da mudança trocada.
  const renamed = page.getByRole('treeitem', { name: 'Nome, Revisada', exact: true });
  await expect(renamed).toBeVisible();
  await expect(renamed).toContainText('Topo do checkout');
  await expect(renamed.locator('.flag', { hasText: /^Revisada/ })).toBeVisible();

  // A nota da mudança retirada subiu para as notas da proposta (a linha raiz da árvore).
  await page
    .getByRole('treeitem', { name: /^Checkout a partir do Figma/ })
    .first()
    .click();
  await expect(
    page.getByText(/Da mudança retirada: .*Banner promoção/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Nota para o agente' }).first(),
  ).toHaveValue('O banner fica.');

  // Filtros › Só revisadas (N): só as revisadas ficam.
  const total = await page.locator('.review-row').count();
  await page.getByRole('button', { name: /^Filtros/ }).click();
  const only = page.getByRole('checkbox', { name: /^Só revisadas \(\d+\)$/ });
  await only.check();
  await page.keyboard.press('Escape');
  const rows = page.locator('.review-row');
  await expect(renamed).toBeVisible();
  await expect(rows.filter({ hasText: 'Botão Pagar' })).toHaveCount(0);
  expect(await rows.count()).toBeLessThan(total);

  // O bloco "Antes da revisão" nos detalhes da mudança trocada.
  await renamed.click();
  const before = page.locator('.revised-before').first();
  await expect(before).toBeVisible();
  await expect(before).toContainText('Antes da revisão');
  await expect(before).toContainText('O agente tinha proposto');
  await expect(before).toContainText('Cabeçalho do checkout');
  await expect(before).toContainText('Você tinha rejeitado');
});
