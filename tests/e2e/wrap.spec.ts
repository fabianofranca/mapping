import { expect, test, type Page } from '@playwright/test';
import { createProject, drag, exportMapping, setMode, type Rect } from './helpers';

// Etapa Marcação pai: o botão Envolver do resumo da seleção múltipla cria uma marcação que
// envolve as selecionadas, com margem, e as torna filhas dela (uma entrada de desfazer).

/** Margem do conjunto até a marcação pai, em px do container (`WRAP_MARGIN`). */
const MARGIN = 8;
/** Margem do enquadramento em volta de tudo, em px de tela (`FIT_PADDING`). */
const FIT_PADDING = 24;

async function addContainer(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
}

async function closeExport(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('Envolver cria a marcação pai das duas selecionadas e desfazer volta tudo', async ({
  page,
}) => {
  await createProject(page, 'Envolver');
  const host = page.locator('.canvas-host');
  await addContainer(page, 'Tela');
  const fitsBefore = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Enquadrar tudo' }).click();
  await expect(host).toHaveAttribute('data-fits', String(fitsBefore + 1));

  // Onde o container está na tela (um só: ocupa o enquadramento, centrado).
  const first = (await exportMapping(page)).mapping.containers[0];
  const box = await host.boundingBox();
  if (!first || !box) throw new Error('sem container ou canvas');
  const width = first.width * first.placement.scale;
  const height = first.height * first.placement.scale;
  const scale = Math.min(
    (box.width - 2 * FIT_PADDING) / width,
    (box.height - 2 * FIT_PADDING) / height,
  );
  const screen: Rect = {
    x: box.x + box.width / 2 - (width * scale) / 2,
    y: box.y + box.height / 2 - (height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };

  // Duas marcações separadas, uma em cada lado do centro.
  const sizeW = screen.width * 0.2;
  const sizeH = screen.height * 0.2;
  const spots = [0.2, 0.6].map((fx) => ({
    x: screen.x + screen.width * fx,
    y: screen.y + screen.height * (fx === 0.2 ? 0.25 : 0.55),
  }));
  await setMode(page, 'Desenhar');
  for (const s of spots) {
    await drag(page, s, { x: s.x + sizeW, y: s.y + sizeH });
  }
  await setMode(page, 'Navegar');
  const centers = spots.map((s) => ({ x: s.x + sizeW / 2, y: s.y + sizeH / 2 }));

  const before = (await exportMapping(page)).mapping;
  expect(before.markings).toHaveLength(2);

  // O diálogo Exportar fica aberto depois de baixar: fecha para clicar no canvas.
  await closeExport(page);

  // Clique na primeira e Shift+clique na segunda.
  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await expect(page.getByText('1 de 2')).toBeVisible();
  await page.keyboard.down('Shift');
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0);
  await page.keyboard.up('Shift');

  await expect(page.getByText('2 itens selecionados').first()).toBeVisible();
  await page.getByRole('button', { name: 'Envolver', exact: true }).click();
  await expect(page.getByText('2 itens selecionados')).toHaveCount(0);
  if (process.env.WRAP_SHOT) await page.screenshot({ path: process.env.WRAP_SHOT });

  const { mapping } = await exportMapping(page);
  await closeExport(page);
  expect(mapping.markings).toHaveLength(3);
  const children = before.markings;
  const parent = mapping.markings.find((m) => !children.some((c) => c.id === m.id));
  if (!parent) throw new Error('sem a marcação nova');
  const kids = mapping.markings.filter((m) => m.id !== parent.id);
  expect(parent.containerId).toBe(first.id);
  expect(parent.parentId).toBeNull();
  for (const k of kids) {
    expect(k.containerId).toBe(first.id);
    expect(k.parentId).toBe(parent.id);
  }
  const x0 = Math.min(...kids.map((k) => k.rect.x));
  const y0 = Math.min(...kids.map((k) => k.rect.y));
  const x1 = Math.max(...kids.map((k) => k.rect.x + k.rect.width));
  const y1 = Math.max(...kids.map((k) => k.rect.y + k.rect.height));
  const left = Math.max(x0 - MARGIN, 0);
  const top = Math.max(y0 - MARGIN, 0);
  const right = Math.min(x1 + MARGIN, first.width);
  const bottom = Math.min(y1 + MARGIN, first.height);
  expect(parent.rect).toEqual({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });

  // Ctrl+Z: volta às duas marcações, sem pai.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const count = (await exportMapping(page)).mapping.markings.length;
      await closeExport(page);
      return count;
    })
    .toBe(2);
  const undone = (await exportMapping(page)).mapping;
  await closeExport(page);
  expect(undone.markings.every((m) => m.parentId === null)).toBe(true);
});
