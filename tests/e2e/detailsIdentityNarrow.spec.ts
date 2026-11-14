import { expect, test } from '@playwright/test';
import { addImage, canvasPoint, createProject, drawMarking } from './helpers';

// Detalhes a 900×720 com Árvore, Camadas e Detalhes abertos (R4/R11 da rodada em 5 blocos): o
// título da marcação sem nome não quebra a palavra no meio; se faltar espaço ele desce inteiro.

test.use({ viewport: { width: 900, height: 720 } });

test('o título dos Detalhes não quebra letra a letra com as três janelas abertas', async ({
  page,
}) => {
  await createProject(page, 'Estreito');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await page.keyboard.press('Control+Shift+1');
  await page.keyboard.press('Control+Shift+2');
  await page.keyboard.press('Control+Shift+3');
  const name = page.locator('.identity-name').first();
  await expect(name).toHaveText('Unnamed marking');
  const box = await name.boundingBox();
  // Uma linha só (altura da fonte de título), não "Marca/ção/sem/nome".
  expect(box?.height ?? 99).toBeLessThan(30);
});
