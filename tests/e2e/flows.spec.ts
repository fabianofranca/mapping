import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
  exportMapping,
  openDetails,
} from './helpers';

const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');

test('projeto novo → imagem → marcação → anotação → zip com o mapping.json', async ({
  page,
}, info) => {
  await createProject(page, 'Projeto E2E');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));

  await openDetails(page);
  await page
    .getByRole('button', { name: /Adicionar anotação na camada/ })
    .first()
    .click();
  await page.getByLabel('Nome da anotação').fill('Botão Entrar');
  await page.getByLabel('Nome da anotação').press('Enter');
  await page.getByRole('button', { name: '+ Par' }).click();
  await page.getByLabel('Chave').fill('acao');
  await page.getByLabel('Chave').press('Tab');
  await page.getByLabel('Valor').fill('login');
  await page.getByLabel('Valor').press('Enter');

  const { mapping, files } = await exportMapping(page);
  expect(mapping.schemaVersion).toBe(4);
  expect(files).toContain('images/tela.webp');
  expect(mapping.images).toHaveLength(1);
  expect(mapping.images[0]).toMatchObject({
    file: 'images/tela.webp',
    width: 400,
    height: 800,
  });
  expect(mapping.markings).toHaveLength(1);
  const marking = mapping.markings[0];
  if (!marking) throw new Error('sem marcação');
  expect(marking.imageId).toBe(mapping.images[0]?.id);
  // O retângulo vai em pixels da imagem original, dentro dela.
  const { x, y, width, height } = marking.rect;
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(x + width).toBeLessThanOrEqual(400);
  expect(y + height).toBeLessThanOrEqual(800);
  expect(mapping.annotations).toHaveLength(1);
  expect(mapping.annotations[0]).toMatchObject({
    markingId: marking.id,
    name: 'Botão Entrar',
    type: null,
  });
  expect(mapping.annotations[0]?.entries.map((e) => [e.key, e.value])).toEqual([
    ['acao', 'login'],
  ]);
});

test('exemplo SDUI → Input com `dado` apontando para uma tupla livre', async ({
  page,
}, info) => {
  await createProject(page, 'Projeto SDUI');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  await applySpecialization(page, SDUI);

  // Anotação livre com a tupla `name: string` (camada livre).
  await openDetails(page);
  await page
    .getByRole('button', { name: 'Adicionar anotação na camada Camada 1' })
    .first()
    .click();
  await page.getByLabel('Nome da anotação').fill('User');
  await page.getByLabel('Nome da anotação').press('Enter');
  await page.getByRole('button', { name: '+ Par' }).click();
  await page.getByLabel('Chave').fill('name');
  await page.getByLabel('Chave').press('Tab');
  await page.getByLabel('Valor').fill('string');
  await page.getByLabel('Valor').press('Enter');

  // Input na camada de componentes.
  await page
    .getByRole('button', { name: 'Adicionar anotação na camada Componentes' })
    .click();
  await page.getByRole('button', { name: /^Input/ }).click();
  await page.getByLabel('id', { exact: true }).fill('input_nome');
  await page.getByLabel('id', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Escolher' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /name/ }).click();
  await expect(page.getByText(/^→ /)).toContainText('name');

  const { mapping } = await exportMapping(page);
  expect(mapping.specializations).toEqual(
    [{ id: 'sdui', version: 1 }].map((s) => expect.objectContaining(s)),
  );
  const free = mapping.annotations.find((a) => a.type === null);
  const input = mapping.annotations.find((a) => a.type?.typeId === 'input');
  expect(free?.entries).toHaveLength(1);
  expect(input?.type).toEqual({ specId: 'sdui', typeId: 'input' });
  expect(input?.values).toMatchObject({
    id: 'input_nome',
    dado: { annotationId: free?.id, entryId: free?.entries[0]?.id },
  });
});

test('caixa de seleção e texto de "Texto no canvas" ficam na mesma linha', async ({
  page,
}) => {
  await page.goto('/');
  const check = page.getByLabel('Texto no canvas');
  const text = page.locator('label.choice .choice-label').first();
  await expect(check).toBeVisible();
  const [c, s] = await Promise.all([check.boundingBox(), text.boundingBox()]);
  if (!c || !s) throw new Error('sem bounding box');
  // Mesma faixa vertical (as caixas se sobrepõem) e a caixa fica à esquerda do texto.
  expect(c.y).toBeLessThan(s.y + s.height);
  expect(s.y).toBeLessThan(c.y + c.height);
  expect(c.x + c.width).toBeLessThanOrEqual(s.x + 1);
});
