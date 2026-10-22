import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  drag,
  exportMapping,
  selectedRect,
  setMode,
  type Rect,
} from './helpers';

// Etapa Marcações espaciais, ME1: marcação do canvas e pertencimento por geometria. O canvas
// publica no container (`.canvas-host`) as contagens do que já desenhou: `data-canvas-markings`
// é a das marcações do canvas.

/** Margem, em px de tela, que o enquadramento deixa em volta de tudo (`FIT_PADDING`). */
const FIT_PADDING = 24;

/** Novo container (Personalizado) com o nome dado, pelo diálogo. */
async function addContainer(page: Page, host: Locator, name: string): Promise<void> {
  const before = Number((await host.getAttribute('data-images')) ?? 0);
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', String(before + 1));
}

/** Enquadrar tudo, esperando o canvas desenhar o enquadramento novo. */
async function fitAll(page: Page, host: Locator): Promise<void> {
  const before = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Enquadrar tudo' }).click();
  await expect(host).toHaveAttribute('data-fits', String(before + 1));
}

/**
 * Onde cada container está na tela, logo depois de Enquadrar tudo: as posições vêm do
 * `mapping.json` exportado e o enquadramento é o do canvas (`fitRect`: tudo centrado, com a
 * margem de `FIT_PADDING`).
 */
async function containerRects(page: Page, host: Locator): Promise<Map<string, Rect>> {
  const { mapping } = await exportMapping(page);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas sem tamanho');
  const canvas = mapping.containers.map((c) => ({
    id: c.id,
    x: c.placement.x,
    y: c.placement.y,
    width: c.width * c.placement.scale,
    height: c.height * c.placement.scale,
  }));
  const x0 = Math.min(...canvas.map((c) => c.x));
  const y0 = Math.min(...canvas.map((c) => c.y));
  const x1 = Math.max(...canvas.map((c) => c.x + c.width));
  const y1 = Math.max(...canvas.map((c) => c.y + c.height));
  const scale = Math.min(
    (box.width - 2 * FIT_PADDING) / (x1 - x0),
    (box.height - 2 * FIT_PADDING) / (y1 - y0),
  );
  const offsetX = box.x + box.width / 2 - ((x0 + x1) / 2) * scale;
  const offsetY = box.y + box.height / 2 - ((y0 + y1) / 2) * scale;
  return new Map(
    canvas.map((c) => [
      c.id,
      {
        x: offsetX + c.x * scale,
        y: offsetY + c.y * scale,
        width: c.width * scale,
        height: c.height * scale,
      },
    ]),
  );
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/**
 * Botão Desfazer/Refazer da barra: um clique é um passo do histórico, como o atalho, sem depender
 * de onde o foco ficou depois de exportar o zip.
 */
function historyButton(page: Page, name: 'Desfazer' | 'Refazer') {
  return page.getByRole('button', { name: new RegExp(`^${name}`) }).first();
}

test('desenhar no vazio em volta de dois containers cria uma marcação do canvas; desfazer volta tudo em uma vez', async ({
  page,
}) => {
  await createProject(page, 'Canvas');
  const host = page.locator('.canvas-host');
  // Três telas lado a lado (variações dark, light e custom de uma mesma tela).
  for (const name of ['Claro', 'Escuro', 'Custom']) await addContainer(page, host, name);
  await fitAll(page, host);
  await expect(host).toHaveAttribute('data-canvas-markings', '0');

  // Dois containers cuja caixa não toca o terceiro.
  const rects = await containerRects(page, host);
  const ids = [...rects.keys()];
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));
  const pair = pairs.find(([a, b]) => {
    const third = ids.find((id) => id !== a && id !== b);
    const box = union(rects.get(a) as Rect, rects.get(b) as Rect);
    return third !== undefined && !overlaps(box, rects.get(third) as Rect);
  });
  if (!pair) throw new Error('nenhum par de containers isolado do terceiro');
  const box = union(rects.get(pair[0]) as Rect, rects.get(pair[1]) as Rect);
  const third = rects.get(ids.find((id) => id !== pair[0] && id !== pair[1]) as string);

  // No vazio: começa fora de todos os containers e termina além do par, sem encostar no terceiro
  // (uma margem de até 8 px, no máximo metade do vão até ele).
  const gap = third
    ? Math.max(
        third.x - (box.x + box.width),
        box.x - (third.x + third.width),
        third.y - (box.y + box.height),
        box.y - (third.y + third.height),
      )
    : 16;
  const margin = Math.min(8, Math.floor(gap / 2));
  expect(margin).toBeGreaterThanOrEqual(2);
  await setMode(page, 'Desenhar');
  await drag(
    page,
    { x: box.x - margin, y: box.y - margin },
    { x: box.x + box.width + margin, y: box.y + box.height + margin },
  );
  await setMode(page, 'Navegar');
  await expect(host).toHaveAttribute('data-canvas-markings', '1');

  // No disco: a marcação é do canvas e os dois containers têm `parentId` dela; o terceiro, não.
  const { mapping } = await exportMapping(page);
  expect(mapping.markings).toHaveLength(1);
  const canvasMarking = mapping.markings[0];
  if (!canvasMarking) throw new Error('sem marcação do canvas');
  expect(canvasMarking).toMatchObject({
    containerId: null,
    parentId: null,
    floating: false,
  });
  expect(Object.fromEntries(mapping.containers.map((c) => [c.id, c.parentId]))).toEqual(
    Object.fromEntries(
      ids.map((id) => [id, id === pair[0] || id === pair[1] ? canvasMarking.id : null]),
    ),
  );

  // Ctrl+Z desfaz tudo de uma vez: a marcação e o pertencimento.
  await historyButton(page, 'Desfazer').click();
  await expect(host).toHaveAttribute('data-canvas-markings', '0');
  const undone = (await exportMapping(page)).mapping;
  expect(undone.markings).toHaveLength(0);
  expect(undone.containers.every((c) => c.parentId === null)).toBe(true);

  // E refazer traz as duas coisas de volta.
  await historyButton(page, 'Refazer').click();
  await expect(host).toHaveAttribute('data-canvas-markings', '1');
  const redone = (await exportMapping(page)).mapping;
  expect(redone.containers.filter((c) => c.parentId === canvasMarking.id)).toHaveLength(
    2,
  );
});

test('arrastar uma marcação de uma tela para a outra a torna marcação da outra, com o mesmo rect', async ({
  page,
}) => {
  await createProject(page, 'Storyboard');
  const host = page.locator('.canvas-host');
  for (const name of ['Quadro 1', 'Quadro 2']) await addContainer(page, host, name);
  await fitAll(page, host);
  const rects = await containerRects(page, host);
  const [first, second] = [...rects.keys()];
  if (first === undefined || second === undefined) throw new Error('sem containers');
  const from = rects.get(first) as Rect;
  const to = rects.get(second) as Rect;

  // Desenha uma marcação dentro do primeiro quadro (a bola do storyboard).
  const ball = {
    x: from.x + from.width * 0.3,
    y: from.y + from.height * 0.3,
    width: from.width * 0.25,
    height: from.width * 0.25,
  };
  await setMode(page, 'Desenhar');
  await drag(
    page,
    { x: ball.x, y: ball.y },
    { x: ball.x + ball.width, y: ball.y + ball.height },
  );
  await setMode(page, 'Navegar');
  const rect = await selectedRect(page);
  await expect(host).toHaveAttribute('data-canvas-markings', '0');

  // Leva a marcação para o mesmo ponto do segundo quadro (os dois têm a mesma resolução).
  const start = { x: ball.x + ball.width / 2, y: ball.y + ball.height / 2 };
  await drag(page, start, {
    x: start.x + (to.x - from.x),
    y: start.y + (to.y - from.y),
  });

  const { mapping } = await exportMapping(page);
  expect(mapping.markings).toHaveLength(1);
  const moved = mapping.markings[0];
  expect(moved?.containerId).toBe(second);
  // Mesma resolução: os mesmos pixels (com um pixel de folga pelo arredondamento do gesto).
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs((moved?.rect[key] ?? Number.NaN) - rect[key])).toBeLessThanOrEqual(2);
  }
  expect(mapping.containers.every((c) => c.parentId === null)).toBe(true);

  // Um Ctrl+Z devolve a marcação ao primeiro quadro.
  await historyButton(page, 'Desfazer').click();
  const undone = (await exportMapping(page)).mapping;
  expect(undone.markings[0]?.containerId).toBe(first);
});
