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
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

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
 * Lê o texto de um `tempos.log` (`<nome> <start|end> <hora ISO>` por linha) e devolve, por nome,
 * a duração do primeiro `start` ao último `end`, o total e os avisos (etapa #482, decisão 8).
 * Marca repetida vira aviso; nome sem par (ou com o fim antes do início) fica com `segundos: null`.
 */
export function temposFromLog(text) {
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
    const e = nomes.get(nome) ?? { start: [], end: [] };
    e[fase].push(t);
    nomes.set(nome, e);
  }
  const itens = [];
  let totalSegundos = 0;
  for (const [nome, e] of nomes) {
    for (const fase of ['start', 'end']) {
      if (e[fase].length > 1) {
        avisos.push(
          `${nome} ${fase}: marca repetida (${e[fase].length} vezes); valem o primeiro start e o último end`,
        );
      }
    }
    const ini = e.start.length ? Math.min(...e.start) : null;
    const fim = e.end.length ? Math.max(...e.end) : null;
    let segundos = null;
    if (ini === null || fim === null) {
      avisos.push(`${nome}: falta a marca de ${ini === null ? 'start' : 'end'}`);
    } else if (fim < ini) {
      avisos.push(`${nome}: o end vem antes do start`);
    } else {
      segundos = Math.round((fim - ini) / 1000);
      totalSegundos += segundos;
    }
    itens.push({ nome, segundos });
  }
  return { itens, avisos, totalSegundos };
}

/** `<apoioDir>/tempos.log` lido por `temposFromLog`; sem o arquivo, não há nada medido. */
export function temposFromDir(apoioDir) {
  const file = path.join(apoioDir, 'tempos.log');
  if (!fs.existsSync(file)) {
    return { itens: [], avisos: ['sem tempos.log: tempo não medido'], totalSegundos: 0 };
  }
  return temposFromLog(fs.readFileSync(file, 'utf8'));
}

const fmtDuracao = (s) => `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}s`;

/** O texto que a CLI imprime e que o relato copia no "Tempo por roteiro". */
export function formatTempos({ itens, avisos, totalSegundos }) {
  const largura = Math.max(5, ...itens.map((i) => i.nome.length));
  const linhas = itens.map(
    (i) =>
      `${i.nome.padEnd(largura)}  ${i.segundos === null ? 'tempo não medido' : fmtDuracao(i.segundos)}`,
  );
  if (itens.length)
    linhas.push(`${'total'.padEnd(largura)}  ${fmtDuracao(totalSegundos)}`);
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
    `Janelas nativas: ${quoted(state.windows)}`,
  ];
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
  const result = { ...dom, windows };
  if (projectDir) {
    const absolute = path.resolve(projectDir);
    const read = await readMapping(projectDir);
    if (!read.error) {
      fs.mkdirSync(path.dirname(lastFolderFile), { recursive: true });
      fs.writeFileSync(lastFolderFile, absolute);
    }
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
    }
  }
  return result;
}

/**
 * Ponto de tela de um ponto em pixels de um container (etapa #841, decisão 5; parte pura, sem CDP).
 * `mapping` é o `mapping.json` já lido; `container` é o nome (sem diferença de caixa) ou o id;
 * `viewport` é o `data-viewport` do `.canvas-host` (`"x y escala"`, px CSS relativos ao canto do
 * host); `host` é o canto do host na página (`boundingBox()`); `perspective`, opcional, é o nome
 * de uma perspectiva cujo item para o container (raiz) troca a posição `x`, `y` dele no canvas;
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
  let { x: px, y: py, scale } = found.placement;
  if (perspective) {
    const named = (mapping.perspectives ?? []).find(
      (q) => q.name.toLowerCase() === String(perspective).toLowerCase(),
    );
    if (!named) throw new Error(`perspectiva não encontrada: ${perspective}`);
    const item = named.items.find((i) => i.root === found.id);
    if (item) {
      px = item.x;
      py = item.y;
    }
  }
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

/** Lê o `data-viewport` e o canto do `.canvas-host` pela página (CDP) e converte (ver acima). */
export async function ponto(
  page,
  projectDir,
  container,
  x,
  y,
  { perspective, marking } = {},
) {
  const read = await readMapping(projectDir);
  if (read.error) throw new Error(read.error);
  const host = page.locator('.canvas-host');
  // espera um quadro, para a vista lida ser a desenhada
  await page.evaluate(
    () =>
      new Promise((ok) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(ok)),
      ),
  );
  const viewport = await host.getAttribute('data-viewport');
  const box = await host.boundingBox();
  if (!viewport || !box)
    throw new Error('o .canvas-host não tem data-viewport (a app abriu o projeto?)');
  return containerScreenPoint({
    mapping: read.json,
    container,
    x,
    y,
    viewport,
    host: { x: box.x, y: box.y },
    perspective,
    marking,
  });
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
 */
export async function drag(
  page,
  de,
  para,
  { select = true, steps = 10, warn = (m) => console.error(m) } = {},
) {
  if (select) {
    await page.mouse.click(de.x, de.y);
    await settle(page);
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

/** Dispara o arrasto da Paleta por eventos (roda na página): `dragstart`, `dragover`, `drop`, `dragend`. */
function syntheticPaletteDrag({ tipo, para }) {
  const item = [...document.querySelectorAll('li.library-type')].find(
    (li) => li.querySelector('.library-type-name')?.textContent?.trim() === tipo,
  );
  if (!item) return;
  const data = new DataTransfer();
  const fire = (target, type) =>
    target.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
        clientX: para.x,
        clientY: para.y,
      }),
    );
  fire(item, 'dragstart');
  const target = document.elementFromPoint(para.x, para.y) ?? document.body;
  fire(target, 'dragover');
  fire(target, 'drop');
  fire(item, 'dragend');
}

/**
 * Arrasta um tipo da Paleta aberta até um ponto de tela (etapa #1256, decisão 7). Acha o
 * `li.library-type` pelo nome do tipo, faz o arrasto nativo pelo mouse do Playwright (`move` no
 * item, `down`, `move` em `steps` passos até `para`, `up`) e confere que o `data-components` do
 * `.canvas-host` subiu. Sem subida, refaz por eventos (`dragstart` no item; `dragover`, `drop` e
 * `dragend` sob o ponto). Sem nenhuma, lança "o arrasto da Paleta não criou a instância".
 * Limite: o sucesso se mede pelo `data-components`, que só conta componentes desenhados; um tipo
 * sem desenho, numa camada oculta ou na vista Atual pode criar a instância sem subir o contador (aí o
 * erro vem mesmo com a instância criada: confira o disco).
 * `capture` (caminho de PNG) grava o recorte do canvas antes de soltar, com o destino aceso.
 * Devolve `{ via: 'nativo' | 'sintetico' }`.
 */
export async function paletteDrag(page, tipo, para, { capture, steps = 10 } = {}) {
  const host = page.locator('.canvas-host');
  const components = async () =>
    Number((await host.getAttribute('data-components')) ?? 0);
  const before = await components();
  const item = page
    .locator('li.library-type')
    .filter({ has: page.getByText(tipo, { exact: true }) });
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
  if ((await components()) > before) return { via: 'nativo' };
  await page.evaluate(syntheticPaletteDrag, { tipo, para });
  await settle(page);
  if ((await components()) > before) return { via: 'sintetico' };
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

/**
 * Executa o corpo de um script de passo (etapa #1148, decisão 1): conecta (`connectFn`, padrão
 * `connect`), roda `body` como corpo de uma função assíncrona com `page`, `browser`, `apoioDir`,
 * `projectDir` e todos os exports deste módulo em escopo, e imprime `formatState(...)` no fim.
 * Devolve o código de saída (0 sucesso, 1 erro, 124 prazo esgotado); quem chama faz o `process.exit`.
 * Em erro ou prazo imprime a mensagem (`io.error`) e o estado, se a conexão ainda responder.
 */
export async function runStep(
  body,
  {
    apoioDir,
    projectDir,
    prazoSeconds = RUN_DEADLINE_SECONDS,
    connectFn = connect,
    io = { log: console.log, error: console.error },
  } = {},
) {
  const { browser, page } = await connectFn(apoioDir);
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
    const scope = { page, browser, apoioDir, projectDir, ...exportsOf() };
    const fn = new AsyncFunction(...Object.keys(scope), body);
    const outcome = await Promise.race([
      fn(...Object.values(scope)).then(() => 'ok'),
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
  await printState();
  return code;
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
  formatState: { sig: 'formatState(estado)', desc: 'texto do estado (tela e disco)' },
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
    sig: 'drag(page, de, para, { select? = true, steps? = 10, warn? })',
    desc: 'arrasta entre dois pontos de tela ({x, y}); avisa se de cair no raio de uma alça (canto) da seleção',
  },
  nearHandle: {
    sig: 'nearHandle(box, ponto)',
    desc: 'canto (nw, ne, sw, se) que a app pegaria no ponto (raio 12 a 22 px, xadrez), ou null',
  },
  paletteDrag: {
    sig: 'paletteDrag(page, tipo, para, { capture?, steps? = 10 })',
    desc: 'arrasta um tipo da Paleta aberta até um ponto de tela; capture = PNG antes de soltar; devolve { via: nativo | sintetico }',
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
    sig: 'temposFromLog(texto)',
    desc: 'durações por roteiro a partir do texto do tempos.log',
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
    sig: 'ponto(page, projectDir, container, x, y, { perspective?, marking? })',
    desc: 'ponto de tela de um ponto do container, lendo o data-viewport',
  },
  runStep: {
    sig: 'runStep(corpo, { apoioDir, projectDir?, prazoSeconds?, connectFn?, io? })',
    desc: 'executa o corpo de um script de passo (o que o comando run usa)',
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
  ['tempos [<apoio>]', 'duração por roteiro, do tempos.log'],
  ['state [<pasta-do-projeto>]', 'conecta, imprime o estado da tela e do disco e sai'],
  [
    'ponto <container> <x> <y> <pasta-do-projeto> [--perspectiva=<nome>] [--marcacao]',
    'ponto de tela de um ponto do container',
  ],
  [
    'run [<pasta-do-projeto>] [--prazo=<s>]',
    "executa o corpo do script lido da entrada padrão (heredoc <<'JS'), com page, browser, apoioDir, projectDir e os exports em escopo; imprime o estado; prazo 90 s",
  ],
  [
    'find <texto>',
    'lista até 10 elementos visíveis cujo nome contém o texto (papel, nome, região)',
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

/** Roda a CLI (`mark`, `state`, `tempos`, `ponto`, `run` e `help`); lê a pasta de apoio de `APOIO` (ou, sem ela, da rodada mais recente). */
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
  if (command === 'run') {
    const prazoArg = rest.find((a) => a.startsWith('--prazo='));
    const prazo = prazoArg ? Number(prazoArg.slice(8)) : undefined;
    const projectDir = rest.find((a) => !a.startsWith('--'));
    const apoioDir = resolveApoio();
    const usage =
      "Uso: node cloud.mjs run [<pasta-do-projeto>] [--prazo=<s>] <<'JS' ... JS";
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
    const code = await runStep(body, { apoioDir, projectDir, prazoSeconds: prazo });
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
    `Comando desconhecido: ${command}. Comandos: mark, state, tempos, ponto, run, find, help.`,
  );
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli(process.argv.slice(2));
}
