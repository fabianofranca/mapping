import { expect, test, type Page } from '@playwright/test';
import { createProject, drag, exportMapping, setMode, type Rect } from './helpers';

// Seleção múltipla (SM1): Ctrl/Cmd+clique junta itens e as setas movem a seleção, com uma
// entrada de desfazer por toque.

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

test('Ctrl/Cmd+clique junta dois itens e a seta move a seleção em uma entrada de desfazer', async ({
  page,
}) => {
  await createProject(page, 'Setas');
  const host = page.locator('.canvas-host');
  await addContainer(page, 'Tela');
  const fitsBefore = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Enquadrar tudo' }).click();
  await expect(host).toHaveAttribute('data-fits', String(fitsBefore + 1));

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
  const before = (await exportMapping(page)).mapping.markings;
  expect(before).toHaveLength(2);
  await closeExport(page);

  await page.mouse.click(centers[0]?.x ?? 0, centers[0]?.y ?? 0);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(centers[1]?.x ?? 0, centers[1]?.y ?? 0);
  await page.keyboard.up('ControlOrMeta');
  await expect(page.getByText('2 itens selecionados').first()).toBeVisible();

  await page.keyboard.press('ArrowRight');
  const moved = (await exportMapping(page)).mapping.markings;
  await closeExport(page);
  for (const m of before) {
    expect(moved.find((n) => n.id === m.id)?.rect.x).toBe(m.rect.x + 1);
  }

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const rects = (await exportMapping(page)).mapping.markings.map((m) => m.rect);
      await closeExport(page);
      return rects;
    })
    .toEqual(before.map((m) => m.rect));
});
