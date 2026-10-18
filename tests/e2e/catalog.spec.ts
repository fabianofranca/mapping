import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, projectAction } from './helpers';

// Etapa Biblioteca, B5: Catálogo aberto pela tela inicial (sem projeto) e de dentro do projeto.

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

test('Abrir biblioteca: lista, página do Button e playground que redesenha', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[data-library-zip]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip(),
  });

  const screen = page.getByRole('main', { name: 'Catálogo da biblioteca' });
  await expect(screen).toBeVisible();
  await expect(screen.locator('.catalog-screen-title')).toHaveText(
    'Material Design 3 (baseline)',
  );

  // Validação no topo e os 15 componentes na lista, por camada.
  const validation = screen.getByRole('region', { name: 'Validação do pacote' });
  await expect(validation).toContainText('0 erro(s) e 42 aviso(s)');
  const list = screen.getByRole('navigation', { name: 'Componentes' });
  await expect(list.locator('button[data-type-id]')).toHaveCount(15);

  // Busca filtra a lista.
  await screen.getByRole('searchbox', { name: 'Buscar componente' }).fill('chip');
  await expect(list.locator('button[data-type-id]')).toHaveCount(1);
  await screen.getByRole('searchbox', { name: 'Buscar componente' }).fill('');
  await expect(list.locator('button[data-type-id]')).toHaveCount(15);

  // Página do Button.
  await list.locator('button[data-type-id="m3-button"]').click();
  const article = screen.getByRole('article', { name: 'Button' });
  await expect(article).toBeVisible();
  for (const heading of [
    'Documento',
    'Propriedades',
    'Código',
    'Origens',
    'Galeria',
    'Experimentar',
  ]) {
    await expect(article.getByRole('heading', { name: heading })).toBeVisible();
  }

  // Playground: mudar o Label muda a imagem desenhada.
  const drawing = article.getByRole('img', { name: /Desenho de Button/ });
  await expect(drawing).toBeVisible();
  const before = await drawing.getAttribute('src');
  expect(before).toBeTruthy();
  const label = article.getByLabel('Label', { exact: true });
  await label.fill('Confirmar compra');
  await label.press('Enter');
  await expect
    .poll(() =>
      article.getByRole('img', { name: /Desenho de Button/ }).getAttribute('src'),
    )
    .not.toBe(before);

  // Restaurar valores volta ao desenho inicial.
  await article.getByRole('button', { name: 'Restaurar valores' }).click();
  await expect
    .poll(() =>
      article.getByRole('img', { name: /Desenho de Button/ }).getAttribute('src'),
    )
    .toBe(before);

  // Voltar à tela inicial.
  await screen.getByRole('button', { name: 'Voltar à tela inicial' }).click();
  await expect(screen).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir biblioteca' })).toBeVisible();
});

test('dentro de um projeto: aplicar o pacote, abrir o Catálogo e adicionar um componente', async ({
  page,
}) => {
  await createProject(page, 'Telas');
  const host = page.locator('.canvas-host');

  await page.getByRole('button', { name: 'Nova tela em branco' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Configurações');
  await dialog.getByRole('button', { name: 'Criar tela' }).click();
  await expect(dialog).toBeHidden();

  // Sem pacote aplicado: estado vazio com o atalho para Especializações.
  await page.keyboard.press('Control+Shift+9');
  await expect(
    page.getByText('Nenhuma biblioteca com componentes aplicada.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir Especializações' })).toBeVisible();

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

  // Aba Componentes: escolher o Button abre a página num diálogo com Adicionar à tela.
  const entry = page.locator('button[data-type-id="m3-button"]');
  await expect(entry).toBeVisible();
  await entry.click();
  const pageDialog = page.getByRole('dialog', { name: 'Button' });
  await expect(pageDialog).toBeVisible();
  await pageDialog.getByRole('button', { name: 'Adicionar à tela' }).click();
  await expect(host).toHaveAttribute('data-components', /^[1-9]/);
});
