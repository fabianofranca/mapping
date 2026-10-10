import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { exportZip, isMobile, type MappingJson } from './helpers';
import {
  FIXTURE_PROPOSAL_ID,
  FIXTURE_PROPOSAL_TITLE,
  fixtureZip,
} from './proposalFixture';

// Etapa 4 (fase 4.4): revisar e aplicar em parte uma proposta, no desktop e no celular.
// O zip de exemplo (o mesmo de examples/proposta-exemplo.zip) traz o projeto "Loja" com
// a proposta "Checkout a partir do Figma"; nada aqui depende do agente.

const NOTE = 'O nome antigo do cabeçalho estava certo.';

async function importFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('input[type=file][accept^=".zip"]').setInputFiles({
    name: 'loja.zip',
    mimeType: 'application/zip',
    buffer: await fixtureZip(),
  });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

/** Abre a janela Propostas: Ctrl+Shift+7 no desktop; Painéis → Propostas no celular. */
async function openProposals(page: Page, info: TestInfo): Promise<void> {
  if (isMobile(info)) {
    await page
      .getByRole('button', { name: /^Painéis/ })
      .first()
      .click();
    await page
      .getByRole('dialog', { name: 'Painéis e ações' })
      .getByRole('button', { name: /^Propostas/ })
      .click();
  } else {
    await page.keyboard.press('Control+Shift+7');
  }
}

const row = (page: Page, name: string) =>
  page.getByRole('treeitem', { name, exact: true });

test('revisar e aplicar em parte uma proposta', async ({ page }, info) => {
  const mobile = isMobile(info);
  await importFixture(page);

  // A proposta chega na janela Propostas; Revisar abre o modo revisão.
  await openProposals(page, info);
  await expect(page.getByText(FIXTURE_PROPOSAL_TITLE).first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();
  if (mobile) {
    // No celular, Revisar volta ao canvas com a faixa e a barra de baixo da revisão.
    await expect(
      page.getByRole('navigation', { name: 'Ferramentas da revisão' }),
    ).toBeVisible();
    await openProposals(page, info);
  }

  // Aceita a imagem nova (com a marcação dela) e o item novo; rejeita o cabeçalho.
  await row(page, 'Confirmação')
    .getByRole('button', { name: /^Aceitar/ })
    .click();
  await row(page, 'Campo Cupom')
    .getByRole('button', { name: /^Aceitar/ })
    .click();
  await row(page, 'Cabeçalho')
    .getByRole('button', { name: /^Rejeitar/ })
    .click();
  await row(page, 'Cabeçalho').click();

  // A nota da rejeição fica nos Detalhes (no celular, na gaveta).
  if (mobile) {
    await page
      .getByRole('button', { name: /^Voltar/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Mostrar detalhes' }).click();
  }
  await page.getByRole('textbox', { name: 'Nova nota para o agente' }).fill(NOTE);
  await page.getByRole('button', { name: 'Adicionar nota' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Nota para o agente', exact: true }),
  ).toHaveValue(NOTE);

  // Aplicar aceitas · 4: a imagem e a marcação dela, a marcação e a anotação do cupom.
  await page
    .getByRole('button', { name: /^Aplicar aceitas · 4/ })
    .first()
    .click();
  await expect(page.getByText(/4 mudança\(s\) aplicada\(s\)/).first()).toBeVisible();

  // Sem aceitas pendentes, sair não pergunta nada.
  await page
    .getByRole('button', { name: mobile ? 'Sair' : /^Sair da revisão/ })
    .first()
    .click();
  await expect(page.getByText('Somente leitura')).toHaveCount(0);

  const zip = await exportZip(page);
  const mapping = JSON.parse(
    (await zip.file('mapping.json')?.async('string')) ?? '{}',
  ) as MappingJson;
  const image = mapping.images.find((i) => i.id === 'I3');
  expect(image?.file).toBe('images/confirmacao.png');
  expect(zip.file('images/confirmacao.png')).not.toBeNull();
  const markings = new Map(mapping.markings.map((m) => [m.id, m]));
  expect(markings.has('M7')).toBe(true);
  expect(markings.has('M8')).toBe(true);
  // Rejeitada e sem decisão continuam como estavam.
  expect(markings.get('M1')?.name).toBe('Cabeçalho');
  expect(markings.has('M5')).toBe(true);
  expect(mapping.layers.some((l) => l.id === 'L2')).toBe(false);
  expect(mapping.annotations.some((a) => a.id === 'A7')).toBe(true);

  // A proposta segue aberta, com as decisões, a nota e as aplicadas registradas.
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
