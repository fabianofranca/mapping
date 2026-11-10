import { expect, test, type Page } from '@playwright/test';
import { addImage, createProject, drawMarking, canvasPoint } from './helpers';

// A vista mantém o centro e a escala quando o canvas muda de tamanho (#1337): abrir ou fechar
// a Árvore ou os Detalhes não muda o zoom nem o que está no meio do canvas.

const TREE = 'Control+Shift+Digit1';
const DETAILS = 'Control+Shift+Digit3';

async function reading(page: Page) {
  const host = page.locator('.canvas-host');
  const [x = 0, y = 0, scale = 1] = ((await host.getAttribute('data-viewport')) ?? '')
    .split(' ')
    .map(Number);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas sem tamanho');
  return {
    width: box.width,
    scale,
    cx: (box.width / 2 - x) / scale,
    cy: (box.height / 2 - y) / scale,
  };
}

test('abrir e fechar a Árvore e os Detalhes mantém a escala e o centro', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await createProject(page, 'Centro');
  await addImage(page);
  const spot = await canvasPoint(page, 0.3);
  await drawMarking(page, { x: spot.x - 40, y: spot.y }, { width: 60, height: 40 });
  const host = page.locator('.canvas-host');
  const tree = page.getByRole('region', { name: 'Árvore' });
  const details = page.locator('section[data-window="details"]');

  // Começa sem janelas, com o foco no canvas.
  const canvas = page.locator('main[data-canvas-area]');
  if (await tree.isVisible())
    await tree.getByRole('button', { name: /Fechar.*Árvore/ }).click();
  if (await details.isVisible())
    await details.getByRole('button', { name: /Fechar.*Detalhes/ }).click();
  await canvas.focus();
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  await expect(host).toHaveAttribute('data-viewport', /.+/);

  const start = await reading(page);
  expect(start.scale).toBeGreaterThan(0);

  const steps: Array<() => Promise<void>> = [
    async () => {
      await canvas.focus();
      await page.keyboard.press(TREE);
      await expect(tree).toBeVisible();
    },
    async () => {
      await canvas.focus();
      await page.keyboard.press(DETAILS);
      await expect(details).toBeVisible();
    },
    async () => {
      await tree.getByRole('button', { name: /Fechar.*Árvore/ }).click();
      await expect(tree).toBeHidden();
    },
    async () => {
      await details.getByRole('button', { name: /Fechar.*Detalhes/ }).click();
      await expect(details).toBeHidden();
    },
  ];
  const widths = new Set<number>([start.width]);
  for (const step of steps) {
    await step();
    // Espera o canvas assentar no tamanho novo antes de ler.
    await expect
      .poll(async () => {
        const a = await reading(page);
        await page.waitForTimeout(100);
        const b = await reading(page);
        return a.width === b.width && a.cx === b.cx && a.cy === b.cy;
      })
      .toBe(true);
    const now = await reading(page);
    widths.add(now.width);
    expect(now.scale).toBeCloseTo(start.scale, 6);
    expect(Math.abs(now.cx - start.cx)).toBeLessThan(1);
    expect(Math.abs(now.cy - start.cy)).toBeLessThan(1);
  }
  expect(widths.size).toBeGreaterThan(1);
});
