import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

// Janela Comentários (#734, CL1): sem barra horizontal, com o ⋯ de cada linha inteiro e o selo de
// status dentro da célula, de 887 px (1591 × 1052) até a janela estreita de 900 × 720, onde
// Msgs e Quando somem e Por mostra só o avatar. Árvore, Camadas e Detalhes ficam abertos.

const EXAMPLE_ZIP = 'examples/exemplo-completo.zip';
const FIRST_THREAD = 'comments/5d0e8a41-2c7b-4f1e-9a63-b8c1d4e7f902.json';

/** O exemplo com uma 4ª conversa aberta (cópia da primeira, âncora longa e não lida). */
async function exampleWithFourThreads(): Promise<Buffer> {
  const zip = await JSZip.loadAsync(readFileSync(EXAMPLE_ZIP));
  const first = JSON.parse(await zip.file(FIRST_THREAD)!.async('string')) as {
    id: string;
    messages: { id: string }[];
  };
  const id = '7a1d3c52-9e04-4b86-8c2f-3d5e6f7a8b90';
  first.id = id;
  first.messages[0]!.id = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  zip.file(`comments/${id}.json`, JSON.stringify(first));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function openComments(
  page: Page,
  status: 'All' | 'Resolved',
  buffer: Buffer = readFileSync(EXAMPLE_ZIP),
): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({ name: 'exemplo-completo.zip', mimeType: 'application/zip', buffer });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  for (const n of ['1', '2', '3', '0']) await page.keyboard.press(`Control+Shift+${n}`);
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption({
    label: status,
  });
  await expect(page.locator('.comments-row').first()).toBeVisible();
}

async function expectInside(inner: Locator, outer: Locator): Promise<void> {
  const o = await outer.boundingBox();
  const i = await inner.boundingBox();
  if (!o || !i) throw new Error('elemento sem caixa');
  expect(i.x).toBeGreaterThanOrEqual(o.x - 0.5);
  expect(i.x + i.width).toBeLessThanOrEqual(o.x + o.width + 0.5);
}

async function expectFits(page: Page): Promise<void> {
  const scroll = page.locator('.comments-view .list-scroll');
  const sizes = await scroll.evaluate((el) => ({ s: el.scrollWidth, c: el.clientWidth }));
  expect(sizes.s, `scrollWidth ${sizes.s} > clientWidth ${sizes.c}`).toBeLessThanOrEqual(
    sizes.c,
  );
  for (const row of await page.locator('.comments-row').all()) {
    await expectInside(row.locator('.comments-menu button'), scroll);
    await expectInside(
      row.locator('.comments-badge'),
      row.locator('td:has(.comments-badge)'),
    );
  }
}

async function expectDeleteMenu(page: Page): Promise<void> {
  await page.locator('.comments-row .comments-menu button').first().click();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.keyboard.press('Escape');
}

for (const status of ['All', 'Resolved'] as const) {
  test.describe(`${status}`, () => {
    test.describe('janela de 887 px (1591 × 1052)', () => {
      test.use({ viewport: { width: 1591, height: 1052 } });

      test('sem barra horizontal, ⋯ inteiro e selo na célula', async ({ page }) => {
        await openComments(page, status);
        await expectFits(page);
        await expectDeleteMenu(page);
        await expect(page.locator('.comments-col-count')).toBeVisible();
        await expect(page.locator('.comments-col-when')).toBeVisible();
      });
    });

    test.describe('janela estreita (900 × 720)', () => {
      test.use({ viewport: { width: 900, height: 720 } });

      test('Msgs e Quando somem, Por vira avatar e o ⋯ fica inteiro', async ({
        page,
      }) => {
        await openComments(page, status);
        await expectFits(page);
        await expectDeleteMenu(page);
        await expect(page.locator('.comments-col-count')).toBeHidden();
        await expect(page.locator('.comments-col-when')).toBeHidden();
        await expect(page.locator('.comments-count').first()).toBeHidden();
        await expect(page.locator('.comments-when').first()).toBeHidden();
        await expect(page.locator('.comments-by-name').first()).toBeHidden();
        await expect(page.locator('.comments-avatar').first()).toBeVisible();
        for (const name of ['Anchor', 'Last message', 'Status']) {
          await expect(page.getByRole('columnheader', { name })).toBeVisible();
        }
        await expect(page.locator('.comments-row .comments-last').first()).toBeVisible();
        await expect(page.locator('.comments-row .comments-badge').first()).toBeVisible();
      });
    });
  });
}

test.describe('altura inicial da janela inferior (900 × 720, sem altura gravada)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('Comentários mostra 4 linhas inteiras, todas com a altura de uma linha', async ({
    page,
  }) => {
    await openComments(page, 'All', await exampleWithFourThreads());
    // O ponto de não lida fica na mesma linha da âncora: nenhuma linha passa de uma linha de texto.
    const sizes = await page.locator('.comments-view .list-scroll').evaluate((el) => {
      const rows = [...el.querySelectorAll('.comments-row')];
      const heights = rows.map((r) => r.getBoundingClientRect().height);
      const box = el.getBoundingClientRect();
      const last = rows[rows.length - 1]!.getBoundingClientRect();
      return { client: el.clientHeight, heights, hidden: last.bottom - box.bottom };
    });
    expect(sizes.heights).toHaveLength(4);
    expect(
      new Set(sizes.heights).size,
      `alturas das linhas: ${sizes.heights.join(', ')}`,
    ).toBe(1);
    expect(
      sizes.hidden,
      `.list-scroll clientHeight ${sizes.client}: a 4ª linha passa ${sizes.hidden} px da borda`,
    ).toBeLessThanOrEqual(0);
  });
});

test.describe('faixa de abas da janela inferior (900 × 720)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  // Folga mínima (px) entre a última aba e a borda da faixa: cobre fontes mais largas de outras
  // máquinas e contagens de mais dígitos (o relato da CL2 e o CI medem 362 a 363 px de conteúdo para 356 antes do ajuste; aqui, com a fonte local, a folga é maior).
  const SLACK = 12;

  test('as seis abas cabem inteiras, sem rolar e com folga', async ({ page }) => {
    await openComments(page, 'All');
    const strip = page.locator('.tool-window-bottom [role=tablist]');
    const sizes = await strip.evaluate((el) => ({
      s: el.scrollWidth,
      c: el.clientWidth,
      left: el.scrollLeft,
      lastRight:
        el.querySelector('[role=tab]:last-of-type')?.getBoundingClientRect().right ?? 0,
      right: el.getBoundingClientRect().right,
    }));
    expect(
      sizes.s,
      `faixa de abas: scrollWidth ${sizes.s} > clientWidth ${sizes.c} (scrollLeft ${sizes.left})`,
    ).toBeLessThanOrEqual(sizes.c);
    expect(
      sizes.right - sizes.lastRight,
      `folga ${sizes.right - sizes.lastRight} px < ${SLACK} px entre a última aba e a borda da faixa`,
    ).toBeGreaterThanOrEqual(SLACK);
  });
});

test.describe('âncora da conversa resolvida (900 × 720)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  for (const status of ['Resolved', 'All'] as const) {
    test(`${status}: o botão da âncora fica riscado e em cinza`, async ({ page }) => {
      await openComments(page, status);
      const row = page.locator('.comments-row[data-resolved]').first();
      await expect(row).toBeVisible();
      const button = row.locator('.comments-anchor-button');
      const style = await button.evaluate((el) => {
        const muted = getComputedStyle(el.closest('.comments-row') as Element).color;
        const s = getComputedStyle(el);
        return { line: s.textDecorationLine, color: s.color, muted };
      });
      expect(style.line, `text-decoration-line: ${style.line}`).toContain('line-through');
      expect(style.line).not.toContain('underline');
      expect(style.color, `cor ${style.color} != atenuada ${style.muted}`).toBe(
        style.muted,
      );
      await expect(button).toHaveAttribute('aria-label', /.+/);
    });
  }
});
