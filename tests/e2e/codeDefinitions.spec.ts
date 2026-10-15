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

// Etapas 3b.3 e 9 (o R3 do guia do testador): atualizar a SDUI para a v2, repositórios por
// plataforma com o aviso pelo `code.<plataforma>.path` dos tipos, a linha "Definição" nos
// Detalhes ("Abrir no repositório", só o `href`: nenhuma navegação, e "Copiar caminho"), o Screen
// sem campo de código, a importação de uma especialização antiga com o campo `codeRef` (ignorado,
// com aviso) e o aviso de repositório depois de uma edição do `mapping.json` por fora.

const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
const FOLDER = 'mapeamento-codigo';
const ANDROID_URL = 'https://github.com/org/app-android/blob/main/{path}';
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

/** Marcação com a SDUI v2 aplicada, os repositórios do passo 2, um Button e o Screen `Cadastro`. */
async function createAnnotations(page: Page): Promise<void> {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  await configureRepos(page);
  await closeDialog(page);
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

  // As plataformas de cada especialização: nome, id e linguagem.
  const specs = page.getByRole('dialog', { name: 'Especializações' });
  await expect(specs.getByText('Android · android · kotlin')).toBeVisible();
  await expect(specs.getByText('iOS · ios · swift')).toBeVisible();
  await expect(specs.getByText('Contrato SDUI · bff · json')).toBeVisible();
  // O exemplo não tem campo do tipo removido: nada a avisar.
  await expect(specs.getByText(/^Campos ignorados/)).toHaveCount(0);
  await closeDialog(page);

  // A camada Telas veio com a atualização (o painel de Camadas lista todas).
  await expect(
    page.getByRole('button', { name: 'Adicionar anotação na camada Telas' }),
  ).toBeVisible();
  const { mapping } = await exportMapping(page);
  expect(mapping.layers.map((l) => l.name)).toContain('Telas');
  expect(mapping.schemaVersion).toBe(9);
});

test('passo 2: repositórios por plataforma, com os erros da validação e o aviso pelo path', async ({
  page,
}) => {
  await openFolderProject(page);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await updateSduiToV2(page);
  await closeDialog(page);
  await configureRepos(page);

  // O ios fica vazio: o Button tem `code.ios.path`, então o aviso aparece só nele.
  const ios = page.getByRole('group', { name: 'iOS' });
  await expect(ios.getByLabel('Endereço do arquivo')).toHaveValue('');
  await expect(ios.getByRole('status')).toHaveText(
    'iOS sem repositório: 1 tipo aponta um arquivo nesta plataforma.',
  );
  await expect(
    page.getByRole('group', { name: 'Contrato SDUI' }).getByRole('status'),
  ).toHaveCount(0);

  const android = page.getByRole('group', { name: 'Android' });
  await expect(android.getByRole('status')).toHaveCount(0);
  const local = android.getByLabel('Caminho local da raiz');
  await local.fill('/abs/olute');
  await local.press('Enter');
  await expect(android.getByRole('alert')).toContainText('relativo à pasta do projeto');
  await expect(local).toHaveValue('../../..');

  // Limpar remove a configuração da plataforma, e o aviso do Android aparece.
  await android.getByRole('button', { name: 'Limpar repositório de Android' }).click();
  await expect(android.getByLabel('Endereço do arquivo')).toHaveValue('');
  await expect(
    android.getByRole('button', { name: 'Limpar repositório de Android' }),
  ).toBeDisabled();
  await expect(android.getByRole('status')).toHaveText(
    'Android sem repositório: 2 tipos apontam arquivos nesta plataforma.',
  );
  await closeDialog(page);
  const { mapping } = await exportMapping(page);
  expect(mapping).toMatchObject({ platformRepos: {} });
});

test('passo 3: "Definição" do Button ("Abrir no repositório" e "Copiar caminho") e o Screen sem campo de código', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createAnnotations(page);

  // Button selecionado nos Detalhes: uma linha por plataforma com `path` (o bff não tem).
  await expect(page.getByText('Definição', { exact: true })).toBeVisible();
  await expect(definitions(page)).toHaveCount(2);
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
  // O iOS não tem repositório: sem link, mas com "Copiar caminho".
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
    schemaVersion: 9,
    platformRepos: { android: { urlTemplate: ANDROID_URL, localPath: '../../..' } },
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
  await expect(page.getByRole('status').filter({ hasText: 'aplicada' })).toBeVisible();
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

test('passo 5: repositório apagado por fora (JSON editado) acende o aviso; restaurado, apaga', async ({
  page,
}) => {
  await createAnnotations(page);
  await expect.poll(async () => (await readMapping(page)).revision).toBeGreaterThan(0);

  const before = await setAndroidRepo(page, null);
  await expect(
    page.getByRole('status').filter({ hasText: 'Projeto atualizado por fora' }),
  ).toBeVisible({ timeout: 10_000 });
  await openSettings(page);
  await expect(
    page.getByRole('group', { name: 'Android' }).getByRole('status'),
  ).toHaveText('Android sem repositório: 2 tipos apontam arquivos nesta plataforma.');
  await closeDialog(page);
  // Sem repositório, a "Definição" do Android perde o link (o Button continua selecionado).
  await expect(page.locator('[data-definition="android"]').getByRole('link')).toHaveCount(
    0,
  );
  // Nenhuma anotação fica incompleta por isso.
  await expect(page.getByText(/^Incompleta/)).toHaveCount(0);

  await setAndroidRepo(page, before);
  await expect(page.locator('[data-definition="android"]').getByRole('link')).toHaveCount(
    1,
    { timeout: 10_000 },
  );
  await openSettings(page);
  await expect(
    page.getByRole('group', { name: 'Android' }).getByRole('status'),
  ).toHaveCount(0);
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

async function readMapping(page: Page): Promise<{ revision: number }> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    const file = await (await dir.getFileHandle('mapping.json')).getFile();
    return JSON.parse(await file.text());
  }, FOLDER);
}

type Repo = { urlTemplate: string | null; localPath: string | null } | null;

/**
 * Outro programa troca o repositório `android` no `mapping.json` (`null`: os dois valores
 * `null`, como um repositório apagado à mão). Devolve o repositório que havia antes.
 */
async function setAndroidRepo(page: Page, repo: Repo): Promise<Repo> {
  return page.evaluate(
    async ({ folder, next }) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(folder);
      const handle = await dir.getFileHandle('mapping.json');
      const mapping = JSON.parse(await (await handle.getFile()).text());
      const previous = mapping.platformRepos.android ?? null;
      mapping.revision += 1;
      mapping.platformRepos.android = next ?? { urlTemplate: null, localPath: null };
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(mapping, null, 2));
      await writable.close();
      return previous;
    },
    { folder: FOLDER, next: repo },
  );
}
