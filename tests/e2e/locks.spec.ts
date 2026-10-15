import { expect, test, type Page } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  createProject,
  drag,
  drawMarking,
  exportMapping,
  selectedRect,
  type Point,
} from './helpers';

// Etapa 2.5: trava de marcações e imagens. Trancada, a marcação não se move, não é
// excluída, mas segue selecionável.

/** Cursor que o navegador mostra sobre um ponto da página. */
async function cursorAt(page: Page, p: Point): Promise<string> {
  return page.evaluate(
    ([x, y]) => getComputedStyle(document.elementFromPoint(x, y) ?? document.body).cursor,
    [p.x, p.y] as const,
  );
}

async function toggleLock(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Trancar marcação', exact: true }).click();
}

test('marcação trancada não se move nem é excluída; destrancada, volta ao normal', async ({
  page,
}) => {
  await createProject(page, 'Trava');
  await addImage(page);
  const center = await canvasPoint(page);
  await drawMarking(page, center);
  const before = await selectedRect(page);

  await toggleLock(page);
  await expect(
    page.getByRole('button', { name: 'Trancar marcação', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // Detalhes avisa e desabilita o que a trava bloqueia, mas o nome segue editável.
  await expect(page.getByRole('status').filter({ hasText: 'Trancada:' })).toBeVisible();
  await expect(page.getByLabel('X', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Excluir marcação' })).toBeDisabled();
  await expect(page.getByLabel('Nome', { exact: true }).first()).toBeEnabled();

  await page.mouse.move(center.x, center.y);
  expect(await cursorAt(page, center)).toBe('not-allowed');

  // Arrastar sobre ela não a move.
  await drag(page, center, { x: center.x + 60, y: center.y + 20 });
  expect(await selectedRect(page)).toEqual(before);

  // A tecla Delete não exclui (o diálogo de exclusão nem abre).
  await page.keyboard.press('Delete');
  expect(await selectedRect(page)).toEqual(before);

  const spot = center;

  // Mesmo trancada, ela continua selecionável: clicar fora e de novo nela a seleciona.
  await drag(page, { x: spot.x, y: spot.y + 200 }, { x: spot.x, y: spot.y + 200 });
  await drag(page, spot, spot);
  expect(await selectedRect(page)).toEqual(before);

  await toggleLock(page);
  await drag(page, spot, { x: spot.x + 60, y: spot.y });
  const after = await selectedRect(page);
  expect(after.x).toBeGreaterThan(before.x);
  expect({ w: after.width, h: after.height }).toEqual({
    w: before.width,
    h: before.height,
  });
});

test('o atalho Alt+L tranca e destranca a seleção, e o locked vai para o mapping.json', async ({
  page,
}) => {
  await createProject(page, 'Atalho');
  await addImage(page);
  const center = await canvasPoint(page);
  await drawMarking(page, center);

  await page.keyboard.press('Alt+L');
  const locked = await exportMapping(page);
  expect(locked.mapping.schemaVersion).toBe(9);
  expect(locked.mapping.markings.map((m) => m.locked)).toEqual([true]);
  expect(locked.mapping.images.map((i) => i.locked)).toEqual([false]);
  // Baixar fecha o diálogo de exportação; a seleção continua na marcação.
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.keyboard.press('Alt+L');
  const unlocked = await exportMapping(page);
  expect(unlocked.mapping.markings.map((m) => m.locked)).toEqual([false]);
});

test('imagem trancada: "trancar todas" e Excluir desabilitado', async ({ page }) => {
  await createProject(page, 'Imagem');
  await addImage(page);
  const center = await canvasPoint(page);
  await drawMarking(page, center);

  // Seleciona a imagem clicando fora da marcação.
  await drag(
    page,
    { x: center.x, y: center.y + 250 },
    { x: center.x, y: center.y + 250 },
  );
  await page
    .getByRole('button', { name: 'Trancar todas as marcações desta imagem' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Destrancar todas as marcações desta imagem' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Trancar imagem', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Excluir imagem' })).toBeDisabled();

  const { mapping } = await exportMapping(page);
  expect(mapping.images.map((i) => i.locked)).toEqual([true]);
  expect(mapping.markings.map((m) => m.locked)).toEqual([true]);
});
