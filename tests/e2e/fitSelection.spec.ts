import { expect, test } from '@playwright/test';
import { addImage, canvasPoint, createProject, drawMarking } from './helpers';

const viewportOf = async (page: import('@playwright/test').Page) =>
  page.locator('.canvas-host').getAttribute('data-viewport');

/** A vista depois de parar de mudar (o enquadramento anima): três leituras iguais seguidas. */
async function settledViewport(
  page: import('@playwright/test').Page,
): Promise<string | null> {
  let last: string | null = null;
  let same = 0;
  await expect
    .poll(
      async () => {
        const now = await viewportOf(page);
        same = now === last ? same + 1 : 0;
        last = now;
        return same;
      },
      { intervals: [100], timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(3);
  return last;
}

// Enquadrar seleção (EQ2): o botão e o `Shift+2` dão zoom e centram a vista nos itens
// selecionados; sem seleção não fazem nada e, com o foco num campo, o atalho é do campo.

const numbers = (text: string | null): number[] => (text ?? '').split(' ').map(Number);

test('Enquadrar seleção: botão, atalho, sem seleção e com o foco num campo', async ({
  page,
}) => {
  await createProject(page, 'Enquadrar');
  await addImage(page);
  const host = page.locator('.canvas-host');
  const fit = page.getByRole('button', { name: 'Fit selection' });

  // Sem seleção (a imagem recém-adicionada vem selecionada): botão desabilitado e atalho sem efeito.
  await page.keyboard.press('Escape');
  await expect(fit).toBeDisabled();
  const viewport = async () => host.getAttribute('data-viewport');
  const initial = await viewport();
  await page.keyboard.press('Shift+2');
  expect(await viewport()).toBe(initial);

  // Uma marcação pequena fora do centro, depois selecionada.
  const spot = await canvasPoint(page, 0.2);
  await drawMarking(page, { x: spot.x - 40, y: spot.y }, { width: 60, height: 40 });
  await page.mouse.click(spot.x - 40, spot.y);
  await expect(fit).toBeEnabled();
  const before = numbers(await viewport());

  await fit.click();
  await expect
    .poll(async () => numbers(await viewport())[2])
    .toBeGreaterThan(before[2] ?? 0);
  const centered = async () => {
    const [x = 0, y = 0, w = 0, h = 0] = numbers(
      await host.getAttribute('data-selection-box'),
    );
    const box = await host.boundingBox();
    if (!box) throw new Error('canvas sem tamanho');
    return {
      dx: x + w / 2 - box.width / 2,
      dy: y + h / 2 - box.height / 2,
      fits: x >= 0 && y >= 0 && x + w <= box.width && y + h <= box.height,
    };
  };
  const afterButton = await centered();
  expect(Math.abs(afterButton.dx)).toBeLessThan(1);
  expect(Math.abs(afterButton.dy)).toBeLessThan(1);
  expect(afterButton.fits).toBe(true);

  // O atalho: depois de afastar a vista, Shift+2 volta a enquadrar.
  const fitted = numbers(await viewport())[2] ?? 0;
  await page.keyboard.press('Control+-');
  await page.keyboard.press('Control+-');
  await expect.poll(async () => numbers(await viewport())[2]).toBeLessThan(fitted);
  const zoomedOut = numbers(await viewport())[2] ?? 0;
  await page.keyboard.press('Shift+2');
  await expect.poll(async () => numbers(await viewport())[2]).toBeGreaterThan(zoomedOut);
  const afterKey = await centered();
  expect(Math.abs(afterKey.dx)).toBeLessThan(1);
  expect(Math.abs(afterKey.dy)).toBeLessThan(1);

  // Com o foco num campo dos Detalhes, o Shift+2 é do campo e a vista não muda.
  await page.keyboard.press('Control+-');
  await expect.poll(async () => numbers(await viewport())[2]).toBeLessThan(fitted);
  const field = page.getByLabel('Name', { exact: true }).first();
  await field.focus();
  const typing = await viewport();
  await page.keyboard.press('Shift+2');
  expect(await viewport()).toBe(typing);
  await expect(field).toHaveValue(/[@"2]/);
});

// #1204: o Shift+1 logo depois do Adicionar da Paleta enquadra (o foco está no botão); com o
// foco no campo X da Posição nos Detalhes, o atalho é do campo (decisão 13 da #841).
test('Shift+1 depois do Adicionar da Paleta enquadra; no campo da Posição é do campo', async ({
  page,
}) => {
  await createProject(page, 'Palette');
  const host = page.locator('.canvas-host');
  await page.getByRole('button', { name: 'New container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Home');
  await dialog.getByRole('button', { name: 'Create container' }).click();
  await expect(dialog).toBeHidden();

  await page.keyboard.press('Control+Shift+Digit9');
  await page.getByRole('tab', { name: 'Palette' }).click();
  const add = page.getByRole('button', {
    name: 'Adicionar no canvas: Nota',
    exact: true,
  });
  await add.click();
  await expect(host).toHaveAttribute('data-components', '1');
  await expect(add).toBeFocused();

  // Afasta a vista; com o foco no botão da Paleta, o atalho enquadra...
  const canvas = page.locator('main[data-canvas-area]');
  const fitAll = page.getByRole('button', { name: 'Fit all' });
  await canvas.focus();
  await page.keyboard.press('Control+-');
  await page.keyboard.press('Control+-');
  const zoomedOut = await settledViewport(page);
  await add.focus();
  await page.keyboard.press('Shift+1');
  await expect.poll(() => viewportOf(page)).not.toBe(zoomedOut);
  const byKey = await settledViewport(page);

  // ...para o mesmo valor do botão Enquadrar tudo.
  await canvas.focus();
  await page.keyboard.press('Control+-');
  await page.keyboard.press('Control+-');
  await expect.poll(() => viewportOf(page)).not.toBe(byKey);
  await settledViewport(page);
  await fitAll.click();
  await expect.poll(() => viewportOf(page)).toBe(byKey);

  // Com o foco no campo X da Posição, o Shift+1 digita no campo e a vista fica igual.
  await page.keyboard.press('Control+Shift+Digit3');
  const x = page
    .locator('section[data-window="details"]')
    .getByLabel('X', { exact: true });
  await x.first().focus();
  const typing = await viewportOf(page);
  await page.keyboard.press('Shift+1');
  expect(await viewportOf(page)).toBe(typing);
  await expect(x.first()).toHaveValue(/[!1]/);
});
