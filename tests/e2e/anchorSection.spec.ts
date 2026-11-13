import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import {
  addContainer,
  createMarking,
  createProject,
  serialize,
  setMarkingAnchor,
} from '../../src/model';
import { blocksPng } from './png';

// Âncora na app (R4, etapa #1096): a seção Âncora dos Detalhes e o Encostar, num painel estreito
// (900 px): os campos do Deslocamento cabem, Lado e Alinhamento gravam e o Encostar move a marcação
// e se desfaz numa entrada só.

test.use({ viewport: { width: 900, height: 720 } });

const NOW = '2026-11-13T12:00:00.000Z';

/** Um container com o `Alvo` e a `Ancorada` (já ancorada nele, longe, sem componente). */
async function anchoredZip(): Promise<Buffer> {
  let p = createProject({
    name: 'Ancora',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
  });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 800 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    name: 'Alvo',
    rect: { x: 400, y: 300, width: 200, height: 100 },
  });
  p = createMarking(p, {
    id: 'M2',
    containerId: 'I1',
    name: 'Ancorada',
    rect: { x: 100, y: 100, width: 100, height: 40 },
  });
  p = setMarkingAnchor(p, 'M2', { to: 'M1' });
  const zip = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  zip.file('mapping.json', serialize(p), opts);
  zip.file('images/a.png', blocksPng(1000, 800, [240, 240, 240], []), opts);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

async function openAnchored(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'ancora.zip',
      mimeType: 'application/zip',
      buffer: await anchoredZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit2');
  await page.locator('.tree-row', { hasText: 'Ancorada' }).first().click();
}

test('seção Âncora: mostra a âncora, grava lado e alinhamento e Encostar move e desfaz numa entrada', async ({
  page,
}) => {
  await openAnchored(page);
  const section = page.getByRole('region', { name: 'Âncora' });
  await expect(section).toBeVisible();
  await expect(section.getByLabel('Ancorada a')).toHaveValue('M1');
  const x = page.getByRole('spinbutton', { name: 'X', exact: true });
  const y = page.getByRole('spinbutton', { name: 'Y', exact: true });
  await expect(x).toHaveValue('100');
  await expect(y).toHaveValue('100');

  // Os padrões do lugar (sem componente): acima e ao centro; o Encostar leva à âncora.
  await expect(section.getByRole('button', { name: 'Acima' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await section.getByRole('button', { name: 'Encostar na âncora' }).click();
  await expect(x).toHaveValue('450');
  await expect(y).toHaveValue('260');

  // Abaixo da âncora (Y = 300 + 100): outra mudança, outra entrada de desfazer.
  await section.getByRole('button', { name: 'Abaixo' }).click();
  await section.getByRole('button', { name: 'Encostar na âncora' }).click();
  await expect(y).toHaveValue('400');

  // O foco sai do campo e o Ctrl+Z desfaz o Encostar de cima numa entrada só.
  await page.getByRole('heading', { name: 'Detalhes' }).first().click();
  await page.keyboard.press('Control+z');
  await expect(y).toHaveValue('260');
  await expect(x).toHaveValue('450');
});

test('seção Âncora a 900 px: os dois campos do Deslocamento cabem inteiros', async ({
  page,
}) => {
  await openAnchored(page);
  const section = page.getByRole('region', { name: 'Âncora' });
  const main = section.getByLabel('Distância da borda');
  const cross = section.getByLabel('Deslocamento ao longo do lado');
  await main.fill('-1234');
  await main.press('Enter');
  await cross.fill('5678');
  await cross.press('Enter');
  for (const field of [main, cross]) {
    const m = await field.evaluate((e) => {
      const input = e as HTMLInputElement;
      return { scroll: input.scrollWidth, client: input.clientWidth };
    });
    expect(m.scroll).toBeLessThanOrEqual(m.client);
  }
  await expect(main).toHaveValue('-1234');
  await expect(cross).toHaveValue('5678');
});
