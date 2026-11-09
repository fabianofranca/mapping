import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
  setMode,
  type Point,
} from './helpers';

// Etapa Comentários, CM4: os pinos das conversas (escondidos por padrão), o botão Conversas, o botão
// Comentar e o clique no pino. O canvas publica `data-pins` (quantos pinos desenhou).

async function setIdentity(page: Page): Promise<void> {
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Marina Alves');
  await dialog.getByLabel('E-mail', { exact: true }).fill('marina@exemplo.com');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

async function pins(host: Locator): Promise<number> {
  return Number((await host.getAttribute('data-pins')) ?? 0);
}

test('os pinos nascem escondidos, o Comentar abre o rascunho e o clique no pino abre a conversa', async ({
  page,
}) => {
  await createProject(page, 'Comentários');
  await addImage(page);
  await setIdentity(page);
  const host = page.locator('.canvas-host');
  const center = await canvasPoint(page);
  await drawMarking(page, center);
  await setMode(page, 'Navegar');
  const conversas = page.getByRole('button', { name: 'Conversas', exact: true });
  await expect(conversas).toHaveAttribute('aria-pressed', 'false');
  expect(await pins(host)).toBe(0);

  // Comentar: arma o clique, liga os pinos e, sobre a marcação, abre o rascunho ancorado nela.
  await page.getByRole('button', { name: 'Comentar', exact: true }).first().click();
  await expect(conversas).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(center.x, center.y);
  const composer = page.getByRole('textbox', { name: /Comentar como Marina Alves/ });
  await expect(composer).toBeVisible();
  await composer.fill('Qual é a variante?');
  await composer.press('Control+Enter');
  await expect.poll(() => pins(host)).toBe(1);

  // Desligar o Conversas esconde o pino (a conversa continua nos Detalhes).
  const elsewhere = await canvasPoint(page, 0.9);
  await page.mouse.click(elsewhere.x, elsewhere.y);
  await conversas.click();
  await expect(conversas).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => pins(host)).toBe(0);
  // Ligar de novo traz o pino de volta.
  await conversas.click();
  await expect.poll(() => pins(host)).toBe(1);

  // O clique no pino (canto de cima à direita da marcação, por fora) abre a conversa nos Detalhes.
  await page.mouse.click(center.x + 60 + 22, center.y - 40 - 10);
  await expect(page.getByText('Qual é a variante?')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: /Responder como Marina Alves/ }),
  ).toBeVisible();
});

test('o Comentar num lugar vazio abre o rascunho num ponto, com o pino tracejado', async ({
  page,
}) => {
  await createProject(page, 'Comentários ponto');
  await addImage(page);
  await setIdentity(page);
  const host = page.locator('.canvas-host');
  const empty = await canvasPoint(page, 0.15);
  await page.getByRole('button', { name: 'Comentar', exact: true }).first().click();
  await page.mouse.click(empty.x, empty.y);
  await expect(
    page.getByRole('textbox', { name: /Comentar como Marina Alves/ }),
  ).toBeVisible();
  // Nada gravado ainda, mas o rascunho mostra o pino tracejado.
  await expect.poll(() => pins(host)).toBe(1);
});

// ---------------------------------------------------------------------------------------------
// CM5: o editor de citações (contenteditable com chips), num Chromium de verdade — o jsdom não
// cobre seleção nem cursor. Projeto de PASTA (uma pasta do OPFS faz o papel da escolhida).

const FOLDER = 'comentarios-e2e';
const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
const EDITOR = /Comentar como|Responder como/;
const CHIP = 'span.citation-chip.citation-chip-editor';

async function openFolderProject(page: Page, name: string): Promise<void> {
  await page.addInitScript((folder) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(folder, { create: true });
    });
  }, FOLDER);
  await page.goto('/');
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await page.getByRole('textbox').fill(name);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

/** Desenha uma marcação em `fy`, dá nome a ela e a deixa selecionada. */
async function namedMarking(page: Page, fy: number, name: string): Promise<Point> {
  const at = await canvasPoint(page, fy);
  await drawMarking(page, at);
  const field = page.getByLabel('Nome', { exact: true }).first();
  await field.fill(name);
  await field.press('Enter');
  return at;
}

/** Abre o rascunho de uma conversa ancorada na marcação em `at`. */
async function openComposer(page: Page, at: Point): Promise<Locator> {
  await page.getByRole('button', { name: 'Comentar', exact: true }).first().click();
  await page.mouse.click(at.x, at.y);
  const composer = page.getByRole('textbox', { name: EDITOR });
  await expect(composer).toBeVisible();
  await composer.focus();
  return composer;
}

/** Os arquivos `comments/<id>.json` da pasta do projeto, já lidos. */
async function readThreads(page: Page): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    const comments = await dir.getDirectoryHandle('comments').catch(() => null);
    if (!comments) return [];
    const out: Record<string, unknown>[] = [];
    for await (const [name, handle] of comments.entries()) {
      if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      try {
        out.push(JSON.parse(await file.text()));
      } catch {
        // gravação em andamento (arquivo ainda incompleto): a próxima leitura do poll pega
      }
    }
    return out;
  }, FOLDER);
}

const threadText = (threads: readonly Record<string, unknown>[]): string =>
  JSON.stringify(threads);

test('o @ abre a lista de itens e o Enter troca o @termo por um chip', async ({
  page,
}) => {
  await openFolderProject(page, 'Citações');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Porta');
  const composer = await openComposer(page, at);

  await composer.pressSequentially('Veja @Por');
  const picker = page.getByRole('listbox', { name: 'Itens para citar' });
  await expect(picker).toBeVisible();
  await expect(composer).toHaveAttribute('aria-controls', /./);
  await expect(picker.getByRole('option').first()).toBeVisible();

  await composer.press('Enter');
  await expect(picker).toBeHidden();
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute('role', 'img');
  await expect(chip).toHaveAttribute('aria-label', 'Porta, citação');
  await expect(chip).toHaveText('Porta');
  // O `@Por` sumiu: o chip tomou o lugar dele.
  await expect(composer).not.toContainText('@Por');
  await expect(composer).toContainText('Veja');
});

test('o Backspace logo depois do chip apaga o chip inteiro', async ({ page }) => {
  await openFolderProject(page, 'Citações backspace');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Porta');
  const composer = await openComposer(page, at);

  await composer.pressSequentially('@Por');
  await composer.press('Enter');
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  // O cursor fica depois do espaço que vem depois do chip: o primeiro Backspace tira o espaço…
  await composer.press('Backspace');
  await expect(chip).toHaveCount(1);
  // …e o segundo, colado ao chip, apaga o chip inteiro (não só uma letra do nome).
  await composer.press('Backspace');
  await expect(chip).toHaveCount(0);
  await expect(composer).not.toContainText('Porta');
});

/** Projeto de pasta com uma anotação SDUI "Input" (campo `id` preenchido) e uma marcação. */
async function projectWithField(page: Page): Promise<Point> {
  await openFolderProject(page, 'Citações propriedade');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Porta');
  await applySpecialization(page, SDUI);
  await page
    .getByRole('button', { name: 'Adicionar anotação na camada Componentes' })
    .click();
  await page.getByRole('button', { name: /^Input/ }).click();
  const id = page.getByLabel('id', { exact: true });
  await id.fill('input_nome');
  await id.press('Enter');
  return at;
}

test('colar a referência copiada de uma propriedade vira chip', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const at = await projectWithField(page);
  // Sem texto selecionado no campo, o Ctrl+C copia a referência da propriedade.
  await page.getByLabel('id', { exact: true }).press('Control+c');
  const reference = await page.evaluate(() => navigator.clipboard.readText());
  expect(reference).toMatch(new RegExp(`^mapping://${FOLDER}/a/[0-9a-f]{8}/f/id$`));

  const composer = await openComposer(page, at);
  await composer.pressSequentially('Veja ');
  await composer.press('Control+v');
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute('data-url', reference);
  await expect(chip).toHaveAttribute('aria-label', /, citação$/);
  // O texto colado não ficou como URL solta.
  await expect(composer).not.toContainText('mapping://');
});

test('o Ctrl+Enter envia e o arquivo em comments/ guarda o link markdown', async ({
  page,
}) => {
  await openFolderProject(page, 'Citações envio');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Porta');
  const composer = await openComposer(page, at);

  await composer.pressSequentially('Confira @Por');
  await composer.press('Enter');
  await composer.pressSequentially('agora');
  await composer.press('Control+Enter');

  await expect.poll(async () => (await readThreads(page)).length).toBe(1);
  const text = threadText(await readThreads(page));
  expect(text).toMatch(
    new RegExp(`Confira \\[Porta\\]\\(mapping://${FOLDER}/m/[0-9a-f]{8}\\) agora`),
  );
  // A mensagem enviada mostra o chip (botão), não o markdown.
  const sent = page.getByRole('button', { name: 'Porta, citação' });
  await expect(sent).toBeVisible();
  await expect(sent).toHaveClass(/citation-chip/);
});

test('papéis e nomes acessíveis do campo, do chip e da lista', async ({ page }) => {
  await openFolderProject(page, 'Citações acessibilidade');
  await addImage(page);
  await setIdentity(page);
  const at = await namedMarking(page, 1 / 3, 'Porta');
  await namedMarking(page, 0.7, 'Janela');
  const composer = await openComposer(page, at);

  await expect(composer).toHaveAttribute('role', 'textbox');
  await expect(composer).toHaveAttribute('aria-multiline', 'true');
  // role=textbox não admite aria-haspopup/aria-expanded; aria-controls só com a lista aberta.
  await expect(composer).not.toHaveAttribute('aria-haspopup', /./);
  await expect(composer).not.toHaveAttribute('aria-expanded', /./);
  await expect(composer).not.toHaveAttribute('aria-controls', /./);
  await expect(composer).not.toHaveAttribute('aria-activedescendant', /./);

  await composer.pressSequentially('@');
  const picker = page.getByRole('listbox', { name: 'Itens para citar' });
  await expect(picker).toBeVisible();
  const options = picker.getByRole('option');
  expect(await options.count()).toBeGreaterThan(1);
  await expect(composer).toHaveAttribute(
    'aria-controls',
    (await picker.getAttribute('id')) ?? '',
  );

  // O `aria-activedescendant` aponta a opção ativa (a selecionada) e acompanha as setas.
  const active = async (): Promise<string> => {
    const id = (await composer.getAttribute('aria-activedescendant')) ?? '';
    expect(id).not.toBe('');
    const option = picker.locator(`[id="${id}"]`);
    await expect(option).toHaveAttribute('role', 'option');
    await expect(option).toHaveAttribute('aria-selected', 'true');
    return id;
  };
  const first = await active();
  await composer.press('ArrowDown');
  const second = await active();
  expect(second).not.toBe(first);
  await composer.press('ArrowUp');
  expect(await active()).toBe(first);

  // Depois de escolher, o chip é lido como "<nome>, citação" e a lista fecha.
  await composer.press('Enter');
  await expect(picker).toBeHidden();
  await expect(composer).not.toHaveAttribute('aria-controls', /./);
  const chip = composer.locator(CHIP);
  await expect(chip).toHaveCount(1);
  const name = await chip.textContent();
  await expect(chip).toHaveAttribute('aria-label', `${name}, citação`);
  await expect(page.getByRole('img', { name: `${name}, citação` })).toHaveCount(1);
});

test('o chip é vivo: renomear o alvo muda o nome e apagar o alvo risca o chip', async ({
  page,
}) => {
  await openFolderProject(page, 'Citações vivas');
  await addImage(page);
  await setIdentity(page);
  const target = await namedMarking(page, 0.7, 'Janela');
  const anchor = await namedMarking(page, 1 / 3, 'Porta');
  const composer = await openComposer(page, anchor);

  await composer.pressSequentially('Veja @Jan');
  await composer.press('Enter');
  await composer.press('Control+Enter');
  const sent = page.getByRole('button', { name: 'Janela, citação' });
  await expect(sent).toBeVisible();
  await expect
    .poll(async () => threadText(await readThreads(page)))
    .toContain('[Janela](');

  // Renomeia o alvo: a mensagem mostra o nome de agora.
  await page.mouse.click(target.x, target.y);
  const name = page.getByLabel('Nome', { exact: true }).first();
  await name.fill('Janela lateral');
  await name.press('Enter');
  await page.mouse.click(anchor.x, anchor.y);
  const renamed = page.getByRole('button', { name: 'Janela lateral, citação' });
  await expect(renamed).toBeVisible();
  await expect(renamed).not.toHaveClass(/citation-chip-broken/);

  // Apaga o alvo: o chip continua na mensagem, riscado.
  await page.mouse.click(target.x, target.y);
  await page.keyboard.press('Delete');
  await page.mouse.click(anchor.x, anchor.y);
  const broken = page.locator('button.citation-chip.citation-chip-broken');
  await expect(broken).toHaveCount(1);
});
