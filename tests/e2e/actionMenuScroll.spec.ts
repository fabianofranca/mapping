import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { addAnnotation, addLayer, createMarking, serialize } from '../../src/model';
import { fixtureFiles, fixtureProject } from './proposalFixture';

// Etapa #515 (FN1 e FN2, #446 item 2): o menu ⋮ de uma linha fora da vista abre no primeiro clique.
// O clique rola a página até a linha, e essa rolagem chega depois de o menu abrir; o menu
// ignora a rolagem que a própria abertura provoca (até o próximo quadro).

test.use({ viewport: { width: 1280, height: 600 } });

const PAIRS = 24;

async function zipWithManyPairs(): Promise<Buffer> {
  const files = fixtureFiles();
  const project = addAnnotation(fixtureProject(), {
    id: 'A9',
    markingId: 'M1',
    layerId: 'L1',
    name: 'Muitos pares',
    entries: Array.from({ length: PAIRS }, (_, i) => ({
      id: `EP${i + 1}`,
      key: `chave${i + 1}`,
      value: `valor ${i + 1}`,
    })),
  });
  files.set('mapping.json', serialize(project));
  const zip = new JSZip();
  for (const [path, content] of files) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('o ⋮ de uma linha fora da vista abre no primeiro clique, três vezes', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await zipWithManyPairs(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Árvore de marcações' })
    .getByRole('button', { name: 'Cabeçalho', exact: true })
    .click();
  const last = page.getByRole('button', { name: `Ações do par chave${PAIRS}` });
  await expect(last).toHaveCount(1);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: `Ações do par chave${PAIRS}` }).click();
    await expect(
      page.getByRole('menu', { name: `Ações do par chave${PAIRS}` }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    await expect(
      page.getByRole('menu', { name: `Ações do par chave${PAIRS}` }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    // Volta ao topo para a próxima volta partir de uma linha fora da vista.
    await page.getByRole('button', { name: 'Ações do par chave1', exact: true }).focus();
  }
});

// FN2 (achado 3 do relato da FN1): Camadas e a Árvore usam o Popover, e o ⋮ da última
// linha de uma lista que rola só abria no segundo clique (a rolagem da lista chegava no
// mesmo instante e fechava o menu).
const LAYERS = 10;
const MARKS = 40;

async function zipWithLongLists(): Promise<Buffer> {
  const files = fixtureFiles();
  let project = fixtureProject();
  for (let i = 2; i <= LAYERS; i++) {
    project = addLayer(project, {
      id: `LX${i}`,
      name: `Extra ${i}`,
      color: '#43a047',
    });
  }
  for (let i = 1; i <= MARKS; i++) {
    project = createMarking(project, {
      id: `MX${i}`,
      containerId: 'I2',
      name: `Linha ${i}`,
      rect: { x: 20, y: 70 + (i % 9) * 60, width: 40, height: 20 },
    });
  }
  files.set('mapping.json', serialize(project));
  const zip = new JSZip();
  for (const [path, content] of files) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('o ⋮ da última camada e de uma linha da Árvore abre no primeiro clique, três vezes', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await zipWithLongLists(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+2');
  const layers = page.getByRole('region', { name: 'Camadas', exact: true });
  await expect(layers).toBeVisible();
  const tree = page.getByRole('region', { name: 'Árvore de marcações' });
  const cases = [
    {
      scope: layers,
      button: `Mais ações da camada Extra ${LAYERS}`,
      list: '.layer-list',
    },
    { scope: tree, button: `Ações de Linha ${MARKS}`, list: null },
  ] as const;
  for (const c of cases) {
    for (let i = 0; i < 3; i++) {
      // Rolagem ao topo; o ⋮ alvo fica fora da vista e o clique não rola antes.
      await c.scope.evaluate((el, list) => {
        for (const box of el.querySelectorAll<HTMLElement>(list ?? '*'))
          box.scrollTop = 0;
      }, c.list);
      const trigger = c.scope.getByRole('button', { name: c.button, exact: true });
      await expect(trigger).toHaveCount(1);
      await trigger.click();
      await expect(page.getByRole('menu', { name: c.button })).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page.getByRole('menu', { name: c.button })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
  }
});
