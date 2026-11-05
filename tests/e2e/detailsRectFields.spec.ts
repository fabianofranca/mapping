import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  addContainer,
  buildProposal,
  createMarking,
  createProject,
  proposalFilePath,
  renameContainer,
  renameMarking,
  serialize,
  serializeProposal,
} from '../../src/model';
import { blocksPng } from './png';

// Posição e Tamanho dos Detalhes num painel estreito (900 px): X, Y, L e A mostram o valor
// inteiro (4 dígitos na revisão, 3 dígitos fora dela), sem o campo cortar (#465, AC1).

test.use({ viewport: { width: 900, height: 700 } });

const NOW = '2026-11-05T12:00:00.000Z';

/** Zip com uma marcação de coordenadas de 4 dígitos e uma proposta que a renomeia. */
async function bigNumbersZip(): Promise<Buffer> {
  let base = createProject({
    name: 'Grande',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
  });
  base = addContainer(base, {
    id: 'I1',
    file: 'images/g.png',
    width: 3000,
    height: 3000,
  });
  base = renameContainer(base, 'I1', 'Tela grande');
  base = createMarking(base, {
    id: 'M1',
    containerId: 'I1',
    name: 'Faixa',
    rect: { x: 1234, y: 1345, width: 1456, height: 1567 },
  });
  const proposal = buildProposal(base, renameMarking(base, 'M1', 'Faixa nova'), {
    id: 'grande',
    title: 'Renomeia',
    description: '',
    origin: 'teste',
    author: 'teste',
    createdAt: NOW,
  });
  const zip = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  zip.file('mapping.json', serialize(base), opts);
  zip.file('images/g.png', blocksPng(3000, 3000, [240, 240, 240], []), opts);
  zip.file(proposalFilePath(proposal.id), serializeProposal(proposal), opts);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

/** Os quatro campos não cortam o valor e cabem em 5 dígitos. */
async function expectFieldsFit(page: Page, digits: number): Promise<void> {
  const fields = page.locator('.props-pair-item .input');
  expect(await fields.count()).toBe(4);
  for (const field of await fields.all()) {
    const m = await field.evaluate((e) => {
      const input = e as HTMLInputElement;
      const probe = document.createElement('span');
      const style = getComputedStyle(input);
      probe.style.font = style.font;
      probe.style.visibility = 'hidden';
      probe.style.position = 'absolute';
      probe.textContent = '0'.repeat(5);
      document.body.append(probe);
      const fiveDigits = probe.getBoundingClientRect().width;
      probe.remove();
      const inner =
        input.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      return {
        value: input.value,
        scroll: input.scrollWidth,
        client: input.clientWidth,
        inner,
        fiveDigits,
      };
    });
    expect(m.value.length).toBeGreaterThanOrEqual(digits);
    expect(m.scroll, `campo ${m.value}`).toBeLessThanOrEqual(m.client);
    // Largura útil para 5 dígitos (menos a folga do spinner, que o tema esconde).
    expect(m.inner, `campo ${m.value}`).toBeGreaterThanOrEqual(m.fiveDigits);
  }
}

test('revisão a 900 px: X, Y, L e A com 4 dígitos cabem inteiros', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'grande.zip',
      mimeType: 'application/zip',
      buffer: await bigNumbersZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit7');
  await page.keyboard.press('Control+Shift+Digit2');
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await page.locator('.tree-row', { hasText: 'Faixa' }).first().click();
  await expect(page.locator('.props-pair-item .input').first()).toBeVisible();
  await expectFieldsFit(page, 4);
});

test('fora da revisão, num painel de 280 px, o Y de 3 dígitos cabe inteiro', async ({
  page,
}) => {
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
  await page.keyboard.press('Control+Shift+Digit2');
  await page.locator('.tree-row', { hasText: 'Cadastrar' }).first().click();
  const y = page.getByRole('spinbutton', { name: 'Y', exact: true });
  await expect(y).toHaveValue('347');
  await expectFieldsFit(page, 2);
});
