import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addImage,
  canvasPoint,
  drawMarking,
  exportMapping,
  projectAction,
} from './helpers';

// Etapas 3b.3, 9 e Código de instanciação (o R3 do guia do testador): atualizar a SDUI para a
// versão com `repo` (formatVersion 5), o `repo` da especialização em leitura nas Configurações
// com só o caminho local editável, a linha "Definição" nos Detalhes ("Abrir no repositório" já
// pela especialização, sem configurar nada, só o `href`: nenhuma navegação, e "Copiar
// caminho"), o Screen sem campo de código, a importação de uma especialização antiga com o
// campo `codeRef` (ignorado, com aviso) e o clone local editado por fora no `mapping.json`.

const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
const FOLDER = 'mapeamento-codigo';
const ANDROID_REPO = {
  url: 'https://github.com/org/app-android',
  urlTemplate: 'https://github.com/org/app-android/blob/main/{path}',
  ref: 'v1.2.0',
};
const DS_BUTTON_KT = 'app/src/main/java/com/app/ds/DSButton.kt';
const DS_BUTTON_SWIFT = 'App/DesignSystem/DSButton.swift';

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
        const copy = { ...(type as Record<string, unknown>) };
        delete copy.code;
        return copy;
      }),
    }));
  delete spec.platforms;
  return Buffer.from(JSON.stringify({ ...spec, formatVersion: 1, version: 1, layers }));
}

/**
 * A SDUI atual (formatVersion 5) com o `repo` só em `android` (com `urlTemplate`) e as outras
 * plataformas sem `repo`, para o passo a passo não depender do que o exemplo declara.
 */
async function sduiV5(): Promise<Buffer> {
  const spec = JSON.parse(await readFile(SDUI, 'utf8')) as {
    formatVersion: number;
    platforms: { id: string; repo?: unknown }[];
  };
  spec.formatVersion = 5;
  for (const platform of spec.platforms) {
    if (platform.id === 'android') platform.repo = ANDROID_REPO;
    else delete platform.repo;
  }
  return Buffer.from(JSON.stringify(spec));
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
  await expect(
    page.getByRole('status').filter({ hasText: /^"SDUI" aplicada/ }),
  ).toBeVisible();
  // Sem plataformas na v1.
  await expect(page.getByText('Plataformas', { exact: true })).toHaveCount(0);

  // O arquivo vai direto ao seletor (sem abrir o escolhedor nativo do navegador).
  await expect(page.getByRole('button', { name: 'Atualizar versão…' })).toBeVisible();
  await specInput(page).setInputFiles({
    name: 'sdui.json',
    mimeType: 'application/json',
    buffer: await sduiV5(),
  });
  const confirm = page.getByRole('dialog', { name: 'Atualizar "SDUI"?' });
  await expect(confirm).toContainText('Camadas novas: Telas');
  await confirm.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /versão \d+/ })).toBeVisible();
}

async function closeDialog(page: Page): Promise<void> {
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();
}

async function openSettings(page: Page): Promise<void> {
  await projectAction(page, 'Configurações');
  await expect(
    page.getByRole('heading', { name: 'Repositórios de código' }),
  ).toBeVisible();
}

/** Configurações → Repositórios: o caminho local do clone do `android` (o `repo` vem da spec). */
async function configureLocalPath(page: Page): Promise<void> {
  await openSettings(page);
  const android = page.getByRole('group', { name: 'Android' });
  const local = android.getByLabel('Caminho local da raiz');
  await local.fill('../../..');
  await local.press('Enter');
  await expect(local).toHaveValue('../../..');
}

/** Marcação com a SDUI aplicada (sem nada em Configurações), um Button e o Screen `Cadastro`. */
async function createAnnotations(page: Page, withLocalPath = false): Promise<void> {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  if (withLocalPath) {
    await configureLocalPath(page);
    await closeDialog(page);
  }
  await page.getByRole('button', { name: 'Adicionar anotação na camada Telas' }).click();
  await page.getByRole('button', { name: /^Screen/ }).click();
  await page.getByLabel('nome', { exact: true }).fill('Cadastro');
  await page.getByLabel('nome', { exact: true }).press('Enter');
  await page.getByLabel('rota', { exact: true }).fill('/cadastro');
  await page.getByLabel('rota', { exact: true }).press('Enter');
  await page
    .getByRole('button', { name: 'Adicionar anotação na camada Componentes' })
    .click();
  await page.getByRole('button', { name: /^Button/ }).click();
  await page.getByLabel('id', { exact: true }).fill('btn_cadastrar');
  await page.getByLabel('id', { exact: true }).press('Enter');
  await page.getByLabel('texto', { exact: true }).fill('Cadastrar');
  await page.getByLabel('texto', { exact: true }).press('Enter');
}

/** As entradas da linha "Definição" nos Detalhes (uma por plataforma com `path`). */
const definitions = (page: Page) => page.locator('[data-definition]');

test('passo 1: atualizar a SDUI para a v2 mostra a camada Telas e as plataformas', async ({
  page,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);

  // As plataformas de cada especialização: nome, id e linguagem; o `repo` do Android como link.
  const specs = page.getByRole('dialog', { name: 'Especializações' });
  await expect(specs.getByText('Android · android · kotlin')).toBeVisible();
  await expect(specs.getByText('iOS · ios · swift')).toBeVisible();
  const repoLink = specs.getByRole('link', { name: ANDROID_REPO.url });
  await expect(repoLink).toHaveAttribute('href', ANDROID_REPO.url);
  await expect(repoLink).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(specs.getByText('referência v1.2.0')).toBeVisible();
  // O exemplo não tem campo do tipo removido: nada a avisar.
  await expect(specs.getByText(/^Campos ignorados/)).toHaveCount(0);
  await closeDialog(page);

  // A camada Telas veio com a atualização (o painel de Camadas lista todas).
  await expect(
    page.getByRole('button', { name: 'Adicionar anotação na camada Telas' }),
  ).toBeVisible();
  const { mapping } = await exportMapping(page);
  expect(mapping.layers.map((l) => l.name)).toContain('Telas');
  expect(mapping.schemaVersion).toBe(13);
});

test('passo 2: o repo da especialização em leitura e só o caminho local editável', async ({
  page,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  await openSettings(page);

  // O Android declara o `repo`: link comum e ref, em leitura; nenhum campo de endereço.
  const android = page.getByRole('group', { name: 'Android' });
  const link = android.getByRole('link', { name: ANDROID_REPO.url });
  await expect(link).toHaveAttribute('href', ANDROID_REPO.url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(android.getByText('referência v1.2.0')).toBeVisible();
  await expect(android.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByLabel('Endereço do arquivo')).toHaveCount(0);

  // O iOS não declara: texto discreto, sem aviso.
  const ios = page.getByRole('group', { name: 'iOS' });
  await expect(
    ios.getByText('A especialização não declara o repositório desta plataforma.'),
  ).toBeVisible();
  await expect(ios.getByRole('status')).toHaveCount(0);
  await expect(ios.getByRole('link')).toHaveCount(0);

  const local = android.getByLabel('Caminho local da raiz');
  await local.fill('/abs/olute');
  await local.press('Enter');
  await expect(android.getByRole('alert')).toContainText('relativo à pasta do projeto');
  await local.fill('../../..');
  await local.press('Enter');
  await expect(android.getByRole('alert')).toHaveCount(0);
  await expect(local).toHaveValue('../../..');

  // Limpar remove só o clone local: o repo da especialização continua.
  await android.getByRole('button', { name: 'Limpar repositório de Android' }).click();
  await expect(local).toHaveValue('');
  await expect(
    android.getByRole('button', { name: 'Limpar repositório de Android' }),
  ).toBeDisabled();
  await expect(link).toBeVisible();
  await closeDialog(page);
  const { mapping } = await exportMapping(page);
  expect(mapping).toMatchObject({ platformRepos: {} });
});

test('passo 3: "Definição" do Button ("Abrir no repositório" e "Copiar caminho") e o Screen sem campo de código', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Nada configurado em Configurações: o link já vem da especialização.
  await createAnnotations(page);

  // Button selecionado nos Detalhes: uma linha por plataforma com `path`.
  await expect(page.getByText('Definição', { exact: true })).toBeVisible();
  await expect(definitions(page).first()).toBeVisible();
  const android = page.locator('[data-definition="android"]');
  const ios = page.locator('[data-definition="ios"]');
  await expect(android.locator('.code-definition-name')).toHaveText(
    'Android · DSButton.kt',
  );
  await expect(ios.locator('.code-definition-name')).toHaveText('iOS · DSButton.swift');

  // O link é comum, em outra aba, sem o `#L{line}` (o caminho não tem linha).
  const open = android.getByRole('link', { name: /^Abrir no repositório/ });
  await expect(open).toHaveAttribute(
    'href',
    `https://github.com/org/app-android/blob/main/${DS_BUTTON_KT}`,
  );
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  // O iOS não declara repo na especialização: sem link, mas com "Copiar caminho".
  await expect(ios.getByRole('link')).toHaveCount(0);
  await ios.getByRole('button', { name: /^Copiar caminho/ }).click();
  await expect(ios.getByRole('status')).toHaveText('Caminho copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DS_BUTTON_SWIFT);
  await android.getByRole('button', { name: /^Copiar caminho/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DS_BUTTON_KT);

  // Nada de campo de implementação no Screen nem no que foi gravado.
  await expect(page.getByText('implementação')).toHaveCount(0);
  const { mapping } = await exportMapping(page);
  expect(mapping).toMatchObject({
    schemaVersion: 13,
    platformRepos: {},
  });
  const screen = mapping.annotations.find((a) => a.type?.typeId === 'screen');
  expect(screen?.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
});

test('passo 4: especialização antiga com campo codeRef é aplicada sem ele, com aviso', async ({
  page,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await projectAction(page, 'Especializações');
  await specInput(page).setInputFiles({
    name: 'sdui-antiga.json',
    mimeType: 'application/json',
    buffer: await sduiWithCodeRef(),
  });
  await expect(
    page.getByRole('status').filter({ hasText: /^"SDUI" aplicada/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /^Campos ignorados: screen\.implementacao\./ }),
  ).toBeVisible();
  await closeDialog(page);

  // O Screen nasce só com os campos do formato atual.
  await page.getByRole('button', { name: 'Adicionar anotação na camada Telas' }).click();
  await page.getByRole('button', { name: /^Screen/ }).click();
  await expect(page.getByLabel('nome', { exact: true })).toBeVisible();
  await expect(page.getByText('implementação')).toHaveCount(0);
  const { mapping } = await exportMapping(page);
  const screen = mapping.annotations.find((a) => a.type?.typeId === 'screen');
  expect(Object.keys(screen?.values ?? {})).toEqual(['nome', 'rota']);
});

test('passo 5: clone local editado por fora (JSON) chega às Configurações; o link não muda', async ({
  page,
}) => {
  await createAnnotations(page);
  // Espera a última edição chegar ao disco: com uma gravação pendente, a mudança de fora
  // vira o diálogo de conflito em vez da recarga.
  await expect
    .poll(async () => {
      const m = await readMapping(page);
      return m.annotations.find((a) => a.type?.typeId === 'button')?.values?.texto;
    })
    .toBe('Cadastrar');

  await setAndroidLocalPath(page, '../../outro');
  await expect(
    page.getByRole('status').filter({ hasText: 'Projeto atualizado por fora' }),
  ).toBeVisible({ timeout: 10_000 });
  await openSettings(page);
  await expect(
    page.getByRole('group', { name: 'Android' }).getByLabel('Caminho local da raiz'),
  ).toHaveValue('../../outro');
  await closeDialog(page);
  // O endereço é da especialização: o link da "Definição" continua.
  await expect(page.locator('[data-definition="android"]').getByRole('link')).toHaveCount(
    1,
  );
});

/** A SDUI com o campo removido (`codeRef`) de volta no Screen, como as especializações antigas. */
async function sduiWithCodeRef(): Promise<Buffer> {
  const spec = JSON.parse(await readFile(SDUI, 'utf8')) as {
    layers: { annotationTypes: { id: string; fields: object[] }[] }[];
  };
  const screen = spec.layers
    .flatMap((l) => l.annotationTypes)
    .find((t) => t.id === 'screen');
  screen?.fields.push({ key: 'implementacao', label: 'implementação', type: 'codeRef' });
  return Buffer.from(JSON.stringify(spec));
}

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

/** Outro programa grava o clone local de `android` no `mapping.json` (edição de texto). */
async function setAndroidLocalPath(page: Page, localPath: string): Promise<void> {
  await page.evaluate(
    async ({ folder, next }) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(folder);
      const handle = await dir.getFileHandle('mapping.json');
      const mapping = JSON.parse(await (await handle.getFile()).text());
      mapping.revision += 1;
      mapping.platformRepos.android = { localPath: next };
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(mapping, null, 2));
      await writable.close();
    },
    { folder: FOLDER, next: localPath },
  );
}
