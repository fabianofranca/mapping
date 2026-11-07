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
  await page.getByRole('button', { name: 'Mostrar Detalhes' }).click();

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
