import { expect, test, type Page } from '@playwright/test';
import { addImage, canvasPoint, createProject, drawMarking, setMode } from './helpers';
import { fixtureZip } from './proposalFixture';

// Barra de status e caminho do canvas (etapa #675): a 900×720 os estados curtos (Salvo, o
// destino, Somente leitura) ficam inteiros, os textos longos encolhem com reticências e dica,
// nada passa da borda e schema e canal somem; a 1440×900 eles voltam. jsdom não tem layout.

const LONG_NAME = 'Botão de confirmação do pedido com um nome bem comprido demais';

interface ItemReport {
  readonly text: string;
  readonly title: string;
  readonly cut: boolean;
  readonly ellipsis: boolean;
  readonly inside: boolean;
}

/** Mede cada `.status-item-text` da barra: cortado sem reticências, dica e se cabe. */
async function measureBar(page: Page) {
  return page.locator('.statusbar').evaluate((bar) => {
    const edge = bar.getBoundingClientRect().right;
    const items: ItemReport[] = [];
    for (const el of bar.querySelectorAll<HTMLElement>('.status-item')) {
      const text = el.querySelector<HTMLElement>('.status-item-text');
      const node = text ?? el;
      const r = el.getBoundingClientRect();
      items.push({
        text: (node.textContent ?? '').trim(),
        title: el.getAttribute('title') ?? node.getAttribute('title') ?? '',
        cut: node.scrollWidth > node.clientWidth,
        ellipsis: text !== null && getComputedStyle(text).textOverflow === 'ellipsis',
        inside: r.width === 0 || r.right <= edge + 0.5,
      });
    }
    return { items, scrolls: bar.scrollWidth > bar.clientWidth };
  });
}

function expectBarHealthy(report: Awaited<ReturnType<typeof measureBar>>) {
  expect(report.scrolls).toBe(false);
  for (const item of report.items) {
    expect(item.inside, `"${item.text}" passa da borda`).toBe(true);
    if (item.cut) {
      expect(item.ellipsis, `"${item.text}" cortado sem reticências`).toBe(true);
      expect(item.title, `"${item.text}" sem dica`).toContain(item.text);
    }
  }
}

async function expectWhole(page: Page, text: RegExp) {
  const item = page.locator('.statusbar .status-item', { hasText: text }).first();
  await expect(item).toBeVisible();
  const [scroll, client] = await item.evaluate((el) => {
    const node = el.querySelector<HTMLElement>('.status-item-text') ?? el;
    return [node.scrollWidth, node.clientWidth];
  });
  expect(scroll, `"${text}" cortado (${scroll} > ${client})`).toBeLessThanOrEqual(client);
}

async function selectLongMarking(page: Page) {
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await page.keyboard.press('Control+Shift+Digit3');
  await page.getByLabel('Nome', { exact: true }).first().fill(LONG_NAME);
  await page.keyboard.press('Enter');
}

test.describe('a 900×720', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('projeto local com "Alterações não exportadas" e nome de seleção longo', async ({
    page,
  }) => {
    await createProject(page, 'Barra');
    await selectLongMarking(page);
    await setMode(page, 'Navegar');
    const bar = page.locator('.statusbar');
    await expect(bar).toContainText('Alterações não exportadas');
    await expectWhole(page, /^Salvo$/);
    await expectWhole(page, /^Neste dispositivo$/);
    expectBarHealthy(await measureBar(page));
    await expect(bar.locator('.status-wide:visible')).toHaveCount(0);
  });

  test('revisão com "1 aceita aguardando aplicação": Somente leitura inteiro e caminho', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
      .setInputFiles({
        name: 'loja.zip',
        mimeType: 'application/zip',
        buffer: await fixtureZip(),
      });
    await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
    await page.keyboard.press('Control+Shift+7');
    await page
      .getByRole('button', { name: /^Revisar/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: /^Aceitar/ })
      .first()
      .click();
    const bar = page.locator('.statusbar');
    await expect(bar).toContainText('aguardando aplicação');
    await expectWhole(page, /Somente leitura/);
    await expectWhole(page, /^Salvo$|^Pasta$|^Neste dispositivo$/);
    expectBarHealthy(await measureBar(page));
    await expect(bar.locator('.status-wide:visible')).toHaveCount(0);
    // O caminho do canvas termina antes dos controles da revisão.
    const crumbs = page.locator('.crumbs');
    const end = page.locator('.canvas-bar-end');
    const [crumbsRight, endLeft] = await Promise.all([
      crumbs.evaluate((e) => e.getBoundingClientRect().right),
      end.evaluate((e) => e.getBoundingClientRect().left),
    ]);
    expect(crumbsRight).toBeLessThanOrEqual(endLeft + 0.5);
    for (const name of await page.locator('.crumb-name').all()) {
      const [cut, title] = await name.evaluate((e) => [
        e.scrollWidth > e.clientWidth,
        e.getAttribute('title') ?? '',
      ]);
      if (cut) expect(title).not.toBe('');
    }
  });
});

test.describe('revisão a 900×720 com as quatro janelas abertas (BS2)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('caminho com reticências e dica, barra dentro da coluna, zoom inteiro', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
      .setInputFiles({
        name: 'loja.zip',
        mimeType: 'application/zip',
        buffer: await fixtureZip(),
      });
    await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
    for (const key of ['1', '2', '3', '7'])
      await page.keyboard.press(`Control+Shift+${key}`);
    await page
      .getByRole('button', { name: /^Revisar/ })
      .first()
      .click();
    await expect(page.locator('.review-canvas-controls')).toBeVisible();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const q = (s: string) => bar.querySelector<HTMLElement>(s)!;
      const crumbs = q('.crumbs');
      const name = bar.querySelector<HTMLElement>('.crumb-name');
      return {
        crumbsWidth: crumbs.clientWidth,
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
        endRight: q('.canvas-bar-end').getBoundingClientRect().right,
        barRight: bar.getBoundingClientRect().right,
        nameCut: name ? name.scrollWidth > name.clientWidth : false,
        nameTitle: name?.getAttribute('title') ?? '',
        nameEllipsis: name ? getComputedStyle(name).textOverflow : '',
      };
    });
    expect(m.crumbsWidth, JSON.stringify(m)).toBeGreaterThan(0);
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    expect(m.endRight, JSON.stringify(m)).toBeLessThanOrEqual(m.barRight + 0.5);
    const empty = page.locator('.crumbs-empty');
    if ((await empty.count()) > 0) {
      const e = await empty.evaluate((el) => ({
        cut: el.scrollWidth > el.clientWidth,
        ellipsis: getComputedStyle(el).textOverflow,
        title: el.getAttribute('title') ?? '',
      }));
      if (e.cut) expect(e.ellipsis).toBe('ellipsis');
      expect(e.title).not.toBe('');
    }
    if (m.nameCut) {
      expect(m.nameEllipsis).toBe('ellipsis');
      expect(m.nameTitle).not.toBe('');
    }
    await expect(page.locator('.canvas-bar .zoom-field')).toBeVisible();
  });
});

test.describe('a 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('schema e canal aparecem', async ({ page }) => {
    await createProject(page, 'Barra');
    const bar = page.locator('.statusbar');
    await expect(bar.locator('.status-wide:visible')).toHaveCount(2);
    await expect(bar).toContainText('schema v');
    expectBarHealthy(await measureBar(page));
  });
});
