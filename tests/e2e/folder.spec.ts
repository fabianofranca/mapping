import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  closeDetails,
  drawMarking,
  isMobile,
  openDetails,
  selectedRect,
  type MappingJson,
  type Rect,
} from './helpers';

// Etapa 3a.2, num Chromium de verdade: projeto de pasta (uma pasta do OPFS faz o papel da
// escolhida em `showDirectoryPicker`, com a mesma API de arquivos), mudanças externas no
// mapping.json e as cópias de referência e de recorte para a área de transferência.

const FOLDER = 'mapeamento-e2e';
const MIME = 'application/x-mapping-item+json';

/** Troca o seletor de pasta por uma pasta do OPFS (a API de arquivos é a mesma). */
async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
}

/** Abre a app, escolhe a "pasta" e cria o projeto nela. */
async function openFolderProject(page: Page, name = 'Pasta'): Promise<void> {
  await stubFolderPicker(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await page.getByRole('textbox').fill(name);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

type FolderMapping = Omit<MappingJson, 'markings'> & {
  readonly revision: number;
  readonly project: { readonly name: string };
  readonly markings: readonly (MappingJson['markings'][number] & {
    readonly name: string | null;
  })[];
};

async function readMapping(page: Page): Promise<FolderMapping> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    // A app pode estar regravando o arquivo nesse instante: o Chrome recusa a leitura
    // (NotReadableError) se o arquivo muda entre o getFile() e o text(). Tenta de novo.
    for (let attempt = 0; ; attempt++) {
      try {
        const file = await (await dir.getFileHandle('mapping.json')).getFile();
        return JSON.parse(await file.text());
      } catch (error) {
        if (
          attempt >= 20 ||
          !(error instanceof DOMException) ||
          error.name !== 'NotReadableError'
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }, FOLDER);
}

/**
 * Outro programa (o MCP, um editor de texto) reescreve o mapping.json da pasta: sobe a
 * revisão e muda o que for pedido. Sem `eval`: a CSP da app vale para o `evaluate` também.
 */
async function externalEdit(
  page: Page,
  change: { readonly projectName?: string; readonly markingName?: string },
): Promise<void> {
  await page.evaluate(
    async ([folder, projectName, markingName]) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(folder);
      const handle = await dir.getFileHandle('mapping.json');
      const mapping = JSON.parse(await (await handle.getFile()).text());
      mapping.revision += 1;
      if (projectName) mapping.project.name = projectName;
      if (markingName) mapping.markings[0].name = markingName;
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(mapping, null, 2));
      await writable.close();
    },
    [FOLDER, change.projectName ?? '', change.markingName ?? ''] as const,
  );
}

async function allowClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Projeto de pasta com uma imagem e uma marcação selecionada. */
async function withMarking(page: Page, info: Parameters<typeof isMobile>[0]) {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  // O salvamento automático espera 800 ms.
  await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);
  return (await readMapping(page)).markings[0]!;
}

const toast = (page: Page, text: string) =>
  page.getByRole('status').filter({ hasText: text });

test('Ctrl+C copia a referência do item selecionado, com os dados do item junto', async ({
  page,
  context,
}, info) => {
  test.skip(isMobile(info), 'atalho de teclado');
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);
  const marking = (await readMapping(page)).markings[0]!;

  await page.keyboard.press('Control+c');
  await expect(toast(page, 'Referência copiada')).toBeVisible();

  const code = marking.id.replaceAll('-', '').slice(0, 8);
  expect(await clipboardText(page)).toMatch(
    new RegExp(`^mapping://${FOLDER}/m/${code} \\(images/tela\\.webp › .+\\)$`),
  );

  // O formato próprio da app vai junto (só a app o lê; o texto é o que o chat recebe).
  const custom = await page.evaluate(
    async ([mime]) => {
      const [item] = await navigator.clipboard.read();
      const type = `web ${mime}`;
      if (!item?.types.includes(type)) return null;
      return JSON.parse(await (await item.getType(type)).text());
    },
    [MIME] as const,
  );
  expect(custom).toMatchObject({
    format: 'mapping-item',
    kind: 'm',
    project: FOLDER,
    item: { id: marking.id },
  });
});

test('Ctrl+Alt+C copia o recorte da marcação como PNG, em pixels da imagem original', async ({
  page,
  context,
}, info) => {
  test.skip(isMobile(info), 'atalho de teclado');
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  const rect: Rect = await selectedRect(page);

  await page.keyboard.press('Control+Alt+c');
  await expect(toast(page, 'Recorte copiado')).toBeVisible();

  const size = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    if (!item?.types.includes('image/png')) return null;
    const bitmap = await createImageBitmap(await item.getType('image/png'));
    return { width: bitmap.width, height: bitmap.height };
  });
  expect(size).toEqual({ width: rect.width, height: rect.height });
});

test('com o foco num campo de texto, Ctrl+C copia o texto do campo', async ({
  page,
  context,
}, info) => {
  test.skip(isMobile(info), 'atalho de teclado');
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));

  const name = page.getByLabel('Nome', { exact: true }).first();
  await name.fill('Porta dianteira');
  await name.press('Control+a');
  await page.keyboard.press('Control+c');

  expect(await clipboardText(page)).toBe('Porta dianteira');
  await expect(toast(page, 'Referência copiada')).toHaveCount(0);
});

test('Detalhes: copiar referência e copiar recorte ao lado do ID', async ({
  page,
  context,
}, info) => {
  await allowClipboard(context);
  const marking = await withMarking(page, info);
  await openDetails(page);
  await page.getByRole('button', { name: 'Copiar referência' }).first().click();
  await expect(toast(page, 'Referência copiada')).toBeVisible();
  const code = marking.id.replaceAll('-', '').slice(0, 8);
  expect(await clipboardText(page)).toContain(`mapping://${FOLDER}/m/${code} (`);

  await page.getByRole('button', { name: 'Copiar recorte' }).click();
  await expect(toast(page, 'Recorte copiado')).toBeVisible();
  await closeDetails(page);
});

test('menu da linha da Árvore (desktop) copia a referência', async ({
  page,
  context,
}, info) => {
  test.skip(isMobile(info), 'a Árvore do celular abre em tela cheia');
  await allowClipboard(context);
  await withMarking(page, info);

  await page.getByRole('button', { name: /^Ações de images\/tela\.webp/ }).click();
  await page.getByRole('menuitem', { name: 'Copiar referência' }).click();
  await expect(toast(page, 'Referência copiada')).toBeVisible();
  expect(await clipboardText(page)).toMatch(/^mapping:\/\/[^/]+\/i\/[0-9a-f]{8} \(/);
});

test('botão direito no canvas seleciona o item e abre o menu de cópia', async ({
  page,
  context,
}, info) => {
  test.skip(isMobile(info), 'o celular usa a Árvore e Detalhes');
  await allowClipboard(context);
  await withMarking(page, info);
  const center = await canvasPoint(page);
  // Tira a seleção para provar que o clique direito seleciona.
  await page.keyboard.press('Escape');

  await page.mouse.click(center.x, center.y, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Menu do item no canvas' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Copiar referência' }).click();
  await expect(menu).toBeHidden();
  await expect(toast(page, 'Referência copiada')).toBeVisible();
  expect(await clipboardText(page)).toMatch(/^mapping:\/\/[^/]+\/m\/[0-9a-f]{8} \(/);
});

test('Ajuda → Atalhos lista os dois atalhos de copiar', async ({ page }, info) => {
  test.skip(isMobile(info), 'a ajuda de atalhos é do desktop');
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByRole('button', { name: 'Ver os atalhos de teclado' }).click();
  const help = page.getByRole('dialog');
  await expect(help.getByText('Copiar a referência do item selecionado')).toBeVisible();
  await expect(help.getByText('Copiar o recorte da marcação selecionada')).toBeVisible();
});

test.describe('mudanças externas no mapping.json', () => {
  test('cada gravação sobe a revisão', async ({ page }, info) => {
    await withMarking(page, info);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const before = (await readMapping(page)).revision;
    await openDetails(page);
    await page.getByLabel('Nome', { exact: true }).first().fill('Porta');
    await page.getByLabel('Nome', { exact: true }).first().press('Enter');
    await expect
      .poll(async () => (await readMapping(page)).revision)
      .toBeGreaterThan(before);
  });

  test('editar o arquivo por fora recarrega a app sozinha, com um aviso discreto', async ({
    page,
  }, info) => {
    test.skip(
      isMobile(info),
      'a conferência é igual no celular; o nome só aparece no desktop',
    );
    await withMarking(page, info);
    await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);

    await externalEdit(page, { markingName: 'Editada por fora' });

    await expect(toast(page, 'Projeto atualizado por fora')).toBeVisible({
      timeout: 10_000,
    });
    // A seleção continua na mesma marcação, já com o nome novo.
    await expect(page.getByLabel('Nome', { exact: true }).first()).toHaveValue(
      'Editada por fora',
    );
  });

  test('editar por fora e dos dois lados abre o diálogo; "Manter as minhas" grava por cima', async ({
    page,
  }, info) => {
    test.skip(isMobile(info), 'o fluxo é o mesmo no celular');
    await withMarking(page, info);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const name = page.getByLabel('Nome', { exact: true }).first();

    // Alteração local ainda não gravada (o salvamento espera 800 ms) + alteração externa.
    await name.fill('Minha marcação');
    await name.press('Enter');
    await externalEdit(page, { projectName: 'Nome do outro programa' });
    const external = await readMapping(page);

    const dialog = page.getByRole('dialog', { name: 'Projeto alterado fora da app' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Manter as minhas' }).click();
    await expect(dialog).toBeHidden();

    await expect
      .poll(async () => (await readMapping(page)).markings[0]?.name)
      .toBe('Minha marcação');
    expect((await readMapping(page)).revision).toBe(external.revision + 1);
  });

  test('"Recarregar" descarta as alterações locais e abre o arquivo como está', async ({
    page,
  }, info) => {
    test.skip(isMobile(info), 'o fluxo é o mesmo no celular');
    await withMarking(page, info);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const name = page.getByLabel('Nome', { exact: true }).first();

    await name.fill('Minha marcação');
    await name.press('Enter');
    await externalEdit(page, { markingName: 'Do outro programa' });

    const dialog = page.getByRole('dialog', { name: 'Projeto alterado fora da app' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Recarregar' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByLabel('Nome', { exact: true }).first()).toHaveValue(
      'Do outro programa',
    );
    // Nada foi gravado por cima do arquivo externo.
    expect((await readMapping(page)).markings[0]?.name).toBe('Do outro programa');
  });
});
