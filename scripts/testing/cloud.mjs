// Auxiliares de automação do agente testador da nuvem (docs/TESTING.md, apêndice A,
// "Diálogos nativos na nuvem (Xvfb)"; docs/TESTING-NUVEM.md). Empacota as receitas 4 a 10 do
// apêndice A para não reescrevê-las em toda rodada.
//
// Uso como biblioteca:
//   import { connect, selectFolder, ... } from './cloud.mjs';
//
// Uso como CLI:
//   node scripts/testing/cloud.mjs mark <roteiro> <start|end>   (o cloud-up.sh chama)
//   node scripts/testing/cloud.mjs tempos <apoio>               (duração por roteiro, do tempos.log)
//   node scripts/testing/cloud.mjs state [<pasta-do-projeto>]    (conecta, imprime o estado, sai)
//   node scripts/testing/cloud.mjs run [<pasta-do-projeto>] [--prazo=<s>] < corpo.js   (corpo do passo pela entrada padrão)
//   node scripts/testing/cloud.mjs find <texto>                  (candidatos cujo nome contém o texto)
//   node scripts/testing/cloud.mjs help                          (comandos e exports, da tabela HELP)
//
// Pasta de apoio: toda função que precisa de disco recebe `apoioDir` (a pasta `apoio/` da
// pasta de trabalho da rodada, docs/TESTING-NUVEM.md item 3) como argumento explícito; a CLI
// lê esse caminho da variável de ambiente `APOIO` (decisão desta fase: um nome só, sem `S`,
// para não colidir com a variável `S` usada nas receitas do apêndice A em shells à parte).
//
// Nunca: registrar `page.on('filechooser')` ou `waitForEvent('filechooser')`, nem usar
// `setInputFiles` como atalho (regra do "Nunca" do docs/TESTING-NUVEM.md); nunca enviar Enter a
// um seletor de arquivo/pasta ou a um "Salvar como" do GTK — só alt+o / alt+s / alt+c.
/* global document, location, CSS, MutationObserver, DataTransfer, DragEvent -- só dentro das funções que rodam na página */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import util, { promisify } from 'node:util';
import { guideExcerpt, guidePreparo, guideSection, listSecoes } from './round-guide.mjs';

const execFileAsync = promisify(execFile);

/** Caminho fixo do Chrome for Testing headless usado por `makeCadastroPng` (docs do ambiente). */
const HEADLESS_CHROMIUM = '/opt/pw-browsers/chromium';

/**
 * Lê o formato que o `cloud-up.sh` grava em `apoio/env.sh` (`export A=1 B=2`, uma ou mais linhas;
 * aspas simples ou duplas em volta do valor são tiradas). Pura.
 */
export function parseEnvFile(text) {
  const values = {};
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    for (const token of line.split(/\s+/)) {
      const eq = token.indexOf('=');
      if (eq <= 0) continue;
      values[token.slice(0, eq)] = token.slice(eq + 1).replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}

/**
 * Carrega o ambiente da rodada (`DISPLAY`, `DBUS_SESSION_BUS_ADDRESS`, `APOIO`) de
 * `<apoioDir>/env.sh`, preenchendo só o que falta em `env` (padrão `process.env`). Sem o arquivo e
 * sem `DISPLAY`, lança. O script do passo não precisa mais de `source apoio/env.sh`.
 */
export function loadEnv(apoioDir, env = process.env) {
  const file = path.join(apoioDir, 'env.sh');
  if (fs.existsSync(file)) {
    const values = parseEnvFile(fs.readFileSync(file, 'utf8'));
    for (const key of ['DISPLAY', 'DBUS_SESSION_BUS_ADDRESS']) {
      if (!env[key] && values[key]) env[key] = values[key];
    }
  } else if (!env.DISPLAY) {
    throw new Error('apoio/env.sh não existe: rode o cloud-up.sh');
  }
  if (!env.APOIO) env.APOIO = apoioDir;
  return env;
}

/** `xdotool key` sem Enter: atalho de um diálogo nativo (receitas 5, 7 e 8 do apêndice A). */
function xdotoolKey(windowId, ...keys) {
  execFileSync('xdotool', ['windowactivate', '--sync', windowId]);
  execFileSync('xdotool', ['key', '--clearmodifiers', ...keys]);
}

/** Primeira janela visível cujo título casa com algum nome da lista, ou null. */
function findWindow(names) {
  for (const name of names) {
    const result = spawnSync('xdotool', ['search', '--onlyvisible', '--name', name], {
      encoding: 'utf8',
    });
    const id = result.stdout.trim().split('\n').find(Boolean);
    if (id) return id;
  }
  return null;
}

/** Espera até `predicate()` ser verdade ou o tempo acabar; não lança ao esgotar (devolve o último valor). */
async function waitUntil(predicate, { timeoutMs = 4000, stepMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let value = await predicate();
  while (!value && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    value = await predicate();
  }
  return value;
}

/** Título da janela ativa do sistema (via `xdotool getactivewindow getwindowname`), ou ''. */
function activeWindowTitle() {
  const result = spawnSync('xdotool', ['getactivewindow', 'getwindowname'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

/** Prazo padrão (ms) da espera por um diálogo nativo (etapa #405, decisão 2). */
const DIALOG_TIMEOUT_MS = 5000;

/**
 * Espera uma janela visível cujo título case com algum nome da lista e devolve o id dela. Tenta
 * a cada `stepMs` (150 ms) até `timeoutMs` (5 s). Ao esgotar o prazo, lança com os títulos
 * esperados e o título da janela ativa; se a ativa não é a da app (título "Mapping…"), acrescenta
 * a frase das duas abas. `find` e `activeTitle` são injetáveis para o teste rodar sem `xdotool`.
 */
export async function waitForWindow(
  names,
  {
    timeoutMs = DIALOG_TIMEOUT_MS,
    stepMs = 150,
    find = findWindow,
    activeTitle = activeWindowTitle,
  } = {},
) {
  const id = await waitUntil(() => find(names), { timeoutMs, stepMs });
  if (id) return id;
  const active = activeTitle();
  let message = `Nenhum seletor de arquivo/pasta encontrado em ${timeoutMs} ms (títulos esperados: ${names.join(', ')}; janela ativa: "${active}").`;
  if (active && !/^Mapping\b/.test(active)) {
    message +=
      ' Causa provável: a aba ativa da janela não é a da app; o seletor nativo só abre com ela em foco no sistema (feche a outra aba).';
  }
  throw new Error(message);
}

/**
 * Lista {id, name} de toda janela visível. Os nomes vêm de um comando só
 * (`xdotool search ... getwindowname %@`, uma linha por janela, na ordem do `search`), em vez de
 * um `getwindowname` por janela a cada tentativa do `waitUntil`.
 */
function listWindows() {
  const search = spawnSync('xdotool', ['search', '--onlyvisible', '--name', '.'], {
    encoding: 'utf8',
  });
  const ids = search.stdout.trim().split('\n').filter(Boolean);
  if (ids.length === 0) return [];
  const names = spawnSync(
    'xdotool',
    ['search', '--onlyvisible', '--name', '.', 'getwindowname', '%@'],
    { encoding: 'utf8' },
  )
    .stdout.trim()
    .split('\n');
  if (names.length === ids.length) return ids.map((id, i) => ({ id, name: names[i] }));
  // A lista mudou entre os dois comandos (janela abriu ou fechou): volta ao nome por janela.
  return ids.map((id) => ({
    id,
    name: spawnSync('xdotool', ['getwindowname', id], { encoding: 'utf8' }).stdout.trim(),
  }));
}

/** Geometria {x, y, width, height} de uma janela (via `xdotool getwindowgeometry --shell`). */
function windowGeometry(windowId) {
  const result = spawnSync('xdotool', ['getwindowgeometry', '--shell', windowId], {
    encoding: 'utf8',
  });
  const values = {};
  for (const line of result.stdout.trim().split('\n')) {
    const [key, value] = line.split('=');
    values[key] = Number(value);
  }
  return values;
}

/** Origem padrão da app servida pelo `cloud-up.sh`. */
const APP_ORIGIN = 'http://localhost:8080';

/**
 * Escolhe a aba da app entre `pages` (`{ url, title? }`): a da origem cujo caminho não começa por
 * `/guia/`. Com zero ou mais de uma, lança com as URLs e os títulos achados em vez de escolher em
 * silêncio. Pura.
 */
export function pickAppPage(pages, { origin = APP_ORIGIN } = {}) {
  const wanted = new URL(origin).origin;
  const matches = pages.filter((candidate) => {
    try {
      const url = new URL(candidate.url);
      return url.origin === wanted && !url.pathname.startsWith('/guia/');
    } catch {
      return false;
    }
  });
  if (matches.length === 1) return matches[0];
  const list = (items) =>
    items
      .map((item) => `  - ${item.url}${item.title ? ` ("${item.title}")` : ''}`)
      .join('\n');
  if (matches.length === 0) {
    throw new Error(
      pages.length === 0
        ? `Nenhuma aba encontrada no Chrome conectado por CDP (esperava a app em ${wanted}).`
        : `Nenhuma aba da app (${wanted}, fora de /guia/) encontrada. Abas achadas:\n${list(pages)}`,
    );
  }
  throw new Error(
    `${matches.length} abas da app abertas:\n${list(matches)}\nDica: feche as abas a mais (receita 3).`,
  );
}

/**
 * Escolhe a aba do guia entre `pages` (`{ url, title? }`): a da origem cujo caminho começa por
 * `/guia/`. Com zero ou mais de uma, lança com as URLs e os títulos achados. Pura.
 */
function pickGuidePage(pages, { origin = APP_ORIGIN } = {}) {
  const wanted = new URL(origin).origin;
  const matches = pages.filter((candidate) => {
    try {
      const url = new URL(candidate.url);
      return url.origin === wanted && url.pathname.startsWith('/guia/');
    } catch {
      return false;
    }
  });
  if (matches.length === 1) return matches[0];
  const list = (items) =>
    items
      .map((item) => `  - ${item.url}${item.title ? ` ("${item.title}")` : ''}`)
      .join('\n');
  throw new Error(
    matches.length === 0
      ? `Nenhuma aba do guia (${wanted}/guia/) encontrada. Abas achadas:\n${list(pages)}`
      : `${matches.length} abas do guia abertas:\n${list(matches)}\nDica: feche as abas a mais (receita 3).`,
  );
}

/**
 * Conecta no Chrome por CDP, escolhe a aba com `pick`, aplica o timeout curto e registra console
 * e erros de página em `<apoioDir>/console.log`. Base de `connect` e `connectGuide`.
 */
async function connectTab(apoioDir, cdpUrl, pick, options) {
  const { timeoutMs, navigationTimeoutMs, origin, connectOverCDP } = options;
  const browser = await connectOverCDP(cdpUrl);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const described = await Promise.all(
    pages.map(async (candidate) => ({
      url: candidate.url(),
      title: await candidate.title().catch(() => ''),
      page: candidate,
    })),
  );
  let page;
  try {
    ({ page } = pick(described, { origin }));
  } catch (error) {
    // Sem fechar a conexão CDP o processo `node` do script não sai.
    await browser.close().catch(() => undefined);
    throw error;
  }
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(navigationTimeoutMs);
  const logFile = path.join(apoioDir, 'console.log');
  const appendLog = (line) => fs.appendFileSync(logFile, `${line}\n`);
  page.on('console', (message) => {
    appendLog(`[console:${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    appendLog(`[pageerror] ${error instanceof Error ? error.message : String(error)}`);
  });
  return { browser, page };
}

const CONNECT_DEFAULTS = {
  timeoutMs: 5000,
  navigationTimeoutMs: 15000,
  origin: APP_ORIGIN,
  connectOverCDP: (url) => chromium.connectOverCDP(url),
};

/**
 * Conecta no Chrome por CDP (receita 4 do apêndice A), acha a aba da app (`pickAppPage`),
 * aplica o timeout curto (`timeoutMs` 5 s nas ações, `navigationTimeoutMs` 15 s nas navegações;
 * espera longa passa `{ timeout }` na própria chamada) e registra console e erros de página em
 * `<apoioDir>/console.log`. Devolve `{ browser, page }`.
 */
export async function connect(apoioDir, cdpUrl = 'http://localhost:9222', options = {}) {
  return connectTab(apoioDir, cdpUrl, pickAppPage, { ...CONNECT_DEFAULTS, ...options });
}

/**
 * Como o `connect()`, mas escolhe a aba do guia (`/guia/`) em vez da da app (etapa #482, GT1):
 * os mesmos 5 s e 15 s e o mesmo registro de console. Devolve `{ browser, page }`.
 */
export async function connectGuide(
  apoioDir,
  cdpUrl = 'http://localhost:9222',
  options = {},
) {
  return connectTab(apoioDir, cdpUrl, pickGuidePage, { ...CONNECT_DEFAULTS, ...options });
}

/**
 * Clique por papel e nome que pode abrir um diálogo nativo, sem esperar depois (receita 4).
 * Nomes acessíveis se repetem na página ("Adicionar imagens", "Local", "Ajuda", "Rejeitar"):
 * `scope` (um `Locator` ou um seletor CSS) restringe a busca a um container e `exact` vai para o
 * `getByRole`. Conta os candidatos antes de clicar e só clica com exatamente 1; nunca escolhe um
 * em silêncio (etapa #405, decisão 3).
 */
export async function clickNoWait(page, name, { scope, exact } = {}) {
  const root = typeof scope === 'string' ? page.locator(scope) : (scope ?? page);
  const options = exact === undefined ? { name } : { name, exact };
  const target = root.getByRole('button', options);
  const count = await target.count();
  if (count !== 1) {
    throw new Error(
      `clickNoWait: o botão "${name}" casou com ${count} candidato(s); passe \`scope\` (um container) ou \`exact: true\`.`,
    );
  }
  await target.click({ noWaitAfter: true });
}

export const OPEN_DIALOG_TITLES = [
  'Selecione onde este site pode salvar mudanças',
  // Seletor de leitura: Aplicar pasta…, Atualizar de pasta… e Abrir biblioteca (etapa #482).
  'Selecione uma pasta que este site pode ver',
  'Abrir arquivos',
  'Abrir arquivo',
];

/** Digita o caminho no seletor GTK já ativo (ctrl+l, depois o caminho). */
function typePathIntoDialog(windowId, targetPath) {
  execFileSync('xdotool', ['windowactivate', '--sync', windowId]);
  execFileSync('xdotool', ['key', '--clearmodifiers', 'ctrl+l']);
  // O campo pode já ter texto (o GTK guarda o caminho da vez anterior e o `ctrl+l` não o
  // seleciona): sem limpar, o caminho saía dobrado ("…/migracao/tmp/…/migracao"). O `ctrl+a`
  // não seleciona tudo; `Home`, `shift+End` e `BackSpace` sim (como no "Salvar como").
  execFileSync('xdotool', ['key', '--clearmodifiers', 'Home', 'shift+End', 'BackSpace']);
  execFileSync('xdotool', ['type', '--delay', '20', targetPath]);
  // Quando a pasta digitada tem exatamente uma subpasta que casa, o GTK completa a barra de
  // caminho sozinho com o nome dela, já selecionado (sem janela de autocompletar à parte); um
  // "Delete" apaga só esse texto selecionado. Sem seleção (nenhuma ou várias subpastas casando,
  // que abre a janela de autocompletar de verdade), o cursor já está no fim e o Delete não apaga
  // nada: é seguro mandá-lo sempre.
  execFileSync('xdotool', ['key', '--clearmodifiers', 'Delete']);
}

/** Altura máxima (px) de uma janela de autocompletar: ~48 px com 1 sugestão, 94 px com 4. */
const AUTOCOMPLETE_MAX_HEIGHT = 400;

/**
 * Entre `windows` (`{ id, name }`), acha a janela de autocompletar do GTK aberta sobre o seletor:
 * uma janela de nome "chromium" (a principal do Chrome e o seletor têm título próprio)
 * e baixa, cuja altura cresce com o número de sugestões (pastas irmãs com o mesmo começo, como
 * `migracao` e `migracao10`, dão ~94 px; o limite antigo de 70 px não as via). Devolve
 * `{ window, geometry }` ou null. Pura: `geometryOf(id)` é injetável para o teste.
 */
export function pickAutocompletePopup(windows, geometryOf, dialogWindowId) {
  for (const window of windows) {
    if (window.id === dialogWindowId) continue;
    if (!/chromium/i.test(window.name)) continue;
    const geometry = geometryOf(window.id);
    if (geometry.HEIGHT > 0 && geometry.HEIGHT <= AUTOCOMPLETE_MAX_HEIGHT) {
      return { window, geometry };
    }
  }
  return null;
}

/** Janela de autocompletar do GTK aberta sobre o seletor (`pickAutocompletePopup`), ou null. */
function findAutocompletePopup(dialogWindowId) {
  return pickAutocompletePopup(listWindows(), windowGeometry, dialogWindowId);
}

/**
 * Pontos de tela onde clicar no botão **Open** do GTK, dada a geometria `{ X, Y, WIDTH, HEIGHT }`
 * do seletor. O centro medido (seletor de 1124 × 822: o botão fica em (1312, 893), a 50 px da
 * borda direita e 45 px da base) vem primeiro; os outros dois sobem e descem uns 8 px, para o caso
 * de o clique cair na borda do botão (com 28 px da base, que era o valor antigo, errava).
 */
export function openButtonPoints(geometry) {
  const x = geometry.X + geometry.WIDTH - 50;
  const bottom = geometry.Y + geometry.HEIGHT;
  return [45, 37, 53].map((fromBottom) => ({ x, y: bottom - fromBottom }));
}

/**
 * Clica no botão **Open** do GTK por coordenada, dentro da janela do seletor (receita 5, pasta com
 * conteúdo). O primeiro clique só fecha a lista de autocompletar e mantém o caminho: repete com
 * outro ponto do botão enquanto a lista continuar aberta (até 3 pontos).
 */
async function clickOpenButtonByCoordinate(dialogWindowId) {
  for (const point of openButtonPoints(windowGeometry(dialogWindowId))) {
    execFileSync('xdotool', [
      'mousemove',
      String(point.x),
      String(point.y),
      'click',
      '1',
    ]);
    const gone = await waitUntil(() => !findAutocompletePopup(dialogWindowId), {
      timeoutMs: 800,
      stepMs: 100,
    });
    if (gone) return;
  }
}

/**
 * Receita 5 do apêndice A: seletor GTK de pasta ou de arquivo. Ache a janela pelo título,
 * digite o caminho e confirme com alt+o — resolvendo sozinho a lista de autocompletar do GTK
 * quando a pasta já tem conteúdo (ela some da lista do `xdotool`, não some como o seletor).
 */
async function runOpenDialog(
  targetPath,
  { expectAutocomplete = false, timeoutMs = DIALOG_TIMEOUT_MS } = {},
) {
  const windowId = await waitForWindow(OPEN_DIALOG_TITLES, { timeoutMs });
  typePathIntoDialog(windowId, targetPath);
  // Dá tempo para o GTK decidir se abre a lista de autocompletar (ela só aparece quando a
  // pasta digitada já tem conteúdo que casa com o que foi digitado).
  const popup = await waitUntil(() => findAutocompletePopup(windowId), {
    timeoutMs: 1500,
    stepMs: 100,
  });
  if (popup) {
    await clickOpenButtonByCoordinate(windowId);
  } else if (expectAutocomplete) {
    throw new Error('Lista de autocompletar do GTK esperada, mas não apareceu.');
  }
  xdotoolKey(windowId, 'alt+o');
  const closed = await waitUntil(() => !findWindow(OPEN_DIALOG_TITLES), {
    timeoutMs: 4000,
  });
  if (!closed) {
    if (findAutocompletePopup(windowId)) {
      throw new Error(
        'O seletor de arquivo/pasta continuou aberto: lista de autocompletar aberta (pastas irmãs com o mesmo começo).',
      );
    }
    throw new Error('O seletor de arquivo/pasta continuou aberto depois do alt+o.');
  }
  return { hadAutocomplete: Boolean(popup) };
}

/**
 * Caminho relativo (etapa #1256, decisão 8): o diretório do `run` não é a pasta de trabalho, então
 * não se resolve sozinho. Fecha o seletor aberto com Cancelar (`alt+c`, receita 8), sem digitar o
 * caminho, e lança o erro que diz o que fazer. Sem caminho relativo, não faz nada.
 */
async function rejectRelativePath(apoioDir, targetPath, cancel) {
  if (path.isAbsolute(targetPath)) return;
  try {
    await cancel(apoioDir);
  } catch {
    // Sem seletor aberto: o erro do caminho é o que importa.
  }
  throw new Error(
    `caminho relativo '${targetPath}': passe o caminho absoluto (path.resolve)`,
  );
}

/**
 * `select_folder` dos roteiros: abre o seletor de pasta, resolve a lista de autocompletar do
 * GTK quando a pasta já tem conteúdo e, em seguida, trata o pedido de permissão (receita 6).
 * Caminho relativo: cancela o seletor e lança (decisão 8 da #1256).
 */
export async function selectFolder(
  apoioDir,
  targetPath,
  { timeoutMs, cancel = cancelDialog } = {},
) {
  await rejectRelativePath(apoioDir, targetPath, cancel);
  loadEnv(apoioDir);
  const dialogResult = await runOpenDialog(targetPath, { timeoutMs });
  const permissionResult = await allowPermission(apoioDir);
  return { ...dialogResult, permission: permissionResult };
}

/** `open_file` dos roteiros: seletor de arquivo, sem o passo de permissão. */
export async function openFile(
  apoioDir,
  targetPath,
  { timeoutMs, cancel = cancelDialog } = {},
) {
  await rejectRelativePath(apoioDir, targetPath, cancel);
  loadEnv(apoioDir);
  return runOpenDialog(targetPath, { timeoutMs });
}

/**
 * Receita 7 do apêndice A: "Salvar como" (Exportar › Baixar). Recusa-se a sobrescrever um
 * arquivo que já existe, porque o GTK sobrescreve sem perguntar.
 */
export async function saveFile(
  apoioDir,
  targetPath,
  { timeoutMs, cancel = cancelDialog } = {},
) {
  await rejectRelativePath(apoioDir, targetPath, cancel);
  loadEnv(apoioDir);
  if (fs.existsSync(targetPath)) {
    throw new Error(
      `saveFile: ${targetPath} já existe no disco; o GTK sobrescreveria sem perguntar.`,
    );
  }
  let windowId;
  try {
    windowId = await waitForWindow(['Aviso: este site'], { timeoutMs });
  } catch {
    throw new Error(
      `saveFile: o diálogo de salvar ("Aviso: este site…") não apareceu; confira se o Exportar › Baixar foi acionado (janela ativa: "${activeWindowTitle()}").`,
    );
  }
  execFileSync('xdotool', ['windowactivate', '--sync', windowId]);
  execFileSync('xdotool', ['key', '--clearmodifiers', 'Home', 'shift+End', 'BackSpace']);
  execFileSync('xdotool', ['type', '--delay', '20', targetPath]);
  // A lista de autocompletar aparece quando o nome digitado casa com um arquivo da pasta; um
  // só Escape a fecha sem cancelar o diálogo (dois Escapes cancelariam).
  const popup = await waitUntil(() => findAutocompletePopup(windowId), {
    timeoutMs: 1000,
    stepMs: 100,
  });
  if (popup) {
    execFileSync('xdotool', ['key', '--clearmodifiers', 'Escape']);
  }
  xdotoolKey(windowId, 'alt+s');
  const closed = await waitUntil(() => !findWindow(['Aviso: este site']), {
    timeoutMs: 4000,
  });
  if (!closed) {
    // "alt+s que não salva" (apêndice A): espera e repete uma única vez.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (findWindow(['Aviso: este site'])) {
      xdotoolKey(windowId, 'alt+s');
    }
  }
}

/**
 * Receita 8 do apêndice A: cancela o diálogo nativo em foco (`alt+c`). O diálogo nativo é a
 * janela visível que não é a janela principal do Chrome (cujo título sempre termina em
 * "Google Chrome for Testing"); essa é a única forma estável achada nesta fase, já que o título
 * do diálogo varia ("Aviso: este site…", "Selecione onde…", "Abrir arquivos…").
 */
export async function cancelDialog(apoioDir, { timeoutMs = DIALOG_TIMEOUT_MS } = {}) {
  loadEnv(apoioDir);
  const windowId = await waitUntil(
    () => listWindows().find((w) => !/Chrome for Testing$/.test(w.name))?.id,
    { timeoutMs, stepMs: 150 },
  );
  if (!windowId) {
    throw new Error(
      `Nenhum diálogo nativo encontrado para cancelar em ${timeoutMs} ms (janela ativa: "${activeWindowTitle()}").`,
    );
  }
  fs.appendFileSync(
    path.join(apoioDir, 'console.log'),
    `[cancelDialog] alt+c em ${windowId}\n`,
  );
  xdotoolKey(windowId, 'alt+c');
}

/** Uma chamada a `atspi-allow.py`; código 1 ("nenhum botão de permitir") também é sucesso. */
async function runAllowPermissionOnce(scriptPath) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/python3.12', [scriptPath]);
    return stdout.trim();
  } catch (error) {
    if (error.code === 1)
      return (error.stdout ?? '').trim() || 'nenhum botão de permitir';
    throw new Error(
      `allowPermission falhou (código ${error.code}): ${(error.stdout ?? '').trim()} ${(error.stderr ?? '').trim()}`,
      { cause: error },
    );
  }
}

/**
 * Receita 6 do apêndice A: pedido de permissão pelo AT-SPI. Chama `atspi-allow.py`; tanto
 * "clicou" quanto "nenhum botão de permitir" contam como sucesso (a app já tinha a permissão,
 * ou o diálogo já fechou). Decisão desta fase: ativa a janela do Chrome antes de clicar — o
 * `do_action` do AT-SPI devolve sucesso mesmo com a janela do Chrome sem foco (ex.: logo depois
 * de fechar o seletor GTK, que fica com o foco), mas o clique não tem efeito nenhum nesse caso;
 * ativando a janela primeiro, o clique passou a surtir efeito de primeira em todas as tentativas
 * desta fase. Mesmo assim, repete até o diálogo sumir de verdade ("nenhum botão de permitir"
 * numa chamada seguinte) ou até o limite de tentativas, como rede de segurança.
 */
export async function allowPermission(apoioDir) {
  loadEnv(apoioDir);
  const scriptPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'atspi-allow.py',
  );
  const logFile = path.join(apoioDir, 'console.log');
  const attempts = [];
  try {
    const chromeWindowId = findWindow(['Chrome for Testing']);
    if (chromeWindowId) {
      execFileSync('xdotool', ['windowactivate', '--sync', chromeWindowId]);
    }
    // O Chrome ignora cliques nos primeiros instantes do pedido de permissão (proteção contra
    // clique acidental logo que um elemento aparece); sem essa espera, as tentativas rápidas
    // batem nessa janela e o clique do AT-SPI não tem efeito nenhuma vez (visto nesta fase).
    await new Promise((resolve) => setTimeout(resolve, 1000));
    for (let i = 0; i < 6; i += 1) {
      const out = await runAllowPermissionOnce(scriptPath);
      attempts.push(out);
      if (out.startsWith('nenhum botão')) break;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const summary = attempts.join('; ');
    fs.appendFileSync(logFile, `[allowPermission] ${summary}\n`);
    return summary;
  } catch (error) {
    fs.appendFileSync(
      logFile,
      `[allowPermission] falhou depois de ${attempts.length} tentativa(s) (${attempts.join('; ')}): ${error.message}\n`,
    );
    throw error;
  }
}

/** Captura `import -window root` (ImageMagick) em `<apoioDir>/anexos/<name>.png`. */
export async function screenshot(apoioDir, name) {
  loadEnv(apoioDir);
  const anexosDir = path.join(apoioDir, 'anexos');
  fs.mkdirSync(anexosDir, { recursive: true });
  const file = path.join(anexosDir, `${name}.png`);
  await execFileAsync('import', ['-window', 'root', file]);
  return file;
}

/** `Control+Shift+Digit<n>` pelo teclado do Playwright (Control+Shift+1 não funciona). */
export async function windowShortcut(page, n) {
  await page.keyboard.press(`Control+Shift+Digit${n}`);
}

const CADASTRO_HTML = `<!doctype html>
<meta charset="utf-8" />
<body style="font: 20px sans-serif; width: 420px; margin: 0; padding: 32px">
  <h1>Crie sua conta</h1>
  <form>
    <p>Nome<br /><input style="width: 340px; font: inherit" /></p>
    <p>Idade<br /><input style="width: 340px; font: inherit" /></p>
    <p>E-mail<br /><input style="width: 340px; font: inherit" /></p>
    <p><button style="font: inherit; padding: 12px 32px">Cadastrar</button></p>
  </form>
</body>`;

/**
 * Gera `cadastro.png` (docs/TESTING.md, R0, seção "Prepare o print da tela de cadastro"): o
 * HTML vem embutido aqui (o mesmo do guia, não há `cadastro.html` pronto no repositório), aberto
 * num Chromium headless à parte (sempre `/opt/pw-browsers/chromium`, o único caminho que o
 * `chromium.launch()` acha neste ambiente) e capturado com `page.screenshot({ fullPage: true })`.
 */
export async function makeCadastroPng(dest) {
  const browser = await chromium.launch({
    executablePath: HEADLESS_CHROMIUM,
    headless: true,
  });
  try {
    // Viewport pequeno (o guia estima ~484 px de largura a 100%) para o PNG sair recortado no
    // conteúdo, e não do tamanho padrão do viewport do Playwright (1280×720).
    const page = await browser.newPage({ viewport: { width: 484, height: 450 } });
    await page.setContent(CADASTRO_HTML);
    await page.screenshot({ path: dest, fullPage: true });
  } finally {
    await browser.close();
  }
}

/** Acrescenta `<roteiro> <start|end> <hora UTC ISO 8601>` a `<apoioDir>/tempos.log`. */
export function mark(apoioDir, roteiro, fase) {
  if (fase !== 'start' && fase !== 'end') {
    throw new Error(`mark: fase precisa ser "start" ou "end", recebi "${fase}".`);
  }
  const file = path.join(apoioDir, 'tempos.log');
  fs.appendFileSync(file, `${roteiro} ${fase} ${new Date().toISOString()}\n`);
}

/**
 * Lê o texto de um `runs.log` (`<hora ISO> run=<n> codigo=<c> checks=<k> falhas=<f>` por linha,
 * gravado pelo `cloud.mjs run`) e devolve `{ t, checks, falhas }` por linha válida. Pura.
 */
function runsFromLog(text) {
  const runs = [];
  for (const linha of String(text ?? '').split('\n')) {
    const m = linha.match(
      /^(\S+)\s+run=(\d+)\s+codigo=(\d+)\s+checks=(\d+)\s+falhas=(\d+)/,
    );
    const t = m ? Date.parse(m[1]) : Number.NaN;
    if (m && !Number.isNaN(t))
      runs.push({ t, checks: Number(m[4]), falhas: Number(m[5]) });
  }
  return runs;
}

/**
 * Os trechos `[start, end]` de um nome quando as marcas, em ordem de hora, alternam `start`, `end`,
 * `start`, `end` (começam em `start`, terminam em `end`, cada end não antes do seu start); senão `null`.
 */
function trechosAlternados(marcas) {
  const ordem = [...marcas].sort((a, b) => a.t - b.t);
  if (ordem.length === 0 || ordem.length % 2 !== 0) return null;
  const trechos = [];
  for (let i = 0; i < ordem.length; i += 2) {
    const [a, b] = [ordem[i], ordem[i + 1]];
    if (a.fase !== 'start' || b.fase !== 'end') return null;
    trechos.push([a.t, b.t]);
  }
  return trechos;
}

/**
 * Lê o texto de um `tempos.log` (`<nome> <start|end> <hora ISO>` por linha) e devolve, por nome,
 * a duração do primeiro `start` ao último `end`, o total e os avisos (etapa #482, decisão 8).
 * Marca repetida vira aviso; nome sem par (ou com o fim antes do início) fica com `segundos: null`.
 * Com o texto do `runs.log` (etapa #1533, decisão 7), cada item traz também `runs` e `checks`: os
 * `run` gravados entre o primeiro `start` e o último `end` do roteiro.
 * Trechos (etapa #1712, decisão 6): se as marcas de um nome, em ordem de hora, alternam
 * `start`, `end`, `start`, `end` (começam em `start` e terminam em `end`, como no `ambiente` quando o
 * `cloud-up.sh` roda duas vezes), a duração é a soma dos trechos, `runs` e `checks` contam os `run`
 * de dentro de qualquer trecho e não há aviso. Fora desse padrão vale a regra acima.
 */
export function temposFromLog(text, runsText) {
  const nomes = new Map();
  const avisos = [];
  for (const linha of String(text ?? '').split('\n')) {
    const [nome, fase, hora] = linha.trim().split(/\s+/);
    if (!nome || (fase !== 'start' && fase !== 'end')) continue;
    const t = Date.parse(hora ?? '');
    if (Number.isNaN(t)) {
      avisos.push(`${nome} ${fase}: hora inválida "${hora ?? ''}" (linha ignorada)`);
      continue;
    }
    const e = nomes.get(nome) ?? { start: [], end: [], marcas: [] };
    e[fase].push(t);
    e.marcas.push({ fase, t });
    nomes.set(nome, e);
  }
  const runs = runsText === undefined ? null : runsFromLog(runsText);
  const itens = [];
  let totalSegundos = 0;
  const totalRuns = { runs: 0, checks: 0 };
  for (const [nome, e] of nomes) {
    const trechos = trechosAlternados(e.marcas);
    for (const fase of ['start', 'end']) {
      if (!trechos && e[fase].length > 1) {
        avisos.push(
          `${nome} ${fase}: marca repetida (${e[fase].length} vezes); valem o primeiro start e o último end`,
        );
      }
    }
    const ini = e.start.length ? Math.min(...e.start) : null;
    const fim = e.end.length ? Math.max(...e.end) : null;
    let segundos = null;
    if (trechos) {
      segundos = Math.round(trechos.reduce((soma, [a, b]) => soma + (b - a), 0) / 1000);
      totalSegundos += segundos;
    } else if (ini === null || fim === null) {
      avisos.push(`${nome}: falta a marca de ${ini === null ? 'start' : 'end'}`);
    } else if (fim < ini) {
      avisos.push(`${nome}: o end vem antes do start`);
    } else {
      segundos = Math.round((fim - ini) / 1000);
      totalSegundos += segundos;
    }
    const item = { nome, segundos };
    if (runs) {
      const dentro =
        segundos === null
          ? []
          : runs.filter((r) =>
              (trechos ?? [[ini, fim]]).some(([a, b]) => r.t >= a && r.t <= b),
            );
      item.runs = dentro.length;
      item.checks = dentro.reduce((soma, r) => soma + r.checks, 0);
      totalRuns.runs += item.runs;
      totalRuns.checks += item.checks;
    }
    itens.push(item);
  }
  const result = { itens, avisos, totalSegundos };
  if (runs)
    Object.assign(result, { totalRuns: totalRuns.runs, totalChecks: totalRuns.checks });
  return result;
}

/** `<apoioDir>/tempos.log` lido por `temposFromLog`, com o `runs.log` quando existe; sem o arquivo, não há nada medido. */
export function temposFromDir(apoioDir) {
  const file = path.join(apoioDir, 'tempos.log');
  if (!fs.existsSync(file)) {
    return { itens: [], avisos: ['sem tempos.log: tempo não medido'], totalSegundos: 0 };
  }
  const runsFile = path.join(apoioDir, 'runs.log');
  return temposFromLog(
    fs.readFileSync(file, 'utf8'),
    fs.existsSync(runsFile) ? fs.readFileSync(runsFile, 'utf8') : undefined,
  );
}

const fmtDuracao = (s) => `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}s`;

/** O texto que a CLI imprime e que o relato copia no "Tempo por roteiro". */
export function formatTempos({ itens, avisos, totalSegundos, totalRuns, totalChecks }) {
  const largura = Math.max(5, ...itens.map((i) => i.nome.length));
  const contagem = (runs, checks) =>
    runs === undefined ? '' : `  ${runs} run, ${checks} checks`;
  const linhas = itens.map(
    (i) =>
      `${i.nome.padEnd(largura)}  ${i.segundos === null ? 'tempo não medido' : fmtDuracao(i.segundos)}${contagem(i.runs, i.checks)}`,
  );
  if (itens.length)
    linhas.push(
      `${'total'.padEnd(largura)}  ${fmtDuracao(totalSegundos)}${contagem(totalRuns, totalChecks)}`,
    );
  for (const a of avisos) linhas.push(`aviso: ${a}`);
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------------------------
// state(): agir e conferir numa chamada (etapa #421, decisão 6)
// ---------------------------------------------------------------------------------------------

/** Compara dois JSON e lista o que mudou (pura). Ver `diffJson`. */
function collectDiff(before, after, where, out) {
  const isObj = (v) => v !== null && typeof v === 'object';
  const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  if (!isObj(before) || !isObj(after) || Array.isArray(before) !== Array.isArray(after)) {
    if (before !== after) {
      if (isObj(before) || isObj(after))
        out.push(
          `~ ${where || '(raiz)'}: ${isObj(before) ? 'estrutura' : show(before)} → ${isObj(after) ? 'estrutura' : show(after)}`,
        );
      else out.push(`~ ${where || '(raiz)'}: ${show(before)} → ${show(after)}`);
    }
    return;
  }
  if (Array.isArray(before)) {
    const byId = [...before, ...after].every(
      (v) => isObj(v) && !Array.isArray(v) && typeof v.id === 'string',
    );
    if (byId) {
      const old = new Map(before.map((v) => [v.id, v]));
      const next = new Map(after.map((v) => [v.id, v]));
      for (const [id, value] of next) {
        const label = `${where}[${id}]`;
        if (!old.has(id)) out.push(`+ ${label}`);
        else collectDiff(old.get(id), value, label, out);
      }
      for (const id of old.keys()) if (!next.has(id)) out.push(`- ${where}[${id}]`);
      return;
    }
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i += 1) {
      const label = `${where}[${i}]`;
      if (i >= before.length)
        out.push(isObj(after[i]) ? `+ ${label}` : `+ ${label} = ${show(after[i])}`);
      else if (i >= after.length) out.push(`- ${label}`);
      else collectDiff(before[i], after[i], label, out);
    }
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const label = where ? `${where}.${key}` : key;
    if (!(key in before))
      out.push(isObj(after[key]) ? `+ ${label}` : `+ ${label} = ${show(after[key])}`);
    else if (!(key in after)) out.push(`- ${label}`);
    else collectDiff(before[key], after[key], label, out);
  }
}

/**
 * Lista caminhos alterados (`~ a.b: antigo → novo`), acrescentados (`+ a[id]`) e removidos
 * (`- a.b`) entre dois JSON; itens de array com `id` são casados pelo id. Passando de `limit`,
 * a última linha diz `+N mudanças além do limite`. Pura.
 */
export function diffJson(before, after, { limit = 20 } = {}) {
  const lines = [];
  collectDiff(before, after, '', lines);
  if (lines.length <= limit) return lines;
  return [...lines.slice(0, limit), `+${lines.length - limit} mudanças além do limite`];
}

const SELECTION_WORD = { marking: 'marcação', image: 'container', arrow: 'seta' };

/** A linha `Seleção:` do `formatState` (etapa #1076, decisão 11). */
function formatSelection(selection) {
  if (!selection) return 'Seleção: nenhuma';
  if (selection.name === undefined) return `Seleção: ${selection.type} ${selection.id}`;
  const word = SELECTION_WORD[selection.type] ?? selection.type;
  return `Seleção: ${word} "${selection.name}" (${selection.id})`;
}

/**
 * A seleção do `state()` (etapa #1076, decisão 11): do `data-selection` (`"<tipo> <id>"`) e, com o
 * `mapping.json` lido, o nome (`sem nome` se vazio; a seta é `"<origem> → <destino>"`). Sem
 * `json`, ou com o id fora do disco (item da proposta na revisão), fica só o tipo e o id.
 */
function resolveSelection(text, json) {
  if (text === undefined) return undefined;
  if (!text) return null;
  const [type, id] = text.split(' ');
  const selection = { type, id };
  if (!json) return selection;
  const nameOf = (item) => (item.name ? item.name : 'sem nome');
  if (type === 'arrow') {
    const arrow = (json.arrows ?? []).find((a) => a.id === id);
    if (!arrow) return selection;
    const mark = (ref) => (json.markings ?? []).find((m) => m.id === ref);
    const from = mark(arrow.from);
    const to = mark(arrow.to);
    return {
      ...selection,
      name: `${from ? nameOf(from) : 'sem nome'} → ${to ? nameOf(to) : 'sem nome'}`,
    };
  }
  const list = type === 'image' ? json.containers : json.markings;
  const item = (list ?? []).find((i) => i.id === id);
  return item ? { ...selection, name: nameOf(item) } : selection;
}

/** Texto curto do estado (poucas linhas, sem JSON cru). */
export function formatState(state) {
  const quoted = (items) =>
    items.length ? items.map((i) => `"${i}"`).join(', ') : 'nenhum';
  const lines = [
    `Aba: ${state.title} — ${state.url}`,
    `Diálogos: ${quoted(state.dialogs)}`,
    `Avisos: ${quoted(state.notices)}`,
    `Gravação: ${state.saveStatus ?? 'sem indicador'}`,
    `Foco: ${state.focus ? `${state.focus.role} "${state.focus.name}"` : 'nenhum'}`,
  ];
  if (state.selection !== undefined) lines.push(formatSelection(state.selection));
  lines.push(`Janelas nativas: ${quoted(state.windows)}`);
  const project = state.project;
  if (project) {
    if (project.dir) lines.push(`Pasta: ${project.dir}`);
    if (project.error) {
      lines.push(`mapping.json: ${project.error}`);
    } else if (project.changes === null) {
      lines.push(`mapping.json: revision ${project.revision} (primeira leitura)`);
    } else if (project.changes.length === 0) {
      lines.push(
        `mapping.json: revision ${project.revision}, sem mudança desde a última leitura`,
      );
    } else {
      lines.push(`mapping.json: revision ${project.revision}; mudou:`);
      for (const change of project.changes) lines.push(`  ${change}`);
    }
  }
  return lines.join('\n');
}

/** Lê o DOM da app (roda dentro da página): diálogos, avisos, gravação e foco. */
function readAppDom() {
  const visible = (el) =>
    !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const labelled = (el) => {
    const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    return ids
      .map((id) => text(document.getElementById(id) ?? document.createElement('i')))
      .join(' ')
      .trim();
  };
  const dialogs = [];
  for (const el of document.querySelectorAll(
    'dialog[open], [role="dialog"], [role="alertdialog"]',
  )) {
    if (!visible(el)) continue;
    const name =
      el.getAttribute('aria-label') ||
      labelled(el) ||
      text(el.querySelector('h1,h2,h3') ?? document.createElement('i'));
    dialogs.push(name || '(sem nome)');
  }
  const notices = [];
  for (const el of document.querySelectorAll(
    '[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])',
  )) {
    if (!visible(el) || el.closest('.status-item')) continue;
    const value = text(el).slice(0, 120);
    if (value && !notices.includes(value)) notices.push(value);
    if (notices.length >= 8) break;
  }
  const saveEl = document.querySelector(
    '.status-item-error, .status-item-ok, .status-item[aria-live]',
  );
  const saveStatus = saveEl ? text(saveEl) : null;
  const implicit = {
    BUTTON: 'button',
    A: 'link',
    SELECT: 'combobox',
    TEXTAREA: 'textbox',
    SUMMARY: 'button',
  };
  const inputRole = {
    checkbox: 'checkbox',
    radio: 'radio',
    button: 'button',
    submit: 'button',
    range: 'slider',
  };
  const active = document.activeElement;
  let focus = null;
  if (active && active !== document.body && active !== document.documentElement) {
    const tag = active.tagName;
    const role =
      active.getAttribute('role') ||
      (tag === 'INPUT'
        ? (inputRole[active.type] ?? 'textbox')
        : (implicit[tag] ?? tag.toLowerCase()));
    const label = active.id
      ? document.querySelector(`label[for="${CSS.escape(active.id)}"]`)
      : null;
    const name =
      active.getAttribute('aria-label') ||
      labelled(active) ||
      (label ? text(label) : '') ||
      (tag === 'BUTTON' || tag === 'A' ? text(active) : '') ||
      active.getAttribute('title') ||
      active.getAttribute('placeholder') ||
      text(active).slice(0, 60);
    focus = { role, name: name.slice(0, 80) };
  }
  return {
    title: document.title,
    url: location.href,
    dialogs,
    notices,
    saveStatus,
    focus,
    selection: document.querySelector('.canvas-host')?.dataset.selection ?? null,
  };
}

/** Lê e parseia `<projectDir>/mapping.json`; JSON que não parseia: espera 1 s e lê uma vez mais. */
async function readMapping(projectDir) {
  const file = path.join(projectDir, 'mapping.json');
  if (!fs.existsSync(file)) return { error: `não existe em ${projectDir}` };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { json: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (error) {
      if (attempt === 1) return { error: `JSON inválido (${error.message})` };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return { error: 'JSON inválido' };
}

/** A pasta que o `state()` lembra (`apoio/state/ultima-pasta.txt`), ou `undefined`. */
function lastFolder(apoioDir) {
  try {
    return (
      fs.readFileSync(path.join(apoioDir, 'state', 'ultima-pasta.txt'), 'utf8').trim() ||
      undefined
    );
  } catch {
    return undefined;
  }
}

/** Grava `ultima-pasta.txt` só quando o conteúdo muda (a pasta lembrada não fica velha nem é regravada à toa). */
function rememberFolder(file, absolute) {
  try {
    if (fs.readFileSync(file, 'utf8').trim() === absolute) return;
  } catch {
    // Sem o arquivo: grava.
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, absolute);
}

/**
 * Estado numa chamada, para agir e conferir sem idas extras ao modelo: aba, diálogos abertos,
 * avisos visíveis, gravação, foco, janelas nativas além do Chrome e, com `projectDir`, a
 * `revision` do `mapping.json` e o que mudou desde a última chamada para a mesma pasta (o
 * retrato anterior fica em `<apoioDir>/state/`). Não muda a app: lê o DOM e o disco.
 */
export async function state(page, apoioDir, { projectDir } = {}) {
  loadEnv(apoioDir);
  const lastFolderFile = path.join(apoioDir, 'state', 'ultima-pasta.txt');
  // `undefined`: a pasta gravada, se houver; `null`: não lê disco (etapa #1256, decisão 9).
  const explicitFolder = typeof projectDir === 'string' && projectDir !== '';
  if (projectDir === undefined && fs.existsSync(lastFolderFile)) {
    projectDir = fs.readFileSync(lastFolderFile, 'utf8').trim() || undefined;
  }
  await settle(page, { timeoutMs: STATE_SETTLE_MS });
  const dom = await page.evaluate(readAppDom);
  let windows;
  try {
    windows = [
      ...new Set(
        listWindows()
          .map((w) => w.name)
          .filter((n) => n && !/Chrome for Testing$/.test(n)),
      ),
    ];
  } catch {
    windows = [];
  }
  const result = { ...dom, windows, selection: resolveSelection(dom.selection, null) };
  if (projectDir) {
    const absolute = path.resolve(projectDir);
    // Pasta explícita: lembrada mesmo se a leitura falha, e só regravada quando muda (#1430 e).
    if (explicitFolder) rememberFolder(lastFolderFile, absolute);
    const read = await readMapping(projectDir);
    if (read.error) {
      result.project = {
        revision: null,
        changes: null,
        error: read.error,
        dir: absolute,
      };
    } else {
      const dir = path.join(apoioDir, 'state');
      const key = createHash('sha1')
        .update(path.resolve(projectDir))
        .digest('hex')
        .slice(0, 12);
      const snapshot = path.join(dir, `${key}.json`);
      let changes = null;
      if (fs.existsSync(snapshot)) {
        changes = diffJson(JSON.parse(fs.readFileSync(snapshot, 'utf8')), read.json);
      }
      fs.writeFileSync(snapshot, JSON.stringify(read.json));
      result.project = { revision: read.json.revision ?? null, changes, dir: absolute };
      result.selection = resolveSelection(dom.selection, read.json);
    }
  }
  return result;
}

/**
 * Lê o `data-container-boxes` do `.canvas-host` (etapa #1076, decisão 5): `"<id> <x> <y> <largura>
 * <altura> <escala>"` por container colocado, separados por `;`, em unidades do canvas e na
 * colocação desenhada. Devolve um `Map` de id para `{ x, y, width, height, scale }`; texto vazio ou
 * nulo dá um `Map` vazio; entrada sem os 5 números depois do id lança com o texto.
 */
export function parseContainerBoxes(text) {
  const boxes = new Map();
  for (const entry of String(text ?? '').split(';')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [id, ...rest] = trimmed.split(/\s+/);
    const numbers = rest.map(Number);
    if (numbers.length !== 5 || !numbers.every(Number.isFinite)) {
      throw new Error(`data-container-boxes inválido: "${trimmed}"`);
    }
    const [x, y, width, height, scale] = numbers;
    boxes.set(id, { x, y, width, height, scale });
  }
  return boxes;
}

/**
 * A colocação (x, y, escala) de `found` no canvas: a desenhada (`boxes`) vale sobre a do disco e
 * sobre a da perspectiva; sem ela, a da perspectiva (se `found` é raiz dela) ou a do disco.
 * `warn` recebe o aviso quando a perspectiva pedida tem outra posição que a desenhada.
 */
function placementOf(found, { boxes, perspective, mapping, warn }) {
  let named;
  if (perspective) {
    named = (mapping.perspectives ?? []).find(
      (q) => q.name.toLowerCase() === String(perspective).toLowerCase(),
    );
    if (!named) throw new Error(`perspectiva não encontrada: ${perspective}`);
  }
  const item = named?.items.find((i) => i.root === found.id);
  const drawn = found.id ? boxes.get(found.id) : undefined;
  if (drawn) {
    if (item && (item.x !== drawn.x || item.y !== drawn.y)) {
      warn?.(`a perspectiva ${named.name} não é a desenhada; vale a posição desenhada`);
    }
    return { x: drawn.x, y: drawn.y, scale: drawn.scale };
  }
  const { x, y, scale } = found.placement;
  return item ? { x: item.x, y: item.y, scale } : { x, y, scale };
}

/**
 * Ponto de tela de um ponto em pixels de um container (etapa #841, decisão 5; parte pura, sem CDP).
 * `mapping` é o `mapping.json` já lido; `container` é o nome (sem diferença de caixa) ou o id;
 * `viewport` é o `data-viewport` do `.canvas-host` (`"x y escala"`, px CSS relativos ao canto do
 * host); `host` é o canto do host na página (`boundingBox()`); `perspective`, opcional, é o nome
 * de uma perspectiva cujo item para o container (raiz) troca a posição `x`, `y` dele no canvas;
 * `boxes` (opcional, etapa #1076) é o texto do `data-container-boxes`: a posição desenhada, que vale
 * sobre a do disco e sobre a da perspectiva (com `warn`, avisa a perspectiva que difere dela);
 * `marking` (opcional): `container` é o nome ou id de uma marcação e (x, y) são deslocamentos a partir do
 * canto dela.
 * A fórmula é a da receita "Onde está uma marcação na tela": canvas = placement + ponto × escala
 * do container; tela = host + canvas × escala da vista + (x, y) da vista.
 */
export function containerScreenPoint({
  mapping,
  container,
  x,
  y,
  viewport,
  host,
  perspective,
  marking,
  boxes,
  warn,
}) {
  const wanted = String(container).trim().toLowerCase();
  const byName = (list) =>
    (list ?? []).filter(
      (c) => c.id === container || (c.name ?? '').toLowerCase() === wanted,
    );
  let found;
  let origin = { x: 0, y: 0 };
  if (marking) {
    // (x, y) são deslocamentos a partir do canto de cima à esquerda da marcação, nos pixels do
    // container dela (no canvas, com a colocação identidade, se `containerId` for nulo).
    const marks = byName(mapping.markings);
    if (marks.length === 0) throw new Error(`marcação não encontrada: ${container}`);
    if (marks.length > 1) throw new Error(`mais de uma marcação se chama ${container}`);
    const mark = marks[0];
    origin = { x: mark.rect.x, y: mark.rect.y };
    found = mark.containerId
      ? (mapping.containers ?? []).find((c) => c.id === mark.containerId)
      : { id: null, placement: { x: 0, y: 0, scale: 1 } };
    if (!found) throw new Error(`container da marcação não encontrado: ${container}`);
  } else {
    const matches = byName(mapping.containers);
    if (matches.length === 0) throw new Error(`container não encontrado: ${container}`);
    if (matches.length > 1) throw new Error(`mais de um container se chama ${container}`);
    found = matches[0];
  }
  const drawn = boxes instanceof Map ? boxes : parseContainerBoxes(boxes);
  const {
    x: px,
    y: py,
    scale,
  } = placementOf(found, {
    boxes: drawn,
    perspective,
    mapping,
    warn,
  });
  const [vx, vy, vs] = String(viewport).trim().split(/\s+/).map(Number);
  if (![vx, vy, vs].every(Number.isFinite) || vs <= 0) {
    throw new Error(`data-viewport inválido: ${viewport}`);
  }
  const canvasX = px + (origin.x + x) * scale;
  const canvasY = py + (origin.y + y) * scale;
  return {
    x: Math.round((host.x + canvasX * vs + vx) * 100) / 100,
    y: Math.round((host.y + canvasY * vs + vy) * 100) / 100,
  };
}

/** Espera dois quadros, para os `data-*` lidos depois serem os do quadro desenhado. */
function nextFrames(page) {
  return page.evaluate(
    () =>
      new Promise((ok) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(ok)),
      ),
  );
}

/** Roda na página: o ponto cai no `.canvas-host`? Devolve `{ ok, element }` (ver `onCanvas`). */
function onCanvasInPage({ x, y }) {
  const target = document.elementFromPoint(x, y);
  if (!target) return { ok: false, element: 'nada' };
  const label = `${target.tagName.toLowerCase()}${target.classList.length ? `.${target.classList[0]}` : ''}`;
  const named = target.closest('[aria-label],[aria-labelledby]');
  let name = named?.getAttribute('aria-label') ?? '';
  if (named && !name) {
    name = (named.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
  }
  return {
    ok: !!target.closest('.canvas-host'),
    element: name ? `${label} "${name}"` : label,
  };
}

/**
 * O ponto de tela cai no canvas (etapa #1076, decisão 7)? `ok` é verdadeiro quando o elemento no
 * ponto (`elementFromPoint`) está dentro do `.canvas-host`; o minimapa, uma janela ou a barra por
 * cima dão falso. `element` descreve o que está lá: a tag, a primeira classe e o nome acessível do
 * ancestral mais próximo que tem um (`div.dock "Janelas"`). É a conferência única do `ponto`, do
 * `drag` e do `paletteDrag`.
 */
export async function onCanvas(page, point) {
  return page.evaluate(onCanvasInPage, { x: point.x, y: point.y });
}

/**
 * Lê o `data-viewport`, o `data-container-boxes` e o canto do `.canvas-host` pela página (CDP) e
 * converte (ver acima). A posição que vale é a desenhada; com `perspective` diferente dela, avisa
 * (`warn`, padrão stderr) e usa a desenhada. Ponto que não cai no canvas (`onCanvas`) também avisa,
 * e o ponto é devolvido do mesmo jeito.
 */
export async function ponto(
  page,
  projectDir,
  container,
  x,
  y,
  { perspective, marking, warn = (m) => console.error(m) } = {},
) {
  const read = await readMapping(projectDir);
  if (read.error) throw new Error(read.error);
  const host = page.locator('.canvas-host');
  await nextFrames(page);
  const viewport = await host.getAttribute('data-viewport');
  const boxes = await host.getAttribute('data-container-boxes');
  const box = await host.boundingBox();
  if (!viewport || !box)
    throw new Error('o .canvas-host não tem data-viewport (a app abriu o projeto?)');
  const at = containerScreenPoint({
    mapping: read.json,
    container,
    x,
    y,
    viewport,
    host: { x: box.x, y: box.y },
    perspective,
    marking,
    boxes: boxes ?? undefined,
    warn,
  });
  const on = await onCanvas(page, at);
  if (!on.ok) {
    warn(
      `o ponto (${at.x}, ${at.y}) não cai no canvas (${on.element}); o .canvas-host ocupa ${box.x}, ${box.y}, ${box.width} × ${box.height}`,
    );
  }
  return at;
}

/**
 * O centro da vista (etapa #1076, decisão 9): `x` e `y` são o ponto de tela (px do viewport, o que
 * o `page.mouse` aceita) do centro do `.canvas-host`; `canvas` é o mesmo ponto em unidades do
 * canvas, `((largura / 2 − vx) / escala, (altura / 2 − vy) / escala)`, com o `data-viewport`.
 */
export async function viewCenter(page) {
  const host = page.locator('.canvas-host');
  await nextFrames(page);
  const viewport = await host.getAttribute('data-viewport');
  const box = await host.boundingBox();
  if (!viewport || !box)
    throw new Error('o .canvas-host não tem data-viewport (a app abriu o projeto?)');
  const [vx, vy, vs] = viewport.trim().split(/\s+/).map(Number);
  if (![vx, vy, vs].every(Number.isFinite) || vs <= 0) {
    throw new Error(`data-viewport inválido: ${viewport}`);
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    x: round(box.x + box.width / 2),
    y: round(box.y + box.height / 2),
    canvas: {
      x: round((box.width / 2 - vx) / vs),
      y: round((box.height / 2 - vy) / vs),
    },
  };
}

/**
 * Lê o `data-arrow-handles` (etapa #1076, decisão 10; parte pura): entradas `"<nome> <x> <y>"`
 * separadas por `;`, em px CSS relativos ao canto do host. Devolve o objeto do nome (`center`,
 * `from`, `to`, `point0`, `mid0`, `segment0` …) para o ponto de tela (o canto `host` somado).
 */
export function parseArrowHandles(text, host) {
  const handles = {};
  for (const entry of String(text ?? '').split(';')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [name, x, y, ...extra] = trimmed.split(/\s+/);
    if (extra.length > 0 || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
      throw new Error(`data-arrow-handles inválido: "${trimmed}"`);
    }
    handles[name] = {
      x: Math.round((host.x + Number(x)) * 100) / 100,
      y: Math.round((host.y + Number(y)) * 100) / 100,
    };
  }
  return handles;
}

/**
 * Os pontos de tela do meio (`center`) e das alças da seta selecionada (etapa #1076, decisão 10),
 * ou `null` sem seta selecionada e desenhada. Releia depois de abrir ou fechar uma janela (o host
 * muda de tamanho) e depois de pan e zoom.
 */
export async function arrowHandlesOf(page) {
  const host = page.locator('.canvas-host');
  await nextFrames(page);
  const text = await host.getAttribute('data-arrow-handles');
  if (!text) return null;
  const box = await host.boundingBox();
  if (!box) return null;
  return parseArrowHandles(text, { x: box.x, y: box.y });
}

/** Prazo do `settle` que o `state()` faz antes de ler (abaixo dos 3 s do estado do `runStep`). */
const STATE_SETTLE_MS = 2000;

/**
 * Roda na página (etapa #1148, decisão 7): espera a barra de status sem "Salvando…", dois quadros e
 * o DOM sem mutação por 200 ms. Devolve `null` ao cumprir tudo, ou o texto da condição que faltou
 * ao estourar `timeoutMs`. Não usa nada fora do próprio corpo (o Playwright a serializa).
 */
function settleInPage({ timeoutMs, savingPattern }) {
  return new Promise((resolve) => {
    const saving = new RegExp(savingPattern, 'i');
    let lastMutation = Date.now();
    let frames = 0;
    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const isSaving = () =>
      [...document.querySelectorAll('.status-item')].some((el) =>
        saving.test(el.textContent ?? ''),
      );
    const finish = (value) => {
      observer.disconnect();
      resolve(value);
    };
    const started = Date.now();
    const tick = () => {
      frames += 1;
      const quiet = Date.now() - lastMutation >= 200;
      if (frames >= 2 && quiet && !isSaving()) return finish(null);
      if (Date.now() - started >= timeoutMs) {
        if (isSaving()) return finish('a barra de status continuou em "Salvando…"');
        if (!quiet) return finish('o DOM continuou mudando (sem 200 ms de silêncio)');
        return finish('os dois quadros não se completaram');
      }
      globalThis.requestAnimationFrame(tick);
    };
    globalThis.requestAnimationFrame(tick);
  });
}

/**
 * Espera a app assentar (etapa #1148, decisão 7): sem "Salvando…", dois quadros e 200 ms sem
 * mutação do DOM. Estouro do prazo não é erro: devolve e escreve (`warn`) o aviso com a condição
 * que faltou. Devolve `null` quando assentou. Use no lugar de `waitForTimeout`.
 */
export async function settle(
  page,
  { timeoutMs = 5000, warn = (m) => console.error(m) } = {},
) {
  const unmet = await page.evaluate(settleInPage, {
    timeoutMs,
    savingPattern: 'Salvando…|Saving…',
  });
  if (!unmet) return null;
  const message = `Aviso: settle esgotou ${timeoutMs} ms: ${unmet}`;
  warn(message);
  return message;
}

/** Ids das janelas de ferramenta (`src/store/toolWindows.ts`), os de `[data-strip-window]`. */
export const TOOL_WINDOW_IDS = [
  'tree',
  'layers',
  'details',
  'list',
  'incomplete',
  'diagnostics',
  'proposals',
  'notices',
  'comments',
  'catalog',
];

async function setWindowOpen(page, id, wanted) {
  if (!TOOL_WINDOW_IDS.includes(id)) {
    throw new Error(`janela desconhecida: ${id}. Ids: ${TOOL_WINDOW_IDS.join(', ')}`);
  }
  const button = page.locator(`[data-strip-window="${id}"]`);
  const pressed = (await button.getAttribute('aria-pressed')) === 'true';
  if (pressed !== wanted) await button.click();
  await page
    .locator(`[data-window="${id}"]`)
    .waitFor({ state: wanted ? 'visible' : 'hidden' });
}

/** Abre a janela de ferramenta `id` só se estiver fechada (idempotente; nunca alterna). */
export async function openWindow(page, id) {
  await setWindowOpen(page, id, true);
}

/** Fecha a janela de ferramenta `id` só se estiver aberta (idempotente; nunca alterna). */
export async function closeWindow(page, id) {
  await setWindowOpen(page, id, false);
}

/** Raio de acerto da alça do container na app (`HANDLE_HIT_RADIUS`, `src/canvas/input/intents.ts`). */
const HANDLE_MAX_RADIUS = 22;
const HANDLE_MIN_RADIUS = 12;

/**
 * Raio (px de tela) da alça de uma caixa: `handleHitRadius` de `src/canvas/markingGeometry.ts` para
 * marcação; o container usa sempre o fixo (`HANDLE_HIT_RADIUS` em `intents.ts`).
 */
function handleRadius(box, container = false) {
  if (container) return HANDLE_MAX_RADIUS;
  const side = Math.min(box.width, box.height) / 3;
  return Math.min(HANDLE_MAX_RADIUS, Math.max(HANDLE_MIN_RADIUS, side));
}

/**
 * Nome do canto (`nw`, `ne`, `sw`, `se`) da caixa (`{ x, y, width, height }` em px de tela) que a
 * app pegaria em `point`, ou `null` (etapa #1256, decisão 10). Igual à app: só os quatro cantos
 * (`CORNERS`), distância em xadrez (`cornerAt`) e raio `clamp(min(largura, altura) / 3, 12, 22)`.
 * Um ponto fora da caixa também conta (o rótulo do container fica acima da borda). Pura.
 */
export function nearHandle(box, point, { container = false } = {}) {
  const radius = handleRadius(box, container);
  const corners = [
    ['nw', box.x, box.y],
    ['ne', box.x + box.width, box.y],
    ['sw', box.x, box.y + box.height],
    ['se', box.x + box.width, box.y + box.height],
  ];
  let best = null;
  let bestDistance = Infinity;
  for (const [name, cx, cy] of corners) {
    const d = Math.max(Math.abs(cx - point.x), Math.abs(cy - point.y));
    if (d <= radius && d < bestDistance) {
      best = name;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Arrasta de `de` até `para` (pontos de tela `{ x, y }`, por exemplo do `ponto`; etapa #1148,
 * decisão 9): clica em `de` para selecionar (com `select`), espera `settle`, `mouse.down`, um
 * quadro, `mouse.move` em `steps` passos e `mouse.up`. Se `de` cair no raio de uma alça da
 * `data-selection-box` (o da app, `nearHandle`), avisa (`warn`) que o arrasto pode redimensionar, e segue.
 * Etapa #1076 (decisão 8): `de` que não cai no canvas (`onCanvas`) lança antes de qualquer ação do
 * mouse, salvo com `allowOffCanvas: true` (o `para` não se confere: o arrasto pode sair do canvas
 * de propósito); o clique de seleção que deixa o `data-selection` vazio avisa que não selecionou nada.
 */
export async function drag(
  page,
  de,
  para,
  {
    select = true,
    steps = 10,
    warn = (m) => console.error(m),
    allowOffCanvas = false,
  } = {},
) {
  if (!allowOffCanvas) {
    const on = await onCanvas(page, de);
    if (!on.ok) {
      throw new Error(
        `drag: o ponto de partida (${de.x}, ${de.y}) não cai no canvas (${on.element})`,
      );
    }
  }
  if (select) {
    await page.mouse.click(de.x, de.y);
    await settle(page);
    if (!(await page.locator('.canvas-host').getAttribute('data-selection'))) {
      warn(`o clique em (${de.x}, ${de.y}) não selecionou nada`);
    }
  }
  const host = page.locator('.canvas-host');
  const text = await host.getAttribute('data-selection-box');
  const hostBox = text ? await host.boundingBox() : null;
  if (text && hostBox) {
    const [l, t, w, h] = text.split(' ').map(Number);
    // A caixa não diz se é container ou marcação: vale o raio maior (o do container), que contém
    // o da marcação; avisar a mais é inofensivo, avisar a menos deixa o arrasto redimensionar.
    const handle = nearHandle(
      { x: hostBox.x + l, y: hostBox.y + t, width: w, height: h },
      de,
      { container: true },
    );
    if (handle) {
      warn(
        `perto da alça ${handle}: o arrasto pode redimensionar (a alça pega até ${Math.round(handleRadius({ width: w, height: h }, true))} px do canto; parta de mais longe)`,
      );
    }
  }
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.evaluate(
    () => new Promise((ok) => globalThis.requestAnimationFrame(() => ok(null))),
  );
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      de.x + ((para.x - de.x) * i) / steps,
      de.y + ((para.y - de.y) * i) / steps,
    );
  }
  await page.mouse.up();
}

/** Roda na página: os grupos (`aria-label` das `section.library-group`) que têm um item com o nome exato do tipo. */
function paletteGroupsOf({ tipo }) {
  return [...document.querySelectorAll('section.library-group')]
    .filter((group) =>
      [...group.querySelectorAll('li.library-type .library-type-name')].some(
        (name) => name.textContent?.trim() === tipo,
      ),
    )
    .map((group) => group.getAttribute('aria-label') ?? '');
}

/**
 * Dispara o arrasto da Paleta por eventos (roda na página): `dragstart`, `dragover`, `drop`,
 * `dragend`. Devolve `{ ok: true }` ou `{ motivo }`: "o item '<tipo>' sumiu da Paleta" ou "o ponto
 * (x, y) não cai no canvas (<elemento>)" (sem elemento no ponto; a conferência de estar dentro do
 * `.canvas-host` é a do `onCanvas`, feita pelo `paletteDrag` antes).
 */
function syntheticPaletteDrag({ tipo, para, grupo }) {
  const groups = grupo
    ? [...document.querySelectorAll('section.library-group')].filter(
        (g) => g.getAttribute('aria-label') === grupo,
      )
    : [document];
  const item = groups
    .flatMap((root) => [...root.querySelectorAll('li.library-type')])
    .find((li) => li.querySelector('.library-type-name')?.textContent?.trim() === tipo);
  if (!item) return { motivo: `o item '${tipo}' sumiu da Paleta` };
  const target = document.elementFromPoint(para.x, para.y);
  if (!target)
    return { motivo: `o ponto (${para.x}, ${para.y}) não cai no canvas (nada)` };
  const data = new DataTransfer();
  const fire = (el, type) =>
    el.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
        clientX: para.x,
        clientY: para.y,
      }),
    );
  fire(item, 'dragstart');
  fire(target, 'dragover');
  fire(target, 'drop');
  fire(item, 'dragend');
  return { ok: true };
}

/** Quanto o `paletteDrag` espera o autosave gravar a marcação nova antes de dar o arrasto por falho. */
const PALETTE_WAIT_MS = 2000;

/** Espera (até `waitMs`) o `mapping.json` passar de `before` marcações: o autosave grava depois do `settle`. */
async function markingsGrewTo(projectDir, before, waitMs) {
  const start = Date.now();
  for (;;) {
    if ((await countMarkings(projectDir)) > before) return true;
    if (Date.now() - start >= waitMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Número de marcações do `mapping.json` da pasta (a medida do `paletteDrag`); lança se não lê. */
async function countMarkings(projectDir) {
  const read = await readMapping(projectDir);
  if (read.error) {
    throw new Error(`paletteDrag: não consegui ler o mapping.json (${read.error})`);
  }
  return Array.isArray(read.json.markings) ? read.json.markings.length : 0;
}

/**
 * Arrasta um tipo da Paleta aberta até um ponto de tela (etapa #1256, decisão 7; #1533, decisões 9
 * e 10). Acha o item pelo `.library-type-name` com o texto exato (dois grupos com o mesmo tipo:
 * lança com a lista dos grupos; `{ grupo }`, o `aria-label` da `section.library-group`, escolhe),
 * faz o arrasto nativo pelo mouse do Playwright (`move` no item, `down`, `move` em `steps` passos
 * até `para`, `up`) e confere que o `mapping.json` da pasta do projeto ganhou uma marcação. Sem
 * marcação nova, refaz por eventos (`dragstart` no item; `dragover`, `drop` e `dragend` sob o
 * ponto, que tem de estar no `.canvas-host`); se o nativo criou, o sintético não roda. Sem nenhuma,
 * lança "o arrasto da Paleta não criou a instância"; o sintético que não pôde rodar lança o motivo.
 * `projectDir` é obrigatório (no corpo do `run`, vale a pasta do `run`): sem ela lança
 * "paletteDrag precisa da pasta do projeto".
 * `capture` (caminho de PNG) grava o recorte do canvas antes de soltar, com o destino aceso.
 * `waitMs` (padrão 2000) é quanto espera o autosave gravar a marcação nova antes de dar o arrasto
 * por falho. Devolve `{ via: 'nativo' | 'sintetico' }`.
 */
export async function paletteDrag(
  page,
  tipo,
  para,
  { capture, steps = 10, grupo, projectDir, waitMs = PALETTE_WAIT_MS } = {},
) {
  if (!projectDir) throw new Error('paletteDrag precisa da pasta do projeto');
  const groups = await page.evaluate(paletteGroupsOf, { tipo });
  if (groups.length === 0) {
    throw new Error(`paletteDrag: o tipo '${tipo}' não está na Paleta aberta`);
  }
  const list = groups.map((g) => `'${g}'`).join(', ');
  if (grupo !== undefined && !groups.includes(grupo)) {
    throw new Error(
      `paletteDrag: o grupo '${grupo}' não tem o tipo '${tipo}'; grupos que têm: ${list}`,
    );
  }
  if (grupo === undefined && groups.length > 1) {
    throw new Error(
      `paletteDrag: o tipo '${tipo}' está em mais de um grupo (${list}); passe { grupo }`,
    );
  }
  const chosen = grupo ?? groups[0];
  const host = page.locator('.canvas-host');
  const before = await countMarkings(projectDir);
  const item = page
    .locator(
      `section.library-group[aria-label=${JSON.stringify(chosen)}] li.library-type`,
    )
    .filter({ has: page.locator('.library-type-name').getByText(tipo, { exact: true }) });
  await item.scrollIntoViewIfNeeded();
  const box = await item.boundingBox();
  if (!box) throw new Error(`paletteDrag: o tipo '${tipo}' não está na Paleta aberta`);
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + ((para.x - from.x) * i) / steps,
      from.y + ((para.y - from.y) * i) / steps,
    );
  }
  if (capture) await host.screenshot({ path: capture });
  await page.mouse.up();
  await settle(page);
  if (await markingsGrewTo(projectDir, before, waitMs)) return { via: 'nativo' };
  const on = await onCanvas(page, para);
  if (!on.ok) {
    throw new Error(
      `paletteDrag: o ponto (${para.x}, ${para.y}) não cai no canvas (${on.element})`,
    );
  }
  const synthetic = await page.evaluate(syntheticPaletteDrag, {
    tipo,
    para,
    grupo: chosen,
  });
  if (synthetic?.motivo) throw new Error(`paletteDrag: ${synthetic.motivo}`);
  await settle(page);
  if (await markingsGrewTo(projectDir, before, waitMs)) return { via: 'sintetico' };
  throw new Error('o arrasto da Paleta não criou a instância');
}

/**
 * Ajusta a janela do Chrome para o `innerWidth × innerHeight` pedido (etapa #1148, decisão 10):
 * CDP `Browser.getWindowForTarget` + `Browser.setWindowBounds` somando a moldura medida
 * (`outerWidth − innerWidth`, `outerHeight − innerHeight`). Erro com os valores obtidos se a
 * janela não deu o pedido.
 */
export async function setViewport(page, largura, altura) {
  const session = await page.context().newCDPSession(page);
  try {
    const { windowId } = await session.send('Browser.getWindowForTarget');
    const frame = await page.evaluate(() => ({
      outerWidth: globalThis.outerWidth,
      innerWidth: globalThis.innerWidth,
      outerHeight: globalThis.outerHeight,
      innerHeight: globalThis.innerHeight,
    }));
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        windowState: 'normal',
        width: largura + (frame.outerWidth - frame.innerWidth),
        height: altura + (frame.outerHeight - frame.innerHeight),
      },
    });
  } finally {
    await session.detach().catch(() => {});
  }
  await settle(page, { timeoutMs: 1000 });
  const got = await page.evaluate(() => ({
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
  }));
  if (got.innerWidth !== largura || got.innerHeight !== altura) {
    throw new Error(
      `setViewport: pedido ${largura}×${altura}, a janela deu ${got.innerWidth}×${got.innerHeight}`,
    );
  }
}

/** Roda na página: até 10 elementos cujo nome acessível contém `needle` (papel, nome, região). */
function findInPage({ needle }) {
  const implicit = {
    BUTTON: 'button',
    A: 'link',
    SELECT: 'combobox',
    TEXTAREA: 'textbox',
    SUMMARY: 'button',
    DIALOG: 'dialog',
    INPUT: 'textbox',
  };
  const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const nameOf = (el) => {
    const label = el.getAttribute('aria-label');
    if (label) return label;
    const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    const byIds = ids
      .map((id) => text(document.getElementById(id) ?? document.createElement('i')))
      .join(' ')
      .trim();
    return (
      byIds || el.getAttribute('title') || el.getAttribute('placeholder') || text(el)
    );
  };
  const regionOf = (el) => {
    const host = el.parentElement?.closest(
      'dialog, [role="dialog"], [role="alertdialog"], [data-window], [role="region"], nav, [role="navigation"], header, main, aside, footer, section[aria-label]',
    );
    if (!host) return '';
    return (
      host.getAttribute('aria-label') ||
      host.getAttribute('data-window') ||
      host.tagName.toLowerCase()
    );
  };
  const visible = (el) =>
    !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const found = [];
  for (const el of document.querySelectorAll(
    'button, a, input, select, textarea, summary, dialog, [role], [contenteditable="true"], [data-strip-window]',
  )) {
    if (!visible(el)) continue;
    const name = nameOf(el);
    if (!name || !name.toLowerCase().includes(needle)) continue;
    const input =
      el.tagName === 'INPUT' ? (el.type === 'checkbox' ? 'checkbox' : 'textbox') : null;
    const role =
      el.getAttribute('role') ||
      input ||
      (el.getAttribute('contenteditable') === 'true' ? 'textbox' : null) ||
      implicit[el.tagName] ||
      el.tagName.toLowerCase();
    found.push({ role, name: name.slice(0, 80), region: regionOf(el) });
    if (found.length >= 10) break;
  }
  return found;
}

/**
 * Os candidatos que o localizador devia ter achado (etapa #1148, decisão 11): até 10 elementos
 * visíveis cujo nome acessível contém `texto` (sem diferença de caixa), cada um com papel, nome e
 * região (o `aria-label` do diálogo, da janela ou do landmark mais próximo).
 */
export async function find(page, texto) {
  return page.evaluate(findInPage, { needle: String(texto).toLowerCase() });
}

/** Texto da lista de `find`, uma linha por candidato (`papel "nome" em região`). */
export function formatCandidates(candidates, texto) {
  if (!candidates || candidates.length === 0) {
    return `nenhum candidato com "${texto}" no nome na tela`;
  }
  const lines = candidates.map(
    (c) => `  ${c.role} "${c.name}"${c.region ? ` em ${c.region}` : ''}`,
  );
  return [`candidatos com "${texto}" (${candidates.length}):`, ...lines].join('\n');
}

/**
 * O texto que o localizador do Playwright procurava, tirado da mensagem de um timeout ou de uma
 * violação do modo estrito (`getByRole('button', { name: 'Revisar' })`, `getByText('Conversas')`);
 * `null` se a mensagem não for desse tipo ou não trouxer texto. Pura.
 */
export function locatorTextFromError(message) {
  const text = String(message);
  if (!/Timeout \d+ms exceeded|strict mode violation/.test(text)) return null;
  const match =
    /name:\s*(['"])(.+?)\1/.exec(text) ?? /getBy\w+\(\s*(['"])(.+?)\1/.exec(text);
  return match ? match[2] : null;
}

/**
 * A pasta de apoio quando `APOIO` não está exportado (etapa #841, decisão 3): a `apoio/` da rodada
 * mais recente em `~/mapping-testes/<AAAA-MM-DD>-<alvo>/apoio`, o mesmo caminho que o `cloud-up.sh`
 * monta. `null` se não houver nenhuma.
 */
export function defaultApoioDir(home = os.homedir()) {
  const root = path.join(home, 'mapping-testes');
  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch {
    return null;
  }
  const dirs = entries
    .map((name) => path.join(root, name, 'apoio'))
    .filter((dir) => fs.existsSync(dir))
    .map((dir) => ({ dir, mtime: fs.statSync(dir).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return dirs[0]?.dir ?? null;
}

/** Prazo padrão (s) do `cloud.mjs run`: abaixo dos 120 s padrão do Bash (etapa #1148, decisão 2). */
const RUN_DEADLINE_SECONDS = 90;

/** O `console` do corpo: manda para o `io` (no servidor, a saída volta ao cliente em vez de ir ao log). */
function bodyConsole(io) {
  const text = (args) => util.format(...args);
  return {
    log: (...args) => io.log(text(args)),
    info: (...args) => io.log(text(args)),
    error: (...args) => io.error(text(args)),
    warn: (...args) => io.error(text(args)),
  };
}

/**
 * `check(rotulo, condicao, detalhe?)` do corpo do `run` (etapa #1533, decisão 7). `condicao` é um
 * booleano, uma promessa ou uma função (síncrona ou assíncrona) que devolve verdadeiro ou lança.
 * Não interrompe o corpo: o resultado fica em `results` e o `execStep` espera os pendentes.
 */
function makeCheck(results, pending) {
  return (rotulo, condicao, detalhe) => {
    const task = (async () => {
      try {
        const value = typeof condicao === 'function' ? await condicao() : await condicao;
        if (value) {
          results.push({ rotulo, ok: true, detalhe });
        } else {
          results.push({ rotulo, ok: false, mensagem: detalhe ?? 'condição falsa' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          rotulo,
          ok: false,
          mensagem: detalhe ? `${message} (${detalhe})` : message,
        });
      }
    })();
    pending.push(task);
    return task;
  };
}

/** Uma linha por check: `✅ <rótulo>` ou `❌ <rótulo> — <mensagem>`. */
function formatChecks(results) {
  return results.map((r) =>
    r.ok
      ? `✅ ${r.rotulo}${typeof r.detalhe === 'string' ? ` — ${r.detalhe}` : ''}`
      : `❌ ${r.rotulo} — ${r.mensagem}`,
  );
}

/**
 * O executor de um corpo (etapa #1148, decisão 1; #1533, decisões 6 e 7): roda `body` como corpo de
 * uma função assíncrona com `page`, `browser`, `apoioDir`, `projectDir`, `ctx`, `check`, `console`
 * (que vai para `io`) e todos os exports deste módulo em escopo; no fim imprime a linha de cada
 * `check` e o `formatState(...)`. Devolve `{ code, checks }`: 0 sucesso, 1 erro no corpo ou check
 * com falha, 124 prazo esgotado. `connection` (`{ browser, page }`) reaproveita uma conexão (o
 * servidor); sem ela conecta com `connectFn`.
 */
async function execStep(
  body,
  {
    apoioDir,
    projectDir,
    prazoSeconds = RUN_DEADLINE_SECONDS,
    connectFn = connect,
    connection,
    ctx = {},
    io = { log: console.log, error: console.error },
  } = {},
) {
  const { browser, page } = connection ?? (await connectFn(apoioDir));
  const checks = [];
  const pending = [];
  const printState = async () => {
    try {
      const snapshot = await Promise.race([
        state(page, apoioDir, { projectDir }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('estado')), 3000).unref(),
        ),
      ]);
      io.log(formatState(snapshot));
    } catch {
      // Conexão sem resposta: o estado não sai.
    }
  };
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve('prazo'), prazoSeconds * 1000);
  });
  let code = 0;
  try {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const scope = {
      page,
      browser,
      apoioDir,
      projectDir,
      ...exportsOf(),
      // No corpo, vale a pasta do `run` quando a chamada não passa `{ projectDir }`.
      paletteDrag: (p, tipo, para, options = {}) =>
        paletteDrag(p, tipo, para, {
          projectDir: projectDir ?? lastFolder(apoioDir),
          ...options,
        }),
      ctx,
      check: makeCheck(checks, pending),
      console: bodyConsole(io),
    };
    const fn = new AsyncFunction(...Object.keys(scope), body);
    const outcome = await Promise.race([
      fn(...Object.values(scope)).then(() => Promise.all(pending).then(() => 'ok')),
      deadline,
    ]);
    if (outcome === 'prazo') {
      io.error(`prazo de ${prazoSeconds} s esgotado no passo`);
      code = 124;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.error(message);
    const wanted = locatorTextFromError(message);
    if (wanted) {
      try {
        io.error(formatCandidates(await find(page, wanted), wanted));
      } catch {
        // Sem resposta da página: a lista de candidatos não sai.
      }
    }
    code = 1;
  } finally {
    clearTimeout(timer);
  }
  // Checks ainda no ar (o corpo lançou ou estourou o prazo) têm até 2 s para entrar no resumo.
  await Promise.race([
    Promise.all(pending),
    new Promise((resolve) => setTimeout(resolve, 2000).unref()),
  ]);
  for (const line of formatChecks(checks)) io.log(line);
  if (code === 0 && checks.some((c) => !c.ok)) code = 1;
  await printState();
  return { code, checks };
}

/**
 * Executa o corpo de um script de passo, sem servidor (conecta, roda, imprime o `check` e o
 * `state()`), e devolve o código de saída (0 sucesso, 1 erro ou check com falha, 124 prazo
 * esgotado); quem chama faz o `process.exit`. É o caminho de reserva do `cloud.mjs run` e o
 * executor que o servidor usa; `ctx` começa vazio.
 */
export async function runStep(body, options = {}) {
  return (await execStep(body, options)).code;
}

// ---------------------------------------------------------------------------------------------
// Servidor persistente do `run` (etapa #1533, decisões 6 a 8)
// ---------------------------------------------------------------------------------------------

const SOCKET_NAME = 'cloud.sock';
const PID_NAME = 'cloud.pid';
const SERVER_START_WAIT_MS = 15000;
/** Folga do cliente sobre o prazo do `run`: o servidor responde 124 antes; passada a folga, ele travou. */
const CLIENT_GRACE_MS = 5000;

/** Próximo número de `run` (continua depois de um servidor novo): maior `<n>.js` de `apoio/runs/` + 1. */
function nextRunNumber(apoioDir) {
  let max = 0;
  try {
    for (const name of fs.readdirSync(path.join(apoioDir, 'runs'))) {
      const n = Number(name.match(/^(\d+)\.js$/)?.[1]);
      if (n > max) max = n;
    }
  } catch {
    // Sem a pasta: é o primeiro.
  }
  return max + 1;
}

/**
 * Grava um `run`: `apoio/runs/<n>.js` (o corpo), `<n>.out` (a saída) e uma linha em `apoio/runs.log`
 * (`<hora> run=<n> codigo=<c> checks=<k> falhas=<f>`). É a Reprodução de um ❌ (decisão 8).
 */
function recordRun(apoioDir, { body, code, lines, checks }) {
  try {
    const n = nextRunNumber(apoioDir);
    const dir = path.join(apoioDir, 'runs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${n}.js`), body);
    fs.writeFileSync(
      path.join(dir, `${n}.out`),
      `${lines.map((l) => l.text).join('\n')}\n[código ${code}]\n`,
    );
    const falhas = checks.filter((c) => !c.ok).length;
    fs.appendFileSync(
      path.join(apoioDir, 'runs.log'),
      `${new Date().toISOString()} run=${n} codigo=${code} checks=${checks.length} falhas=${falhas}\n`,
    );
  } catch {
    // O registro não derruba o passo.
  }
}

/** Uma conexão ainda serve? (`connectFn` falso pode não ter `isConnected`/`isClosed`.) */
function connectionAlive({ browser, page }) {
  return browser.isConnected?.() !== false && page.isClosed?.() !== true;
}

/** Roda um corpo e devolve `{ code, lines, checks }`, com a saída capturada em ordem (`s`: 'out' ou 'err'). */
async function captureStep(body, options) {
  const lines = [];
  const io = {
    log: (text) => lines.push({ s: 'out', text }),
    error: (text) => lines.push({ s: 'err', text }),
  };
  try {
    const { code, checks } = await execStep(body, { ...options, io });
    return { code, lines, checks };
  } catch (error) {
    lines.push({
      s: 'err',
      text: error instanceof Error ? error.message : String(error),
    });
    return { code: 1, lines, checks: [] };
  }
}

/**
 * Sobe o servidor do `run` (decisão 6): escuta o soquete Unix `apoio/cloud.sock`, mantém a conexão
 * CDP e o `ctx` entre os `run` e atende um `run` por vez. Prazo esgotado (124): responde, para o
 * servidor e chama `onExit` (o processo `serve` sai). Conexão caída: reconecta no `run` seguinte,
 * com o aviso e o `ctx` vazio. Devolve `{ close }`.
 */
export async function startRunServer({
  apoioDir,
  connectFn = connect,
  onExit = () => process.exit(0),
}) {
  const sock = path.join(apoioDir, SOCKET_NAME);
  fs.mkdirSync(apoioDir, { recursive: true });
  if (fs.existsSync(sock) && (await serverAnswers(sock))) {
    throw new Error('já existe um servidor do run nesta pasta de apoio');
  }
  fs.rmSync(sock, { force: true });
  let connection = null;
  let ctx = {};
  let queue = Promise.resolve();
  let stopping = false;
  let closed = false;
  const sockets = new Set();

  const close = async () => {
    stopping = true;
    if (closed) return;
    closed = true;
    // Os `run` que já esperavam na fila recebem o erro antes de os soquetes caírem.
    await queue.catch(() => {});
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(sock, { force: true });
    fs.rmSync(path.join(apoioDir, PID_NAME), { force: true });
    try {
      await connection?.browser.close();
    } catch {
      // Já caída.
    }
  };

  const handle = async (request) => {
    const warnings = [];
    if (connection && !connectionAlive(connection)) {
      warnings.push('aviso: a conexão com o Chrome caiu; reconectei e o ctx está vazio');
      connection = null;
    }
    if (!connection) {
      try {
        connection = await connectFn(apoioDir);
      } catch (error) {
        return {
          code: 1,
          lines: [
            { s: 'err', text: error instanceof Error ? error.message : String(error) },
          ],
          checks: [],
        };
      }
      ctx = {};
    }
    // Caminhos relativos do corpo valem a partir da pasta de onde o `run` foi chamado.
    if (request.cwd) {
      try {
        process.chdir(request.cwd);
      } catch {
        // A pasta sumiu: fica onde está.
      }
    }
    const result = await captureStep(request.body, {
      apoioDir,
      projectDir: request.projectDir,
      prazoSeconds: request.prazoSeconds,
      connection,
      ctx,
    });
    result.lines.unshift(...warnings.map((text) => ({ s: 'err', text })));
    recordRun(apoioDir, { body: request.body, ...result });
    return result;
  };

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        socket.end(`${JSON.stringify({ code: 2, lines: [], checks: [] })}\n`);
        return;
      }
      if (request.cmd === 'quit') {
        stopping = true;
        socket.end(`${JSON.stringify({ code: 0, lines: [] })}\n`, () => {
          close().then(onExit);
        });
        return;
      }
      queue = queue.then(async () => {
        if (stopping) {
          const text =
            'o servidor do run saiu (prazo esgotado no run anterior); rode de novo';
          socket.end(
            `${JSON.stringify({ code: 1, lines: [{ s: 'err', text }], checks: [] })}\n`,
          );
          return;
        }
        const result = await handle(request);
        const expired = result.code === 124;
        if (expired) stopping = true;
        socket.write(`${JSON.stringify(result)}\n`, () => {
          if (expired) close().then(onExit);
        });
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(sock, resolve);
  });
  fs.writeFileSync(path.join(apoioDir, PID_NAME), String(process.pid));
  return { close };
}

/** Manda uma requisição ao soquete e devolve a resposta; `null` se ninguém atende. */
function sendToServer(sock, request, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection(sock);
    socket.setEncoding('utf8');
    let connected = false;
    let buffer = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ timeout: true }), timeoutMs);
    socket.on('connect', () => {
      connected = true;
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end >= 0) {
        try {
          finish(JSON.parse(buffer.slice(0, end)));
        } catch {
          finish(null);
        }
      }
    });
    // `null`: ninguém atende (nada foi enviado); `{ lost }`: o servidor aceitou e caiu sem responder.
    socket.on('error', () => finish(connected ? { lost: true } : null));
    socket.on('close', () => finish(connected ? { lost: true } : null));
  });
}

/** O soquete responde a uma conexão? (um servidor de pé; o arquivo sozinho pode ser de um servidor morto) */
function serverAnswers(sock) {
  return new Promise((resolve) => {
    const socket = net.createConnection(sock);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

/** Para o servidor pelo `apoio/cloud.pid` (travado ou de outra rodada); silencioso se não existe. */
function killServer(apoioDir) {
  try {
    const pid = Number(fs.readFileSync(path.join(apoioDir, PID_NAME), 'utf8'));
    // Só mata se o pid ainda é de um `cloud.mjs` (o número pode ter sido reaproveitado).
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    if (pid > 0 && cmdline.includes('cloud.mjs')) process.kill(pid, 'SIGTERM');
  } catch {
    // Sem servidor.
  }
  fs.rmSync(path.join(apoioDir, SOCKET_NAME), { force: true });
  fs.rmSync(path.join(apoioDir, PID_NAME), { force: true });
}

/** Sobe `cloud.mjs serve` solto do terminal (`setsid`, stdin de /dev/null, log em `apoio/cloud-serve.log`). */
function spawnServeProcess(apoioDir) {
  const log = fs.openSync(path.join(apoioDir, 'cloud-serve.log'), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, APOIO: apoioDir },
  });
  child.unref();
  fs.closeSync(log);
}

/**
 * O `cloud.mjs run` (decisão 6): manda o corpo ao servidor persistente (sobe um se não houver) e
 * imprime a resposta em `io`; devolve o código (0, 1 ou 124). `novo` reinicia o servidor. Se o
 * servidor não sobe em `socketWaitMs`, cai no caminho de hoje (`runStep`) e avisa.
 * `spawnServer` e `connectFn` são injetáveis para teste.
 */
export async function runViaServer(
  body,
  {
    apoioDir,
    projectDir,
    prazoSeconds = RUN_DEADLINE_SECONDS,
    novo = false,
    socketWaitMs = SERVER_START_WAIT_MS,
    spawnServer = spawnServeProcess,
    connectFn = connect,
    io = { log: console.log, error: console.error },
  },
) {
  const sock = path.join(apoioDir, SOCKET_NAME);
  const request = { body, projectDir, prazoSeconds, cwd: process.cwd() };
  const timeoutMs = prazoSeconds * 1000 + CLIENT_GRACE_MS;
  const print = (response) => {
    for (const line of response.lines ?? [])
      (line.s === 'err' ? io.error : io.log)(line.text);
    return response.code;
  };
  fs.mkdirSync(apoioDir, { recursive: true });
  if (novo && fs.existsSync(sock)) {
    await sendToServer(sock, { cmd: 'quit' }, 3000);
    for (let i = 0; i < 25 && fs.existsSync(sock); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    killServer(apoioDir);
  }
  let response = fs.existsSync(sock)
    ? await sendToServer(sock, request, timeoutMs)
    : null;
  if (response === null) {
    // Soquete velho (servidor morto) ou nenhum servidor: sobe outro.
    fs.rmSync(sock, { force: true });
    try {
      await spawnServer(apoioDir);
    } catch {
      // Cai na reserva abaixo.
    }
    const start = Date.now();
    while (!fs.existsSync(sock) && Date.now() - start < socketWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    response = fs.existsSync(sock) ? await sendToServer(sock, request, timeoutMs) : null;
  }
  if (response === null) {
    io.error(
      'aviso: o servidor do run não subiu; rodando no caminho direto (sem ctx entre os run)',
    );
    const result = await captureStep(body, {
      apoioDir,
      projectDir,
      prazoSeconds,
      connectFn,
    });
    recordRun(apoioDir, { body, ...result });
    return print(result);
  }
  if (response.lost) {
    io.error(
      'o servidor do run caiu durante este run; o corpo pode ter rodado até certo ponto: confira o estado antes de repetir',
    );
    return 1;
  }
  if (response.timeout) {
    killServer(apoioDir);
    io.error(`prazo de ${prazoSeconds} s esgotado no passo`);
    return 124;
  }
  return print(response);
}

/** `cloud.mjs serve`: o processo que o primeiro `run` sobe; sai no prazo esgotado, no `--novo` ou no SIGTERM. */
async function runServe(apoioDir) {
  // Uma promessa solta do corpo não derruba o servidor (e a conexão e o ctx com ele).
  process.on('unhandledRejection', (error) => {
    console.error(`rejeição sem tratamento no corpo: ${error?.message ?? error}`);
  });
  let server;
  try {
    server = await startRunServer({ apoioDir });
  } catch (error) {
    // Outro `run` subiu o servidor primeiro: este sai e os dois clientes usam o mesmo.
    console.error(error.message);
    return;
  }
  const { close } = server;
  const stop = () => close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

/** Os exports de função e valor deste módulo (menos o próprio `runStep`), para o escopo do corpo. */
function exportsOf() {
  return {
    connect,
    connectGuide,
    clickNoWait,
    OPEN_DIALOG_TITLES,
    pickAutocompletePopup,
    openButtonPoints,
    pickAppPage,
    parseEnvFile,
    loadEnv,
    diffJson,
    formatState,
    state,
    waitForWindow,
    selectFolder,
    openFile,
    saveFile,
    cancelDialog,
    allowPermission,
    screenshot,
    windowShortcut,
    settle,
    openWindow,
    closeWindow,
    TOOL_WINDOW_IDS,
    drag,
    nearHandle,
    onCanvas,
    viewCenter,
    arrowHandlesOf,
    parseArrowHandles,
    parseContainerBoxes,
    paletteDrag,
    setViewport,
    find,
    formatCandidates,
    locatorTextFromError,
    makeCadastroPng,
    mark,
    temposFromLog,
    temposFromDir,
    defaultApoioDir,
    formatTempos,
    containerScreenPoint,
    ponto,
    HELP,
    formatHelp,
  };
}

/**
 * Tabela única (etapa #1148, decisão 3): cada comando da CLI e cada export deste módulo, com a
 * assinatura e uma linha de descrição. O `cloud.mjs help` imprime daqui; um teste confere que todo
 * export está na tabela e que o `cloud.d.mts` declara os mesmos nomes.
 */
export const HELP = {
  connect: {
    sig: 'connect(apoioDir, cdpUrl?, options?)',
    desc: 'conecta no Chrome por CDP, acha a aba da app, timeout de 5 s',
  },
  connectGuide: {
    sig: 'connectGuide(apoioDir, cdpUrl?, options?)',
    desc: 'como o connect, mas na aba do guia (/guia/)',
  },
  clickNoWait: {
    sig: 'clickNoWait(page, nome, { scope?, exact? })',
    desc: 'clique por papel e nome sem esperar depois (abre diálogo nativo)',
  },
  OPEN_DIALOG_TITLES: {
    sig: 'OPEN_DIALOG_TITLES',
    desc: 'títulos dos seletores de arquivo/pasta do GTK',
  },
  pickAutocompletePopup: {
    sig: 'pickAutocompletePopup(windows, geometryOf, dialogWindowId)',
    desc: 'acha a lista de autocompletar do GTK',
  },
  openButtonPoints: {
    sig: 'openButtonPoints(geometry)',
    desc: 'pontos candidatos do botão Abrir do seletor',
  },
  pickAppPage: {
    sig: 'pickAppPage(pages, { origin? })',
    desc: 'escolhe a aba da app entre as abertas',
  },
  parseEnvFile: {
    sig: 'parseEnvFile(texto)',
    desc: 'lê o formato do apoio/env.sh (export A=1 B=2)',
  },
  loadEnv: {
    sig: 'loadEnv(apoioDir, env?)',
    desc: 'carrega DISPLAY e D-Bus do apoio/env.sh',
  },
  diffJson: {
    sig: 'diffJson(antes, depois, { limit? })',
    desc: 'linhas de diferença entre dois JSON',
  },
  formatState: {
    sig: 'formatState(estado)',
    desc: 'texto do estado (tela, disco e a linha Seleção: o que o clique selecionou)',
  },
  state: {
    sig: 'state(page, apoioDir, { projectDir? })',
    desc: 'estado da tela (título, diálogos, avisos, foco, janelas) e do disco; sem projectDir lê a última pasta usada (null: não lê disco)',
  },
  waitForWindow: {
    sig: 'waitForWindow(nomes, { timeoutMs? })',
    desc: 'espera um diálogo nativo pelo título',
  },
  selectFolder: {
    sig: 'selectFolder(apoioDir, caminho, { timeoutMs? })',
    desc: 'escolhe uma pasta no seletor nativo; caminho absoluto (relativo: cancela e lança)',
  },
  openFile: {
    sig: 'openFile(apoioDir, caminho, { timeoutMs? })',
    desc: 'abre um arquivo no seletor nativo; caminho absoluto (relativo: cancela e lança)',
  },
  saveFile: {
    sig: 'saveFile(apoioDir, caminho, { timeoutMs? })',
    desc: 'salva num "Salvar como" nativo; caminho absoluto (relativo: cancela e lança)',
  },
  cancelDialog: {
    sig: 'cancelDialog(apoioDir, { timeoutMs? })',
    desc: 'cancela o diálogo nativo aberto',
  },
  allowPermission: {
    sig: 'allowPermission(apoioDir)',
    desc: 'aceita o pedido de permissão do Chrome',
  },
  screenshot: {
    sig: 'screenshot(apoioDir, nome)',
    desc: 'captura de tela em apoio/anexos',
  },
  windowShortcut: {
    sig: 'windowShortcut(page, n)',
    desc: 'atalho Ctrl+Shift+N da janela de ferramenta (ALTERNA: prefira openWindow/closeWindow)',
  },
  settle: {
    sig: 'settle(page, { timeoutMs? = 5000, warn? })',
    desc: 'espera sem "Salvando…", 2 quadros e 200 ms sem mutação; estouro vira aviso (use no lugar de waitForTimeout)',
  },
  openWindow: {
    sig: 'openWindow(page, id)',
    desc: 'abre a janela de ferramenta só se fechada (idempotente); id: tree, layers, details, list, incomplete, diagnostics, proposals, notices, comments, catalog',
  },
  closeWindow: {
    sig: 'closeWindow(page, id)',
    desc: 'fecha a janela de ferramenta só se aberta (idempotente)',
  },
  TOOL_WINDOW_IDS: {
    sig: 'TOOL_WINDOW_IDS',
    desc: 'os ids das janelas de ferramenta aceitos por openWindow e closeWindow',
  },
  drag: {
    sig: 'drag(page, de, para, { select? = true, steps? = 10, warn?, allowOffCanvas? })',
    desc: 'arrasta entre dois pontos de tela ({x, y}); lança se de não cai no canvas (allowOffCanvas segue); avisa se de cair no raio de uma alça (canto) da seleção e se o clique não selecionou nada',
  },
  nearHandle: {
    sig: 'nearHandle(box, ponto)',
    desc: 'canto (nw, ne, sw, se) que a app pegaria no ponto (raio 12 a 22 px, xadrez), ou null',
  },
  paletteDrag: {
    sig: 'paletteDrag(page, tipo, para, { capture?, steps? = 10, grupo?, projectDir?, waitMs? })',
    desc: 'arrasta um tipo da Paleta aberta até um ponto de tela e confere a marcação nova no mapping.json (projectDir; no run vale a pasta do run); grupo escolhe entre dois grupos com o mesmo tipo; capture = PNG antes de soltar; devolve { via: nativo | sintetico }',
  },
  setViewport: {
    sig: 'setViewport(page, largura, altura)',
    desc: 'ajusta a janela do Chrome ao innerWidth × innerHeight pedido (soma a moldura; confere)',
  },
  find: {
    sig: 'find(page, texto)',
    desc: 'até 10 elementos visíveis cujo nome contém o texto (papel, nome, região)',
  },
  formatCandidates: {
    sig: 'formatCandidates(candidatos, texto)',
    desc: 'texto da lista de find, uma linha por candidato',
  },
  locatorTextFromError: {
    sig: 'locatorTextFromError(mensagem)',
    desc: 'o texto do localizador num erro de timeout ou de modo estrito, ou null',
  },
  makeCadastroPng: {
    sig: 'makeCadastroPng(destino)',
    desc: 'gera a imagem de teste "Cadastro"',
  },
  mark: {
    sig: 'mark(apoioDir, roteiro, "start"|"end")',
    desc: 'marca início ou fim de um roteiro no tempos.log',
  },
  temposFromLog: {
    sig: 'temposFromLog(texto, textoDoRunsLog?)',
    desc: 'durações por roteiro a partir do texto do tempos.log; com o runs.log, o total de run e de checks por roteiro',
  },
  temposFromDir: {
    sig: 'temposFromDir(apoioDir)',
    desc: 'durações por roteiro da pasta de apoio',
  },
  defaultApoioDir: {
    sig: 'defaultApoioDir(home?)',
    desc: 'apoio/ da rodada mais recente em ~/mapping-testes',
  },
  formatTempos: { sig: 'formatTempos(tempos)', desc: 'texto do Tempo por roteiro' },
  containerScreenPoint: {
    sig: 'containerScreenPoint({ mapping, container, x, y, viewport, host, ... })',
    desc: 'ponto de tela de um ponto em pixels do container (parte pura)',
  },
  ponto: {
    sig: 'ponto(page, projectDir, container, x, y, { perspective?, marking?, warn? })',
    desc: 'ponto de tela de um ponto do container pela posição desenhada (data-container-boxes); avisa a perspectiva que difere dela e o ponto que cai fora do canvas',
  },
  parseContainerBoxes: {
    sig: 'parseContainerBoxes(texto)',
    desc: 'Map de id para { x, y, width, height, scale } a partir do data-container-boxes (parte pura)',
  },
  onCanvas: {
    sig: 'onCanvas(page, { x, y })',
    desc: 'o ponto de tela cai no canvas? devolve { ok, element } (o que está no ponto)',
  },
  viewCenter: {
    sig: 'viewCenter(page)',
    desc: 'centro da vista: { x, y } de tela e canvas: { x, y } em unidades do canvas',
  },
  arrowHandlesOf: {
    sig: 'arrowHandlesOf(page)',
    desc: 'pontos de tela do meio (center) e das alças da seta selecionada, ou null',
  },
  parseArrowHandles: {
    sig: 'parseArrowHandles(texto, host)',
    desc: 'objeto nome → ponto de tela a partir do data-arrow-handles (parte pura)',
  },
  runStep: {
    sig: 'runStep(corpo, { apoioDir, projectDir?, prazoSeconds?, connectFn?, ctx?, io? })',
    desc: 'executa o corpo de um script de passo sem servidor (o caminho de reserva do run); no corpo valem também ctx, check(rotulo, condicao, detalhe?) e console',
  },
  startRunServer: {
    sig: 'startRunServer({ apoioDir, connectFn?, onExit? })',
    desc: 'sobe o servidor persistente do run no soquete apoio/cloud.sock (o que o comando serve usa)',
  },
  runViaServer: {
    sig: 'runViaServer(corpo, { apoioDir, projectDir?, prazoSeconds?, novo?, socketWaitMs?, spawnServer?, connectFn?, io? })',
    desc: 'manda o corpo ao servidor persistente (sobe um se faltar) e devolve o código 0, 1 ou 124; sem servidor cai no runStep e avisa',
  },
  HELP: {
    sig: 'HELP',
    desc: 'esta tabela: comandos e exports com assinatura e descrição',
  },
  formatHelp: { sig: 'formatHelp()', desc: 'texto que o comando help imprime' },
};

/** Comandos da CLI, para o `help`. */
const CLI_HELP = [
  ['mark <roteiro> <start|end>', 'marca início ou fim de um roteiro no tempos.log'],
  [
    'tempos [<apoio>]',
    'duração por roteiro, do tempos.log, com o total de run e de checks do runs.log',
  ],
  ['state [<pasta-do-projeto>]', 'conecta, imprime o estado da tela e do disco e sai'],
  [
    'ponto <container> <x> <y> <pasta-do-projeto> [--perspectiva=<nome>] [--marcacao]',
    'ponto de tela de um ponto do container',
  ],
  [
    'run [<pasta-do-projeto>] [--prazo=<s>] [--novo]',
    "executa o corpo do script lido da entrada padrão (heredoc <<'JS') num servidor persistente (a conexão e o ctx ficam entre os run; apoio/cloud.sock), com page, browser, apoioDir, projectDir, ctx, check(rotulo, condicao, detalhe?) e os exports em escopo; imprime uma linha por check e o estado; sai 0, 1 (erro ou check com falha) ou 124 (prazo de 90 s; o servidor sai); --novo reinicia o servidor; cada run fica em apoio/runs/<n>.js e .out e em apoio/runs.log",
  ],
  [
    'serve',
    'o servidor persistente do run (apoio/cloud.sock, log em apoio/cloud-serve.log); o primeiro run o sobe sozinho, o cloud-up.sh --restart-chrome o para',
  ],
  [
    'find <texto>',
    'lista até 10 elementos visíveis cujo nome contém o texto (papel, nome, região)',
  ],
  [
    'passo <item…> [--guia=<arquivo>] [--preparo]',
    'imprime do guia da rodada (<APOIO>/guia.md) o roteiro (R12), um passo (R12.4) ou uma faixa (R12.1-R12.8), sem abrir o Chrome; com --preparo, só o trecho do roteiro inteiro antes do primeiro passo (título, O que cobre, Preparo e blocos de código: as funções de um roteiro que a faixa não traz); item que o guia da rodada não tem sai do docs/TESTING.md, com a primeira linha dizendo; passa de 25 mil caracteres, corta e diz como continuar',
  ],
  [
    'secao [<chave…>] [--guia=<arquivo>]',
    'imprime uma seção sob demanda do guia da rodada (1, 2, 3, 5, 6, 7, A.seletores, B) ou do docs/TESTING-NUVEM-CONSULTA.md (consulta.subagente, consulta.grupos, consulta.passada, consulta.regras, consulta.historico), sem abrir o Chrome; sem chave, lista as chaves com o tamanho e o quando ler; corta em 25 mil caracteres',
  ],
  ['help', 'esta lista'],
];

/** Texto do `cloud.mjs help`: os comandos da CLI e a assinatura de cada export, uma linha cada. */
export function formatHelp() {
  const lines = ['Comandos (node scripts/testing/cloud.mjs <comando>):'];
  for (const [usage, desc] of CLI_HELP) lines.push(`  cloud.mjs ${usage}\n      ${desc}`);
  lines.push(
    '',
    'Exports (import { ... } de cloud.mjs; todos em escopo no corpo do run):',
  );
  for (const { sig, desc } of Object.values(HELP)) lines.push(`  ${sig}\n      ${desc}`);
  return lines.join('\n');
}

/** `APOIO`, ou a pasta padrão com um aviso; `null` (e a explicação no stderr) se não achar. */
function resolveApoio(explicit) {
  const apoioDir = explicit ?? process.env.APOIO;
  if (apoioDir) return apoioDir;
  const found = defaultApoioDir();
  if (found) {
    console.error(
      `Aviso: APOIO não está definido; usando ${found} (a rodada mais recente).`,
    );
    return found;
  }
  console.error(
    'APOIO (a pasta apoio/ da rodada) não está definido e não há ~/mapping-testes/*/apoio.',
  );
  return null;
}

/** `passo <item…> [--guia=<arquivo>] [--preparo]`: imprime o trecho do guia da rodada (etapa #1232, GL1; `--preparo`, #1639, TC1). */
function runPasso(args) {
  const guiaArg = args.find((a) => a.startsWith('--guia='));
  const preparo = args.includes('--preparo');
  const items = args.filter((a) => !a.startsWith('--guia=') && a !== '--preparo');
  if (items.length === 0 || (guiaArg && guiaArg.length === 7)) {
    console.error(
      'Uso: node cloud.mjs passo <item…> [--guia=<arquivo>]\n     node cloud.mjs passo <Rn…> --preparo   (só o trecho antes do primeiro passo, de roteiros inteiros)',
    );
    process.exitCode = 2;
    return;
  }
  let file = guiaArg?.slice(7);
  if (!file) {
    const apoioDir = resolveApoio();
    if (!apoioDir) {
      process.exitCode = 2;
      return;
    }
    file = path.join(apoioDir, 'guia.md');
  }
  try {
    const text = fs.readFileSync(file, 'utf8');
    console.log(
      preparo
        ? guidePreparo(text, items, readTestingGuide())
        : guideExcerpt(text, items, readTestingGuide()),
    );
  } catch (error) {
    console.error(
      error.code === 'ENOENT'
        ? `Não achei o guia da rodada: ${file}. Gere-o com round-guide.mjs --out.`
        : error.message,
    );
    process.exitCode = 2;
  }
}

/** O `docs/TESTING.md` do clone (ao lado do `scripts/`), ou `undefined`: o `passo` cai nele para item fora do guia da rodada. */
function readTestingGuide() {
  const file = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'docs',
    'TESTING.md',
  );
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** O `docs/TESTING-NUVEM-CONSULTA.md` do clone (ao lado do `scripts/`), ou `undefined` se não existir. */
function readConsulta() {
  const file = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'docs',
    'TESTING-NUVEM-CONSULTA.md',
  );
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** `secao [<chave…>] [--guia=<arquivo>]`: imprime seções sob demanda do guia da rodada (etapa #1533, TE1). */
function runSecao(args) {
  const guiaArg = args.find((a) => a.startsWith('--guia='));
  const chaves = args.filter((a) => !a.startsWith('--guia='));
  if (guiaArg && guiaArg.length === 7) {
    console.error('Uso: node cloud.mjs secao [<chave…>] [--guia=<arquivo>]');
    process.exitCode = 2;
    return;
  }
  let file = guiaArg?.slice(7);
  if (!file) {
    const apoioDir = resolveApoio();
    if (!apoioDir) {
      process.exitCode = 2;
      return;
    }
    file = path.join(apoioDir, 'guia.md');
  }
  try {
    const guide = fs.readFileSync(file, 'utf8');
    const consulta = readConsulta();
    console.log(
      chaves.length === 0
        ? listSecoes(guide, consulta)
        : guideSection(guide, chaves, consulta),
    );
  } catch (error) {
    console.error(
      error.code === 'ENOENT'
        ? `Não achei o guia da rodada: ${file}. Gere-o com round-guide.mjs --out.`
        : error.message,
    );
    process.exitCode = 2;
  }
}

/** Roda a CLI (`mark`, `state`, `tempos`, `ponto`, `run`, `serve`, `passo`, `secao` e `help`); lê a pasta de apoio de `APOIO` (ou, sem ela, da rodada mais recente). */
async function runCli(argv) {
  const [command, ...rest] = argv;
  if (command === 'mark') {
    const [roteiro, fase] = rest;
    const apoioDir = resolveApoio();
    if (!apoioDir) {
      process.exitCode = 2;
      return;
    }
    if (!roteiro || !fase) {
      console.error('Uso: node cloud.mjs mark <roteiro> <start|end>');
      process.exitCode = 2;
      return;
    }
    fs.mkdirSync(apoioDir, { recursive: true });
    mark(apoioDir, roteiro, fase);
    return;
  }
  if (command === 'state') {
    const apoioDir = resolveApoio();
    if (!apoioDir) {
      process.exitCode = 2;
      return;
    }
    const { browser, page } = await connect(apoioDir);
    try {
      console.log(formatState(await state(page, apoioDir, { projectDir: rest[0] })));
    } finally {
      await browser.close();
    }
    return;
  }
  if (command === 'ponto') {
    const marking = rest.includes('--marcacao');
    const args = rest.filter((a) => !a.startsWith('--'));
    const perspective = rest.find((a) => a.startsWith('--perspectiva='))?.slice(14);
    const [container, x, y, projectDir] = args;
    if (
      !container ||
      !Number.isFinite(Number(x)) ||
      !Number.isFinite(Number(y)) ||
      !projectDir
    ) {
      console.error(
        'Uso: node cloud.mjs ponto <container> <x> <y> <pasta-do-projeto> [--perspectiva=<nome>] [--marcacao]',
      );
      process.exitCode = 2;
      return;
    }
    const apoioDir = resolveApoio();
    if (!apoioDir) {
      process.exitCode = 2;
      return;
    }
    const { browser, page } = await connect(apoioDir);
    try {
      const at = await ponto(page, projectDir, container, Number(x), Number(y), {
        perspective,
        marking,
      });
      console.log(`${at.x} ${at.y}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    } finally {
      await browser.close();
    }
    return;
  }
  if (command === 'find') {
    const texto = rest.join(' ').trim();
    const apoioDir = texto ? resolveApoio() : null;
    if (!texto || !apoioDir) {
      if (!texto) console.error('Uso: node cloud.mjs find <texto>');
      process.exitCode = 2;
      return;
    }
    const { browser, page } = await connect(apoioDir);
    try {
      console.log(formatCandidates(await find(page, texto), texto));
    } finally {
      await browser.close();
    }
    return;
  }
  if (command === 'help') {
    console.log(formatHelp());
    return;
  }
  if (command === 'passo') {
    runPasso(rest);
    return;
  }
  if (command === 'secao') {
    runSecao(rest);
    return;
  }
  if (command === 'serve') {
    const apoioDir = resolveApoio();
    if (!apoioDir) {
      process.exitCode = 2;
      return;
    }
    await runServe(apoioDir);
    return;
  }
  if (command === 'run') {
    const prazoArg = rest.find((a) => a.startsWith('--prazo='));
    const prazo = prazoArg ? Number(prazoArg.slice(8)) : undefined;
    const novo = rest.includes('--novo');
    const projectDir = rest.find((a) => !a.startsWith('--'));
    const apoioDir = resolveApoio();
    const usage =
      "Uso: node cloud.mjs run [<pasta-do-projeto>] [--prazo=<s>] [--novo] <<'JS' ... JS";
    if (!apoioDir || (prazoArg && !(prazo > 0))) {
      if (apoioDir) console.error(usage);
      process.exitCode = 2;
      return;
    }
    const body = fs.readFileSync(0, 'utf8');
    if (!body.trim()) {
      console.error(usage);
      process.exitCode = 2;
      return;
    }
    const code = await runViaServer(body, {
      apoioDir,
      projectDir: projectDir ? path.resolve(projectDir) : undefined,
      prazoSeconds: prazo,
      novo,
    });
    process.exit(code);
  }
  if (command === 'tempos') {
    const apoioDir = resolveApoio(rest[0]);
    if (!apoioDir) {
      console.error('Uso: node cloud.mjs tempos [<apoio>]');
      process.exitCode = 2;
      return;
    }
    console.log(formatTempos(temposFromDir(apoioDir)));
    return;
  }
  console.error(
    `Comando desconhecido: ${command}. Comandos: mark, state, tempos, ponto, run, serve, find, passo, secao, help.`,
  );
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli(process.argv.slice(2));
}
