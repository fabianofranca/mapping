import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createProject, projectAction } from './helpers';

// Etapa Biblioteca, B5: Catálogo aberto pela tela inicial (sem projeto) e de dentro do projeto.

const PACKAGE_DIR = 'examples/libraries/material3';

/** Zip do pacote do Material 3, gerado na hora a partir da pasta do repositório. */
async function packageZip(extraDoc?: {
  readonly path: string;
  readonly append: string;
}): Promise<Buffer> {
  const zip = new JSZip();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const rel = relative(PACKAGE_DIR, path);
        const bytes = readFileSync(path);
        zip.file(
          rel,
          extraDoc?.path === rel ? `${bytes.toString('utf8')}${extraDoc.append}` : bytes,
        );
      }
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

test('Abrir biblioteca: só a lista e a página rolam; link volta ao topo e o aviso fica à vista', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[data-library-zip]').setInputFiles({
    name: 'material3.zip',
    mimeType: 'application/zip',
    buffer: await packageZip({
      path: 'docs/m3-button.md',
      append:
        '\n\n[Ver o Chip](mapping://material3/m3-chip)\n\n[Destino que não existe](mapping://material3/nao-existe)\n',
    }),
  });
  const screen = page.getByRole('main', { name: 'Catálogo da biblioteca' });
  await screen
    .getByRole('navigation', { name: 'Componentes' })
    .locator('button[data-type-id="m3-button"]')
    .click();
  const article = screen.getByRole('article', { name: 'Button' });
  await expect(article).toBeVisible();

  const detail = page.locator('.catalog-detail');
  const scrollDetail = () =>
    detail.evaluate((el) => {
      el.scrollTop = 400;
      return el.scrollTop;
    });
  expect(await scrollDetail()).toBeGreaterThan(0);
  // A janela não rola: quem rola é a página do componente.
  expect(
    await page.evaluate(
      () => (document.scrollingElement?.scrollHeight ?? 0) <= window.innerHeight,
    ),
  ).toBe(true);

  await article.getByRole('link', { name: 'Ver o Chip' }).click();
  await expect(screen.getByRole('article', { name: 'Chip' })).toBeVisible();
  await expect.poll(() => detail.evaluate((el) => el.scrollTop)).toBe(0);

  // Link para destino inexistente: o aviso fica dentro da área visível.
  await screen
    .getByRole('navigation', { name: 'Componentes' })
    .locator('button[data-type-id="m3-button"]')
    .click();
  await expect(article).toBeVisible();
  expect(await scrollDetail()).toBeGreaterThan(0);
  await article.getByRole('link', { name: 'Destino que não existe' }).click();
  await expect(page.locator('.catalog-notice')).toBeInViewport();
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
