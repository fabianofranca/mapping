import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { addAnnotation, serialize } from '../../src/model';
import { fixtureFiles, fixtureProject } from './proposalFixture';

// Etapa #515 (FN1, #446 item 2): o menu ⋮ de uma linha fora da vista abre no primeiro clique.
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
