import { expect, test, type Locator, type Page } from '@playwright/test';
import { addImage, canvasPoint, createProject, drawMarking, setMode } from './helpers';

// Etapa Comentários, CM4: os pinos das conversas (escondidos por padrão), o botão Conversas, o botão
// Comentar e o clique no pino. O canvas publica `data-pins` (quantos pinos desenhou).

async function setIdentity(page: Page): Promise<void> {
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Marina Alves');
  await dialog.getByLabel('E-mail', { exact: true }).fill('marina@exemplo.com');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

async function pins(host: Locator): Promise<number> {
  return Number((await host.getAttribute('data-pins')) ?? 0);
}

test('os pinos nascem escondidos, o Comentar abre o rascunho e o clique no pino abre a conversa', async ({
  page,
}) => {
  await createProject(page, 'Comentários');
  await addImage(page);
  await setIdentity(page);
  const host = page.locator('.canvas-host');
  const center = await canvasPoint(page);
  await drawMarking(page, center);
  await setMode(page, 'Navegar');
  const conversas = page.getByRole('button', { name: 'Conversas', exact: true });
  await expect(conversas).toHaveAttribute('aria-pressed', 'false');
  expect(await pins(host)).toBe(0);

  // Comentar: arma o clique, liga os pinos e, sobre a marcação, abre o rascunho ancorado nela.
  await page.getByRole('button', { name: 'Comentar', exact: true }).first().click();
  await expect(conversas).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(center.x, center.y);
  const composer = page.getByRole('textbox', { name: /Comentar como Marina Alves/ });
  await expect(composer).toBeVisible();
  await composer.fill('Qual é a variante?');
  await composer.press('Control+Enter');
  await expect.poll(() => pins(host)).toBe(1);

  // Desligar o Conversas esconde o pino (a conversa continua nos Detalhes).
  const elsewhere = await canvasPoint(page, 0.9);
  await page.mouse.click(elsewhere.x, elsewhere.y);
  await conversas.click();
  await expect(conversas).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => pins(host)).toBe(0);
  // Ligar de novo traz o pino de volta.
  await conversas.click();
  await expect.poll(() => pins(host)).toBe(1);

  // O clique no pino (canto de cima à direita da marcação, por fora) abre a conversa nos Detalhes.
  await page.mouse.click(center.x + 60 + 22, center.y - 40 - 10);
  await expect(page.getByText('Qual é a variante?')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: /Responder como Marina Alves/ }),
  ).toBeVisible();
});

test('o Comentar num lugar vazio abre o rascunho num ponto, com o pino tracejado', async ({
  page,
}) => {
  await createProject(page, 'Comentários ponto');
  await addImage(page);
  await setIdentity(page);
  const host = page.locator('.canvas-host');
  const empty = await canvasPoint(page, 0.15);
  await page.getByRole('button', { name: 'Comentar', exact: true }).first().click();
  await page.mouse.click(empty.x, empty.y);
  await expect(
    page.getByRole('textbox', { name: /Comentar como Marina Alves/ }),
  ).toBeVisible();
  // Nada gravado ainda, mas o rascunho mostra o pino tracejado.
  await expect.poll(() => pins(host)).toBe(1);
});
