import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
} from './helpers';

// Etapa #679 (CF3): o seletor de `ref` com a anotação inteira como alvo e a linha
// "Referenciada por" não geram barra horizontal a 900 px, mesmo com rótulos longos (como o R11.12).

test.use({ viewport: { width: 900, height: 720 } });

const LONG = 'Componente com um nome extremamente longo para forçar a quebra de linha';

const spec = {
  format: 'mapping-spec',
  formatVersion: 14,
  id: 'fora',
  name: 'Fora da imagem',
  version: 1,
  layers: [
    {
      id: 'componentes',
      name: 'Componentes',
      color: '#43A047',
      annotationTypes: [
        {
          id: 'item',
          name: 'Item de lista',
          labelField: 'titulo',
          fields: [{ key: 'titulo', type: 'string' }],
        },
      ],
    },
    {
      id: 'eventos',
      name: 'Eventos',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'evento',
          name: 'Evento',
          fields: [
            {
              key: 'principal',
              type: 'ref',
              accepts: { annotations: [{ layer: 'componentes' }] },
            },
          ],
        },
      ],
    },
  ],
};

/** Os contêineres que rolam (auto/scroll) e a própria raiz: texto cortado com reticências não conta. */
async function overflow(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const found: string[] = [];
    for (const base of document.querySelectorAll<HTMLElement>(sel)) {
      for (const el of [base, ...base.querySelectorAll<HTMLElement>('*')]) {
        const overflowX = getComputedStyle(el).overflowX;
        const scrolls = overflowX === 'auto' || overflowX === 'scroll' || el === base;
        if (scrolls && (el.scrollWidth > el.clientWidth || el.scrollLeft !== 0)) {
          found.push(
            `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}x${el.clientWidth}`,
          );
        }
      }
    }
    return found;
  }, selector);
}

test('seletor e linha Referenciada por sem barra horizontal a 900 px', async ({
  page,
}, info) => {
  const file = info.outputPath('fora.json');
  writeFileSync(file, JSON.stringify(spec));
  await createProject(page, 'Fora da imagem');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 1 / 4));
  await applySpecialization(page, file);
  await page.getByRole('button', { name: 'Detalhes', exact: true }).click();

  // O item: anotação tipada da camada Componentes, com o título longo.
  await page
    .getByRole('button', { name: /Adicionar anotação na camada Componentes/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Item de lista/ })
    .click();
  const title = page.getByRole('textbox', { name: 'titulo' });
  await title.fill(LONG);
  await title.press('Enter');

  // O evento aponta para o item pelo seletor.
  await drawMarking(page, await canvasPoint(page, 2 / 3));
  await page
    .getByRole('button', { name: /Adicionar anotação na camada Eventos/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Evento/ })
    .click();
  await page.getByRole('button', { name: /^Escolher: principal/i }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('option')).toHaveCount(1);
  expect(await overflow(page, 'dialog[open]')).toEqual([]);
  await picker.getByRole('option').first().click();
  expect(await overflow(page, '.editor')).toEqual([]);

  // O item mostra "Referenciada por" com o evento.
  await page.getByRole('button', { name: 'Ir para o alvo' }).click();
  await expect(page.getByRole('group', { name: 'Referenciada por' })).toBeVisible();
  expect(await overflow(page, '.editor')).toEqual([]);
});

// CF13 (R24.15): na janela estreita o nome do alvo no campo `ref` dos Detalhes não pode ficar
// espremido ("→ Pl…", 24 de 50 px) pelos botões ao lado: ou cabe inteiro, ou os botões quebram
// de linha. Vale a 900 px e a 1280 px.
async function measureRef(page: Page) {
  return page.evaluate(() => {
    const text = document.querySelector<HTMLElement>('.ref-field .ref-control-text')!;
    const field = text.closest<HTMLElement>('.ref-field')!;
    const box = (el: Element) => Math.round(el.getBoundingClientRect().width);
    // O texto desenhado (Range) contra a caixa, em fração de pixel: 0,3 px a menos já põe reticências.
    const range = document.createRange();
    range.selectNodeContents(text);
    return {
      shown: text.getBoundingClientRect().width,
      full: range.getBoundingClientRect().width,
      control: box(text.closest('.ref-control')!),
      field: box(field),
    };
  });
}

test('o nome do alvo do campo ref cabe a 900 e a 1280 px', async ({ page }, info) => {
  const file = info.outputPath('fora.json');
  writeFileSync(file, JSON.stringify(spec));
  await createProject(page, 'Fora da imagem');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 1 / 4));
  await applySpecialization(page, file);
  await page.getByRole('button', { name: 'Detalhes', exact: true }).click();
  await page
    .getByRole('button', { name: /Adicionar anotação na camada Componentes/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Item de lista/ })
    .click();
  const title = page.getByRole('textbox', { name: 'titulo' });
  await title.fill('Plugin B');
  await title.press('Enter');
  await drawMarking(page, await canvasPoint(page, 2 / 3));
  await page
    .getByRole('button', { name: /Adicionar anotação na camada Eventos/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Evento/ })
    .click();
  await page.getByRole('button', { name: /^Escolher: principal/i }).click();
  await page.getByRole('dialog').getByRole('option').first().click();

  for (const width of [900, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    const m = await measureRef(page);
    expect(m.shown, `largura ${width}`).toBeGreaterThanOrEqual(m.full - 0.05);
  }
});

// AF2 (#784, decisão 4): a 900×720 com Árvore, Camadas e Detalhes abertos (Detalhes ~279 px), o
// rótulo do alvo tem prioridade sobre o nome da camada: ele aparece inteiro e o texto completo
// (alvo e camada) está no tooltip.
test('com 3 janelas abertas o rotulo do alvo fica inteiro e o tooltip traz tudo', async ({
  page,
}, info) => {
  const file = info.outputPath('fora.json');
  writeFileSync(file, JSON.stringify(spec));
  await createProject(page, 'Fora da imagem');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 1 / 4));
  await applySpecialization(page, file);
  await page.keyboard.press('Control+Shift+1');
  await page.keyboard.press('Control+Shift+2');
  await page.keyboard.press('Control+Shift+3');
  await page
    .getByRole('button', { name: /Adicionar anotação na camada Componentes/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Item de lista/ })
    .click();
  const title = page.getByRole('textbox', { name: 'titulo' });
  await title.fill('Plugin B');
  await title.press('Enter');
  await drawMarking(page, await canvasPoint(page, 2 / 3));
  await page
    .getByRole('button', { name: /Adicionar anotação na camada Eventos/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Evento/ })
    .click();
  await page.getByRole('button', { name: /^Escolher: principal/i }).click();
  await page.getByRole('dialog').getByRole('option').first().click();

  const m = await measureRef(page);
  expect(m.shown, 'rótulo cortado').toBeGreaterThanOrEqual(m.full - 0.05);

  // O que ficar cortado (aqui, o nome da camada) mostra o texto inteiro no tooltip.
  const control = page.locator('.ref-field .ref-control');
  await control.hover();
  const tip = page.locator('[data-tooltip]', { hasText: 'Plugin B' }).first();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Componentes');
});

// CL1 (#784, achados 1 e 2 do relato da #827): o controle de `ref` em célula de tabela não deixa o
// ✕ de Limpar sobre o rótulo nem quebra a "(referência quebrada)" em várias linhas; e o rótulo do
// campo `qualquer` não é cortado nem por meio pixel. Mede o texto desenhado (Range), não o scrollWidth.
const tableSpec = {
  ...spec,
  layers: [
    spec.layers[0],
    {
      ...spec.layers[1],
      annotationTypes: [
        {
          id: 'evento',
          name: 'Evento',
          fields: [
            {
              key: 'plugins',
              type: 'table',
              columns: [
                { key: 'nota', type: 'string' },
                {
                  key: 'item',
                  type: 'ref',
                  accepts: { annotations: ['item'] },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

async function measureRefCells(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.ref-cell')].map((cell) => {
      const control = cell.querySelector<HTMLElement>('.ref-control')!;
      const text = control.querySelector<HTMLElement>('.ref-control-text')!;
      const clear = cell.querySelector<HTMLElement>('button:not(.ref-control)')!;
      const range = document.createRange();
      range.selectNodeContents(text);
      const c = control.getBoundingClientRect();
      const x = clear.getBoundingClientRect();
      return {
        text: text.textContent,
        overlap: Math.max(0, c.right - x.left),
        cut: Math.max(
          0,
          range.getBoundingClientRect().width - text.getBoundingClientRect().width,
        ),
        lines: Math.round(range.getBoundingClientRect().height / 14),
      };
    }),
  );
}

for (const width of [1280, 900]) {
  test(`celulas ref da tabela: X de limpar fora do rotulo e referencia quebrada legivel a ${width} px`, async ({
    page,
  }, info) => {
    const file = info.outputPath('fora.json');
    writeFileSync(file, JSON.stringify(tableSpec));
    await page.setViewportSize({ width, height: 720 });
    await createProject(page, 'Fora da imagem');
    await addImage(page);
    await page.keyboard.press('Control+Shift+1');
    await page.keyboard.press('Control+Shift+2');
    await page.keyboard.press('Control+Shift+3');
    await expect(page.getByRole('region', { name: 'Detalhes' })).toBeVisible();
    await page.waitForTimeout(300); // o canvas reajusta o tamanho depois que as janelas abrem
    await drawMarking(page, await canvasPoint(page, 1 / 4));
    await applySpecialization(page, file);
    await page
      .getByRole('button', { name: /Adicionar anotação na camada Componentes/ })
      .first()
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Item de lista/ })
      .click();
    const title = page.getByRole('textbox', { name: 'titulo' });
    await title.fill('Plugin A');
    await title.press('Enter');
    await drawMarking(page, await canvasPoint(page, 2 / 3));
    await page
      .getByRole('button', { name: /Adicionar anotação na camada Eventos/ })
      .first()
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Evento/ })
      .click();
    await page.getByRole('button', { name: '+ Linha' }).click();
    await page.getByRole('button', { name: /^Escolher: item/i }).click();
    await page.getByRole('dialog').getByRole('option').first().click();

    const ok = (await measureRefCells(page))[0]!;
    expect(ok.overlap, 'âncora e ✕ sobrepostos').toBe(0);
    expect(ok.cut, 'rótulo cortado').toBeLessThanOrEqual(0.5);

    // Exclui o alvo (Plugin A) e volta ao evento: a célula fica quebrada.
    const tree = page.getByRole('list', { name: 'Árvore de marcações' });
    await tree.getByRole('button', { name: 'Marcação sem nome' }).first().click();
    await page.getByRole('button', { name: 'Excluir marcação' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();
    await tree.getByRole('button', { name: 'Marcação sem nome' }).first().click();
    await expect(page.locator('.ref-cell .ref-control.is-broken')).toBeVisible();
    const broken = (await measureRefCells(page))[0]!;
    expect(broken.text).toContain('quebrada');
    expect(broken.lines, 'uma linha só').toBe(1);
    expect(broken.overlap, 'âncora e ✕ sobrepostos').toBe(0);
    expect(broken.cut, 'rótulo cortado').toBeLessThanOrEqual(0.5);
  });
}
