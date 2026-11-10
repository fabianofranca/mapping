import { expect, test, type Page } from '@playwright/test';
import { addImage, canvasPoint, createProject, drawMarking, setMode } from './helpers';
import { readFileSync } from 'node:fs';
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

  test('caminho legível: letras e reticências, não só os separadores (BS3)', async ({
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
    await page
      .getByRole('button', { name: /^Atual$/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: 'Banner promoção', exact: true })
      .first()
      .click();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const crumbs = bar.querySelector<HTMLElement>('.crumbs')!;
      const items = [...crumbs.querySelectorAll<HTMLElement>('.crumb-item')];
      return {
        crumbsWidth: crumbs.clientWidth,
        items: items.length,
        lastName:
          items.at(-1)?.querySelector<HTMLElement>('.crumb-name')?.clientWidth ?? 0,
        lastCut: (() => {
          const n = items.at(-1)?.querySelector<HTMLElement>('.crumb-name');
          return n ? n.scrollWidth > n.clientWidth : false;
        })(),
        lastEllipsis: getComputedStyle(
          items.at(-1)!.querySelector<HTMLElement>('.crumb-name')!,
        ).textOverflow,
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
        zoomWhole: (() => {
          const z = bar.querySelector<HTMLElement>('.zoom-field')!;
          return z.scrollWidth <= z.clientWidth && z.clientWidth > 0;
        })(),
      };
    });
    expect(m.items, JSON.stringify(m)).toBeGreaterThanOrEqual(2);
    // A seleção (último trecho) mostra 2 a 3 letras, com reticências se cortada.
    // O "⋯" da BC2 custa ~22 px + vãos à seleção (antes 90 e 40); o caminho inteiro está no "…".
    expect(m.crumbsWidth, JSON.stringify(m)).toBeGreaterThanOrEqual(60);
    expect(m.lastName, JSON.stringify(m)).toBeGreaterThanOrEqual(16);
    if (m.lastCut) expect(m.lastEllipsis, JSON.stringify(m)).toBe('ellipsis');
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    expect(m.zoomWhole, JSON.stringify(m)).toBe(true);
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

// BC1 (#1064): na barra do canvas estreita o caminho recolhe o meio num "…" que abre o caminho
// inteiro; na larga, nada muda. jsdom não tem layout: a medida é aqui.

async function openExample(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

async function selectCadastrar(page: Page): Promise<void> {
  const tree = page.getByRole('list', { name: 'Árvore de marcações' });
  await tree.getByRole('button', { name: 'Cadastrar', exact: true }).click();
}

test.describe('caminho recolhido a 900×720 fora da revisão (BC1)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('Canvas › … › Cadastrar; o Enter no "…" abre o caminho inteiro e o Esc devolve o foco', async ({
    page,
  }) => {
    await openExample(page);
    for (const key of ['1', '2', '7', '3'])
      await page.keyboard.press(`Control+Shift+Digit${key}`);
    await selectCadastrar(page);
    const more = page.getByRole('button', { name: 'Mostrar o caminho inteiro' });
    await expect(more).toBeVisible();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const items = [...bar.querySelectorAll<HTMLElement>('.crumb-item')];
      const last = items.at(-1)!.querySelector<HTMLElement>('.crumb-name')!;
      return {
        middle: items.slice(1, -1).map((el) => el.getBoundingClientRect().width),
        last: last.clientWidth,
        lastTitle: last.getAttribute('title') ?? '',
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
      };
    });
    expect(m.middle.length, JSON.stringify(m)).toBeGreaterThan(0);
    expect(
      m.middle.every((w) => w === 0),
      JSON.stringify(m),
    ).toBe(true);
    expect(m.last, JSON.stringify(m)).toBeGreaterThanOrEqual(40);
    expect(m.lastTitle).toBe('Cadastrar');
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    await more.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Caminho inteiro' });
    await expect(menu.getByRole('menuitem')).toHaveCount(4);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Canvas',
      'Cadastro',
      'Formulário',
      'Cadastrar',
    ]);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
  });
});

test.describe('caminho inteiro a 1440×900 (BC1)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('sem "…": todos os trechos visíveis, como hoje', async ({ page }) => {
    await openExample(page);
    await selectCadastrar(page);
    await expect(
      page.getByRole('button', { name: 'Mostrar o caminho inteiro' }),
    ).toBeHidden();
    const widths = await page
      .locator('.crumbs .crumb-item')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(widths.length).toBeGreaterThanOrEqual(4);
    expect(widths.every((w) => w > 0)).toBe(true);
  });
});

// BC2 (#1065): na revisão estreita os controles que somem ficam num "⋯" no fim da barra.

async function openReview(page: Page): Promise<void> {
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
}

const MORE = 'Mais controles';

test.describe('o "⋯" da revisão a 900×720 (BC2)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('visível e dentro da coluna, com o zoom inteiro; abre os itens e cada um funciona', async ({
    page,
  }) => {
    await openReview(page);
    const more = page.getByRole('button', { name: MORE });
    await expect(more).toBeVisible();
    const m = await page.locator('.canvas-bar').evaluate((bar) => {
      const zoom = bar.querySelector<HTMLElement>('.zoom-field')!;
      const review = bar.querySelector<HTMLElement>('.review-canvas-controls')!;
      return {
        barScroll: bar.scrollWidth,
        barClient: bar.clientWidth,
        zoomWhole: zoom.scrollWidth <= zoom.clientWidth && zoom.clientWidth > 0,
        reviewWidth: review.getBoundingClientRect().width,
        moreRight: bar
          .querySelector('[aria-label="Mais controles"]')!
          .getBoundingClientRect().right,
        barRight: bar.getBoundingClientRect().right,
      };
    });
    expect(m.barScroll, JSON.stringify(m)).toBeLessThanOrEqual(m.barClient);
    expect(m.zoomWhole, JSON.stringify(m)).toBe(true);
    expect(m.reviewWidth, JSON.stringify(m)).toBeGreaterThan(0);
    expect(m.moreRight, JSON.stringify(m)).toBeLessThanOrEqual(m.barRight + 0.5);

    await more.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: MORE });
    await expect(menu.locator('[role^="menuitem"]')).toHaveCount(5);
    const names = await menu.locator('[role^="menuitem"]').allInnerTexts();
    expect(names[0]).toContain('Conversas');
    expect(names[1]).toContain('Visualizar');
    expect(names[2]).toContain('Mostrar no canvas');
    expect(names[3]).toContain('Enquadrar tudo');

    // Enquadrar tudo pelo menu muda o zoom.
    const zoom = page.locator('.canvas-bar .zoom-field');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Equal');
    await page.keyboard.press('Control+Equal');
    const zoomed = await zoom.innerText();
    await more.click();
    await menu.getByRole('menuitem', { name: /Enquadrar tudo/ }).click();
    await expect.poll(() => zoom.innerText()).not.toBe(zoomed);

    // Visualizar pelo menu liga o modo; o painel abre ancorado no "⋯", dentro da janela.
    await more.click();
    await menu.getByRole('menuitemcheckbox', { name: /Visualizar/ }).click();
    const panel = page.getByRole('dialog', { name: 'Mostrar no canvas' });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const anchor = await more.boundingBox();
    const view = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(view.width);
    expect(box!.y).toBeGreaterThanOrEqual(anchor!.y);
    expect(Math.abs(box!.x + box!.width - (anchor!.x + anchor!.width))).toBeLessThan(
      view.width,
    );
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(more).toBeFocused();
  });
});

test.describe('sem o "⋯" fora da revisão e na barra larga (BC2)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('fora da revisão a 900×720: os quatro botões à vista', async ({ page }) => {
    await createProject(page, 'Barra');
    await expect(page.getByRole('button', { name: MORE })).toBeHidden();
    for (const name of ['Conversas', 'Visualizar', 'Mostrar no canvas', 'Enquadrar tudo'])
      await expect(
        page.locator('.canvas-bar').getByRole('button', { name }),
      ).toBeVisible();
  });
});

test.describe('sem o "⋯" a 1440×900 (BC2)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('na revisão e fora dela os botões ficam à vista', async ({ page }) => {
    await openReview(page);
    await expect(page.getByRole('button', { name: MORE })).toBeHidden();
    for (const name of ['Conversas', 'Visualizar', 'Mostrar no canvas', 'Enquadrar tudo'])
      await expect(
        page.locator('.canvas-bar').getByRole('button', { name }),
      ).toBeVisible();
  });
});
