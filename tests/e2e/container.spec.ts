import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, exportMapping, projectAction } from './helpers';

// Etapa Biblioteca, B3: container e componentes desenhados no canvas do produto.

const PACKAGE_DIR = 'examples/libraries/material3';

/** Zip do pacote do Material 3, gerado na hora a partir da pasta do repositório. */
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

test('container com um componente da Biblioteca, sem desenho gravado', async ({
  page,
}) => {
  await createProject(page, 'Telas');
  const host = page.locator('.canvas-host');

  // Novo container (Personalizado, 360×800).
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Configurações');
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', '1');

  // Aplica o pacote do Material 3 por zip.
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

  // Janela Catálogo, aba Paleta (Ctrl+Shift+9) e Adicionar de um botão.
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Paleta' }).click();
  await page.getByRole('button', { name: 'Adicionar Button' }).click();
  await expect(host).toHaveAttribute('data-components', /^[1-9]/);

  // O mapping.json guarda a marcação e a anotação, nada do desenho.
  const { mapping } = await exportMapping(page);
  expect(mapping.schemaVersion).toBe(13);
  expect(mapping.containers).toHaveLength(1);
  expect(mapping.containers[0]).toMatchObject({ file: null, background: '#FFFFFF' });
  expect(mapping.markings).toHaveLength(1);
  expect(mapping.annotations.some((a) => a.type?.typeId === 'm3-button')).toBe(true);
  expect(JSON.stringify(mapping)).not.toMatch(/"(scene|drawing|root|children)"/);
});

test('arrastar um tipo da Paleta até o canvas cria a instância onde cai', async ({
  page,
}) => {
  await createProject(page, 'Arrasto');
  const host = page.locator('.canvas-host');
  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Home');
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
  await expect(host).toHaveAttribute('data-images', '1');

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

  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Paleta' }).click();
  const item = page.locator('li.library-type').filter({
    has: page.getByRole('button', { name: 'Adicionar Button', exact: true }),
  });
  await expect(item).toHaveAttribute('draggable', 'true');
  // Enquadrar tudo: o único container (360 × 800, alto) fica no centro da vista, com vazio dos lados.
  await page.getByRole('button', { name: 'Enquadrar tudo' }).click();
  const canvas = page.getByRole('main', { name: 'Canvas do projeto' });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas sem tamanho');

  // Sobre o container (o centro da vista, enquadrado): a instância nasce nele.
  await item.dragTo(canvas, { targetPosition: { x: box.width / 2, y: box.height / 2 } });
  await expect(host).toHaveAttribute('data-components', /^[1-9]/);

  // No vazio, à esquerda do container (longe do encaixe): marcação do canvas.
  await item.dragTo(canvas, {
    targetPosition: { x: 24, y: box.height / 2 },
    force: true,
  });
  await expect(host).toHaveAttribute('data-components', '2');

  const { mapping } = await exportMapping(page);
  expect(mapping.markings).toHaveLength(2);
  expect(mapping.markings[0]?.containerId).toBe(mapping.containers[0]?.id);
  expect(mapping.markings[1]?.containerId).toBeNull();
});
