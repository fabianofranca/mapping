import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Revisão a 900 px com a camada escondida revelada ("Mostrar aqui"): o Flag "escondida" do
// cabeçalho de camada cabe no rótulo, o + fica à vista e os Detalhes não ganham barra
// horizontal (#372, SN3).

test.use({ viewport: { width: 900, height: 850 } });

async function revealHiddenLayer(page: Page): Promise<Locator> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  // Árvore, Propostas e Detalhes abertos; Camadas é a janela da esquerda.
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit7');
  await page.keyboard.press('Control+Shift+Digit2');
  await page
    .getByRole('button', { name: 'Revisar: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();

  // Esconde todas as camadas que o editor deixa esconder (a ativa não deixa).
  const toggles = page.getByRole('checkbox', { name: /^Mostrar a camada / });
  for (const box of await toggles.all()) {
    if ((await box.isChecked()) && (await box.isEnabled()))
      await box.uncheck({ force: true });
  }

  await page
    .getByRole('group', { name: 'Visão do canvas' })
    .getByRole('button', { name: 'Proposto', exact: true })
    .click();
  await page.locator('.tree-row', { hasText: 'Dados da conta' }).first().click();
  await page.getByRole('button', { name: 'Mostrar aqui' }).first().click();

  const head = page
    .locator('.layer-group-head')
    .filter({ hasText: 'Componentes M3' })
    .first();
  await expect(head.locator('.flag')).toBeVisible();
  return head;
}

test('Flag da camada escondida cabe no rótulo e os Detalhes ficam sem barra horizontal a 900 px', async ({
  page,
}) => {
  const head = await revealHiddenLayer(page);

  const geo = await head.evaluate((el) => {
    const label = el.querySelector<HTMLElement>('.layer-group-label')!;
    const flag = el.querySelector<HTMLElement>('.flag')!;
    return {
      labelRight: label.getBoundingClientRect().right,
      flagRight: flag.getBoundingClientRect().right,
    };
  });
  expect(geo.flagRight).toBeLessThanOrEqual(geo.labelRight + 0.5);

  const body = page.locator('[data-window="details"] .tool-window-body');
  const sizes = await body.evaluate((e) => ({
    scroll: e.scrollWidth,
    client: e.clientWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
});

// Prioridade do cabeçalho: nome > flag > selo (#447, AC1). A flag "escondida" mantém o texto
// inteiro, porque é um estado da camada; o que é cortado (selo, depois o nome) tem a dica.
for (const width of [900, 1280]) {
  test(`a flag "escondida" mantém o texto inteiro a ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const head = await revealHiddenLayer(page);
    const text = head.locator('.flag .flag-text');
    const m = await text.evaluate((e) => ({
      scroll: e.scrollWidth,
      client: e.clientWidth,
    }));
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    // O que encolheu para dar lugar à flag mostra o texto inteiro na dica.
    for (const part of await head.locator('.layer-group-name, .tag').all()) {
      const cut = await part.evaluate((e) => e.scrollWidth > e.clientWidth);
      if (cut) await expect(part).toHaveAttribute('title', /\S/);
    }
  });
}
