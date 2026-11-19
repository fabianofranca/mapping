#!/usr/bin/env node
// Mapping conversation watcher (Node >= 20, no dependencies).
//
// Watches `projects/*/comments/` (or `projetos/*/comments/` in an old workspace that only has that folder) and, when some OPEN conversation awaits the agent (the last
// message is from a person), either runs ONE command (the agent) with the list of them in
// `MAPPING_AWAITING`, or (`--emit`) prints ONE line `MAPPING_WAKE <json>` per batch to stdout, which a
// background-process notification (Claude Code's `Monitor`, Cursor's `notify_on_output`) turns into a wake
// of the agent in the same chat. The JSON is `[{ "project", "thread", "path" }]`; the logs stay on stderr.
// The MCP server never triggers an agent: this process, which you start, decides to wake it.
//
//   node watch-comments.mjs [--root <folder>] [--quiet <seconds>] [--state <file>] -- <command> [args…]
//   node watch-comments.mjs [--root <folder>] [--quiet <seconds>] [--state <file>] --emit
//   node watch-comments.mjs -- claude -p "<prompt>"
//   node watch-comments.mjs --emit --state .mapping-watch/state.json --quiet 1
//
// `--emit` and `-- <command>` together, or neither, are a usage error (exit 2).
// `--state <file>` keeps the handled conversation/message pairs between runs (temporary file + rename), so a
// restart does not repeat a wake; a pair that no longer awaits the agent leaves the file. A missing file
// starts empty; an invalid one starts empty with a warning and is overwritten on the next batch.
//
// Installed and updated by `setup.sh`; do not edit (the next update overwrites it).
//
// Conversation format: Mapping's `docs/COMMENT-FORMAT.md`.
import { spawn } from 'node:child_process';
import { existsSync, realpathSync, watch } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = 'watch-comments:';
const DEFAULT_QUIET_SECONDS = 5;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WAKE_PREFIX = 'MAPPING_WAKE';
const STATE_FORMAT = 'mapping-watch-state';
const USAGE =
  'usage: node watch-comments.mjs [--root <folder>] [--quiet <seconds>] [--state <file>] (--emit | -- <command> [args…])';

function log(message) {
  process.stderr.write(`${PREFIX} ${message}\n`);
}

/** Validates the minimum the watcher uses of the conversation; the rest is up to the app and the MCP server. */
function parseThread(text) {
  const thread = JSON.parse(text);
  if (thread === null || typeof thread !== 'object') throw new Error('not an object');
  if (thread.format !== 'mapping-thread') throw new Error('format is not mapping-thread');
  if (typeof thread.id !== 'string' || !Array.isArray(thread.messages)) {
    throw new Error('no id or messages');
  }
  const valid = thread.messages.every(
    (m) =>
      m !== null &&
      typeof m === 'object' &&
      typeof m.id === 'string' &&
      typeof m.at === 'string' &&
      m.author !== null &&
      typeof m.author === 'object' &&
      (m.author.kind === 'human' || m.author.kind === 'agent'),
  );
  if (!valid) throw new Error('invalid message');
  return thread;
}

/** Message order: by `at` and, on a tie, by `id`. */
function compareMessages(a, b) {
  const byTime = Date.parse(a.at) - Date.parse(b.at);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Id of the last message if the conversation awaits the agent (open and the last message is from a
 * person); `null` when it is resolved, empty or awaits a person.
 */
export function awaitingAgent(thread) {
  if (thread.resolved !== null && thread.resolved !== undefined) return null;
  const sorted = [...thread.messages].sort(compareMessages);
  const last = sorted[sorted.length - 1];
  return last !== undefined && last.author.kind === 'human' ? last.id : null;
}

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw err;
  }
}

/** Reads a conversation; an unreadable or invalid one becomes a warning on stderr and `null`. */
async function readThread(path) {
  try {
    return parseThread(await readFile(path, 'utf8'));
  } catch (err) {
    log(`conversation ignored (${path}): ${err.message}`);
    return null;
  }
}

async function scanProject(root, project) {
  const dir = join(root, project, 'comments');
  const found = [];
  for (const entry of await listDir(dir)) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const path = join(dir, entry.name);
    const thread = await readThread(path);
    const messageId = thread === null ? null : awaitingAgent(thread);
    if (thread !== null && messageId !== null) {
      found.push({ project, thread: thread.id, messageId, path });
    }
  }
  return found;
}

/** The open conversations (`comments/*.json` of each project under `root`) that await the agent. */
export async function scanAwaiting(root) {
  const projects = (await listDir(root))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const found = [];
  for (const project of projects) found.push(...(await scanProject(root, project)));
  return found;
}

/** `<project>/comments/…`: the only path that matters (a null `filename` counts as interest). */
function isCommentsPath(filename) {
  if (filename === null || filename === undefined) return true;
  const parts = String(filename).split(/[\\/]/);
  return parts.length >= 2 && parts[1] === 'comments';
}

const pairKey = (item) => `${item.project}/${item.thread}:${item.messageId}`;

/** Reads the handled pairs from the state file; missing -> empty, invalid -> empty with a warning. */
async function loadState(statePath) {
  if (statePath === null) return new Set();
  let text;
  try {
    text = await readFile(statePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') log(`state file ignored (${statePath}): ${err.message}`);
    return new Set();
  }
  try {
    const state = JSON.parse(text);
    const valid =
      state !== null &&
      state.format === STATE_FORMAT &&
      Array.isArray(state.handled) &&
      state.handled.every((key) => typeof key === 'string');
    if (!valid) throw new Error('not a watch state file');
    return new Set(state.handled);
  } catch (err) {
    log(`state file ignored (${statePath}): ${err.message}; starting empty`);
    return new Set();
  }
}

/** Writes the handled pairs: temporary file next to the state file + rename; a failure only warns. */
async function saveState(statePath, handled) {
  if (statePath === null) return;
  const tmp = `${statePath}.tmp-${process.pid}`;
  try {
    await mkdir(dirname(statePath), { recursive: true });
    const body = { format: STATE_FORMAT, handled: [...handled].sort() };
    await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`);
    await rename(tmp, statePath);
  } catch (err) {
    log(`could not write the state file (${statePath}): ${err.message}`);
  }
}

/**
 * The watcher cycle: an event restarts the quiet period; once it has passed, reads the conversations
 * and runs the command if there is a new pair; one command at a time; a change during the run marks "pending".
 */
function createRunner({ root, quietMs, command, args, emit, statePath, handled }) {
  let timer = null;
  let busy = false;
  let pending = false;
  let stopped = false;
  let child = null;

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(evaluate, quietMs);
  }

  function release() {
    busy = false;
    child = null;
    if (stopped || !pending) return;
    pending = false;
    schedule();
  }

  const toPayload = (items) =>
    items.map(({ project, thread, path }) => ({ project, thread, path }));

  /** `--emit`: one line per batch on stdout; the batch is done right away. */
  function emitWake(items) {
    process.stdout.write(`${WAKE_PREFIX} ${JSON.stringify(toPayload(items))}\n`);
    log(`${items.length} conversation(s) awaiting the agent; MAPPING_WAKE emitted`);
    release();
  }

  function runCommand(items) {
    const payload = toPayload(items);
    log(`${items.length} conversation(s) awaiting the agent; running ${command}`);
    let finished = false;
    const finish = (message) => {
      if (finished) return;
      finished = true;
      log(message);
      release();
    };
    child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, MAPPING_AWAITING: JSON.stringify(payload) },
    });
    child.on('error', (err) => finish(`could not run ${command}: ${err.message}`));
    child.on('close', (code, signal) =>
      finish(`${command} finished (code ${code ?? signal})`),
    );
  }

  async function evaluate() {
    timer = null;
    if (stopped || busy) return;
    busy = true;
    try {
      const awaiting = await scanAwaiting(root);
      const current = new Set(awaiting.map(pairKey));
      for (const key of handled) if (!current.has(key)) handled.delete(key);
      const fresh = awaiting.filter((item) => !handled.has(pairKey(item)));
      if (stopped || fresh.length === 0) return release();
      for (const item of fresh) handled.add(pairKey(item));
      await saveState(statePath, handled);
      if (emit) emitWake(fresh);
      else runCommand(fresh);
    } catch (err) {
      log(`error reading the conversations: ${err.message}`);
      release();
    }
  }

  function onEvent(filename) {
    if (stopped || !isCommentsPath(filename)) return;
    if (busy) pending = true;
    else schedule();
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    if (child !== null) child.kill('SIGTERM');
  }

  return { onEvent, schedule, stop };
}

/** Applies one option (`--emit` takes no value); returns the number of arguments used, or an error. */
function applyOption(config, name, value) {
  if (name === '--emit') {
    config.emit = true;
    return { used: 1 };
  }
  if (value === undefined) return { error: `option ${name} requires a value` };
  if (name === '--root') config.root = resolve(value);
  else if (name === '--quiet') config.quietSeconds = Number(value);
  else if (name === '--state') config.statePath = resolve(value);
  else return { error: `unknown option: ${name}` };
  return { used: 2 };
}

/** The message for an invalid combination of options, or `null`. */
function validateConfig(config, command) {
  if (!Number.isFinite(config.quietSeconds) || config.quietSeconds < 0) {
    return '--quiet requires a number of seconds (0 or more)';
  }
  if (config.emit && command.length > 0) {
    return '--emit and a command after "--" cannot be used together';
  }
  if (!config.emit && command.length === 0)
    return 'missing --emit or the command after "--"';
  return null;
}

/** Reads the options; returns `{ error }` with the message, or the configuration. */
function parseArgs(argv, defaultRoot) {
  const config = {
    root: defaultRoot,
    quietSeconds: DEFAULT_QUIET_SECONDS,
    statePath: null,
    emit: false,
  };
  const split = argv.indexOf('--');
  const options = split === -1 ? argv : argv.slice(0, split);
  const command = split === -1 ? [] : argv.slice(split + 1);
  for (let i = 0; i < options.length;) {
    const result = applyOption(config, options[i], options[i + 1]);
    if (result.error !== undefined) return { error: result.error };
    i += result.used;
  }
  const invalid = validateConfig(config, command);
  if (invalid !== null) return { error: invalid };
  return { ...config, command: command[0], args: command.slice(1) };
}

/** Runs the watcher until SIGINT/SIGTERM. Returns the exit code (2 for incorrect usage). */
export async function main(argv) {
  const base = dirname(SCRIPT_PATH);
  const legacyRoot = join(base, 'projetos');
  // Default root: projects/ next to the script; only an old projetos/ present -> that one.
  const useLegacy = !existsSync(join(base, 'projects')) && existsSync(legacyRoot);
  const defaultRoot = useLegacy ? legacyRoot : join(base, 'projects');
  const config = parseArgs(argv, defaultRoot);
  if (config.error !== undefined) {
    log(config.error);
    log(USAGE);
    return 2;
  }
  const handled = await loadState(config.statePath);
  const projectCount = (await listDir(config.root)).filter((e) => e.isDirectory()).length;
  return await new Promise((done) => {
    const runner = createRunner({
      root: config.root,
      quietMs: config.quietSeconds * 1000,
      command: config.command,
      args: config.args,
      emit: config.emit,
      statePath: config.statePath,
      handled,
    });
    let watcher;
    const quit = (code) => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      runner.stop();
      watcher?.close();
      done(code);
    };
    const onSignal = () => quit(0);
    try {
      watcher = watch(config.root, { recursive: true }, (_event, filename) =>
        runner.onEvent(filename),
      );
    } catch (err) {
      log(`could not watch ${config.root}: ${err.message}`);
      return done(1);
    }
    watcher.on('error', (err) => {
      log(`watch error: ${err.message}`);
      quit(1);
    });
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    const folders = `${projectCount} project folder${projectCount === 1 ? '' : 's'}`;
    log(
      `observing ${config.root} (${folders}, quiet period of ${config.quietSeconds}s); Ctrl+C stops`,
    );
    if (useLegacy && config.root === legacyRoot) {
      log('using the legacy projetos/ folder (no projects/ next to the script)');
    }
    runner.schedule();
  });
}

function isEntryModule() {
  try {
    return (
      process.argv[1] !== undefined &&
      realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH)
    );
  } catch {
    return false;
  }
}

if (isEntryModule()) {
  process.exitCode = await main(process.argv.slice(2));
}
