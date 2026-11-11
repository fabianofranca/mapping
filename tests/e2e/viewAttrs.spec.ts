import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  createProject,
  drag,
  drawMarking,
  selectedRect,
  setMode,
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

// Etapa #1076, VC1: `data-selection`, `data-arrow-handles` e `data-container-boxes`.

/** Cria um container "Personalizado" com o nome dado e espera o canvas desenhá-lo. */
async function addContainer(page: Page, host: Locator, name: string): Promise<void> {
  const before = Number((await host.getAttribute('data-images')) ?? 0);
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', String(before + 1));
}

test('o center do data-arrow-handles seleciona a seta e o data-selection a nomeia', async ({
  page,
}) => {
  await createProject(page, 'Alças');
  const host = page.locator('.canvas-host');
  for (const name of ['Tela A', 'Tela B']) await addContainer(page, host, name);
  const before = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Enquadrar tudo' }).click();
  await expect(host).toHaveAttribute('data-fits', String(before + 1));

  // Uma marcação no meio de cada tela, lida pelo data-container-boxes + data-viewport.
  const boxes = parseBoxes((await host.getAttribute('data-container-boxes')) ?? '');
  expect(boxes).toHaveLength(2);
  const origin = await host.boundingBox();
  const vp = await numbers(host, 'data-viewport');
  if (!origin || !vp) throw new Error('sem vista');
  const [vx, vy, scale] = vp as [number, number, number];
  const centers: Point[] = [];
  await setMode(page, 'Desenhar');
  for (const b of boxes) {
    const x0 = origin.x + (b.x + b.width * 0.3) * scale + vx;
    const y0 = origin.y + (b.y + b.height * 0.3) * scale + vy;
    const w = b.width * 0.25 * scale;
    const h = b.height * 0.2 * scale;
    await drag(page, { x: x0, y: y0 }, { x: x0 + w, y: y0 + h });
    centers.push({ x: x0 + w / 2, y: y0 + h / 2 });
  }
  await setMode(page, 'Navegar');

  await page.mouse.click(centers[0]!.x, centers[0]!.y);
  await page.getByRole('button', { name: 'Ligar a…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Ligar .* a…$/ });
  await picker.getByRole('option').first().click();
  await expect(host).toHaveAttribute('data-arrows', '1');

  // A seta recém-criada está selecionada: o data-selection a nomeia.
  await expect(host).toHaveAttribute('data-selection', /^arrow .+/);
  const selection = await host.getAttribute('data-selection');
  expect(await host.getAttribute('data-selection-box')).toBeNull();

  // Esc limpa a seleção; o clique no center (lido antes, com o host somado) seleciona a mesma
  // seta. O primeiro Esc pode fechar a janela dos Detalhes e mudar o host: relê a cada tentativa.
  let target: Point | null = null;
  await expect(async () => {
    const entry = ((await host.getAttribute('data-arrow-handles')) ?? '').split(';')[0];
    const rect = await host.boundingBox();
    if (rect && entry?.startsWith('center ')) {
      const [, cx, cy] = entry.split(' ');
      target = { x: rect.x + Number(cx), y: rect.y + Number(cy) };
    }
    await page.keyboard.press('Escape');
    await expect(host).not.toHaveAttribute('data-selection', /.+/, { timeout: 500 });
  }).toPass();
  await expect(host).not.toHaveAttribute('data-arrow-handles', /.+/);
  if (!target) throw new Error('sem center');
  const { x, y } = target as Point;
  await page.mouse.click(x, y);
  await expect(host).toHaveAttribute('data-selection', selection!);
});

test('a caixa do container no data-container-boxes bate com o data-selection-box', async ({
  page,
}) => {
  await createProject(page, 'Caixas');
  await addImage(page);
  const host = page.locator('.canvas-host');
  // Seleciona o container clicando num ponto vazio da imagem (sem marcações).
  const point = await canvasPoint(page, 1 / 2);
  await page.mouse.click(point.x, point.y);
  await expect(host).toHaveAttribute('data-selection', /^image .+/);
  const id = (await host.getAttribute('data-selection'))!.split(' ')[1];
  const box = parseBoxes((await host.getAttribute('data-container-boxes')) ?? '').find(
    (b) => b.id === id,
  );
  const vp = await numbers(host, 'data-viewport');
  const sel = await numbers(host, 'data-selection-box');
  if (!box || !vp || !sel) throw new Error('sem dados');
  const [vx, vy, scale] = vp as [number, number, number];
  expect(Math.abs(box.x * scale + vx - sel[0]!)).toBeLessThan(1);
  expect(Math.abs(box.y * scale + vy - sel[1]!)).toBeLessThan(1);
  expect(Math.abs(box.width * scale - sel[2]!)).toBeLessThan(1);
  expect(Math.abs(box.height * scale - sel[3]!)).toBeLessThan(1);
});

interface ContainerBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

function parseBoxes(text: string): ContainerBox[] {
  return text
    .split(';')
    .filter(Boolean)
    .map((entry) => {
      const [id, x, y, width, height, scale] = entry.split(' ');
      return {
        id: id!,
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
        scale: Number(scale),
      };
    });
}
