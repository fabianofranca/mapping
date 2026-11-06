import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Selo da especialização no cabeçalho de camada dos Detalhes a 900 px (#371): o selo
// encolhe com reticências e dica, o + não o cobre e o painel não ganha barra horizontal.

test.use({ viewport: { width: 900, height: 720 } });

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
  await page.keyboard.press('Control+Shift+Digit3');
}

test('selo longo da especialização encolhe sem criar barra horizontal nos Detalhes', async ({
  page,
}) => {
  await openExample(page);
  await page
    .getByRole('list', { name: 'Árvore de marcações' })
    .getByRole('button', { name: 'Cadastrar', exact: true })
    .click();

  const panel = page
    .locator('.tab-panel')
    .filter({ has: page.locator('.layer-group-head') });
  await expect(panel.locator('.layer-group-head .tag').first()).toBeVisible();
  const sizes = await panel.first().evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);

  const geometry = await panel.first().evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    return [...el.querySelectorAll('.layer-group-head')].flatMap((head) => {
      const tag = head.querySelector<HTMLElement>('.tag');
      const add = head.lastElementChild;
      if (!tag || !add) return [];
      const t = tag.getBoundingClientRect();
      return [
        {
          text: tag.textContent ?? '',
          title: tag.title,
          truncated: tag.scrollWidth > tag.clientWidth,
          tagRight: t.right,
          addLeft: add.getBoundingClientRect().left,
          panelRight: bounds.right,
        },
      ];
    });
  });
  expect(geometry.length).toBeGreaterThan(0);
  for (const g of geometry) {
    expect(g.tagRight).toBeLessThanOrEqual(g.addLeft);
    expect(g.tagRight).toBeLessThanOrEqual(g.panelRight);
  }
  const material = geometry.filter((g) => g.text === 'Material 3 (Compose)');
  expect(material.length).toBeGreaterThan(0);
  for (const g of material) {
    expect(g.truncated).toBe(true);
    expect(g.title).toBe('Material 3 (Compose)');
  }
});

test('o nome da camada só encolhe depois de o selo ter sumido (900 e 1000 px)', async ({
  page,
}) => {
  for (const width of [900, 1000]) {
    await page.setViewportSize({ width, height: 860 });
    await openExample(page);
    await page
      .getByRole('list', { name: 'Árvore de marcações' })
      .getByRole('button', { name: 'Cadastrar', exact: true })
      .click();
    const heads = await page.locator('.layer-group-head').evaluateAll((all) =>
      all.flatMap((head) => {
        const name = head.querySelector<HTMLElement>('.layer-group-name');
        const tag = head.querySelector<HTMLElement>('.tag');
        if (!name || !tag) return [];
        return [
          {
            name: name.textContent ?? '',
            nameCut: name.scrollWidth > name.clientWidth,
            tagWidth: tag.clientWidth,
            tagCut: tag.scrollWidth > tag.clientWidth,
          },
        ];
      }),
    );
    // O cenário existe: um selo cortado, que ainda mostra texto.
    expect(heads.some((h) => h.tagCut && h.tagWidth > 0)).toBe(true);
    for (const h of heads) {
      if (h.tagWidth > 0) expect(h.nameCut, `${h.name} a ${width} px`).toBe(false);
    }
  }
});

test('a 1592 px os selos curtos (SDUI, Modelo de dados) continuam inteiros', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1592, height: 860 });
  await openExample(page);
  await page
    .getByRole('list', { name: 'Árvore de marcações' })
    .getByRole('button', { name: 'Cadastrar', exact: true })
    .click();
  const tags = page.locator('.layer-group-head .tag');
  await expect(tags.first()).toBeVisible();
  const truncated = await tags.evaluateAll((els) =>
    els
      .filter((el) => el.scrollWidth > el.clientWidth)
      .map((el) => el.textContent)
      .filter((text) => text !== 'Material 3 (Compose)'),
  );
  expect(truncated).toEqual([]);
});
