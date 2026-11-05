import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

// A dica dos botões da faixa lateral sai ao lado do botão, e não embaixo, onde cobria o
// conteúdo da janela aberta (a busca do Catálogo, #497, AC1).

test('a dica da faixa esquerda aparece à direita do botão, sem passar por baixo dele', async ({
  page,
}) => {
  await createProject(page, 'Faixa');
  const button = page.locator('.tool-strip-left [data-strip-window]').first();
  await button.hover();
  const tip = button
    .locator('xpath=ancestor::*[contains(@class,"tooltip-anchor")]')
    .locator('.tooltip');
  await expect(tip).toBeVisible();
  const [b, t] = await Promise.all([button.boundingBox(), tip.boundingBox()]);
  if (!b || !t) throw new Error('sem geometria');
  expect(t.x).toBeGreaterThanOrEqual(b.x + b.width);
  // Centrada na vertical do botão: não desce sobre o botão seguinte nem sobre a janela.
  expect(Math.abs(t.y + t.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(2);
});
