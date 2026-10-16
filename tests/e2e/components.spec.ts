import { expect, test } from '@playwright/test';

// Laboratório "Componentes" (lab/components): telas sem imagem, montadas com componentes
// genéricos desenhados por template; editar um campo redesenha a instância.

const LAB = '/lab/components/index.html';

async function paintedPixels(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const canvases = document.querySelectorAll('[data-testid="stage"] canvas');
    let count = 0;
    for (const canvas of canvases) {
      if (!(canvas instanceof HTMLCanvasElement)) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) count++;
    }
    return count;
  });
}

test('os exemplos carregam a biblioteca e desenham a tela de login', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto(LAB);
  await expect(
    page.getByRole('heading', { name: 'Componentes por template' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Exemplos', exact: true }).click();
  await expect(page.getByTestId('status')).toContainText('6 tipo(s), 6 com componente');
  await expect(page.getByTestId('status')).toContainText('9 instância(s)');
  await expect(page.locator('[data-type-id="button"]')).toContainText('Botão');
  expect(await paintedPixels(page)).toBeGreaterThan(5000);
  expect(violations).toEqual([]);
});

test('o Material 3 carrega quinze componentes e a tela de configurações', async ({
  page,
}) => {
  await page.goto(LAB);
  await page.getByRole('button', { name: 'Material 3' }).click();
  await expect(page.getByTestId('status')).toContainText('15 tipo(s), 15 com componente');
  await expect(page.getByTestId('status')).toContainText('21 instância(s)');
  await expect(page.locator('.lab-warnings')).toContainText('Nada ficou de fora');
  expect(await paintedPixels(page)).toBeGreaterThan(5000);
});

test('adicionar um botão e editar os campos reflete no desenho', async ({ page }) => {
  await page.goto(LAB);
  await page.getByRole('button', { name: 'Exemplos', exact: true }).click();
  await page.getByRole('button', { name: 'Nova tela' }).click();
  await expect(page.getByTestId('status')).toContainText('0 instância(s)');
  const before = await paintedPixels(page);
  const addButton = page
    .locator('[data-type-id="button"]')
    .getByRole('button', { name: 'Adicionar' });

  await addButton.click();
  await expect(page.getByTestId('status')).toContainText('1 instância(s)');
  await expect(page.getByRole('heading', { name: 'Botão · Entrar' })).toBeVisible();
  const withButton = await paintedPixels(page);
  expect(withButton).toBeGreaterThan(before);

  // A instância recém-criada fica selecionada: Delete (fora de um campo) exclui.
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('status')).toContainText('0 instância(s)');

  // De novo, agora editando os campos: o rótulo muda o cabeçalho (labelField) e o desenho.
  await addButton.click();
  await expect(page.getByTestId('status')).toContainText('1 instância(s)');
  const label = page.getByTestId('properties').getByLabel('Rótulo *');
  await label.fill('Continuar com um rótulo bem mais longo');
  await expect(
    page.getByRole('heading', { name: /Continuar com um rótulo/ }),
  ).toBeVisible();
  const longer = await paintedPixels(page);
  expect(longer).not.toBe(withButton);

  // Desabilitar baixa a opacidade: o desenho muda.
  await page.getByTestId('properties').getByLabel('Desabilitado').selectOption('sim');
  await expect.poll(() => paintedPixels(page)).not.toBe(longer);

  // Excluir pelo botão do painel.
  await page.getByTestId('properties').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByTestId('status')).toContainText('0 instância(s)');
});

test('a página leva a CSP gerada no build', async ({ page }) => {
  await page.goto(LAB);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
});
