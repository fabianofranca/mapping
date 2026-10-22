import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  drag,
  exportMapping,
  setMode,
  type MappingJson,
  type Point,
  type Rect,
} from './helpers';

// Etapa Marcações espaciais, ME4: a seta (uma marcação que aponta) no canvas. O canvas publica no
// container (`.canvas-host`) `data-arrows`, a contagem de setas que já desenhou. A seta nasce de
// puxar a alça de ligação da marcação selecionada até outra marcação; o botão direito no traço
// abre o menu com o estilo (Reta, Curva, Canto) e Excluir.

/** O `arrows` do `mapping.json` (o helper compartilhado ainda não o tipa). */
interface ArrowJson {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly style: string;
  readonly points: readonly Point[];
  readonly locked: boolean;
}
type MappingWithArrows = MappingJson & { readonly arrows: readonly ArrowJson[] };

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

async function arrowsOf(page: Page): Promise<readonly ArrowJson[]> {
  const { mapping } = await exportMapping(page);
  return (mapping as MappingWithArrows).arrows;
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

test('puxar a alça de ligação de uma marcação até outra cria uma seta curva e a seleciona', async ({
  page,
}) => {
  await createProject(page, 'Setas');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);
  await expect(host).toHaveAttribute('data-arrows', '0');

  // Seleciona a primeira marcação: a alça de ligação aparece fora da borda direita.
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  const handle = {
    x: first.x + first.width + LINK_HANDLE_OFFSET,
    y: first.y + first.height / 2,
  };
  await drag(page, handle, centerOf(second));
  await expect(host).toHaveAttribute('data-arrows', '1');

  const { mapping } = await exportMapping(page);
  const arrows = (mapping as MappingWithArrows).arrows;
  expect(arrows).toHaveLength(1);
  expect(mapping.markings).toHaveLength(2);
  const [a, b] = mapping.markings;
  expect(arrows[0]).toMatchObject({ from: a?.id, to: b?.id, style: 'curve', points: [] });
  // Criar a seta não mexe nas marcações.
  expect(a?.rect.width).toBeGreaterThan(0);
});

test('soltar a alça de ligação fora de uma marcação cancela', async ({ page }) => {
  await createProject(page, 'Setas');
  const host = page.locator('.canvas-host');
  const [first] = await twoMarkedScreens(page, host);
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas sem tamanho');
  await drag(
    page,
    { x: first.x + first.width + LINK_HANDLE_OFFSET, y: first.y + first.height / 2 },
    { x: box.x + 6, y: box.y + box.height - 6 },
  );
  await expect(host).toHaveAttribute('data-arrows', '0');
  expect(await arrowsOf(page)).toHaveLength(0);
});

test('o menu do traço troca o estilo (reta, curva, canto), uma entrada cada, e exclui', async ({
  page,
}) => {
  await createProject(page, 'Setas');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await drag(
    page,
    { x: first.x + first.width + LINK_HANDLE_OFFSET, y: first.y + first.height / 2 },
    centerOf(second),
  );
  await expect(host).toHaveAttribute('data-arrows', '1');

  // As duas marcações têm o mesmo tamanho: o meio do traço é o meio entre os centros.
  const middle = {
    x: (centerOf(first).x + centerOf(second).x) / 2,
    y: (centerOf(first).y + centerOf(second).y) / 2,
  };
  const menu = page.getByRole('menu', { name: 'Menu do item no canvas' });
  for (const [label, style] of [
    ['Canto', 'elbow'],
    ['Reta', 'straight'],
    ['Curva', 'curve'],
  ] as const) {
    await page.mouse.click(middle.x, middle.y, { button: 'right' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', { name: label }).click();
    await expect(menu).toBeHidden();
    expect((await arrowsOf(page))[0]?.style).toBe(style);
  }

  // O estilo atual vem marcado no menu.
  await page.mouse.click(middle.x, middle.y, { button: 'right' });
  await expect(menu.getByRole('menuitemradio', { name: 'Curva' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await menu.getByRole('menuitem', { name: 'Excluir seta' }).click();
  await expect(host).toHaveAttribute('data-arrows', '0');
  expect(await arrowsOf(page)).toHaveLength(0);
});

test('arrastar o meio do traço cria um ponto de passagem', async ({ page }) => {
  await createProject(page, 'Setas');
  const host = page.locator('.canvas-host');
  const [first, second] = await twoMarkedScreens(page, host);
  await page.mouse.click(centerOf(first).x, centerOf(first).y);
  await drag(
    page,
    { x: first.x + first.width + LINK_HANDLE_OFFSET, y: first.y + first.height / 2 },
    centerOf(second),
  );
  await expect(host).toHaveAttribute('data-arrows', '1');

  // A seta recém-criada está selecionada: a alça do meio do trecho fica sobre o traço.
  const middle = {
    x: (centerOf(first).x + centerOf(second).x) / 2,
    y: (centerOf(first).y + centerOf(second).y) / 2,
  };
  await drag(page, middle, { x: middle.x, y: middle.y - 80 });
  await expect.poll(async () => (await arrowsOf(page))[0]?.points.length).toBe(1);
});
