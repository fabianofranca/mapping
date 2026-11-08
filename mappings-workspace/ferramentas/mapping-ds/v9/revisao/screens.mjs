// Telas do modo revisão no app 0.25.0, com a proposta aberta da fixture ("Revisão de teste: botões e pinos").
const PROPOSALS = '.tool-window[data-window=proposals]';
const DETAILS = '.tool-window[data-window=details]';

// Abre a janela Propostas (Ctrl+Shift+7).
async function openProposals(page) {
  await page.keyboard.press('Control+Shift+7');
  await page.locator(`${PROPOSALS} .proposal-row`).first().waitFor();
  await page.waitForTimeout(300);
}

// Entra no modo revisão pela linha da proposta aberta (botão Revisar).
async function enterReview(page) {
  await openProposals(page);
  await page.locator(`${PROPOSALS} .proposal-row[data-status=open]`).getByRole('button', { name: /^Revisar/ }).click();
  await page.locator('.review-bar').waitFor();
  await page.locator(`${PROPOSALS} .review-row`).first().waitFor();
  await page.waitForTimeout(600);
}

// Seleciona um nível pela linha da janela Propostas (o rótulo exato).
async function selectLevel(page, label) {
  const row = page.locator(`${PROPOSALS} .review-row`).filter({ has: page.locator('.review-row-label', { hasText: new RegExp(`^${label}$`) }) }).first();
  await row.locator('.review-row-label').click();
  await page.waitForTimeout(600);
}

// Uma nota na mudança do Nome do Salvar (pelo popover do marcador): os Detalhes passam a mostrar a ChangeBelow.
async function noteOnName(page) {
  await page.locator(`${DETAILS} .change-mark[data-change]`).first().click();
  const pop = page.locator('.popover.change-popover');
  await pop.waitFor();
  await pop.getByRole('button', { name: 'Adicionar nota' }).click();
  await pop.locator('textarea').waitFor();
  await page.keyboard.type('Prefiro manter "Salvar": o botão é curto.');
  // Sai do campo (grava a nota) sem fechar o popover nem mudar a seleção.
  await pop.locator('.change-popover-title').click();
  await page.waitForTimeout(600);
  if (await pop.isVisible()) await page.locator(`${DETAILS} .identity-name`).click();
  await page.waitForTimeout(400);
}

export const screens = [
  {
    // A janela Propostas, mais alta (arrastando a borda), com a proposta aberta e as fechadas.
    name: 'Revisão — Janela Propostas',
    rootSel: PROPOSALS,
    rootIsItem: true,
    open: async (page) => {
      await openProposals(page);
      const grip = await page.locator(`${PROPOSALS} .tool-resizer`).boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2, grip.y - 170, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    },
  },
  {
    // O editor no modo revisão com o botão Salvar selecionado: ReviewBar, níveis, cabeçalho com a nota do item,
    // marcadores e a nota de uma mudança embaixo do campo Nome.
    name: 'Revisão — Editor 1440 × 900 (Salvar)',
    rootSel: '.editor-desktop',
    open: async (page) => {
      await enterReview(page);
      await selectLevel(page, 'Salvar');
      await noteOnName(page);
      // A nota do item, pelo botão de nota do cabeçalho.
      await page.locator(`${DETAILS} .review-header`).getByRole('button', { name: 'Adicionar nota' }).click();
      await page.locator(`${DETAILS} .review-header textarea`).waitFor();
      await page.keyboard.type('Conferir o rótulo com o time de produto.');
      await page.locator(`${DETAILS} .identity-name`).click();
      await page.waitForTimeout(600);
      // O campo da nota remonta com o foco (a nota passou a existir): tira o foco para a captura.
      await page.evaluate(() => document.activeElement?.blur());
      // Os níveis começam numa linha inteira (Trava, logo acima do Salvar).
      await page.evaluate((sel) => {
        const body = document.querySelector(`${sel} .review-levels-body`);
        const row = [...body.querySelectorAll('.review-row')].find((r) => r.querySelector('.review-row-label')?.textContent === 'Salvar');
        body.scrollTop += row.getBoundingClientRect().top - body.getBoundingClientRect().top - row.getBoundingClientRect().height;
      }, PROPOSALS);
      await page.waitForTimeout(300);
    },
  },
  {
    // Os Detalhes no nível da proposta: o cabeçalho (Aceitar tudo / Rejeitar tudo), Outras mudanças e Imagens.
    name: 'Revisão — Detalhes da proposta',
    rootSel: DETAILS,
    rootIsItem: true,
    open: async (page) => {
      await enterReview(page);
      await selectLevel(page, 'Revisão de teste: botões e pinos');
    },
  },
  {
    // Os Detalhes de uma marcação criada pela proposta: a Flag "Criada pela proposta" e os marcadores de parte
    // (tracejados, só com o +).
    name: 'Revisão — Detalhes da marcação criada',
    rootSel: DETAILS,
    rootIsItem: true,
    open: async (page) => {
      await enterReview(page);
      await selectLevel(page, 'Pinos abertos');
    },
  },
  {
    // O popover do marcador do Nome (com a nota da mudança), levado para dentro da janela Detalhes (no DOM ele
    // mora nela, e o extrator recorta pelo corpo da janela).
    name: 'Revisão — Popover da mudança',
    rootSel: '.popover.change-popover',
    rootIsItem: true,
    open: async (page) => {
      await enterReview(page);
      await selectLevel(page, 'Salvar');
      await noteOnName(page);
      await page.locator(`${DETAILS} .change-mark[data-change]`).first().click();
      await page.locator('.popover.change-popover').waitFor();
      await page.waitForTimeout(400);
      await page.evaluate((sel) => {
        const pop = document.querySelector('.popover.change-popover');
        const body = document.querySelector(sel).getBoundingClientRect();
        pop.style.left = `${Math.round(body.left + 8)}px`;
        document.activeElement?.blur();
      }, `${DETAILS} .tool-window-body`);
      await page.waitForTimeout(300);
    },
  },
];
