import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createProject,
  exportMapping,
  drag,
  setMode,
  type MappingJson,
  type Point,
  type Rect,
} from './helpers';

// Etapa Perspectivas, PE3: o fluxo da interface. Seletor da barra principal, diálogos
// (Nova, Gerenciar, Apagar), menu do botão direito, aviso "Veio de…" nos Detalhes.
// A 900×720 (janela mínima), sem barra horizontal em nenhuma dessas telas.

interface PerspectiveJson {
  readonly id: string;
  readonly name: string;
  readonly items: readonly {
    readonly root: string;
    readonly x: number;
    readonly y: number;
  }[];
}
interface ArrivalJson {
  readonly root: string;
  readonly fromName: string;
}
type MappingWithPerspectives = MappingJson & {
  readonly arrows: readonly unknown[];
  readonly perspectives: readonly PerspectiveJson[];
  readonly arrivals: readonly ArrivalJson[];
};

/** Margem, em px de tela, que o enquadramento deixa em volta de tudo (`FIT_PADDING`). */
const FIT_PADDING = 24;
/** Folga a mais com marca de chegada (`ARRIVAL_FIT_EXTRA`). */
const ARRIVAL_FIT_EXTRA = 48;

test.use({ viewport: { width: 900, height: 720 } });

/** O `mapping.json` exportado, com as perspectivas; fecha o diálogo, que senão cobre o canvas. */
async function readMapping(page: Page): Promise<MappingWithPerspectives> {
  const { mapping } = await exportMapping(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  return mapping as MappingWithPerspectives;
}

async function noHorizontalScroll(page: Page, within?: Locator): Promise<void> {
  const page_ = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(page_.scroll).toBeLessThanOrEqual(page_.inner);
  if (within) {
    const box = await within.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(box.scroll).toBeLessThanOrEqual(box.client);
  }
}

async function addContainer(page: Page, host: Locator, name: string): Promise<void> {
  const before = Number((await host.getAttribute('data-images')) ?? 0);
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', String(before + 1));
}

async function fitAll(page: Page, host: Locator): Promise<void> {
  const before = Number((await host.getAttribute('data-fits')) ?? 0);
  await page.getByRole('button', { name: 'Enquadrar tudo' }).click();
  await expect(host).toHaveAttribute('data-fits', String(before + 1));
}

/** Onde cada caixa está na tela depois de Enquadrar tudo (`boxes` em unidades do canvas). */
async function toScreen(
  host: Locator,
  boxes: readonly (Rect & { readonly id: string })[],
  padding = FIT_PADDING,
): Promise<Map<string, Rect>> {
  const box = await host.boundingBox();
  if (!box) throw new Error('canvas sem tamanho');
  const x0 = Math.min(...boxes.map((c) => c.x));
  const y0 = Math.min(...boxes.map((c) => c.y));
  const x1 = Math.max(...boxes.map((c) => c.x + c.width));
  const y1 = Math.max(...boxes.map((c) => c.y + c.height));
  const scale = Math.min(
    (box.width - 2 * padding) / (x1 - x0),
    (box.height - 2 * padding) / (y1 - y0),
  );
  const offsetX = box.x + box.width / 2 - ((x0 + x1) / 2) * scale;
  const offsetY = box.y + box.height / 2 - ((y0 + y1) / 2) * scale;
  return new Map(
    boxes.map((c) => [
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

const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** O botão do seletor da barra principal (o nome acessível traz a perspectiva aberta). */
const trigger = (page: Page, name: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^Perspectiva: ${name},`) });

async function openPerspective(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /^Perspectiva: / }).click();
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
  await expect(trigger(page, name)).toBeVisible();
}

test('perspectivas: criar, enviar, mover dentro dela, chegada na Principal, apagar e desfazer', async ({
  page,
}) => {
  await createProject(page, 'Perspectivas');
  const host = page.locator('.canvas-host');
  // Os Detalhes abertos desde o início: abrir depois mudaria o tamanho do canvas.
  await page.getByRole('button', { name: 'Detalhes', exact: true }).click();
  for (const name of ['Tela A', 'Tela B', 'Tela C']) await addContainer(page, host, name);
  await fitAll(page, host);

  // Uma marcação em A e outra em B, ligadas por uma seta (Detalhes → Ligar a…).
  const first = await readMapping(page);
  const canvasBoxes = first.containers.map((c) => ({
    id: c.id,
    x: c.placement.x,
    y: c.placement.y,
    width: c.width * c.placement.scale,
    height: c.height * c.placement.scale,
  }));
  const screens = await toScreen(host, canvasBoxes);
  const [idA, idB, idC] = first.containers.map((c) => c.id);
  if (!idA || !idB || !idC) throw new Error('faltam containers');
  for (const id of [idA, idB]) {
    const s = screens.get(id)!;
    await setMode(page, 'Desenhar');
    await drag(
      page,
      { x: s.x + s.width * 0.3, y: s.y + s.height * 0.3 },
      { x: s.x + s.width * 0.6, y: s.y + s.height * 0.5 },
    );
    await setMode(page, 'Navegar');
  }
  const sA = screens.get(idA)!;
  await page.mouse.click(sA.x + sA.width * 0.45, sA.y + sA.height * 0.4);
  await page.getByRole('button', { name: 'Ligar a…', exact: true }).click();
  await page
    .getByRole('dialog', { name: /^Ligar .* a…$/ })
    .getByRole('option')
    .first()
    .click();
  await expect(host).toHaveAttribute('data-arrows', '1');

  // Nova perspectiva… pelo seletor, começando vazia.
  await trigger(page, 'Principal').click();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Nova perspectiva…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova perspectiva' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nome', { exact: true }).fill('Revisão');
  await dialog.getByLabel('Começar de').selectOption({ label: 'Vazia' });
  await noHorizontalScroll(page, dialog);
  await dialog.getByRole('button', { name: 'Criar perspectiva' }).click();
  await expect(dialog).toBeHidden();
  // A nova fica aberta.
  await expect(trigger(page, 'Revisão')).toBeVisible();
  let mapping = await readMapping(page);
  expect(mapping.perspectives.map((p) => p.name)).toEqual(['Revisão']);
  expect(mapping.perspectives[0]?.items).toHaveLength(0);

  // Volta à Principal e envia a Tela A pelo menu do botão direito.
  await openPerspective(page, 'Principal');
  await fitAll(page, host);
  await page.mouse.click(sA.x + sA.width * 0.9, sA.y + sA.height * 0.9, {
    button: 'right',
  });
  const menu = page.getByRole('menu', { name: 'Menu do item no canvas' });
  await menu.getByRole('menuitem', { name: 'Enviar para perspectiva' }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Revisão/ }).click();
  await expect
    .poll(async () => (await readMapping(page)).perspectives[0]?.items.length)
    .toBe(1);
  await page.keyboard.press('Escape');
  mapping = await readMapping(page);
  const sent = mapping.perspectives[0]?.items[0];
  expect(sent?.root).toBe(idA);
  const before = mapping.containers.find((c) => c.id === idA)!.placement;

  // Dentro da perspectiva: arrastar a raiz muda a posição dela, não a da Principal.
  await openPerspective(page, 'Revisão');
  await fitAll(page, host);
  const own = mapping.containers.find((c) => c.id === idA)!;
  const inPerspective = await toScreen(host, [
    {
      id: idA,
      x: sent!.x,
      y: sent!.y,
      width: own.width * own.placement.scale,
      height: own.height * own.placement.scale,
    },
  ]);
  const a = inPerspective.get(idA)!;
  await page.mouse.click(centerOf(a).x, a.y + a.height * 0.95);
  await drag(
    page,
    { x: centerOf(a).x, y: a.y + a.height * 0.95 },
    { x: centerOf(a).x + 60, y: a.y + a.height * 0.95 + 40 },
  );
  await expect
    .poll(async () => {
      const m = await readMapping(page);
      const item = m.perspectives[0]?.items[0];
      return item ? item.x !== sent!.x || item.y !== sent!.y : false;
    })
    .toBe(true);
  mapping = await readMapping(page);
  expect(mapping.containers.find((c) => c.id === idA)!.placement).toEqual(before);

  // Criar um item dentro da perspectiva: aparece na Principal com a marca "Veio de Revisão".
  await addContainer(page, host, 'Tela D');
  mapping = await readMapping(page);
  expect(mapping.arrivals).toHaveLength(1);
  expect(mapping.arrivals[0]?.fromName).toBe('Revisão');
  const idD = mapping.arrivals[0]!.root;
  expect(mapping.containers.some((c) => c.id === idD)).toBe(true);

  await openPerspective(page, 'Principal');
  await fitAll(page, host);
  mapping = await readMapping(page);
  const principalScreens = await toScreen(
    host,
    mapping.containers.map((c) => ({
      id: c.id,
      x: c.placement.x,
      y: c.placement.y,
      width: c.width * c.placement.scale,
      height: c.height * c.placement.scale,
    })),
    // Com marca de chegada, Enquadrar tudo deixa folga para o rótulo da faixa.
    FIT_PADDING + ARRIVAL_FIT_EXTRA,
  );
  const d = principalScreens.get(idD)!;
  await page.mouse.click(centerOf(d).x, centerOf(d).y);
  const notice = page.locator('.arrival-notice');
  await expect(notice).toContainText('Veio de Revisão');
  await noHorizontalScroll(page, notice);
  await notice.getByRole('button', { name: 'Dispensar' }).click();
  await expect(notice).toBeHidden();
  expect((await readMapping(page)).arrivals).toHaveLength(0);

  // Gerenciar → Apagar → confirmar; Ctrl+Z desfaz.
  await trigger(page, 'Principal').click();
  await page.getByRole('button', { name: 'Gerenciar perspectivas…' }).click();
  const manage = page.getByRole('dialog', { name: 'Gerenciar perspectivas' });
  await expect(manage).toBeVisible();
  await noHorizontalScroll(page, manage);
  await manage.getByRole('button', { name: 'Apagar Revisão' }).click();
  const del = page.getByRole('alertdialog', { name: /^Apagar a perspectiva Revisão/ });
  await expect(del).toBeVisible();
  await noHorizontalScroll(page, del);
  await del.getByRole('button', { name: 'Apagar perspectiva' }).click();
  await expect(del).toBeHidden();
  if (await manage.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await readMapping(page)).perspectives).toHaveLength(0);

  await page
    .locator('.canvas-host')
    .focus()
    .catch(() => undefined);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readMapping(page)).perspectives.map((p) => p.name))
    .toEqual(['Revisão']);
});
