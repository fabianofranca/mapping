import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  drag,
  exportMapping,
  setMode,
  type Point,
  type Rect,
} from './helpers';

// Etapa Visualização, VZ3: o modo visualização e o painel "Mostrar no canvas". O canvas publica
// no container (`.canvas-host`) `data-arrows` e `data-components`, o que já desenhou.

/** Distância (px de tela) da alça de ligação até a borda direita da marcação (`LINK_HANDLE_OFFSET`). */
const LINK_HANDLE_OFFSET = 14;
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

/** Onde cada container está na tela, logo depois de Enquadrar tudo (as posições vêm do `mapping.json`). */
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

/**
 * Duas telas com uma marcação cada, do mesmo tamanho e no mesmo ponto relativo de cada tela:
 * devolve o retângulo (px de tela) das duas marcações, na ordem das telas.
 */
async function twoMarkedScreens(page: Page, host: Locator): Promise<[Rect, Rect]> {
  for (const name of ['Tela A', 'Tela B']) await addContainer(page, host, name);
  await fitAll(page, host);
  const rects = [...(await containerRects(page, host)).values()];
  const marks: Rect[] = [];
  for (const screen of rects) {
    const mark = {
      x: screen.x + screen.width * 0.3,
      y: screen.y + screen.height * 0.3,
      width: screen.width * 0.25,
      height: screen.height * 0.2,
    };
    await setMode(page, 'Desenhar');
    await drag(
      page,
      { x: mark.x, y: mark.y },
      { x: mark.x + mark.width, y: mark.y + mark.height },
    );
    await setMode(page, 'Navegar');
    marks.push(mark);
  }
  const [first, second] = marks;
  if (!first || !second) throw new Error('sem marcações');
  return [first, second];
}

const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const panel = (page: Page) => page.getByRole('dialog', { name: 'Mostrar no canvas' });
const box = (page: Page, name: string) =>
  panel(page).getByRole('checkbox', { name, exact: false });

test('entrar, desmarcar Contorno e uma camada com desenho, Só as telas, Esc, e a escolha volta ao reabrir', async ({
  page,
}) => {
  await createProject(page, 'Visualizar');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);

  // Uma seta entre as duas marcações e uma Nota (camada com desenho).
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await drag(
    page,
    {
      x: first.x + first.width + LINK_HANDLE_OFFSET,
      y: first.y + first.height / 2,
    },
    centerOf(second),
  );
  await expect(host).toHaveAttribute('data-arrows', '1');
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Paleta' }).click();
  await page
    .getByRole('button', { name: 'Adicionar no canvas: Nota', exact: true })
    .click();
  await expect(host).toHaveAttribute('data-components', '1');

  // Entrar: o botão fica pressionado, Desenhar desabilita e o painel abre com o foco dentro.
  const view = page.getByRole('button', { name: 'Visualizar', exact: true });
  await view.click();
  await expect(view).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Desenhar' })).toBeDisabled();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByText(/^Modo visualização: só para ver/)).toBeVisible();
  await expect(box(page, 'Contorno das marcações')).not.toBeChecked();

  // Contorno desmarcado: as setas continuam à vista.
  await box(page, 'Contorno das marcações').check();
  await box(page, 'Contorno das marcações').uncheck();
  await expect(host).toHaveAttribute('data-arrows', '1');

  // Camada com desenho desmarcada: o desenho some.
  await box(page, 'Notas').uncheck();
  await expect(host).toHaveAttribute('data-components', '0');

  // Só as telas: sem setas; Mostrar tudo as devolve.
  await panel(page).getByRole('button', { name: 'Só as telas' }).click();
  await expect(host).toHaveAttribute('data-arrows', '0');
  await panel(page).getByRole('button', { name: 'Mostrar tudo' }).click();
  await expect(host).toHaveAttribute('data-arrows', '1');
  await expect(host).toHaveAttribute('data-components', '1');
  await panel(page).getByRole('button', { name: 'Só as telas' }).click();
  await box(page, 'Notas').uncheck();

  // Esc fecha o painel primeiro; o segundo sai do modo.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(view).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(view).toHaveAttribute('aria-pressed', 'false');

  // Nada foi gravado pelo modo; a escolha volta ao reabrir o projeto.
  const { mapping } = await exportMapping(page);
  expect(mapping.markings.length).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /: ações do projeto$/ }).click();
  await page.getByRole('menuitem', { name: 'Fechar projeto', exact: true }).click();
  await page.locator('[data-recent-open]').first().click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.getByRole('button', { name: 'Visualizar', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(box(page, 'Setas')).not.toBeChecked();
  await expect(box(page, 'Notas')).not.toBeChecked();
});
