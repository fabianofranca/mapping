import { expect, test, type Page } from '@playwright/test';
import { exportZip, type MappingJson } from './helpers';
import {
  FIXTURE_PROPOSAL_ID,
  FIXTURE_PROPOSAL_TITLE,
  fixtureZip,
} from './proposalFixture';

// Etapa 4 (fase 4.4): revisar e aplicar em parte uma proposta.
// O zip de exemplo (o mesmo de examples/proposta-exemplo.zip) traz o projeto "Loja" com
// a proposta "Checkout a partir do Figma"; nada aqui depende do agente.

const NOTE = 'O nome antigo do cabeçalho estava certo.';

async function importFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

/** Abre a janela Propostas (Ctrl+Shift+7). */
async function openProposals(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+7');
}

const row = (page: Page, name: string) =>
  page.getByRole('treeitem', { name, exact: true });

test('revisar e aplicar em parte uma proposta', async ({ page }) => {
  await importFixture(page);

  // A proposta chega na janela Propostas; Revisar abre o modo revisão.
  await openProposals(page);
  await expect(page.getByText(FIXTURE_PROPOSAL_TITLE).first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();

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

  // A nota da rejeição fica nos Detalhes: o botão de nota do cabeçalho abre o campo, que
  // grava ao sair dele.
  await page.getByRole('button', { name: 'Adicionar nota' }).click();
  const note = page.getByRole('textbox', { name: 'Nota para o agente', exact: true });
  await note.fill(NOTE);
  await note.blur();
  await expect(note).toHaveValue(NOTE);

  // Aplicar aceitas · 4: a imagem e a marcação dela, a marcação e a anotação do cupom.
  await page
    .getByRole('button', { name: /^Aplicar aceitas · 4/ })
    .first()
    .click();
  await expect(page.getByText(/4 mudança\(s\) aplicada\(s\)/).first()).toBeVisible();

  // Sem aceitas pendentes, sair não pergunta nada.
  await page
    .getByRole('button', { name: /^Sair da revisão/ })
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

test('decidir pelos Detalhes: o cabeçalho do item, o popover do campo e o teclado', async ({
  page,
}) => {
  await importFixture(page);
  await openProposals(page);
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();

  // O cabeçalho decide o item inteiro (a marcação e a anotação criadas).
  await row(page, 'Campo Cupom').click();
  const header = page.getByRole('region', { name: 'Decisão' });
  await expect(header.getByText('Marcação criada')).toBeVisible();
  await header.getByRole('button', { name: 'Aceitar Campo Cupom' }).click();
  await expect(header.getByText('2 aceitas, 0 rejeitadas, 0 sem decisão')).toBeVisible();

  // O popover do campo decide só o campo; fica aberto mostrando a decisão.
  await row(page, 'Cabeçalho').click();
  const mark = page.getByRole('button', { name: /^Nome: alterado/ });
  await mark.click();
  const popover = page.getByRole('dialog', { name: 'Nome · alterado' });
  await popover.getByRole('button', { name: 'Rejeitar Nome' }).click();
  await expect(mark).toHaveAttribute('data-state', 'rejected');
  await expect(popover).toBeVisible();
  await expect(popover.getByRole('status')).toHaveText('Nome: rejeitada');

  // Com o foco no marcador, o teclado decide o campo: A aceita, Backspace limpa.
  await page.keyboard.press('Escape');
  await expect(mark).toBeFocused();
  await page.keyboard.press('a');
  await expect(mark).toHaveAttribute('data-state', 'accepted');
  await page.keyboard.press('Backspace');
  await expect(mark).toHaveAttribute('data-state', 'undecided');
});

test('rejeitar a criação pelo marcador leva a anotação junto; Desfazer e aceitar pelo cartão', async ({
  page,
}) => {
  await importFixture(page);
  await openProposals(page);
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await row(page, 'Campo Cupom').click();
  const header = page.getByRole('region', { name: 'Decisão' });

  // O marcador "+" é parte da criação: o quadro manda decidir no cabeçalho, e `R` com o
  // foco nele rejeita a criação da marcação.
  const part = page.getByRole('button', { name: /^Nome: novo, parte da criação/ });
  await part.click();
  await expect(
    page
      .getByRole('dialog')
      .getByText('Faz parte da criação da marcação: decida no cabeçalho, acima.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(part).toBeFocused();
  await page.keyboard.press('r');
  await expect(
    header.getByText(/^1 mudança\(s\) rejeitada\(s\) junto: Anotação Input criada/),
  ).toBeVisible();
  await expect(header.getByText('0 aceitas, 2 rejeitadas, 0 sem decisão')).toBeVisible();

  // Desfazer volta as duas.
  await header.getByRole('button', { name: 'Desfazer' }).click();
  await expect(header.getByText('0 aceitas, 0 rejeitadas, 2 sem decisão')).toBeVisible();

  // Rejeitar de novo e aceitar a anotação pelo cartão dela (a criação volta junto).
  await part.focus();
  await page.keyboard.press('r');
  // A criação rejeitada: o painel mostra o que a proposta criaria, e o cartão da anotação
  // continua lá, com a decisão.
  const card = page.locator('[data-annotation]').first();
  await card.getByRole('button', { name: 'Aceitar Anotação Input criada' }).click();
  await expect(header.getByText('2 aceitas, 0 rejeitadas, 0 sem decisão')).toBeVisible();
});

// Nota sugerida ao rejeitar a criação (R5.3, HANDOFF-REVIEW-DETAILS 5.5). Rejeitar a
// anotação criada troca o cartão dela (vira "Criação rejeitada") e remonta o popover com o
// campo de nota dentro; o Chrome dispara `blur` no campo ao tirá-lo do DOM (o jsdom não),
// e esse `blur` apagava o pedido da nota. Falhou em três rodadas manuais com os testes de
// componente verdes. `click()` tem `detail` 1; `dispatchEvent('click')`, `detail` 0, como
// o clique de uma extensão do navegador.
async function openCreatedAnnotation(page: Page) {
  await importFixture(page);
  await openProposals(page);
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await row(page, 'Campo Cupom').click();
  return page.locator('[data-annotation]').first();
}

const noteBox = (page: Page) =>
  page.getByRole('textbox', { name: 'Nota para o agente', exact: true });

for (const mode of ['clique real', 'clique sintético'] as const) {
  const press = (button: ReturnType<Page['locator']>) =>
    mode === 'clique real' ? button.click() : button.dispatchEvent('click');

  test(`rejeitar a anotação criada pelo ✕ do cartão abre a nota vazia com o foco (${mode})`, async ({
    page,
  }) => {
    const card = await openCreatedAnnotation(page);
    await press(card.getByRole('button', { name: 'Rejeitar Anotação Input criada' }));
    await expect(card.getByText('Criação rejeitada')).toBeVisible();
    await expect(noteBox(page)).toBeFocused();
    await expect(noteBox(page)).toHaveValue('');
    // Vazia, ao sair ela some e o foco não cai no body.
    await page.keyboard.press('Tab');
    await expect(noteBox(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(
      false,
    );
  });

  test(`rejeitar a anotação criada pelo Rejeitar do popover abre a nota vazia com o foco (${mode})`, async ({
    page,
  }) => {
    const card = await openCreatedAnnotation(page);
    await card.getByRole('button', { name: /^Anotação Input criada: novo/ }).click();
    const popover = page.getByRole('dialog', { name: /^Anotação Input criada/ });
    await press(popover.getByRole('button', { name: /^Rejeitar/ }));
    await expect(card.getByText('Criação rejeitada')).toBeVisible();
    await expect(noteBox(page)).toBeFocused();
    await expect(noteBox(page)).toHaveValue('');
    // O que se escreve grava ao sair do campo (o marcador passa a dizer "com nota").
    await noteBox(page).fill('O Input vira um Text.');
    await page.keyboard.press('Tab');
    await expect(
      card.getByRole('button', { name: /^Anotação Input criada: .*com nota/ }),
    ).toBeVisible();
  });
}

test('rejeitar a anotação criada pelo teclado não abre a nota nem move o foco para ela', async ({
  page,
}) => {
  const card = await openCreatedAnnotation(page);
  const reject = card.getByRole('button', { name: 'Rejeitar Anotação Input criada' });
  await reject.focus();
  await page.keyboard.press('Enter');
  await expect(card.getByText('Criação rejeitada')).toBeVisible();
  await expect(noteBox(page)).toHaveCount(0);
  // O mesmo no popover: Enter no Rejeitar dele.
  await card.getByRole('button', { name: 'Aceitar Anotação Input criada' }).click();
  await card.getByRole('button', { name: /^Anotação Input criada: novo/ }).click();
  const popover = page.getByRole('dialog', { name: /^Anotação Input criada/ });
  await popover.getByRole('button', { name: /^Rejeitar/ }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByText('Criação rejeitada')).toBeVisible();
  await expect(noteBox(page)).toHaveCount(0);
});
