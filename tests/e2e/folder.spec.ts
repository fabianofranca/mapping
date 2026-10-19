import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  addImage,
  canvasPoint,
  drawMarking,
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
async function withMarking(page: Page) {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  // O salvamento automático espera o debounce (`AUTOSAVE_DELAY_MS`).
  await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);
  return (await readMapping(page)).markings[0]!;
}

const toast = (page: Page, text: string) =>
  page.getByRole('status').filter({ hasText: text });

test('Ctrl+C copia a referência do item selecionado, com os dados do item junto', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await expect.poll(async () => (await readMapping(page)).markings.length).toBe(1);
  const marking = (await readMapping(page)).markings[0]!;

  await page.keyboard.press('Control+c');
  await expect(toast(page, 'Referência copiada')).toBeVisible();

  const code = marking.id.replaceAll('-', '').slice(0, 8);
  expect(await clipboardText(page)).toMatch(
    // Imagem sem nome: o nome do arquivo sem a pasta, como no `resolve` do MCP (6.4).
    new RegExp(`^mapping://${FOLDER}/m/${code} \\(tela\\.webp › .+\\)$`),
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
}) => {
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
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
}) => {
  await allowClipboard(context);
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));

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
}) => {
  await allowClipboard(context);
  const marking = await withMarking(page);
  await page.getByRole('button', { name: 'Copiar referência' }).first().click();
  await expect(toast(page, 'Referência copiada')).toBeVisible();
  const code = marking.id.replaceAll('-', '').slice(0, 8);
  expect(await clipboardText(page)).toContain(`mapping://${FOLDER}/m/${code} (`);

  await page.getByRole('button', { name: 'Copiar recorte' }).click();
  await expect(toast(page, 'Recorte copiado')).toBeVisible();
});

test('menu da linha da Árvore (desktop) copia a referência', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  await withMarking(page);

  await page.getByRole('button', { name: /^Ações de images\/tela\.webp/ }).click();
  await page.getByRole('menuitem', { name: 'Copiar referência' }).click();
  await expect(toast(page, 'Referência copiada')).toBeVisible();
  expect(await clipboardText(page)).toMatch(/^mapping:\/\/[^/]+\/i\/[0-9a-f]{8} \(/);
});

test('botão direito no canvas seleciona o item e abre o menu de cópia', async ({
  page,
  context,
}) => {
  await allowClipboard(context);
  await withMarking(page);
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

test('Ajuda → Atalhos lista os dois atalhos de copiar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByRole('button', { name: 'Ver os atalhos de teclado' }).click();
  const help = page.getByRole('dialog');
  await expect(help.getByText('Copiar a referência do item selecionado')).toBeVisible();
  await expect(help.getByText('Copiar o recorte da marcação selecionada')).toBeVisible();
});

// Antes R6.2 do guia (fechar a aba no meio da gravação): a extensão do navegador não fecha
// a aba da app, então a cobertura de perda de dados vem daqui.
test('fechar a página logo depois de editar não perde a marcação (R6.2)', async ({
  page,
  context,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));

  // Fecha sem esperar o debounce. Se a app avisar ("Sair da página?"), escolhe ficar, espera
  // o Salvo e fecha de novo; se a gravação do `pagehide` bastar, a página fecha de uma vez.
  let warned = false;
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') warned = true;
    void dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  if (warned && !page.isClosed()) {
    await expect(page.getByText('Salvo', { exact: true }).first()).toBeVisible();
    await page.close({ runBeforeUnload: true });
  }

  // Outra aba do mesmo contexto (mesmo OPFS e mesmos recentes) reabre a pasta.
  const reopened = await context.newPage();
  await stubFolderPicker(reopened);
  await reopened.goto('/');
  await reopened.getByRole('button', { name: /Abrir pasta/ }).click();
  await expect(reopened.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await expect.poll(async () => (await readMapping(reopened)).markings.length).toBe(1);
  const mapping = await readMapping(reopened);
  expect(mapping.markings[0]?.imageId).toBe(mapping.images[0]?.id);
});

// R6.1 do guia: renomear (Enter) e, logo em seguida, começar a arrastar e apertar Esc sem
// soltar. A gravação do nome sai ~250 ms depois do Enter (debounce da sessão); o arraste
// cancelado não pode chegar ao disco nem à tela. `lateEsc` espera a gravação antes do arraste.
for (const lateEsc of [false, true]) {
  test(`renomear e cancelar o arraste com Esc deixa o nome novo e o rect antigo (R6.1, Esc ${
    lateEsc ? 'depois' : 'antes'
  } da gravação)`, async ({ page }) => {
    const marking = await withMarking(page);
    const center = await canvasPoint(page);
    const before = await selectedRect(page);
    expect(marking.rect).toEqual(before);
    const base = (await readMapping(page)).revision;

    const name = page.getByLabel('Nome', { exact: true });
    await name.fill('Título R6');
    await name.press('Enter');
    if (lateEsc) {
      await expect
        .poll(async () => (await readMapping(page)).markings[0]?.name)
        .toBe('Título R6');
      await expect(page.getByText('Salvo', { exact: true }).first()).toBeVisible();
    }

    // Botão no meio da marcação (longe das alças), desloca bem mais que o limiar e aperta
    // Esc sem soltar.
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y + 40, { steps: 6 });
    await page.mouse.move(center.x + 120, center.y + 80, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.move(center.x + 140, center.y + 90, { steps: 3 });
    await page.mouse.up();

    // Tela: a marcação voltou ao lugar e o nome novo ficou.
    await expect(name).toHaveValue('Título R6');
    expect(await selectedRect(page)).toEqual(before);

    // Disco: depois de Salvo, nome novo com o rect antigo e uma só gravação de conteúdo novo.
    await expect(page.getByText('Salvo', { exact: true }).first()).toBeVisible();
    await expect
      .poll(async () => (await readMapping(page)).markings[0]?.name)
      .toBe('Título R6');
    const saved = await readMapping(page);
    expect(saved.markings[0]?.rect).toEqual(marking.rect);
    expect(saved.revision).toBe(base + 1);
    // Nada mais é gravado depois (a posição do arraste não aparece).
    await page.waitForTimeout(800);
    const later = await readMapping(page);
    expect(later.markings[0]?.rect).toEqual(marking.rect);
    expect(later.revision).toBe(base + 1);
  });
}

test.describe('mudanças externas no mapping.json', () => {
  test('cada gravação sobe a revisão', async ({ page }) => {
    await withMarking(page);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const before = (await readMapping(page)).revision;
    await page.getByLabel('Nome', { exact: true }).first().fill('Porta');
    await page.getByLabel('Nome', { exact: true }).first().press('Enter');
    await expect
      .poll(async () => (await readMapping(page)).revision)
      .toBeGreaterThan(before);
  });

  test('editar o arquivo por fora recarrega a app sozinha, com um aviso discreto', async ({
    page,
  }) => {
    await withMarking(page);
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
  }) => {
    await withMarking(page);
    await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
    const name = page.getByLabel('Nome', { exact: true }).first();

    // Alteração local ainda não gravada (o salvamento espera o debounce) + alteração externa.
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
  }) => {
    await withMarking(page);
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

// Fase 6.6: recentes de pasta na tela inicial. Aqui a "pasta" é do OPFS, que o seletor de
// verdade nunca devolve: a app não a guarda (o Chromium derruba a página ao ler de volta do
// IndexedDB um handle do OPFS). O fluxo da lista, do clique e do aviso é exercido com uma
// entrada gravada direto no banco dos recentes, sem handle; o de abrir pelo handle fica nos
// testes do controller (handles falsos: granted, prompt, denied, NotFoundError).
test.describe('recentes de pasta', () => {
  async function closeProject(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Ações do projeto' }).click();
    await page.getByRole('button', { name: 'Fechar projeto', exact: true }).click();
  }

  /** Grava uma entrada dos recentes (nome do projeto e da pasta, sem handle) no IndexedDB. */
  async function seedRecentFolder(page: Page, name: string, folderName: string) {
    await page.evaluate(
      async ([projectName, folder]) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('mapping-folders');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('folders', 'readwrite');
          tx.objectStore('folders').put({
            id: 'semeada',
            name: projectName,
            folderName: folder,
            usedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      [name, folderName] as const,
    );
  }

  test('uma pasta do OPFS não entra nos recentes, e a app segue de pé', async ({
    page,
  }) => {
    await openFolderProject(page, 'Privada');
    await addImage(page);
    await closeProject(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Começar' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Privada' })).toHaveCount(0);
  });

  test('a lista traz a pasta guardada; sem acesso, o aviso tem Localizar pasta… e Remover da lista', async ({
    page,
  }) => {
    await stubFolderPicker(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Começar' })).toBeVisible();
    await seedRecentFolder(page, 'Guardada', 'pasta-guardada');

    // Outra visita: a lista vem do IndexedDB, com o selo e o nome da pasta.
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: 'Guardada' });
    await expect(row.getByText('Pasta', { exact: true })).toBeVisible();
    await expect(row.getByText('pasta-guardada')).toBeVisible();

    await row.getByRole('button', { name: 'Abrir', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Pasta indisponível' });
    await expect(dialog).toBeVisible();

    // A pasta escolhida (vazia) não tem mapping.json: o aviso continua, com o motivo.
    await dialog.getByRole('button', { name: 'Localizar pasta…' }).click();
    await expect(dialog.getByRole('alert')).toContainText('não tem um mapping.json');

    await dialog.getByRole('button', { name: 'Remover da lista' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Começar' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Guardada' })).toHaveCount(0);
  });
});
