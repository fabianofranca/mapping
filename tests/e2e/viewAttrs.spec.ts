import { expect, test, type Locator } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  createProject,
  drawMarking,
  selectedRect,
  type Point,
} from './helpers';

// Etapa Vista do canvas (#842), PV1: o `.canvas-host` publica `data-viewport` ("x y escala" do
// stage) e `data-selection-box` ("esquerda topo largura altura" da seleção primária), em px CSS
// relativos ao canto do host. São só leitura para o testador achar uma marcação na tela.

const numbers = async (host: Locator, name: string): Promise<number[] | null> => {
  const value = await host.getAttribute(name);
  return value === null ? null : value.split(' ').map(Number);
};

const centerOfBox = async (host: Locator): Promise<Point> => {
  const [l, t, w, h] = (await numbers(host, 'data-selection-box')) ?? [];
  const origin = await host.boundingBox();
  if (!origin || l === undefined || t === undefined || !w || !h) {
    throw new Error('sem caixa da seleção');
  }
  return { x: origin.x + l + w / 2, y: origin.y + t + h / 2 };
};

test('a caixa da seleção cai sobre a marcação do container e acompanha o zoom', async ({
  page,
}) => {
  await createProject(page, 'Vista');
  await addImage(page);
  const host = page.locator('.canvas-host');
  const top = await canvasPoint(page, 1 / 3);
  const bottom = await canvasPoint(page, 2 / 3);
  await drawMarking(page, top);
  await drawMarking(page, bottom);

  // Sem seleção, não há caixa; com a marcação desenhada selecionada, o centro dela é o clique certo.
  const second = await centerOfBox(host);
  const secondRect = await selectedRect(page);

  await page.mouse.click(top.x, top.y);
  await expect.poll(() => selectedRect(page)).not.toEqual(secondRect);
  const first = await selectedRect(page);
  const [vx0, vy0, scale0] = (await numbers(host, 'data-viewport')) ?? [];
  expect(scale0).toBeGreaterThan(0);

  // Afastar com a roda: a vista muda e a caixa continua sobre a marcação.
  await page.mouse.move(top.x, top.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect
    .poll(async () => (await numbers(host, 'data-viewport'))?.[2])
    .not.toBe(scale0);
  const [vx1, vy1, scale1] = (await numbers(host, 'data-viewport')) ?? [];
  expect(vx1).not.toBe(vx0);
  expect(vy1).not.toBe(vy0);

  // A caixa da primeira bate com a conversão pela vista nova (esperando o quadro).
  const origin = await host.boundingBox();
  if (!origin || scale0 === undefined || scale1 === undefined)
    throw new Error('sem vista');
  const centerBefore = { x: second.x - origin.x, y: second.y - origin.y };
  const moved = {
    x: origin.x + ((centerBefore.x - vx0!) / scale0) * scale1 + vx1!,
    y: origin.y + ((centerBefore.y - vy0!) / scale0) * scale1 + vy1!,
  };
  // Clicar onde a vista diz que a segunda marcação está seleciona a segunda.
  await page.mouse.click(moved.x, moved.y);
  await expect.poll(() => selectedRect(page)).toEqual(secondRect);
  expect(first).not.toEqual(secondRect);
  const box = await centerOfBox(host);
  expect(Math.abs(box.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(box.y - moved.y)).toBeLessThan(2);

  // Seleciona a primeira (pela vista) e volta ao centro da caixa da segunda, lida antes.
  await page.mouse.click(top.x, top.y);
  await expect.poll(() => selectedRect(page)).toEqual(first);
  await page.mouse.click(box.x, box.y);
  await expect.poll(() => selectedRect(page)).toEqual(secondRect);

  // Esc limpa a seleção: a caixa some.
  await page.keyboard.press('Escape');
  await expect(host).not.toHaveAttribute('data-selection-box', /.+/);
});
