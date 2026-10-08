import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addImage,
  canvasPoint,
  closeDetails,
  drawMarking,
  exportMapping,
  isMobile,
  openDetails,
  projectAction,
} from './helpers';

// Etapa 3b.3, roteiro de teste manual da 3b, passos 1 a 5: atualizar a SDUI para a v2,
// repositórios por plataforma, o Screen com `codeRef` (editor, Detalhes, Lista e resumo),
// "Abrir no repositório" (só o `href`: nenhuma navegação) e "Copiar caminho", e uma
// entrada de plataforma não declarada (editando o JSON por fora) como incompleta.

const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
const FOLDER = 'mapeamento-codigo';
const ANDROID_URL = 'https://github.com/org/app-android/blob/main/{path}#L{line}';
const SCREEN_KT = 'app/src/main/java/com/app/cadastro/CadastroScreen.kt';
const VIEW_MODEL_KT = 'app/src/main/java/com/app/cadastro/CadastroViewModel.kt';
const VIEW_SWIFT = 'App/Cadastro/CadastroView.swift';

/** Troca o seletor de pasta por uma pasta do OPFS (a API de arquivos é a mesma). */
async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
}

async function openFolderProject(page: Page): Promise<void> {
  await stubFolderPicker(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await page.getByRole('textbox').fill('Roteiro 3b');
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

/** A SDUI v1 (sem plataformas, `code` nem a camada Telas): o ponto de partida do passo 1. */
async function sduiV1(): Promise<Buffer> {
  const spec = JSON.parse(await readFile(SDUI, 'utf8')) as Record<string, unknown>;
  const layers = (spec.layers as { id: string; annotationTypes: object[] }[])
    .filter((layer) => layer.id !== 'telas')
    .map((layer) => ({
      ...layer,
      annotationTypes: layer.annotationTypes.map((type) => {
        const { code: _code, ...rest } = type as Record<string, unknown>;
        return rest;
      }),
    }));
  delete spec.platforms;
  return Buffer.from(JSON.stringify({ ...spec, formatVersion: 1, version: 1, layers }));
}

const specInput = (page: Page) =>
  page.locator('input[type=file][accept=".json,application/json"]');

/** Aplica a SDUI v1 e atualiza para a v2 pelo diálogo (passo 1 do roteiro). */
async function updateSduiToV2(page: Page): Promise<void> {
  await projectAction(page, 'Especializações');
  await specInput(page).setInputFiles({
    name: 'sdui-v1.json',
    mimeType: 'application/json',
    buffer: await sduiV1(),
  });
  await expect(page.getByRole('status').filter({ hasText: 'aplicada' })).toBeVisible();
  // Sem plataformas na v1.
  await expect(page.getByText('Plataformas', { exact: true })).toHaveCount(0);

  // O arquivo vai direto ao seletor (sem abrir o escolhedor nativo do navegador).
  await expect(page.getByRole('button', { name: 'Atualizar versão…' })).toBeVisible();
  await specInput(page).setInputFiles(SDUI);
  const confirm = page.getByRole('dialog', { name: 'Atualizar "SDUI"?' });
  await expect(confirm).toContainText('Camadas novas: Telas');
  await confirm.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'versão 2' })).toBeVisible();
}

async function closeDialog(page: Page): Promise<void> {
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();
}

/** Abre uma janela da base: aba no desktop; tela cheia, pelo menu Painéis, no celular. */
async function openBottomWindow(
  page: Page,
  info: Parameters<typeof isMobile>[0],
  name: 'Lista de anotações' | 'Incompletas',
): Promise<void> {
  if (!isMobile(info)) {
    await page.getByRole('button', { name: `Mostrar ${name}` }).click();
    return;
  }
  await closeDetails(page);
  await page.getByRole('button', { name: /^Painéis/ }).click();
  await page
    .getByRole('dialog', { name: 'Painéis e ações' })
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click();
}

async function openSettings(page: Page): Promise<void> {
  await projectAction(page, 'Configurações');
  await expect(
    page.getByRole('heading', { name: 'Repositórios de código' }),
  ).toBeVisible();
}

/** Configurações → Repositórios: `android` com endereço e caminho local; `ios` vazio. */
async function configureRepos(page: Page): Promise<void> {
  await openSettings(page);
  const android = page.getByRole('group', { name: 'Android' });
  const url = android.getByLabel('Endereço do arquivo');
  await url.fill('ftp://servidor/{path}');
  await url.press('Enter');
  await expect(android.getByRole('alert')).toContainText('http:// ou https://');
  await url.fill(ANDROID_URL);
  await url.press('Enter');
  await expect(android.getByRole('alert')).toHaveCount(0);
  const local = android.getByLabel('Caminho local da raiz');
  await local.fill('../../..');
  await local.press('Enter');
  await expect(url).toHaveValue(ANDROID_URL);
  await expect(local).toHaveValue('../../..');
}

/** Marcação "Formulário" com a SDUI v2 aplicada e o Screen `Cadastro` criado e preenchido. */
async function createScreen(
  page: Page,
  info: Parameters<typeof isMobile>[0],
): Promise<void> {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  await configureRepos(page);
  await closeDialog(page);

  await openDetails(page);
  await page.getByRole('button', { name: 'Adicionar anotação na camada Telas' }).click();
  await page.getByRole('button', { name: /^Screen/ }).click();
  await page.getByLabel('nome', { exact: true }).fill('Cadastro');
  await page.getByLabel('nome', { exact: true }).press('Enter');
  await page.getByLabel('rota', { exact: true }).fill('/cadastro');
  await page.getByLabel('rota', { exact: true }).press('Enter');

  const add = page.getByRole('button', { name: '+ Entrada' });
  const entries = page.getByRole('list', { name: 'implementação' }).getByRole('listitem');
  const fill = async (
    index: number,
    platform: string,
    path: string,
    line?: string,
  ): Promise<void> => {
    await add.click();
    const entry = entries.nth(index);
    await expect(entry).toBeVisible();
    await entry
      .getByRole('combobox', { name: 'Plataforma' })
      .selectOption({ label: platform });
    await entry.getByRole('textbox', { name: 'Caminho', exact: true }).fill(path);
    await entry.getByRole('textbox', { name: 'Caminho', exact: true }).press('Enter');
    if (line) {
      await entry.getByRole('textbox', { name: 'Linha', exact: true }).fill(line);
      await entry.getByRole('textbox', { name: 'Linha', exact: true }).press('Enter');
    }
  };
  await fill(0, 'Android', SCREEN_KT);
  await fill(1, 'Android', VIEW_MODEL_KT, '42');
  await fill(2, 'iOS', VIEW_SWIFT);
}

test('passo 1: atualizar a SDUI para a v2 mostra a camada Telas e as plataformas', async ({
  page,
}, info) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  await updateSduiToV2(page);

  // As plataformas de cada especialização: nome, id e linguagem.
  const specs = page.getByRole('dialog', { name: 'Especializações' });
  await expect(specs.getByText('Android · android · kotlin')).toBeVisible();
  await expect(specs.getByText('iOS · ios · swift')).toBeVisible();
  await expect(specs.getByText('Contrato SDUI · bff · json')).toBeVisible();
  await closeDialog(page);

  // A camada Telas veio com a atualização (o painel de Camadas, no desktop, lista todas).
  await openDetails(page);
  await expect(
    page.getByRole('button', { name: 'Adicionar anotação na camada Telas' }),
  ).toBeVisible();
  const { mapping } = await exportMapping(page);
  expect(mapping.layers.map((l) => l.name)).toContain('Telas');
  expect(mapping.schemaVersion).toBe(7);
});

test('passo 2: repositórios por plataforma, com os erros da validação', async ({
  page,
}, info) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  await configureRepos(page);

  // O ios fica vazio; o aviso só aparece quando uma entrada usa a plataforma (passo 3).
  const ios = page.getByRole('group', { name: 'iOS' });
  await expect(ios.getByLabel('Endereço do arquivo')).toHaveValue('');
  await expect(page.getByText('sem repositório')).toHaveCount(0);

  const android = page.getByRole('group', { name: 'Android' });
  const local = android.getByLabel('Caminho local da raiz');
  await local.fill('/abs/olute');
  await local.press('Enter');
  await expect(android.getByRole('alert')).toContainText('relativo à pasta do projeto');
  await expect(local).toHaveValue('../../..');

  // Limpar remove a configuração da plataforma.
  await android.getByRole('button', { name: 'Limpar repositório de Android' }).click();
  await expect(android.getByLabel('Endereço do arquivo')).toHaveValue('');
  await expect(
    android.getByRole('button', { name: 'Limpar repositório de Android' }),
  ).toBeDisabled();
  await closeDialog(page);
  const { mapping } = await exportMapping(page);
  expect(mapping).toMatchObject({ platformRepos: {} });
});

test('passo 3: Screen com codeRef nos Detalhes, na Lista, no resumo e com o aviso', async ({
  page,
}, info) => {
  await createScreen(page, info);

  // Detalhes: uma linha por entrada, "<plataforma> · <arquivo>[:linha]".
  const entries = page.getByRole('list', { name: 'implementação' }).getByRole('listitem');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0).locator('.code-entry-name')).toHaveText(
    'Android · CadastroScreen.kt',
  );
  await expect(entries.nth(1).locator('.code-entry-name')).toHaveText(
    'Android · CadastroViewModel.kt:42',
  );
  await expect(entries.nth(2).locator('.code-entry-name')).toHaveText(
    'iOS · CadastroView.swift',
  );
  await expect(page.getByText('3 entradas')).toBeVisible();
  // Nenhuma pendência.
  await expect(page.locator('.issues')).toHaveCount(0);

  // Resumo da anotação recolhida: só as plataformas distintas, na ordem de aparição.
  await page
    .getByRole('button', { name: /^Telas/ })
    .first()
    .click();
  await expect(page.getByText('implementação: Android, iOS')).toBeVisible();
  await page
    .getByRole('button', { name: /^Telas/ })
    .first()
    .click();

  // O aviso: iOS sem repositório, nas Configurações.
  await openSettings(page);
  const warning = page.getByRole('group', { name: 'iOS' }).getByRole('status');
  await expect(warning).toHaveText(/iOS sem repositório: 1 referência de código/);
  await expect(
    page.getByRole('group', { name: 'Android' }).getByRole('status'),
  ).toHaveCount(0);
  await closeDialog(page);

  // Lista: uma linha por entrada, com o caminho completo na dica (desktop).
  await openBottomWindow(page, info, 'Lista de anotações');
  const list = page.getByRole('region', { name: 'Lista de anotações' });
  await expect(list).toBeVisible();
  await expect(
    list.getByText('Android · CadastroScreen.kt', { exact: true }),
  ).toBeVisible();
  await expect(
    list.getByText('Android · CadastroViewModel.kt:42', { exact: true }),
  ).toBeVisible();
  await expect(list.getByText('iOS · CadastroView.swift', { exact: true })).toBeVisible();
  if (!isMobile(info)) {
    await list.getByText('iOS · CadastroView.swift', { exact: true }).hover();
    await expect(list.locator('.tooltip', { hasText: VIEW_SWIFT }).first()).toBeVisible();
  } else {
    // Sem hover: o caminho completo fica visível.
    await expect(list.locator('.code-entry-path', { hasText: VIEW_SWIFT })).toBeVisible();
  }
});

test('passo 4: "Abrir no repositório" (href certo, com e sem linha) e "Copiar caminho"', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createScreen(page, info);

  const entries = page.getByRole('list', { name: 'implementação' }).getByRole('listitem');
  const open = (index: number) =>
    entries.nth(index).getByRole('link', { name: /^Abrir no repositório/ });

  // Sem linha: o trecho "#L{line}" sai do endereço. Com linha: "#L42".
  await expect(open(0)).toHaveAttribute(
    'href',
    `https://github.com/org/app-android/blob/main/${SCREEN_KT}`,
  );
  await expect(open(1)).toHaveAttribute(
    'href',
    `https://github.com/org/app-android/blob/main/${VIEW_MODEL_KT}#L42`,
  );
  // Link comum, em outra aba e sem o endereço da app.
  await expect(open(0)).toHaveAttribute('target', '_blank');
  await expect(open(0)).toHaveAttribute('rel', 'noopener noreferrer');
  // A plataforma sem repositório não tem o link.
  await expect(
    entries.nth(2).getByRole('link', { name: /Abrir no repositório/ }),
  ).toHaveCount(0);

  // Copiar caminho: o caminho do arquivo no repositório, com confirmação.
  await entries
    .nth(2)
    .getByRole('button', { name: /^Copiar caminho/ })
    .click();
  await expect(entries.nth(2).getByRole('status')).toHaveText('Caminho copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(VIEW_SWIFT);
  await entries
    .nth(1)
    .getByRole('button', { name: /^Copiar caminho/ })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(VIEW_MODEL_KT);

  // O mesmo na Lista.
  await openBottomWindow(page, info, 'Lista de anotações');
  const list = page.getByRole('region', { name: 'Lista de anotações' });
  await expect(
    list.getByRole('link', { name: /^Abrir no repositório: CadastroViewModel\.kt/ }),
  ).toHaveAttribute(
    'href',
    `https://github.com/org/app-android/blob/main/${VIEW_MODEL_KT}#L42`,
  );
  await list.getByRole('button', { name: `Copiar caminho: ${SCREEN_KT}` }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SCREEN_KT);

  // O que foi gravado: ids estáveis e platformRepos.
  const { mapping } = await exportMapping(page);
  expect(mapping).toMatchObject({
    schemaVersion: 7,
    platformRepos: { android: { urlTemplate: ANDROID_URL, localPath: '../../..' } },
  });
  const screen = mapping.annotations.find((a) => a.type?.typeId === 'screen');
  expect(screen?.values).toMatchObject({ nome: 'Cadastro', rota: '/cadastro' });
  expect(screen?.values?.implementacao).toEqual([
    expect.objectContaining({ platform: 'android', path: SCREEN_KT, line: null }),
    expect.objectContaining({ platform: 'android', path: VIEW_MODEL_KT, line: 42 }),
    expect.objectContaining({ platform: 'ios', path: VIEW_SWIFT }),
  ]);
});

test('passo 5: entrada com plataforma não declarada (JSON editado por fora) fica incompleta', async ({
  page,
}, info) => {
  await createScreen(page, info);
  await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);
  await expect.poll(async () => implementacaoOf(await readMapping(page)).length).toBe(3);

  await appendWebEntry(page);
  await expect(
    page.getByRole('status').filter({ hasText: 'Projeto atualizado por fora' }),
  ).toBeVisible({ timeout: 10_000 });

  // A entrada aparece na lista, com a plataforma original (o id) e os motivos.
  const entries = page.getByRole('list', { name: 'implementação' }).getByRole('listitem');
  await expect(entries).toHaveCount(4);
  await expect(entries.nth(3).locator('.code-entry-name')).toHaveText('web · Web.ts');
  const issues = entries.nth(3).locator('.code-entry-issues');
  await expect(issues).toContainText('plataforma não declarada pela especialização');
  // A anotação conta como incompleta (aviso nos Detalhes e aba Incompletas).
  await expect(page.getByText('Incompleta: 1 pendência')).toBeVisible();
  await openBottomWindow(page, info, 'Incompletas');
  const incomplete = page.getByRole('region', { name: 'Incompletas' });
  await expect(incomplete).toContainText('Screen · Cadastro');
  await expect(incomplete).toContainText('plataforma não declarada pela especialização');
});

async function readMapping(page: Page): Promise<{
  revision: number;
  annotations: {
    type: { typeId: string } | null;
    values: Record<string, unknown> | null;
  }[];
}> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    const file = await (await dir.getFileHandle('mapping.json')).getFile();
    return JSON.parse(await file.text());
  }, FOLDER);
}

function implementacaoOf(mapping: Awaited<ReturnType<typeof readMapping>>): unknown[] {
  const screen = mapping.annotations.find((a) => a.type?.typeId === 'screen');
  const value = screen?.values?.implementacao;
  return Array.isArray(value) ? value : [];
}

/** Outro programa acrescenta, no `mapping.json`, uma entrada da plataforma `web` (não declarada). */
async function appendWebEntry(page: Page): Promise<void> {
  await page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    const handle = await dir.getFileHandle('mapping.json');
    const mapping = JSON.parse(await (await handle.getFile()).text());
    mapping.revision += 1;
    const screen = mapping.annotations.find(
      (a: { type: { typeId: string } | null }) => a.type?.typeId === 'screen',
    );
    screen.values.implementacao.push({
      _id: 'externa',
      platform: 'web',
      path: 'src/Web.ts',
      symbol: null,
      line: null,
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(mapping, null, 2));
    await writable.close();
  }, FOLDER);
}
