import { expect, test } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  createProject,
  drag,
  drawMarking,
  isMobile,
  selectedRect,
} from './helpers';

test('pan sobre a marcação selecionada não a move; segurar e arrastar move', async ({
  page,
}, info) => {
  // Gestos de toque (docs/history/PLAN-etapas-1-2.md 12.2): só fazem sentido no celular emulado.
  test.skip(!isMobile(info), 'gestos de toque: só no projeto "mobile"');
  await createProject(page, 'Gestos');
  await addImage(page);
  const center = await canvasPoint(page);
  await drawMarking(page, info, center);

  // Recém-desenhada, a marcação já vem selecionada.
  const before = await selectedRect(page);

  // Arrastar na hora (sem segurar) é pan do canvas: a marcação fica onde está.
  const panned = { x: center.x, y: center.y + 90 };
  await drag(page, info, center, panned);
  expect(await selectedRect(page)).toEqual(before);

  // O pan levou a marcação junto com a imagem: segura sobre ela (agora em
  // `panned`) por mais que o tempo de pressão e só então arrasta.
  await drag(page, info, panned, { x: panned.x + 50, y: panned.y }, { holdMs: 600 });
  const after = await selectedRect(page);
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBe(before.y);
  expect({ w: after.width, h: after.height }).toEqual({
    w: before.width,
    h: before.height,
  });
});
