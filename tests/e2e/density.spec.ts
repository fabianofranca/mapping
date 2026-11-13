import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, exportMapping, projectAction } from './helpers';

// D2 (#1104): o campo Densidade nos Detalhes do container e no Novo container, a sugestão pelos
// tamanhos prontos e o Aplicar, na app de verdade.

const PACKAGE_DIR = 'tests/fixtures/material3';

async function packageZip(): Promise<Buffer> {
  const zip = new JSZip();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else zip.file(relative(PACKAGE_DIR, path), readFileSync(path));
    }
  };
  walk(PACKAGE_DIR);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('captura 3x: sugestão, Aplicar, desfazer numa entrada e gravação da densidade', async ({
  page,
}) => {
  await createProject(page, 'Captura');

  // Pacote do Material 3 (traz o tamanho pronto Celular 360 × 800).
  await projectAction(page, 'Especializações');
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip(),
  });
  const confirm = page.getByRole('button', { name: 'Aplicar', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'aplicada' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();

  // Novo container 1080 × 2400: o campo Densidade existe, vem em 1x e não grava a chave.
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Captura 3x');
  await dialog.getByLabel('Largura').fill('1080');
  await dialog.getByLabel('Altura').fill('2400');
  await expect(dialog.getByLabel('Densidade', { exact: true })).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();

  // Detalhes: a sugestão aparece (1080 = 3 × 360) e o Aplicar a grava.
  const details = page.locator('.props');
  const density = details.getByLabel('Densidade', { exact: true });
  await expect(density).toHaveValue('1');
  await expect(details.getByText('Sugestão: 3x (Celular 360 × 800)')).toBeVisible();
  await details.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(density).toHaveValue('3');
  await expect(details.getByText(/Sugestão/)).toBeHidden();
  await expect(
    details.getByRole('button', { name: 'Aplicar', exact: true }),
  ).toBeHidden();

  // Ctrl+Z volta numa entrada só (foco fora de campo).
  await page.getByRole('heading', { name: 'Detalhes' }).first().click();
  await page.keyboard.press('Control+z');
  await expect(density).toHaveValue('1');
  await expect(details.getByText('Sugestão: 3x (Celular 360 × 800)')).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(density).toHaveValue('3');

  // Personalizada aceita 2,625 e recusa 0,2.
  await density.selectOption('custom');
  const custom = details.getByLabel('Densidade personalizada');
  await custom.fill('0,2');
  await custom.press('Enter');
  await expect(details.getByRole('alert')).toHaveText('Use um número de 0,5 a 8.');
  await custom.fill('2,625');
  await custom.press('Enter');
  await expect(details.getByRole('alert')).toBeHidden();
  await expect(custom).toHaveValue('2,625');

  const { mapping } = await exportMapping(page);
  expect(mapping.schemaVersion).toBe(20);
  expect(mapping.containers).toHaveLength(1);
  expect(mapping.containers[0]).toMatchObject({
    width: 1080,
    height: 2400,
    density: 2.625,
  });
});

test('Novo container grava a densidade escolhida', async ({ page }) => {
  await createProject(page, 'Densidade');
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Tela');
  await dialog.getByLabel('Densidade', { exact: true }).selectOption('2');
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
  const { mapping } = await exportMapping(page);
  expect(mapping.containers[0]).toMatchObject({ density: 2 });
});
