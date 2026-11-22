// Automation helpers for the cloud tester agent (docs/TESTING.md, Appendix A,
// "Native dialogs in the cloud (Xvfb)"; docs/TESTING-NUVEM.md). Packages recipes 4 to 10 of
// Appendix A so they are not rewritten in every round.
//
// Use as a library:
//   import { connect, selectFolder, ... } from './cloud.mjs';
//
// Use as a CLI:
//   node scripts/testing/cloud.mjs mark <script> <start|end>    (called by cloud-up.sh)
//   node scripts/testing/cloud.mjs tempos <apoio>               (duration per script, from tempos.log)
//   node scripts/testing/cloud.mjs state [<project-folder>]     (connects, prints the state, exits)
//   node scripts/testing/cloud.mjs run [<project-folder>] [--prazo=<s>] < body.js   (step body on standard input)
//   node scripts/testing/cloud.mjs find <text>                  (candidates whose name contains the text)
//   node scripts/testing/cloud.mjs help                         (commands and exports, from the HELP table)
//
// Support folder: every function that needs disk receives `apoioDir` (the `apoio/` folder of the
// round's working folder, docs/TESTING-NUVEM.md item 3) as an explicit argument; the CLI
// reads that path from the `APOIO` environment variable (decision of this phase: a single name,
// without `S`, to avoid colliding with the `S` variable used in the Appendix A recipes in
// separate shells).
//
// Never: register `page.on('filechooser')` or `waitForEvent('filechooser')`, or use
// `setInputFiles` as a shortcut (rule of the "Never" section of docs/TESTING-NUVEM.md); never send Enter to
// a GTK file/folder picker or a "Save as" — only alt+o / alt+s / alt+c.
/* global document, location, CSS, MutationObserver, DataTransfer, DragEvent -- only inside the functions that run on the page */
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

/** Fixed path of the headless Chrome for Testing used by `makeCadastroPng` (environment docs). */
const HEADLESS_CHROMIUM = '/opt/pw-browsers/chromium';

/**
 * Reads the format that `cloud-up.sh` writes to `apoio/env.sh` (`export A=1 B=2`, one or more
 * lines; single or double quotes around the value are stripped). Pure.
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
 * Loads the round's environment (`DISPLAY`, `DBUS_SESSION_BUS_ADDRESS`, `APOIO`) from
 * `<apoioDir>/env.sh`, filling in only what is missing in `env` (default `process.env`). Without the
 * file and without `DISPLAY`, throws. The step script no longer needs `source apoio/env.sh`.
 */
export function loadEnv(apoioDir, env = process.env) {
  const file = path.join(apoioDir, 'env.sh');
  if (fs.existsSync(file)) {
    const values = parseEnvFile(fs.readFileSync(file, 'utf8'));
    for (const key of ['DISPLAY', 'DBUS_SESSION_BUS_ADDRESS']) {
      if (!env[key] && values[key]) env[key] = values[key];
    }
  } else if (!env.DISPLAY) {
    throw new Error('apoio/env.sh does not exist: run cloud-up.sh');
  }
  if (!env.APOIO) env.APOIO = apoioDir;
  return env;
}

/** `xdotool key` without Enter: shortcut of a native dialog (recipes 5, 7 and 8 of Appendix A). */
function xdotoolKey(windowId, ...keys) {
  execFileSync('xdotool', ['windowactivate', '--sync', windowId]);
  execFileSync('xdotool', ['key', '--clearmodifiers', ...keys]);
}

/** First visible window whose title matches any name in the list, or null. */
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

/** Waits until `predicate()` is truthy or time runs out; does not throw on timeout (returns the last value). */
async function waitUntil(predicate, { timeoutMs = 4000, stepMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let value = await predicate();
  while (!value && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    value = await predicate();
  }
  return value;
}

/** Title of the system's active window (via `xdotool getactivewindow getwindowname`), or ''. */
function activeWindowTitle() {
  const result = spawnSync('xdotool', ['getactivewindow', 'getwindowname'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

/** Default timeout (ms) of the wait for a native dialog (stage #405, decision 2). */
const DIALOG_TIMEOUT_MS = 5000;

/**
 * Waits for a visible window whose title matches any name in the list and returns its id. Tries
 * every `stepMs` (150 ms) up to `timeoutMs` (5 s). When the timeout runs out, throws with the
 * expected titles and the active window's title; if the active one is not the app's (title
 * "Mapping…"), adds the two-tabs sentence. `find` and `activeTitle` are injectable so the test
 * runs without `xdotool`.
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
  let message = `No file/folder picker found within ${timeoutMs} ms (expected titles: ${names.join(', ')}; active window: "${active}").`;
  if (active && !/^Mapping\b/.test(active)) {
    message +=
      " Probable cause: the window's active tab is not the app's; the native picker only opens with it focused in the system (close the other tab).";
  }
  throw new Error(message);
}

/**
 * Lists {id, name} of every visible window. The names come from a single command
 * (`xdotool search ... getwindowname %@`, one line per window, in the `search` order), instead of
 * one `getwindowname` per window on each `waitUntil` attempt.
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
  // The list changed between the two commands (a window opened or closed): back to one name per window.
  return ids.map((id) => ({
    id,
    name: spawnSync('xdotool', ['getwindowname', id], { encoding: 'utf8' }).stdout.trim(),
  }));
}

/** Geometry {x, y, width, height} of a window (via `xdotool getwindowgeometry --shell`). */
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

/** Default origin of the app served by `cloud-up.sh`. */
const APP_ORIGIN = 'http://localhost:8080';

/**
 * Picks the app's tab among `pages` (`{ url, title? }`): the one of the origin whose path does not
 * start with `/guide/` (or `/guia/`). With zero or more than one, throws with the URLs and titles
 * found instead of choosing silently. Pure.
 */
export function pickAppPage(pages, { origin = APP_ORIGIN } = {}) {
  const wanted = new URL(origin).origin;
  const matches = pages.filter((candidate) => {
    try {
      const url = new URL(candidate.url);
      return url.origin === wanted && !/^\/gui(de|a)\//.test(url.pathname);
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
        ? `No tab found in the Chrome connected over CDP (expected the app at ${wanted}).`
        : `No app tab (${wanted}, outside /guide/) found. Tabs found:\n${list(pages)}`,
    );
  }
  throw new Error(
    `${matches.length} app tabs open:\n${list(matches)}\nHint: close the extra tabs (recipe 3).`,
  );
}

/**
 * Picks the guide's tab among `pages` (`{ url, title? }`): the one of the origin whose path starts
 * with `/guide/` (or `/guia/`). With zero or more than one, throws with the URLs and titles found. Pure.
 */
function pickGuidePage(pages, { origin = APP_ORIGIN } = {}) {
  const wanted = new URL(origin).origin;
  const matches = pages.filter((candidate) => {
    try {
      const url = new URL(candidate.url);
      return url.origin === wanted && /^\/gui(de|a)\//.test(url.pathname);
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
      ? `No guide tab (${wanted}/guide/) found. Tabs found:\n${list(pages)}`
      : `${matches.length} guide tabs open:\n${list(matches)}\nHint: close the extra tabs (recipe 3).`,
  );
}

/**
 * Connects to Chrome over CDP, picks the tab with `pick`, applies the short timeout and logs
 * console and page errors to `<apoioDir>/console.log`. Basis of `connect` and `connectGuide`.
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
    // Without closing the CDP connection the script's `node` process does not exit.
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
 * Connects to Chrome over CDP (recipe 4 of Appendix A), finds the app's tab (`pickAppPage`),
 * applies the short timeout (`timeoutMs` 5 s on actions, `navigationTimeoutMs` 15 s on
 * navigations; a long wait passes `{ timeout }` in the call itself) and logs console and page
 * errors to `<apoioDir>/console.log`. Returns `{ browser, page }`.
 */
export async function connect(apoioDir, cdpUrl = 'http://localhost:9222', options = {}) {
  return connectTab(apoioDir, cdpUrl, pickAppPage, { ...CONNECT_DEFAULTS, ...options });
}

/**
 * Like `connect()`, but picks the guide's tab (`/guide/`) instead of the app's (stage #482, GT1):
 * the same 5 s and 15 s and the same console log. Returns `{ browser, page }`.
 */
export async function connectGuide(
  apoioDir,
  cdpUrl = 'http://localhost:9222',
  options = {},
) {
  return connectTab(apoioDir, cdpUrl, pickGuidePage, { ...CONNECT_DEFAULTS, ...options });
}

/**
 * Click by role and name that may open a native dialog, without waiting afterwards (recipe 4).
 * Accessible names repeat on the page ("Add images", "Local", "Help", "Reject"): `scope` (a
 * `Locator` or a CSS selector) restricts the search to a container and `exact` goes to
 * `getByRole`. Counts the candidates before clicking and only clicks with exactly 1; never picks
 * one silently (stage #405, decision 3).
 */
export async function clickNoWait(page, name, { scope, exact } = {}) {
  const root = typeof scope === 'string' ? page.locator(scope) : (scope ?? page);
  const options = exact === undefined ? { name } : { name, exact };
  const target = root.getByRole('button', options);
  const count = await target.count();
  if (count !== 1) {
    throw new Error(
      `clickNoWait: the button "${name}" matched ${count} candidate(s); pass \`scope\` (a container) or \`exact: true\`.`,
    );
  }
  await target.click({ noWaitAfter: true });
}

export const OPEN_DIALOG_TITLES = [
  'Selecione onde este site pode salvar mudanças',
  // Read picker: Apply folder…, Update from folder… and Open library (stage #482).
  'Selecione uma pasta que este site pode ver',
  'Abrir arquivos',
  'Abrir arquivo',
];

/** Types the path into the already active GTK picker (ctrl+l, then the path). */
function typePathIntoDialog(windowId, targetPath) {
  execFileSync('xdotool', ['windowactivate', '--sync', windowId]);
  execFileSync('xdotool', ['key', '--clearmodifiers', 'ctrl+l']);
  // The field may already have text (GTK keeps the path from the previous time and `ctrl+l` does
  // not select it): without clearing, the path came out doubled ("…/migracao/tmp/…/migracao").
  // `ctrl+a` does not select everything; `Home`, `shift+End` and `BackSpace` do (as in "Save as").
  execFileSync('xdotool', ['key', '--clearmodifiers', 'Home', 'shift+End', 'BackSpace']);
  execFileSync('xdotool', ['type', '--delay', '20', targetPath]);
  // When the typed folder has exactly one matching subfolder, GTK completes the path bar by
  // itself with its name, already selected (no separate autocomplete window); a "Delete" erases
  // only that selected text. Without a selection (none or several matching subfolders, which opens
  // the real autocomplete window), the cursor is already at the end and Delete erases nothing:
  // it is safe to always send it.
  execFileSync('xdotool', ['key', '--clearmodifiers', 'Delete']);
}

/** Maximum height (px) of an autocomplete window: ~48 px with 1 suggestion, 94 px with 4. */
const AUTOCOMPLETE_MAX_HEIGHT = 400;

/**
 * Among `windows` (`{ id, name }`), finds the GTK autocomplete window open over the picker:
 * a window named "chromium" (Chrome's main window and the picker have their own title)
 * and short, whose height grows with the number of suggestions (sibling folders with the same
 * start, like `migracao` and `migracao10`, give ~94 px; the old 70 px limit did not see them).
 * Returns `{ window, geometry }` or null. Pure: `geometryOf(id)` is injectable for the test.
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

/** GTK autocomplete window open over the picker (`pickAutocompletePopup`), or null. */
function findAutocompletePopup(dialogWindowId) {
  return pickAutocompletePopup(listWindows(), windowGeometry, dialogWindowId);
}

/**
 * Screen points where to click the GTK **Open** button, given the picker's geometry
 * `{ X, Y, WIDTH, HEIGHT }`. The measured center (picker of 1124 × 822: the button sits at
 * (1312, 893), 50 px from the right edge and 45 px from the bottom) comes first; the other two go
 * up and down about 8 px, in case the click lands on the button's edge (with 28 px from the
 * bottom, the old value, it missed).
 */
export function openButtonPoints(geometry) {
  const x = geometry.X + geometry.WIDTH - 50;
  const bottom = geometry.Y + geometry.HEIGHT;
  return [45, 37, 53].map((fromBottom) => ({ x, y: bottom - fromBottom }));
}

/**
 * Clicks the GTK **Open** button by coordinate, inside the picker's window (recipe 5, folder with
 * content). The first click only closes the autocomplete list and keeps the path: repeats with
 * another point of the button while the list stays open (up to 3 points).
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
 * Recipe 5 of Appendix A: GTK folder or file picker. Find the window by title, type the path and
 * confirm with alt+o — resolving the GTK autocomplete list by itself when the folder already has
 * content (it disappears from the `xdotool` list, it does not disappear like the picker).
 */
async function runOpenDialog(
  targetPath,
  { expectAutocomplete = false, timeoutMs = DIALOG_TIMEOUT_MS } = {},
) {
  const windowId = await waitForWindow(OPEN_DIALOG_TITLES, { timeoutMs });
  typePathIntoDialog(windowId, targetPath);
  // Gives GTK time to decide whether to open the autocomplete list (it only appears when the
  // typed folder already has content that matches what was typed).
  const popup = await waitUntil(() => findAutocompletePopup(windowId), {
    timeoutMs: 1500,
    stepMs: 100,
  });
  if (popup) {
    await clickOpenButtonByCoordinate(windowId);
  } else if (expectAutocomplete) {
    throw new Error('GTK autocomplete list expected, but it did not appear.');
  }
  xdotoolKey(windowId, 'alt+o');
  const closed = await waitUntil(() => !findWindow(OPEN_DIALOG_TITLES), {
    timeoutMs: 4000,
  });
  if (!closed) {
    if (findAutocompletePopup(windowId)) {
      throw new Error(
        'The file/folder picker stayed open: autocomplete list open (sibling folders with the same start).',
      );
    }
    throw new Error('The file/folder picker stayed open after alt+o.');
  }
  return { hadAutocomplete: Boolean(popup) };
}

/**
 * Relative path (stage #1256, decision 8): the `run` directory is not the working folder, so it
 * does not resolve by itself. Closes the open picker with Cancel (`alt+c`, recipe 8), without
 * typing the path, and throws the error that says what to do. Without a relative path, does nothing.
 */
async function rejectRelativePath(apoioDir, targetPath, cancel) {
  if (path.isAbsolute(targetPath)) return;
  try {
    await cancel(apoioDir);
  } catch {
    // No picker open: the path error is what matters.
  }
  throw new Error(`relative path '${targetPath}': pass the absolute path (path.resolve)`);
}

/**
 * `select_folder` of the test scripts: opens the folder picker, resolves the GTK autocomplete list
 * when the folder already has content and then handles the permission prompt (recipe 6).
 * Relative path: cancels the picker and throws (decision 8 of #1256).
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

/** `open_file` of the test scripts: file picker, without the permission step. */
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
 * Recipe 7 of Appendix A: "Save as" (Export › Download). Refuses to overwrite a file that
 * already exists, because GTK overwrites without asking.
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
      `saveFile: ${targetPath} already exists on disk; GTK would overwrite without asking.`,
    );
  }
  let windowId;
  try {
    windowId = await waitForWindow(['Aviso: este site'], { timeoutMs });
  } catch {
    throw new Error(
      `saveFile: the save dialog ("Aviso: este site…") did not appear; check that Export › Download was triggered (active window: "${activeWindowTitle()}").`,
    );
  }
  execFileSync('xdotool', ['windowactivate', '--sync', windowId]);
  execFileSync('xdotool', ['key', '--clearmodifiers', 'Home', 'shift+End', 'BackSpace']);
  execFileSync('xdotool', ['type', '--delay', '20', targetPath]);
  // The autocomplete list appears when the typed name matches a file in the folder; a single
  // Escape closes it without cancelling the dialog (two Escapes would cancel).
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
    // "alt+s that does not save" (Appendix A): waits and repeats just once.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (findWindow(['Aviso: este site'])) {
      xdotoolKey(windowId, 'alt+s');
    }
  }
}

/**
 * Recipe 8 of Appendix A: cancels the focused native dialog (`alt+c`). The native dialog is the
 * visible window that is not Chrome's main window (whose title always ends in
 * "Google Chrome for Testing"); this is the only stable way found in this phase, since the
 * dialog's title varies ("Aviso: este site…", "Selecione onde…", "Abrir arquivos…").
 */
export async function cancelDialog(apoioDir, { timeoutMs = DIALOG_TIMEOUT_MS } = {}) {
  loadEnv(apoioDir);
  const windowId = await waitUntil(
    () => listWindows().find((w) => !/Chrome for Testing$/.test(w.name))?.id,
    { timeoutMs, stepMs: 150 },
  );
  if (!windowId) {
    throw new Error(
      `No native dialog found to cancel within ${timeoutMs} ms (active window: "${activeWindowTitle()}").`,
    );
  }
  fs.appendFileSync(
    path.join(apoioDir, 'console.log'),
    `[cancelDialog] alt+c on ${windowId}\n`,
  );
  xdotoolKey(windowId, 'alt+c');
}

/** One call to `atspi-allow.py`; code 1 ("no allow button") is also a success. */
async function runAllowPermissionOnce(scriptPath) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/python3.12', [scriptPath]);
    return stdout.trim();
  } catch (error) {
    if (error.code === 1) return (error.stdout ?? '').trim() || 'no allow button';
    throw new Error(
      `allowPermission failed (code ${error.code}): ${(error.stdout ?? '').trim()} ${(error.stderr ?? '').trim()}`,
      { cause: error },
    );
  }
}

/**
 * Recipe 6 of Appendix A: permission prompt through AT-SPI. Calls `atspi-allow.py`; both
 * "clicked" and "no allow button" count as success (the app already had the permission,
 * or the dialog already closed). Decision of this phase: activates the Chrome window before
 * clicking — AT-SPI's `do_action` returns success even with the Chrome window unfocused (e.g.
 * right after closing the GTK picker, which keeps the focus), but the click has no effect at all
 * in that case; by activating the window first, the click started to work on the first try in
 * every attempt of this phase. Even so, repeats until the dialog really disappears ("no allow
 * button" in a following call) or until the attempt limit, as a safety net.
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
    // Chrome ignores clicks in the first instants of the permission prompt (protection against
    // accidental clicks right after an element appears); without this wait, the quick attempts
    // hit that window and the AT-SPI click has no effect at all (seen in this phase).
    await new Promise((resolve) => setTimeout(resolve, 1000));
    for (let i = 0; i < 6; i += 1) {
      const out = await runAllowPermissionOnce(scriptPath);
      attempts.push(out);
      if (out.startsWith('no allow button')) break;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const summary = attempts.join('; ');
    fs.appendFileSync(logFile, `[allowPermission] ${summary}\n`);
    return summary;
  } catch (error) {
    fs.appendFileSync(
      logFile,
      `[allowPermission] failed after ${attempts.length} attempt(s) (${attempts.join('; ')}): ${error.message}\n`,
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

/** `Control+Shift+Digit<n>` through Playwright's keyboard (Control+Shift+1 does not work). */
export async function windowShortcut(page, n) {
  await page.keyboard.press(`Control+Shift+Digit${n}`);
}

const CADASTRO_HTML = `<!doctype html>
<meta charset="utf-8" />
<body style="font: 20px sans-serif; width: 420px; margin: 0; padding: 32px">
  <h1>Create your account</h1>
  <form>
    <p>Name<br /><input style="width: 340px; font: inherit" /></p>
    <p>Age<br /><input style="width: 340px; font: inherit" /></p>
    <p>Email<br /><input style="width: 340px; font: inherit" /></p>
    <p><button style="font: inherit; padding: 12px 32px">Sign up</button></p>
  </form>
</body>`;

/**
 * Generates `cadastro.png` (docs/TESTING.md, R0, section "Prepare the sign-up screen screenshot"):
 * the HTML is embedded here (the same as the guide's, there is no ready-made `cadastro.html` in
 * the repository), opened in a separate headless Chromium (always `/opt/pw-browsers/chromium`,
 * the only path `chromium.launch()` finds in this environment) and captured with
 * `page.screenshot({ fullPage: true })`.
 */
export async function makeCadastroPng(dest) {
  const browser = await chromium.launch({
    executablePath: HEADLESS_CHROMIUM,
    headless: true,
  });
  try {
    // Small viewport (the guide estimates ~484 px wide at 100%) so the PNG comes out cropped to
    // the content, and not at the default size of Playwright's viewport (1280×720).
    const page = await browser.newPage({ viewport: { width: 484, height: 450 } });
    await page.setContent(CADASTRO_HTML);
    await page.screenshot({ path: dest, fullPage: true });
  } finally {
    await browser.close();
  }
}

/** Appends `<script> <start|end> <UTC time ISO 8601>` to `<apoioDir>/tempos.log`. */
export function mark(apoioDir, roteiro, fase) {
  if (fase !== 'start' && fase !== 'end') {
    throw new Error(`mark: the phase must be "start" or "end", got "${fase}".`);
  }
  const file = path.join(apoioDir, 'tempos.log');
  fs.appendFileSync(file, `${roteiro} ${fase} ${new Date().toISOString()}\n`);
}

/**
 * Reads the text of a `runs.log` (`<ISO time> run=<n> codigo=<c> checks=<k> falhas=<f>` per line,
 * written by `cloud.mjs run`) and returns `{ t, checks, falhas }` per valid line. Pure.
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
 * The `[start, end]` spans of a name when the marks, in time order, alternate `start`, `end`,
 * `start`, `end` (begin with `start`, finish with `end`, each end not before its start); else `null`.
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
 * Reads the text of a `tempos.log` (`<name> <start|end> <ISO time>` per line) and returns, per
 * name, the duration from the first `start` to the last `end`, the total and the warnings (stage
 * #482, decision 8). A repeated mark becomes a warning; a name without a pair (or with the end
 * before the start) gets `segundos: null`. With the text of `runs.log` (stage #1533, decision 7),
 * each item also carries `runs` and `checks`: the `run`s recorded between the script's first
 * `start` and last `end`.
 * Spans (stage #1712, decision 6): if a name's marks, in time order, alternate `start`, `end`,
 * `start`, `end` (begin with `start` and finish with `end`, as in `ambiente` when `cloud-up.sh`
 * runs twice), the duration is the sum of the spans, `runs` and `checks` count the `run`s inside
 * any span and there is no warning. Outside that pattern the rule above applies.
 */
export function temposFromLog(text, runsText) {
  const nomes = new Map();
  const avisos = [];
  for (const linha of String(text ?? '').split('\n')) {
    const [nome, fase, hora] = linha.trim().split(/\s+/);
    if (!nome || (fase !== 'start' && fase !== 'end')) continue;
    const t = Date.parse(hora ?? '');
    if (Number.isNaN(t)) {
      avisos.push(`${nome} ${fase}: invalid time "${hora ?? ''}" (line ignored)`);
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
          `${nome} ${fase}: repeated mark (${e[fase].length} times); the first start and the last end count`,
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
      avisos.push(`${nome}: missing the ${ini === null ? 'start' : 'end'} mark`);
    } else if (fim < ini) {
      avisos.push(`${nome}: the end comes before the start`);
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

/** `<apoioDir>/tempos.log` read by `temposFromLog`, with `runs.log` when it exists; without the file, nothing was measured. */
export function temposFromDir(apoioDir) {
  const file = path.join(apoioDir, 'tempos.log');
  if (!fs.existsSync(file)) {
    return { itens: [], avisos: ['no tempos.log: time not measured'], totalSegundos: 0 };
  }
  const runsFile = path.join(apoioDir, 'runs.log');
  return temposFromLog(
    fs.readFileSync(file, 'utf8'),
    fs.existsSync(runsFile) ? fs.readFileSync(runsFile, 'utf8') : undefined,
  );
}

const fmtDuracao = (s) => `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}s`;

/** The text the CLI prints and that the report copies into "Time per script". */
export function formatTempos({ itens, avisos, totalSegundos, totalRuns, totalChecks }) {
  const largura = Math.max(5, ...itens.map((i) => i.nome.length));
  const contagem = (runs, checks) =>
    runs === undefined ? '' : `  ${runs} run, ${checks} checks`;
  const linhas = itens.map(
    (i) =>
      `${i.nome.padEnd(largura)}  ${i.segundos === null ? 'time not measured' : fmtDuracao(i.segundos)}${contagem(i.runs, i.checks)}`,
  );
  if (itens.length)
    linhas.push(
      `${'total'.padEnd(largura)}  ${fmtDuracao(totalSegundos)}${contagem(totalRuns, totalChecks)}`,
    );
  for (const a of avisos) linhas.push(`warning: ${a}`);
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------------------------
// state(): act and check in one call (stage #421, decision 6)
// ---------------------------------------------------------------------------------------------

/** Compares two JSON values and lists what changed (pure). See `diffJson`. */
function collectDiff(before, after, where, out) {
  const isObj = (v) => v !== null && typeof v === 'object';
  const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  if (!isObj(before) || !isObj(after) || Array.isArray(before) !== Array.isArray(after)) {
    if (before !== after) {
      if (isObj(before) || isObj(after))
        out.push(
          `~ ${where || '(root)'}: ${isObj(before) ? 'structure' : show(before)} → ${isObj(after) ? 'structure' : show(after)}`,
        );
      else out.push(`~ ${where || '(root)'}: ${show(before)} → ${show(after)}`);
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
 * Lists changed paths (`~ a.b: old → new`), added (`+ a[id]`) and removed (`- a.b`) between two
 * JSON values; array items with `id` are matched by id. Past `limit`, the last line says
 * `+N changes beyond the limit`. Pure.
 */
export function diffJson(before, after, { limit = 20 } = {}) {
  const lines = [];
  collectDiff(before, after, '', lines);
  if (lines.length <= limit) return lines;
  return [...lines.slice(0, limit), `+${lines.length - limit} changes beyond the limit`];
}

const SELECTION_WORD = { marking: 'marking', image: 'container', arrow: 'arrow' };

/** The `Selection:` line of `formatState` (stage #1076, decision 11). */
function formatSelection(selection) {
  if (!selection) return 'Selection: none';
  if (selection.name === undefined) return `Selection: ${selection.type} ${selection.id}`;
  const word = SELECTION_WORD[selection.type] ?? selection.type;
  return `Selection: ${word} "${selection.name}" (${selection.id})`;
}

/**
 * The selection of `state()` (stage #1076, decision 11): from the `data-selection` (`"<type> <id>"`)
 * and, with `mapping.json` read, the name (`No name` if empty; the arrow is
 * `"<source> → <target>"`). Without `json`, or with the id not on disk (a proposal item under
 * review), only the type and the id remain.
 */
function resolveSelection(text, json) {
  if (text === undefined) return undefined;
  if (!text) return null;
  const [type, id] = text.split(' ');
  const selection = { type, id };
  if (!json) return selection;
  const nameOf = (item) => (item.name ? item.name : 'No name');
  if (type === 'arrow') {
    const arrow = (json.arrows ?? []).find((a) => a.id === id);
    if (!arrow) return selection;
    const mark = (ref) => (json.markings ?? []).find((m) => m.id === ref);
    const from = mark(arrow.from);
    const to = mark(arrow.to);
    return {
      ...selection,
      name: `${from ? nameOf(from) : 'No name'} → ${to ? nameOf(to) : 'No name'}`,
    };
  }
  const list = type === 'image' ? json.containers : json.markings;
  const item = (list ?? []).find((i) => i.id === id);
  return item ? { ...selection, name: nameOf(item) } : selection;
}

/** Short text of the state (a few lines, no raw JSON). */
export function formatState(state) {
  const quoted = (items) =>
    items.length ? items.map((i) => `"${i}"`).join(', ') : 'none';
  const lines = [
    `Tab: ${state.title} — ${state.url}`,
    ...(state.origin ? [`Origem: ${state.origin}`] : []),
    `Dialogs: ${quoted(state.dialogs)}`,
    `Notices: ${quoted(state.notices)}`,
    `Saving: ${state.saveStatus ?? 'no indicator'}`,
    `Focus: ${state.focus ? `${state.focus.role} "${state.focus.name}"` : 'none'}`,
  ];
  if (state.selection !== undefined) lines.push(formatSelection(state.selection));
  lines.push(`Native windows: ${quoted(state.windows)}`);
  const project = state.project;
  if (project) {
    if (project.dir) lines.push(`Folder: ${project.dir}`);
    if (project.error) {
      lines.push(`mapping.json: ${project.error}`);
    } else if (project.changes === null) {
      lines.push(`mapping.json: revision ${project.revision} (first read)`);
    } else if (project.changes.length === 0) {
      lines.push(
        `mapping.json: revision ${project.revision}, no change since the last read`,
      );
    } else {
      lines.push(`mapping.json: revision ${project.revision}; changed:`);
      for (const change of project.changes) lines.push(`  ${change}`);
    }
  }
  return lines.join('\n');
}

/** Reads the app's DOM (runs inside the page): dialogs, notices, saving and focus. */
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
    dialogs.push(name || '(no name)');
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
  // The status bar item `title` is `status.targetLabel`: "<label>: <origin>", in both languages.
  let origin = null;
  const labels = ['Onde o projeto é salvo', 'Where the project is saved'];
  for (const el of document.querySelectorAll('.statusbar .status-item')) {
    const title = el.getAttribute('title') ?? '';
    const label = labels.find((l) => title.startsWith(`${l}: `));
    if (label && title.length > label.length + 2) {
      origin = title.slice(label.length + 2);
      break;
    }
  }
  return {
    title: document.title,
    url: location.href,
    origin,
    dialogs,
    notices,
    saveStatus,
    focus,
    selection: document.querySelector('.canvas-host')?.dataset.selection ?? null,
  };
}

/** Reads and parses `<projectDir>/mapping.json`; JSON that does not parse: waits 1 s and reads once more. */
async function readMapping(projectDir) {
  const file = path.join(projectDir, 'mapping.json');
  if (!fs.existsSync(file)) return { error: `does not exist at ${projectDir}` };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { json: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (error) {
      if (attempt === 1) return { error: `invalid JSON (${error.message})` };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return { error: 'invalid JSON' };
}

/** The folder that `state()` remembers (`apoio/state/ultima-pasta.txt`), or `undefined`. */
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

/** Writes `ultima-pasta.txt` only when the content changes (the remembered folder does not go stale nor get rewritten needlessly). */
function rememberFolder(file, absolute) {
  try {
    if (fs.readFileSync(file, 'utf8').trim() === absolute) return;
  } catch {
    // Without the file: write it.
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, absolute);
}

/**
 * State in one call, to act and check without extra round trips to the model: tab, open dialogs,
 * visible notices, saving, focus, native windows besides Chrome and, with `projectDir`, the
 * `revision` of `mapping.json` and what changed since the last call for the same folder (the
 * previous snapshot stays in `<apoioDir>/state/`). Does not change the app: reads the DOM and the disk.
 */
export async function state(page, apoioDir, { projectDir } = {}) {
  loadEnv(apoioDir);
  const lastFolderFile = path.join(apoioDir, 'state', 'ultima-pasta.txt');
  // `undefined`: the recorded folder, if any; `null`: does not read disk (stage #1256, decision 9).
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
    // Explicit folder: remembered even if the read fails, and only rewritten when it changes (#1430 e).
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
 * Reads the `data-container-boxes` of the `.canvas-host` (stage #1076, decision 5): `"<id> <x> <y>
 * <width> <height> <scale>"` per placed container, separated by `;`, in canvas units and in the
 * drawn placement. Returns a `Map` from id to `{ x, y, width, height, scale }`; empty or null text
 * gives an empty `Map`; an entry without the 5 numbers after the id throws with the text.
 */
export function parseContainerBoxes(text) {
  const boxes = new Map();
  for (const entry of String(text ?? '').split(';')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [id, ...rest] = trimmed.split(/\s+/);
    const numbers = rest.map(Number);
    if (numbers.length !== 5 || !numbers.every(Number.isFinite)) {
      throw new Error(`invalid data-container-boxes: "${trimmed}"`);
    }
    const [x, y, width, height, scale] = numbers;
    boxes.set(id, { x, y, width, height, scale });
  }
  return boxes;
}

/**
 * The placement (x, y, scale) of `found` on the canvas: the drawn one (`boxes`) wins over the
 * disk's and the perspective's; without it, the perspective's (if `found` is its root) or the
 * disk's. `warn` receives the warning when the requested perspective has a different position
 * than the drawn one.
 */
function placementOf(found, { boxes, perspective, mapping, warn }) {
  let named;
  if (perspective) {
    named = (mapping.perspectives ?? []).find(
      (q) => q.name.toLowerCase() === String(perspective).toLowerCase(),
    );
    if (!named) throw new Error(`perspective not found: ${perspective}`);
  }
  const item = named?.items.find((i) => i.root === found.id);
  const drawn = found.id ? boxes.get(found.id) : undefined;
  if (drawn) {
    if (item && (item.x !== drawn.x || item.y !== drawn.y)) {
      warn?.(`perspective ${named.name} is not the drawn one; the drawn position wins`);
    }
    return { x: drawn.x, y: drawn.y, scale: drawn.scale };
  }
  const { x, y, scale } = found.placement;
  return item ? { x: item.x, y: item.y, scale } : { x, y, scale };
}

/**
 * Screen point of a point in a container's pixels (stage #841, decision 5; pure part, no CDP).
 * `mapping` is the `mapping.json` already read; `container` is the name (case-insensitive) or the
 * id; `viewport` is the `data-viewport` of the `.canvas-host` (`"x y scale"`, CSS px relative to
 * the host's corner); `host` is the host's corner on the page (`boundingBox()`); `perspective`,
 * optional, is the name of a perspective whose item for the container (root) swaps its `x`, `y`
 * position on the canvas; `boxes` (optional, stage #1076) is the text of `data-container-boxes`:
 * the drawn position, which wins over the disk's and the perspective's (with `warn`, warns about
 * the perspective that differs from it); `marking` (optional): `container` is the name or id of a
 * marking and (x, y) are offsets from its corner.
 * The formula is that of the recipe "Where a marking is on screen": canvas = placement + point ×
 * container scale; screen = host + canvas × view scale + (x, y) of the view.
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
    // (x, y) are offsets from the top-left corner of the marking, in the pixels of its
    // container (on the canvas, with the identity placement, if `containerId` is null).
    const marks = byName(mapping.markings);
    if (marks.length === 0) throw new Error(`marking not found: ${container}`);
    if (marks.length > 1) throw new Error(`more than one marking is named ${container}`);
    const mark = marks[0];
    origin = { x: mark.rect.x, y: mark.rect.y };
    found = mark.containerId
      ? (mapping.containers ?? []).find((c) => c.id === mark.containerId)
      : { id: null, placement: { x: 0, y: 0, scale: 1 } };
    if (!found) throw new Error(`marking's container not found: ${container}`);
  } else {
    const matches = byName(mapping.containers);
    if (matches.length === 0) throw new Error(`container not found: ${container}`);
    if (matches.length > 1)
      throw new Error(`more than one container is named ${container}`);
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
    throw new Error(`invalid data-viewport: ${viewport}`);
  }
  const canvasX = px + (origin.x + x) * scale;
  const canvasY = py + (origin.y + y) * scale;
  return {
    x: Math.round((host.x + canvasX * vs + vx) * 100) / 100,
    y: Math.round((host.y + canvasY * vs + vy) * 100) / 100,
  };
}

/** Waits two frames, so the `data-*` read afterwards are those of the drawn frame. */
function nextFrames(page) {
  return page.evaluate(
    () =>
      new Promise((ok) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(ok)),
      ),
  );
}

/** Runs on the page: does the point fall on the `.canvas-host`? Returns `{ ok, element }` (see `onCanvas`). */
function onCanvasInPage({ x, y }) {
  const target = document.elementFromPoint(x, y);
  if (!target) return { ok: false, element: 'nothing' };
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
 * Does the screen point fall on the canvas (stage #1076, decision 7)? `ok` is true when the
 * element at the point (`elementFromPoint`) is inside the `.canvas-host`; the minimap, a window or
 * the bar on top give false. `element` describes what is there: the tag, the first class and the
 * accessible name of the closest ancestor that has one (`div.dock "Windows"`). It is the single
 * check of `ponto`, `drag` and `paletteDrag`.
 */
export async function onCanvas(page, point) {
  return page.evaluate(onCanvasInPage, { x: point.x, y: point.y });
}

/**
 * Reads the `data-viewport`, the `data-container-boxes` and the corner of the `.canvas-host` through
 * the page (CDP) and converts (see above). The position that counts is the drawn one; with a
 * `perspective` different from it, warns (`warn`, default stderr) and uses the drawn one. A point
 * that does not fall on the canvas (`onCanvas`) also warns, and the point is returned all the same.
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
    throw new Error(
      'the .canvas-host has no data-viewport (did the app open the project?)',
    );
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
      `the point (${at.x}, ${at.y}) does not fall on the canvas (${on.element}); the .canvas-host occupies ${box.x}, ${box.y}, ${box.width} × ${box.height}`,
    );
  }
  return at;
}

/**
 * The center of the view (stage #1076, decision 9): `x` and `y` are the screen point (viewport px,
 * what `page.mouse` accepts) of the center of the `.canvas-host`; `canvas` is the same point in
 * canvas units, `((width / 2 − vx) / scale, (height / 2 − vy) / scale)`, with the `data-viewport`.
 */
export async function viewCenter(page) {
  const host = page.locator('.canvas-host');
  await nextFrames(page);
  const viewport = await host.getAttribute('data-viewport');
  const box = await host.boundingBox();
  if (!viewport || !box)
    throw new Error(
      'the .canvas-host has no data-viewport (did the app open the project?)',
    );
  const [vx, vy, vs] = viewport.trim().split(/\s+/).map(Number);
  if (![vx, vy, vs].every(Number.isFinite) || vs <= 0) {
    throw new Error(`invalid data-viewport: ${viewport}`);
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
 * Reads the `data-arrow-handles` (stage #1076, decision 10; pure part): entries `"<name> <x> <y>"`
 * separated by `;`, in CSS px relative to the host's corner. Returns the object from the name
 * (`center`, `from`, `to`, `point0`, `mid0`, `segment0` …) to the screen point (the `host` corner added).
 */
export function parseArrowHandles(text, host) {
  const handles = {};
  for (const entry of String(text ?? '').split(';')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [name, x, y, ...extra] = trimmed.split(/\s+/);
    if (extra.length > 0 || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
      throw new Error(`invalid data-arrow-handles: "${trimmed}"`);
    }
    handles[name] = {
      x: Math.round((host.x + Number(x)) * 100) / 100,
      y: Math.round((host.y + Number(y)) * 100) / 100,
    };
  }
  return handles;
}

/**
 * The screen points of the middle (`center`) and of the handles of the selected arrow (stage #1076,
 * decision 10), or `null` without a selected and drawn arrow. Re-read after opening or closing a
 * window (the host changes size) and after pan and zoom.
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

/** Timeout of the `settle` that `state()` does before reading (below the 3 s of `runStep`'s state). */
const STATE_SETTLE_MS = 2000;

/**
 * Runs on the page (stage #1148, decision 7): waits for the status bar without "Saving…", two
 * frames and the DOM without mutation for 200 ms. Returns `null` when all is met, or the text of
 * the condition that was missing when `timeoutMs` runs out. Uses nothing outside its own body
 * (Playwright serializes it).
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
        if (isSaving()) return finish('the status bar stayed on "Saving…"');
        if (!quiet) return finish('the DOM kept changing (no 200 ms of silence)');
        return finish('the two frames did not complete');
      }
      globalThis.requestAnimationFrame(tick);
    };
    globalThis.requestAnimationFrame(tick);
  });
}

/**
 * Waits for the app to settle (stage #1148, decision 7): without "Saving…", two frames and 200 ms
 * without DOM mutation. Running out of time is not an error: returns and writes (`warn`) the
 * warning with the missing condition. Returns `null` when it settled. Use instead of `waitForTimeout`.
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
  const message = `Warning: settle timed out after ${timeoutMs} ms: ${unmet}`;
  warn(message);
  return message;
}

/** Ids of the tool windows (`src/store/toolWindows.ts`), those of `[data-strip-window]`. */
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
    throw new Error(`unknown window: ${id}. Ids: ${TOOL_WINDOW_IDS.join(', ')}`);
  }
  const button = page.locator(`[data-strip-window="${id}"]`);
  const pressed = (await button.getAttribute('aria-pressed')) === 'true';
  if (pressed !== wanted) await button.click();
  await page
    .locator(`[data-window="${id}"]`)
    .waitFor({ state: wanted ? 'visible' : 'hidden' });
}

/** Opens the tool window `id` only if it is closed (idempotent; never toggles). */
export async function openWindow(page, id) {
  await setWindowOpen(page, id, true);
}

/** Closes the tool window `id` only if it is open (idempotent; never toggles). */
export async function closeWindow(page, id) {
  await setWindowOpen(page, id, false);
}

/** Hit radius of the container's handle in the app (`HANDLE_HIT_RADIUS`, `src/canvas/input/intents.ts`). */
const HANDLE_MAX_RADIUS = 22;
const HANDLE_MIN_RADIUS = 12;

/**
 * Radius (screen px) of a box's handle: `handleHitRadius` of `src/canvas/markingGeometry.ts` for a
 * marking; the container always uses the fixed one (`HANDLE_HIT_RADIUS` in `intents.ts`).
 */
function handleRadius(box, container = false) {
  if (container) return HANDLE_MAX_RADIUS;
  const side = Math.min(box.width, box.height) / 3;
  return Math.min(HANDLE_MAX_RADIUS, Math.max(HANDLE_MIN_RADIUS, side));
}

/**
 * Name of the corner (`nw`, `ne`, `sw`, `se`) of the box (`{ x, y, width, height }` in screen px)
 * that the app would grab at `point`, or `null` (stage #1256, decision 10). Same as the app: only
 * the four corners (`CORNERS`), chessboard distance (`cornerAt`) and radius
 * `clamp(min(width, height) / 3, 12, 22)`. A point outside the box also counts (the container's
 * label sits above the border). Pure.
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
 * Drags from `de` to `to` (screen points `{ x, y }`, for example from `ponto`; stage #1148,
 * decision 9): clicks on `de` to select (with `select`), waits for `settle`, `mouse.down`, one
 * frame, `mouse.move` in `steps` steps and `mouse.up`. If `de` falls within the radius of a handle
 * of the `data-selection-box` (the app's, `nearHandle`), warns (`warn`) that the drag may resize,
 * and carries on.
 * Stage #1076 (decision 8): a `de` that does not fall on the canvas (`onCanvas`) throws before any
 * mouse action, except with `allowOffCanvas: true` (`to` is not checked: the drag may leave the
 * canvas on purpose); the selection click that leaves `data-selection` empty warns that nothing
 * was selected.
 */
export async function drag(
  page,
  de,
  to,
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
        `drag: the starting point (${de.x}, ${de.y}) does not fall on the canvas (${on.element})`,
      );
    }
  }
  if (select) {
    await page.mouse.click(de.x, de.y);
    await settle(page);
    if (!(await page.locator('.canvas-host').getAttribute('data-selection'))) {
      warn(`the click at (${de.x}, ${de.y}) selected nothing`);
    }
  }
  const host = page.locator('.canvas-host');
  const text = await host.getAttribute('data-selection-box');
  const hostBox = text ? await host.boundingBox() : null;
  if (text && hostBox) {
    const [l, t, w, h] = text.split(' ').map(Number);
    // The box does not say whether it is a container or a marking: the larger radius (the
    // container's) applies, which contains the marking's; warning too much is harmless, warning
    // too little lets the drag resize.
    const handle = nearHandle(
      { x: hostBox.x + l, y: hostBox.y + t, width: w, height: h },
      de,
      { container: true },
    );
    if (handle) {
      warn(
        `near handle ${handle}: the drag may resize (the handle grabs up to ${Math.round(handleRadius({ width: w, height: h }, true))} px from the corner; start farther away)`,
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
      de.x + ((to.x - de.x) * i) / steps,
      de.y + ((to.y - de.y) * i) / steps,
    );
  }
  await page.mouse.up();
}

/** Runs on the page: the groups (`aria-label` of the `section.library-group`) that have an item with the type's exact name. */
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
 * Fires the Palette drag through events (runs on the page): `dragstart`, `dragover`, `drop`,
 * `dragend`. Returns `{ ok: true }` or `{ motivo }`: "the item '<type>' disappeared from the
 * Palette" or "the point (x, y) does not fall on the canvas (<element>)" (no element at the point;
 * the check of being inside the `.canvas-host` is `onCanvas`'s, done by `paletteDrag` beforehand).
 */
function syntheticPaletteDrag({ tipo, to, grupo }) {
  const groups = grupo
    ? [...document.querySelectorAll('section.library-group')].filter(
        (g) => g.getAttribute('aria-label') === grupo,
      )
    : [document];
  const item = groups
    .flatMap((root) => [...root.querySelectorAll('li.library-type')])
    .find((li) => li.querySelector('.library-type-name')?.textContent?.trim() === tipo);
  if (!item) return { motivo: `the item '${tipo}' disappeared from the Palette` };
  const target = document.elementFromPoint(to.x, to.y);
  if (!target)
    return {
      motivo: `the point (${to.x}, ${to.y}) does not fall on the canvas (nothing)`,
    };
  const data = new DataTransfer();
  const fire = (el, type) =>
    el.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
        clientX: to.x,
        clientY: to.y,
      }),
    );
  fire(item, 'dragstart');
  fire(target, 'dragover');
  fire(target, 'drop');
  fire(item, 'dragend');
  return { ok: true };
}

/** How long `paletteDrag` waits for the autosave to write the new marking before giving the drag up as failed. */
const PALETTE_WAIT_MS = 2000;

/** Waits (up to `waitMs`) for `mapping.json` to exceed `before` markings: the autosave writes after the `settle`. */
async function markingsGrewTo(projectDir, before, waitMs) {
  const start = Date.now();
  for (;;) {
    if ((await countMarkings(projectDir)) > before) return true;
    if (Date.now() - start >= waitMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Number of markings in the folder's `mapping.json` (`paletteDrag`'s measure); throws if it cannot be read. */
async function countMarkings(projectDir) {
  const read = await readMapping(projectDir);
  if (read.error) {
    throw new Error(`paletteDrag: could not read mapping.json (${read.error})`);
  }
  return Array.isArray(read.json.markings) ? read.json.markings.length : 0;
}

/**
 * Drags a type from the open Palette to a screen point (stage #1256, decision 7; #1533, decisions
 * 9 and 10). Finds the item by the `.library-type-name` with the exact text (two groups with the
 * same type: throws with the list of groups; `{ grupo }`, the `aria-label` of the
 * `section.library-group`, chooses), does the native drag through Playwright's mouse (`move` on
 * the item, `down`, `move` in `steps` steps to `to`, `up`) and checks that the project folder's
 * `mapping.json` gained a marking. Without a new marking, redoes it through events (`dragstart` on
 * the item; `dragover`, `drop` and `dragend` under the point, which must be on the `.canvas-host`);
 * if the native one created it, the synthetic one does not run. With none, throws "the Palette
 * drag did not create the instance"; a synthetic one that could not run throws the reason.
 * `projectDir` is required (in the `run` body, the `run` folder applies): without it throws
 * "paletteDrag needs the project folder".
 * `capture` (PNG path) writes the canvas crop before dropping, with the target lit.
 * `waitMs` (default 2000) is how long it waits for the autosave to write the new marking before
 * giving the drag up as failed. Returns `{ via: 'nativo' | 'sintetico' }`.
 */
export async function paletteDrag(
  page,
  tipo,
  to,
  { capture, steps = 10, grupo, projectDir, waitMs = PALETTE_WAIT_MS } = {},
) {
  if (!projectDir) throw new Error('paletteDrag needs the project folder');
  const groups = await page.evaluate(paletteGroupsOf, { tipo });
  if (groups.length === 0) {
    throw new Error(`paletteDrag: the type '${tipo}' is not in the open Palette`);
  }
  const list = groups.map((g) => `'${g}'`).join(', ');
  if (grupo !== undefined && !groups.includes(grupo)) {
    throw new Error(
      `paletteDrag: the group '${grupo}' does not have the type '${tipo}'; groups that do: ${list}`,
    );
  }
  if (grupo === undefined && groups.length > 1) {
    throw new Error(
      `paletteDrag: the type '${tipo}' is in more than one group (${list}); pass { grupo }`,
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
  if (!box) throw new Error(`paletteDrag: the type '${tipo}' is not in the open Palette`);
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
  }
  if (capture) await host.screenshot({ path: capture });
  await page.mouse.up();
  await settle(page);
  if (await markingsGrewTo(projectDir, before, waitMs)) return { via: 'nativo' };
  const on = await onCanvas(page, to);
  if (!on.ok) {
    throw new Error(
      `paletteDrag: the point (${to.x}, ${to.y}) does not fall on the canvas (${on.element})`,
    );
  }
  const synthetic = await page.evaluate(syntheticPaletteDrag, {
    tipo,
    to,
    grupo: chosen,
  });
  if (synthetic?.motivo) throw new Error(`paletteDrag: ${synthetic.motivo}`);
  await settle(page);
  if (await markingsGrewTo(projectDir, before, waitMs)) return { via: 'sintetico' };
  throw new Error('the Palette drag did not create the instance');
}

/**
 * Sets the Chrome window to the requested `innerWidth × innerHeight` (stage #1148, decision 10):
 * CDP `Browser.getWindowForTarget` + `Browser.setWindowBounds` adding the measured frame
 * (`outerWidth − innerWidth`, `outerHeight − innerHeight`). Throws with the obtained values if the
 * window did not give what was requested.
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
      `setViewport: requested ${largura}×${altura}, the window gave ${got.innerWidth}×${got.innerHeight}`,
    );
  }
}

/** Runs on the page: up to 10 elements whose accessible name contains `needle` (role, name, region). */
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
 * The candidates the locator should have found (stage #1148, decision 11): up to 10 visible
 * elements whose accessible name contains `texto` (case-insensitive), each with role, name and
 * region (the `aria-label` of the closest dialog, window or landmark).
 */
export async function find(page, texto) {
  return page.evaluate(findInPage, { needle: String(texto).toLowerCase() });
}

/** Text of the `find` list, one line per candidate (`role "name" in region`). */
export function formatCandidates(candidates, texto) {
  if (!candidates || candidates.length === 0) {
    return `no candidate with "${texto}" in the name on screen`;
  }
  const lines = candidates.map(
    (c) => `  ${c.role} "${c.name}"${c.region ? ` in ${c.region}` : ''}`,
  );
  return [`candidates with "${texto}" (${candidates.length}):`, ...lines].join('\n');
}

/**
 * The text the Playwright locator was looking for, taken from the message of a timeout or a
 * strict mode violation (`getByRole('button', { name: 'Review' })`, `getByText('Threads')`);
 * `null` if the message is not of that kind or carries no text. Pure.
 */
export function locatorTextFromError(message) {
  const text = String(message);
  if (!/Timeout \d+ms exceeded|strict mode violation/.test(text)) return null;
  const match =
    /name:\s*(['"])(.+?)\1/.exec(text) ?? /getBy\w+\(\s*(['"])(.+?)\1/.exec(text);
  return match ? match[2] : null;
}

/**
 * The support folder when `APOIO` is not exported (stage #841, decision 3): the `apoio/` of the
 * most recent round in `~/mapping-testes/<YYYY-MM-DD>-<target>/apoio`, the same path that
 * `cloud-up.sh` builds. `null` if there is none.
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

/** Default timeout (s) of `cloud.mjs run`: below Bash's default 120 s (stage #1148, decision 2). */
const RUN_DEADLINE_SECONDS = 90;

/** The body's `console`: sends to `io` (on the server, the output goes back to the client instead of the log). */
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
 * `await check(rotulo, condicao, detalhe?)` of the `run` body (stage #1533, decision 7; stage
 * #2450, decision 8). `condicao` is a boolean, a promise or a function (sync or async) that
 * returns truthy or throws. Always write `await check(...)`: the return is a thenable that records
 * whether its `then` was called, and an async condition (a promise, an async function or a
 * function that returns a promise) that was never awaited is turned into a failure by `execStep`
 * (`not awaited`). A sync condition works without `await`.
 * Does not interrupt the body: the result stays in `results` and `execStep` waits for the pending ones.
 */
function makeCheck(results, pending, tracked = []) {
  return (rotulo, condicao, detalhe) => {
    const entry = { async: false, awaited: false, result: null };
    const record = (result) => {
      entry.result = result;
      results.push(result);
    };
    const task = (async () => {
      try {
        const raw = typeof condicao === 'function' ? condicao() : condicao;
        entry.async = typeof raw?.then === 'function';
        const value = await raw;
        if (value) {
          record({ rotulo, ok: true, detalhe });
        } else {
          record({ rotulo, ok: false, mensagem: detalhe ?? 'condition false' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        record({
          rotulo,
          ok: false,
          mensagem: detalhe ? `${message} (${detalhe})` : message,
        });
      }
    })();
    pending.push(task);
    tracked.push(entry);
    return {
      then(onFulfilled, onRejected) {
        entry.awaited = true;
        return task.then(onFulfilled, onRejected);
      },
    };
  };
}

/** Turns each async check that was never awaited into the `not awaited` failure. */
function failUnawaited(tracked) {
  for (const entry of tracked) {
    if (entry.async && !entry.awaited && entry.result) {
      entry.result.ok = false;
      entry.result.mensagem = 'not awaited: write await check(...)';
      delete entry.result.detalhe;
    }
  }
}

/** One line per check: `✅ <label>` or `❌ <label> — <message>`. */
function formatChecks(results) {
  return results.map((r) =>
    r.ok
      ? `✅ ${r.rotulo}${typeof r.detalhe === 'string' ? ` — ${r.detalhe}` : ''}`
      : `❌ ${r.rotulo} — ${r.mensagem}`,
  );
}

/**
 * The executor of a body (stage #1148, decision 1; #1533, decisions 6 and 7): runs `body` as the
 * body of an async function with `page`, `browser`, `apoioDir`, `projectDir`, `ctx`, `check`,
 * `console` (which goes to `io`) and all the exports of this module in scope; at the end prints
 * the line of each `check` and `formatState(...)`. Returns `{ code, checks }`: 0 success, 1 error
 * in the body or failed check, 124 timeout. `connection` (`{ browser, page }`) reuses a
 * connection (the server); without it connects with `connectFn`.
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
  const tracked = [];
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
      // Connection not responding: the state is not printed.
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
      // In the body, the `run` folder applies when the call does not pass `{ projectDir }`.
      paletteDrag: (p, tipo, to, options = {}) =>
        paletteDrag(p, tipo, to, {
          projectDir: projectDir ?? lastFolder(apoioDir),
          ...options,
        }),
      ctx,
      check: makeCheck(checks, pending, tracked),
      console: bodyConsole(io),
    };
    const fn = new AsyncFunction(...Object.keys(scope), body);
    const outcome = await Promise.race([
      fn(...Object.values(scope)).then(() => Promise.all(pending).then(() => 'ok')),
      deadline,
    ]);
    if (outcome === 'prazo') {
      io.error(`deadline of ${prazoSeconds} s exceeded in the step`);
      code = 124;
    } else {
      failUnawaited(tracked);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.error(message);
    const wanted = locatorTextFromError(message);
    if (wanted) {
      try {
        io.error(formatCandidates(await find(page, wanted), wanted));
      } catch {
        // Page not responding: the candidate list is not printed.
      }
    }
    code = 1;
  } finally {
    clearTimeout(timer);
  }
  // Checks still pending (the body threw or hit the deadline) have up to 2 s to enter the summary.
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
 * Runs the body of a step script, without a server (connects, runs, prints the `check` and
 * `state()`), and returns the exit code (0 success, 1 error or failed check, 124 timeout); the
 * caller does the `process.exit`. It is the fallback path of `cloud.mjs run` and the executor the
 * server uses; `ctx` starts empty.
 */
export async function runStep(body, options = {}) {
  return (await execStep(body, options)).code;
}

// ---------------------------------------------------------------------------------------------
// Persistent `run` server (stage #1533, decisions 6 to 8)
// ---------------------------------------------------------------------------------------------

const SOCKET_NAME = 'cloud.sock';
const PID_NAME = 'cloud.pid';
const SERVER_START_WAIT_MS = 15000;
/** Client slack over the `run` timeout: the server answers 124 first; past the slack, it hung. */
const CLIENT_GRACE_MS = 5000;

/** Next `run` number (continues after a new server): highest `<n>.js` in `apoio/runs/` + 1. */
function nextRunNumber(apoioDir) {
  let max = 0;
  try {
    for (const name of fs.readdirSync(path.join(apoioDir, 'runs'))) {
      const n = Number(name.match(/^(\d+)\.js$/)?.[1]);
      if (n > max) max = n;
    }
  } catch {
    // Without the folder: it is the first.
  }
  return max + 1;
}

/**
 * Records a `run`: `apoio/runs/<n>.js` (the body), `<n>.out` (the output) and a line in `apoio/runs.log`
 * (`<time> run=<n> codigo=<c> checks=<k> falhas=<f>`). It is the Reproduction of a ❌ (decision 8).
 */
function recordRun(apoioDir, { body, code, lines, checks }) {
  try {
    const n = nextRunNumber(apoioDir);
    const dir = path.join(apoioDir, 'runs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${n}.js`), body);
    fs.writeFileSync(
      path.join(dir, `${n}.out`),
      `${lines.map((l) => l.text).join('\n')}\n[code ${code}]\n`,
    );
    const falhas = checks.filter((c) => !c.ok).length;
    fs.appendFileSync(
      path.join(apoioDir, 'runs.log'),
      `${new Date().toISOString()} run=${n} codigo=${code} checks=${checks.length} falhas=${falhas}\n`,
    );
  } catch {
    // The recording does not bring the step down.
  }
}

/** Is a connection still usable? (A fake `connectFn` may lack `isConnected`/`isClosed`.) */
function connectionAlive({ browser, page }) {
  return browser.isConnected?.() !== false && page.isClosed?.() !== true;
}

/** Runs a body and returns `{ code, lines, checks }`, with the output captured in order (`s`: 'out' or 'err'). */
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
 * Starts the `run` server (decision 6): listens on the Unix socket `apoio/cloud.sock`, keeps the
 * CDP connection and the `ctx` between `run`s and serves one `run` at a time. Timeout (124):
 * answers, stops the server and calls `onExit` (the `serve` process exits). Dropped connection:
 * reconnects on the next `run`, with the warning and an empty `ctx`. Returns `{ close }`.
 */
export async function startRunServer({
  apoioDir,
  connectFn = connect,
  onExit = () => process.exit(0),
}) {
  const sock = path.join(apoioDir, SOCKET_NAME);
  fs.mkdirSync(apoioDir, { recursive: true });
  if (fs.existsSync(sock) && (await serverAnswers(sock))) {
    throw new Error('a run server already exists in this support folder');
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
    // The `run`s already waiting in the queue get the error before the sockets drop.
    await queue.catch(() => {});
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(sock, { force: true });
    fs.rmSync(path.join(apoioDir, PID_NAME), { force: true });
    try {
      await connection?.browser.close();
    } catch {
      // Already dropped.
    }
  };

  const handle = async (request) => {
    const warnings = [];
    if (connection && !connectionAlive(connection)) {
      warnings.push(
        'warning: the connection to Chrome dropped; I reconnected and the ctx is empty',
      );
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
    // Relative paths in the body apply from the folder the `run` was called from.
    if (request.cwd) {
      try {
        process.chdir(request.cwd);
      } catch {
        // The folder is gone: stay where we are.
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
          const text = 'the run server exited (timeout in the previous run); run again';
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

/** Sends a request to the socket and returns the response; `null` if nobody answers. */
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
    // `null`: nobody answers (nothing was sent); `{ lost }`: the server accepted and dropped without answering.
    socket.on('error', () => finish(connected ? { lost: true } : null));
    socket.on('close', () => finish(connected ? { lost: true } : null));
  });
}

/** Does the socket answer a connection? (a live server; the file alone may belong to a dead server) */
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

/** Stops the server through `apoio/cloud.pid` (hung or from another round); silent if it does not exist. */
function killServer(apoioDir) {
  try {
    const pid = Number(fs.readFileSync(path.join(apoioDir, PID_NAME), 'utf8'));
    // Only kills if the pid still belongs to a `cloud.mjs` (the number may have been reused).
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    if (pid > 0 && cmdline.includes('cloud.mjs')) process.kill(pid, 'SIGTERM');
  } catch {
    // No server.
  }
  fs.rmSync(path.join(apoioDir, SOCKET_NAME), { force: true });
  fs.rmSync(path.join(apoioDir, PID_NAME), { force: true });
}

/** Starts `cloud.mjs serve` detached from the terminal (`setsid`, stdin from /dev/null, log in `apoio/cloud-serve.log`). */
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
 * The `cloud.mjs run` (decision 6): sends the body to the persistent server (starts one if there
 * is none) and prints the response to `io`; returns the code (0, 1 or 124). `novo` restarts the
 * server. If the server does not start within `socketWaitMs`, falls back to today's path
 * (`runStep`) and warns. `spawnServer` and `connectFn` are injectable for tests.
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
    // Old socket (dead server) or no server: start another.
    fs.rmSync(sock, { force: true });
    try {
      await spawnServer(apoioDir);
    } catch {
      // Falls back to the path below.
    }
    const start = Date.now();
    while (!fs.existsSync(sock) && Date.now() - start < socketWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    response = fs.existsSync(sock) ? await sendToServer(sock, request, timeoutMs) : null;
  }
  if (response === null) {
    io.error(
      'warning: the run server did not start; running on the direct path (no ctx between runs)',
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
      'the run server dropped during this run; the body may have run up to a point: check the state before repeating',
    );
    return 1;
  }
  if (response.timeout) {
    killServer(apoioDir);
    io.error(`deadline of ${prazoSeconds} s exceeded in the step`);
    return 124;
  }
  return print(response);
}

/** `cloud.mjs serve`: the process the first `run` starts; exits on timeout, on `--novo` or on SIGTERM. */
async function runServe(apoioDir) {
  // A loose promise from the body does not bring the server down (and the connection and ctx with it).
  process.on('unhandledRejection', (error) => {
    console.error(`unhandled rejection in the body: ${error?.message ?? error}`);
  });
  let server;
  try {
    server = await startRunServer({ apoioDir });
  } catch (error) {
    // Another `run` started the server first: this one exits and both clients use the same one.
    console.error(error.message);
    return;
  }
  const { close } = server;
  const stop = () => close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

/** The function and value exports of this module (except `runStep` itself), for the body's scope. */
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
 * Single table (stage #1148, decision 3): each CLI command and each export of this module, with
 * the signature and a one-line description. `cloud.mjs help` prints from here; a test checks that
 * every export is in the table and that `cloud.d.mts` declares the same names.
 */
export const HELP = {
  connect: {
    sig: 'connect(apoioDir, cdpUrl?, options?)',
    desc: 'connects to Chrome over CDP, finds the app tab, 5 s timeout',
  },
  connectGuide: {
    sig: 'connectGuide(apoioDir, cdpUrl?, options?)',
    desc: 'like connect, but on the guide tab (/guide/)',
  },
  clickNoWait: {
    sig: 'clickNoWait(page, nome, { scope?, exact? })',
    desc: 'click by role and name without waiting afterwards (opens a native dialog)',
  },
  OPEN_DIALOG_TITLES: {
    sig: 'OPEN_DIALOG_TITLES',
    desc: 'titles of the GTK file/folder pickers',
  },
  pickAutocompletePopup: {
    sig: 'pickAutocompletePopup(windows, geometryOf, dialogWindowId)',
    desc: 'finds the GTK autocomplete list',
  },
  openButtonPoints: {
    sig: 'openButtonPoints(geometry)',
    desc: "candidate points of the picker's Open button",
  },
  pickAppPage: {
    sig: 'pickAppPage(pages, { origin? })',
    desc: 'picks the app tab among the open ones',
  },
  parseEnvFile: {
    sig: 'parseEnvFile(texto)',
    desc: 'reads the format of apoio/env.sh (export A=1 B=2)',
  },
  loadEnv: {
    sig: 'loadEnv(apoioDir, env?)',
    desc: 'loads DISPLAY and D-Bus from apoio/env.sh',
  },
  diffJson: {
    sig: 'diffJson(antes, depois, { limit? })',
    desc: 'difference lines between two JSON values',
  },
  formatState: {
    sig: 'formatState(estado)',
    desc: 'state text (screen, disk and the Selection: line, what the click selected)',
  },
  state: {
    sig: 'state(page, apoioDir, { projectDir? })',
    desc: 'state of the screen (title, dialogs, notices, focus, windows) and of the disk; without projectDir reads the last folder used (null: does not read disk)',
  },
  waitForWindow: {
    sig: 'waitForWindow(nomes, { timeoutMs? })',
    desc: 'waits for a native dialog by title',
  },
  selectFolder: {
    sig: 'selectFolder(apoioDir, caminho, { timeoutMs? })',
    desc: 'chooses a folder in the native picker; absolute path (relative: cancels and throws)',
  },
  openFile: {
    sig: 'openFile(apoioDir, caminho, { timeoutMs? })',
    desc: 'opens a file in the native picker; absolute path (relative: cancels and throws)',
  },
  saveFile: {
    sig: 'saveFile(apoioDir, caminho, { timeoutMs? })',
    desc: 'saves in a native "Save as"; absolute path (relative: cancels and throws)',
  },
  cancelDialog: {
    sig: 'cancelDialog(apoioDir, { timeoutMs? })',
    desc: 'cancels the open native dialog',
  },
  allowPermission: {
    sig: 'allowPermission(apoioDir)',
    desc: "accepts Chrome's permission prompt",
  },
  screenshot: {
    sig: 'screenshot(apoioDir, nome)',
    desc: 'screenshot into apoio/anexos',
  },
  windowShortcut: {
    sig: 'windowShortcut(page, n)',
    desc: 'Ctrl+Shift+N shortcut of the tool window (TOGGLES: prefer openWindow/closeWindow)',
  },
  settle: {
    sig: 'settle(page, { timeoutMs? = 5000, warn? })',
    desc: 'waits for no "Saving…", 2 frames and 200 ms without mutation; a timeout becomes a warning (use instead of waitForTimeout)',
  },
  openWindow: {
    sig: 'openWindow(page, id)',
    desc: 'opens the tool window only if closed (idempotent); id: tree, layers, details, list, incomplete, diagnostics, proposals, notices, comments, catalog',
  },
  closeWindow: {
    sig: 'closeWindow(page, id)',
    desc: 'closes the tool window only if open (idempotent)',
  },
  TOOL_WINDOW_IDS: {
    sig: 'TOOL_WINDOW_IDS',
    desc: 'the tool window ids accepted by openWindow and closeWindow',
  },
  drag: {
    sig: 'drag(page, de, to, { select? = true, steps? = 10, warn?, allowOffCanvas? })',
    desc: 'drags between two screen points ({x, y}); throws if de does not fall on the canvas (allowOffCanvas carries on); warns if de falls within the radius of a handle (corner) of the selection and if the click selected nothing',
  },
  nearHandle: {
    sig: 'nearHandle(box, ponto)',
    desc: 'corner (nw, ne, sw, se) the app would grab at the point (radius 12 to 22 px, chessboard), or null',
  },
  paletteDrag: {
    sig: 'paletteDrag(page, tipo, to, { capture?, steps? = 10, grupo?, projectDir?, waitMs? })',
    desc: 'drags a type from the open Palette to a screen point and checks the new marking in mapping.json (projectDir; in run the run folder applies); grupo chooses between two groups with the same type; capture = PNG before dropping; returns { via: nativo | sintetico }',
  },
  setViewport: {
    sig: 'setViewport(page, largura, altura)',
    desc: 'sets the Chrome window to the requested innerWidth × innerHeight (adds the frame; checks)',
  },
  find: {
    sig: 'find(page, texto)',
    desc: 'up to 10 visible elements whose name contains the text (role, name, region)',
  },
  formatCandidates: {
    sig: 'formatCandidates(candidatos, texto)',
    desc: 'text of the find list, one line per candidate',
  },
  locatorTextFromError: {
    sig: 'locatorTextFromError(mensagem)',
    desc: 'the locator text in a timeout or strict mode error, or null',
  },
  makeCadastroPng: {
    sig: 'makeCadastroPng(destino)',
    desc: 'generates the "sign-up" test image (cadastro.png)',
  },
  mark: {
    sig: 'mark(apoioDir, roteiro, "start"|"end")',
    desc: 'marks the start or end of a test script in tempos.log',
  },
  temposFromLog: {
    sig: 'temposFromLog(texto, textoDoRunsLog?)',
    desc: 'durations per script from the text of tempos.log; with runs.log, the total of runs and checks per script',
  },
  temposFromDir: {
    sig: 'temposFromDir(apoioDir)',
    desc: 'durations per script from the support folder',
  },
  defaultApoioDir: {
    sig: 'defaultApoioDir(home?)',
    desc: 'apoio/ of the most recent round in ~/mapping-testes',
  },
  formatTempos: { sig: 'formatTempos(tempos)', desc: 'text of the Time per script' },
  containerScreenPoint: {
    sig: 'containerScreenPoint({ mapping, container, x, y, viewport, host, ... })',
    desc: 'screen point of a point in container pixels (pure part)',
  },
  ponto: {
    sig: 'ponto(page, projectDir, container, x, y, { perspective?, marking?, warn? })',
    desc: 'screen point of a container point by the drawn position (data-container-boxes); warns about the perspective that differs from it and about a point that falls outside the canvas',
  },
  parseContainerBoxes: {
    sig: 'parseContainerBoxes(texto)',
    desc: 'Map from id to { x, y, width, height, scale } from data-container-boxes (pure part)',
  },
  onCanvas: {
    sig: 'onCanvas(page, { x, y })',
    desc: 'does the screen point fall on the canvas? returns { ok, element } (what is at the point)',
  },
  viewCenter: {
    sig: 'viewCenter(page)',
    desc: 'center of the view: { x, y } on screen and canvas: { x, y } in canvas units',
  },
  arrowHandlesOf: {
    sig: 'arrowHandlesOf(page)',
    desc: 'screen points of the middle (center) and of the handles of the selected arrow, or null',
  },
  parseArrowHandles: {
    sig: 'parseArrowHandles(texto, host)',
    desc: 'object name → screen point from data-arrow-handles (pure part)',
  },
  runStep: {
    sig: 'runStep(corpo, { apoioDir, projectDir?, prazoSeconds?, connectFn?, ctx?, io? })',
    desc: 'runs the body of a step script without a server (the fallback path of run); in the body ctx, await check(rotulo, condicao, detalhe?) and console are also available',
  },
  startRunServer: {
    sig: 'startRunServer({ apoioDir, connectFn?, onExit? })',
    desc: 'starts the persistent run server on the apoio/cloud.sock socket (what the serve command uses)',
  },
  runViaServer: {
    sig: 'runViaServer(corpo, { apoioDir, projectDir?, prazoSeconds?, novo?, socketWaitMs?, spawnServer?, connectFn?, io? })',
    desc: 'sends the body to the persistent server (starts one if missing) and returns code 0, 1 or 124; without a server falls back to runStep and warns',
  },
  HELP: {
    sig: 'HELP',
    desc: 'this table: commands and exports with signature and description',
  },
  formatHelp: { sig: 'formatHelp()', desc: 'text that the help command prints' },
};

/** CLI commands, for `help`. */
const CLI_HELP = [
  ['mark <script> <start|end>', 'marks the start or end of a test script in tempos.log'],
  [
    'tempos [<apoio>]',
    'duration per script, from tempos.log, with the total of runs and checks from runs.log',
  ],
  ['state [<project-folder>]', 'connects, prints the screen and disk state and exits'],
  [
    'ponto <container> <x> <y> <project-folder> [--perspectiva=<name>] [--marcacao]',
    'screen point of a container point',
  ],
  [
    'run [<project-folder>] [--prazo=<s>] [--novo]',
    "runs the script body read from standard input (heredoc <<'JS') on a persistent server (the connection and the ctx stay between runs; apoio/cloud.sock), with page, browser, apoioDir, projectDir, ctx, await check(rotulo, condicao, detalhe?) and the exports in scope; prints one line per check (an async check without await fails as `not awaited`) and the state; exits 0, 1 (error or failed check) or 124 (90 s timeout; the server exits); --novo restarts the server; each run is kept in apoio/runs/<n>.js and .out and in apoio/runs.log",
  ],
  [
    'serve',
    'the persistent run server (apoio/cloud.sock, log in apoio/cloud-serve.log); the first run starts it by itself, cloud-up.sh --restart-chrome stops it',
  ],
  [
    'find <text>',
    'lists up to 10 visible elements whose name contains the text (role, name, region)',
  ],
  [
    'passo <item…> [--guia=<file>] [--preparo]',
    'prints from the round guide (<APOIO>/guia.md) a test script (R12), a step (R12.4) or a range (R12.1-R12.8), without opening Chrome (a range or a step also brings the labeled Setup blocks of its steps: the "The batch of R<n>.<k>" paragraphs with their code fence); with --preparo, only the part of the whole script before the first step (title, What it covers, Setup and code blocks: the functions of a script that the range does not bring); an item the round guide does not have comes from docs/TESTING.md, with the first line saying so; over 25 thousand characters, cuts and says how to continue',
  ],
  [
    'secao [<key…>] [--guia=<file>]',
    'prints an on-demand section of the round guide (1, 2, 3, 5, 6, 7, A.seletores, B) or of docs/TESTING-NUVEM-CONSULTA.md (consulta.subagente, consulta.grupos, consulta.passada, consulta.regras, consulta.historico), without opening Chrome; without a key, lists the keys with the size and when to read; cuts at 25 thousand characters',
  ],
  ['help', 'this list'],
];

/** Text of `cloud.mjs help`: the CLI commands and the signature of each export, one line each. */
export function formatHelp() {
  const lines = ['Commands (node scripts/testing/cloud.mjs <command>):'];
  for (const [usage, desc] of CLI_HELP) lines.push(`  cloud.mjs ${usage}\n      ${desc}`);
  lines.push(
    '',
    'Exports (import { ... } from cloud.mjs; all in scope in the run body):',
  );
  for (const { sig, desc } of Object.values(HELP)) lines.push(`  ${sig}\n      ${desc}`);
  return lines.join('\n');
}

/** `APOIO`, or the default folder with a warning; `null` (and the explanation on stderr) if not found. */
function resolveApoio(explicit) {
  const apoioDir = explicit ?? process.env.APOIO;
  if (apoioDir) return apoioDir;
  const found = defaultApoioDir();
  if (found) {
    console.error(`Warning: APOIO is not set; using ${found} (the most recent round).`);
    return found;
  }
  console.error(
    "APOIO (the round's apoio/ folder) is not set and there is no ~/mapping-testes/*/apoio.",
  );
  return null;
}

/** `passo <item…> [--guia=<file>] [--preparo]`: prints the excerpt of the round guide (stage #1232, GL1; `--preparo`, #1639, TC1). */
function runPasso(args) {
  const guiaArg = args.find((a) => a.startsWith('--guia='));
  const preparo = args.includes('--preparo');
  const items = args.filter((a) => !a.startsWith('--guia=') && a !== '--preparo');
  if (items.length === 0 || (guiaArg && guiaArg.length === 7)) {
    console.error(
      'Usage: node cloud.mjs passo <item…> [--guia=<file>]\n       node cloud.mjs passo <Rn…> --preparo   (only the part before the first step, of whole scripts)',
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
        ? `Could not find the round guide: ${file}. Generate it with round-guide.mjs --out.`
        : error.message,
    );
    process.exitCode = 2;
  }
}

/** The clone's `docs/TESTING.md` (next to `scripts/`), or `undefined`: `passo` falls back to it for an item outside the round guide. */
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

/** The clone's `docs/TESTING-NUVEM-CONSULTA.md` (next to `scripts/`), or `undefined` if it does not exist. */
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

/** `secao [<key…>] [--guia=<file>]`: prints on-demand sections of the round guide (stage #1533, TE1). */
function runSecao(args) {
  const guiaArg = args.find((a) => a.startsWith('--guia='));
  const chaves = args.filter((a) => !a.startsWith('--guia='));
  if (guiaArg && guiaArg.length === 7) {
    console.error('Usage: node cloud.mjs secao [<key…>] [--guia=<file>]');
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
        ? `Could not find the round guide: ${file}. Generate it with round-guide.mjs --out.`
        : error.message,
    );
    process.exitCode = 2;
  }
}

/** Runs the CLI (`mark`, `state`, `tempos`, `ponto`, `run`, `serve`, `passo`, `secao` and `help`); reads the support folder from `APOIO` (or, without it, from the most recent round). */
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
      console.error('Usage: node cloud.mjs mark <script> <start|end>');
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
        'Usage: node cloud.mjs ponto <container> <x> <y> <project-folder> [--perspectiva=<name>] [--marcacao]',
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
      if (!texto) console.error('Usage: node cloud.mjs find <text>');
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
      "Usage: node cloud.mjs run [<project-folder>] [--prazo=<s>] [--novo] <<'JS' ... JS";
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
      console.error('Usage: node cloud.mjs tempos [<apoio>]');
      process.exitCode = 2;
      return;
    }
    console.log(formatTempos(temposFromDir(apoioDir)));
    return;
  }
  console.error(
    `Unknown command: ${command}. Commands: mark, state, tempos, ponto, run, serve, find, passo, secao, help.`,
  );
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli(process.argv.slice(2));
}
