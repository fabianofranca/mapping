// Auxiliares de automação do agente testador da nuvem (docs/TESTING.md, apêndice A,
// "Diálogos nativos na nuvem (Xvfb)"; docs/TESTING-NUVEM.md). Empacota as receitas 4 a 10 do
// apêndice A para não reescrevê-las em toda rodada.
//
// Uso como biblioteca:
//   import { connect, selectFolder, ... } from './cloud.mjs';
//
// Uso como CLI (hoje só o `mark`, que o cloud-up.sh chama):
//   node scripts/testing/cloud.mjs mark <roteiro> <start|end>
//
// Pasta de apoio: toda função que precisa de disco recebe `apoioDir` (a pasta `apoio/` da
// pasta de trabalho da rodada, docs/TESTING-NUVEM.md item 3) como argumento explícito; a CLI
// lê esse caminho da variável de ambiente `APOIO` (decisão desta fase: um nome só, sem `S`,
// para não colidir com a variável `S` usada nas receitas do apêndice A em shells à parte).
//
// Nunca: registrar `page.on('filechooser')` ou `waitForEvent('filechooser')`, nem usar
// `setInputFiles` como atalho (regra do "Nunca" do docs/TESTING-NUVEM.md); nunca enviar Enter a
// um seletor de arquivo/pasta ou a um "Salvar como" do GTK — só alt+o / alt+s / alt+c.
import { chromium } from 'playwright';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Caminho fixo do Chrome for Testing headless usado por `makeCadastroPng` (docs do ambiente). */
const HEADLESS_CHROMIUM = '/opt/pw-browsers/chromium';

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

/** Lista {id, name} de toda janela visível (via `xdotool getwindowname`). */
function listWindows() {
  const search = spawnSync('xdotool', ['search', '--onlyvisible', '--name', '.'], {
    encoding: 'utf8',
  });
  const ids = search.stdout.trim().split('\n').filter(Boolean);
  return ids.map((id) => {
    const name = spawnSync('xdotool', ['getwindowname', id], {
      encoding: 'utf8',
    }).stdout.trim();
    return { id, name };
  });
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

/**
 * Conecta no Chrome por CDP (receita 4 do apêndice A), acha a aba da app e registra console e
 * erros de página em `<apoioDir>/console.log`. Devolve `{ browser, page }`.
 */
export async function connect(apoioDir, cdpUrl = 'http://localhost:9222') {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('http'));
  if (!page) {
    throw new Error('Nenhuma aba http(s) encontrada no Chrome conectado por CDP.');
  }
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

/** Clique por papel e nome que pode abrir um diálogo nativo, sem esperar depois (receita 4). */
export async function clickNoWait(page, name) {
  await page.getByRole('button', { name }).click({ noWaitAfter: true });
}

const OPEN_DIALOG_TITLES = [
  'Selecione onde este site pode salvar mudanças',
  'Abrir arquivos',
  'Abrir arquivo',
];

/** Digita o caminho no seletor GTK já ativo (ctrl+l, depois o caminho). */
function typePathIntoDialog(windowId, targetPath) {
  execFileSync('xdotool', ['windowactivate', '--sync', windowId]);
  execFileSync('xdotool', ['key', '--clearmodifiers', 'ctrl+l']);
  execFileSync('xdotool', ['type', '--delay', '20', targetPath]);
}

/**
 * Janela de autocompletar do GTK aberta sobre o seletor: uma janela "chromium" pequena
 * (~48 px de altura) que não é o próprio seletor. Devolve a janela achada, ou null.
 */
function findAutocompletePopup(dialogWindowId) {
  for (const window of listWindows()) {
    if (window.id === dialogWindowId) continue;
    if (!/chromium/i.test(window.name)) continue;
    const geometry = windowGeometry(window.id);
    if (geometry.HEIGHT > 0 && geometry.HEIGHT <= 70) return { window, geometry };
  }
  return null;
}

/** Clica no botão **Open** do GTK por coordenada, dentro da janela do seletor (receita 5, pasta com conteúdo). */
function clickOpenButtonByCoordinate(dialogWindowId) {
  const geometry = windowGeometry(dialogWindowId);
  // O botão "Open" fica no canto inferior direito do seletor GTK padrão.
  const x = geometry.X + geometry.WIDTH - 60;
  const y = geometry.Y + geometry.HEIGHT - 28;
  execFileSync('xdotool', ['mousemove', String(x), String(y), 'click', '1']);
}

/**
 * Receita 5 do apêndice A: seletor GTK de pasta ou de arquivo. Ache a janela pelo título,
 * digite o caminho e confirme com alt+o — resolvendo sozinho a lista de autocompletar do GTK
 * quando a pasta já tem conteúdo (ela some da lista do `xdotool`, não some como o seletor).
 */
async function runOpenDialog(targetPath, { expectAutocomplete = false } = {}) {
  const windowId = findWindow(OPEN_DIALOG_TITLES);
  if (!windowId) {
    throw new Error(
      `Nenhum seletor de arquivo/pasta encontrado (títulos esperados: ${OPEN_DIALOG_TITLES.join(', ')}).`,
    );
  }
  typePathIntoDialog(windowId, targetPath);
  // Dá tempo para o GTK decidir se abre a lista de autocompletar (ela só aparece quando a
  // pasta digitada já tem conteúdo que casa com o que foi digitado).
  const popup = await waitUntil(() => findAutocompletePopup(windowId), {
    timeoutMs: 1500,
    stepMs: 100,
  });
  if (popup) {
    clickOpenButtonByCoordinate(windowId);
  } else if (expectAutocomplete) {
    throw new Error('Lista de autocompletar do GTK esperada, mas não apareceu.');
  }
  xdotoolKey(windowId, 'alt+o');
  const closed = await waitUntil(() => !findWindow(OPEN_DIALOG_TITLES), {
    timeoutMs: 4000,
  });
  if (!closed) {
    throw new Error('O seletor de arquivo/pasta continuou aberto depois do alt+o.');
  }
  return { hadAutocomplete: Boolean(popup) };
}

/**
 * `select_folder` dos roteiros: abre o seletor de pasta, resolve a lista de autocompletar do
 * GTK quando a pasta já tem conteúdo e, em seguida, trata o pedido de permissão (receita 6).
 */
export async function selectFolder(apoioDir, targetPath) {
  const dialogResult = await runOpenDialog(targetPath);
  const permissionResult = await allowPermission(apoioDir);
  return { ...dialogResult, permission: permissionResult };
}

/** `open_file` dos roteiros: seletor de arquivo, sem o passo de permissão. */
export async function openFile(apoioDir, targetPath) {
  return runOpenDialog(targetPath);
}

/**
 * Receita 7 do apêndice A: "Salvar como" (Exportar › Baixar). Recusa-se a sobrescrever um
 * arquivo que já existe, porque o GTK sobrescreve sem perguntar.
 */
export async function saveFile(apoioDir, targetPath) {
  if (fs.existsSync(targetPath)) {
    throw new Error(
      `saveFile: ${targetPath} já existe no disco; o GTK sobrescreveria sem perguntar.`,
    );
  }
  const windowId = findWindow(['Aviso: este site']);
  if (!windowId) {
    throw new Error(
      'Nenhum diálogo "Salvar como" encontrado (título "Aviso: este site…").',
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

/** Receita 8 do apêndice A: cancela o diálogo nativo em foco (`alt+c`). */
export async function cancelDialog(apoioDir) {
  const windows = listWindows();
  const current = windows.find(
    (w) => /chromium/i.test(w.name) && w.name.trim().length > 0,
  );
  const windowId = current ? current.id : findWindow(['chromium']);
  if (!windowId) {
    throw new Error('Nenhuma janela do Chrome encontrada para cancelar.');
  }
  fs.appendFileSync(
    path.join(apoioDir, 'console.log'),
    `[cancelDialog] alt+c em ${windowId}\n`,
  );
  xdotoolKey(windowId, 'alt+c');
}

/**
 * Receita 6 do apêndice A: pedido de permissão pelo AT-SPI. Chama `atspi-allow.py`; tanto
 * "clicou" quanto "nenhum botão de permitir" contam como sucesso (a app já tinha a permissão).
 */
export async function allowPermission(apoioDir) {
  const scriptPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'atspi-allow.py',
  );
  const logFile = path.join(apoioDir, 'console.log');
  try {
    const { stdout } = await execFileAsync('/usr/bin/python3.12', [scriptPath]);
    fs.appendFileSync(logFile, `[allowPermission] ${stdout.trim()}\n`);
    return stdout.trim();
  } catch (error) {
    // code 1 = "nenhum botão de permitir": sucesso na prática (apêndice A, receita 6).
    if (error.code === 1) {
      const out = (error.stdout ?? '').trim() || 'nenhum botão de permitir';
      fs.appendFileSync(logFile, `[allowPermission] ${out}\n`);
      return out;
    }
    fs.appendFileSync(
      logFile,
      `[allowPermission] falhou (código ${error.code}): ${(error.stdout ?? '').trim()} ${(error.stderr ?? '').trim()}\n`,
    );
    throw new Error(
      `allowPermission falhou (código ${error.code}): ${(error.stdout ?? '').trim()} ${(error.stderr ?? '').trim()}`,
      { cause: error },
    );
  }
}

/** Captura `import -window root` (ImageMagick) em `<apoioDir>/anexos/<name>.png`. */
export async function screenshot(apoioDir, name) {
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
    const page = await browser.newPage();
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

/** Roda a CLI (hoje só `mark`); lê a pasta de apoio da variável de ambiente `APOIO`. */
async function runCli(argv) {
  const [command, ...rest] = argv;
  if (command === 'mark') {
    const [roteiro, fase] = rest;
    const apoioDir = process.env.APOIO;
    if (!apoioDir) {
      console.error('APOIO (a pasta apoio/ da rodada) precisa estar definida.');
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
  console.error(`Comando desconhecido: ${command}. Comandos: mark.`);
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli(process.argv.slice(2));
}
