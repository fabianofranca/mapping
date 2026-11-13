#!/usr/bin/env node
// Watcher de conversas do Mapping (Node >= 20, sem dependências).
//
// Observa `projetos/*/comments/` e, quando alguma conversa ABERTA aguarda o agente (a última
// mensagem é de pessoa), roda UM comando (o agente) com a lista delas em `MAPPING_AWAITING`.
// O servidor MCP nunca dispara agente: quem decide rodar é este processo, que você inicia.
//
//   node watch-comments.mjs [--root <pasta>] [--quiet <segundos>] -- <comando> [args…]
//   node watch-comments.mjs -- claude -p "<prompt>"
//
// Instalado e atualizado pelo `setup.sh`; não edite (a próxima atualização sobrescreve).
//
// Formato da conversa: `docs/COMMENT-FORMAT.md` do Mapping.
import { spawn } from 'node:child_process';
import { realpathSync, watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = 'watch-comments:';
const DEFAULT_QUIET_SECONDS = 5;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const USAGE =
  'uso: node watch-comments.mjs [--root <pasta>] [--quiet <segundos>] -- <comando> [args…]';

function log(message) {
  process.stderr.write(`${PREFIX} ${message}\n`);
}

/** Valida o mínimo que o watcher usa da conversa; o resto é com a app e o servidor MCP. */
function parseThread(text) {
  const thread = JSON.parse(text);
  if (thread === null || typeof thread !== 'object') throw new Error('não é um objeto');
  if (thread.format !== 'mapping-thread')
    throw new Error('format diferente de mapping-thread');
  if (typeof thread.id !== 'string' || !Array.isArray(thread.messages)) {
    throw new Error('sem id ou messages');
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
  if (!valid) throw new Error('mensagem inválida');
  return thread;
}

/** Ordem das mensagens: por `at` e, no empate, por `id`. */
function compareMessages(a, b) {
  const byTime = Date.parse(a.at) - Date.parse(b.at);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Id da última mensagem se a conversa aguarda o agente (aberta e a última mensagem é de pessoa);
 * `null` quando está resolvida, vazia ou aguarda pessoa.
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

/** Lê uma conversa; ilegível ou inválida vira aviso no stderr e `null`. */
async function readThread(path) {
  try {
    return parseThread(await readFile(path, 'utf8'));
  } catch (err) {
    log(`conversa ignorada (${path}): ${err.message}`);
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

/** As conversas abertas (`comments/*.json` de cada projeto de `root`) que aguardam o agente. */
export async function scanAwaiting(root) {
  const projects = (await listDir(root))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const found = [];
  for (const project of projects) found.push(...(await scanProject(root, project)));
  return found;
}

/** `<projeto>/comments/…`: o único caminho que interessa (`filename` nulo vale como interesse). */
function isCommentsPath(filename) {
  if (filename === null || filename === undefined) return true;
  const parts = String(filename).split(/[\\/]/);
  return parts.length >= 2 && parts[1] === 'comments';
}

const pairKey = (item) => `${item.project}/${item.thread}:${item.messageId}`;

/**
 * O ciclo do watcher: evento reinicia a quietude; passada a quietude, lê as conversas e roda o
 * comando se houver par novo; um comando por vez; mudança durante a execução marca "pendente".
 */
function createRunner({ root, quietMs, command, args }) {
  const handled = new Set();
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

  function runCommand(items) {
    const payload = items.map(({ project, thread, path }) => ({ project, thread, path }));
    log(`${items.length} conversa(s) aguardando o agente; rodando ${command}`);
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
    child.on('error', (err) =>
      finish(`não foi possível rodar ${command}: ${err.message}`),
    );
    child.on('close', (code, signal) =>
      finish(`${command} terminou (código ${code ?? signal})`),
    );
  }

  async function evaluate() {
    timer = null;
    if (stopped || busy) return;
    busy = true;
    try {
      const fresh = (await scanAwaiting(root)).filter(
        (item) => !handled.has(pairKey(item)),
      );
      if (stopped || fresh.length === 0) return release();
      for (const item of fresh) handled.add(pairKey(item));
      runCommand(fresh);
    } catch (err) {
      log(`erro ao ler as conversas: ${err.message}`);
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

/** Lê as opções; devolve `{ error }` com a mensagem, ou a configuração. */
function parseArgs(argv, defaultRoot) {
  const config = { root: defaultRoot, quietSeconds: DEFAULT_QUIET_SECONDS };
  const split = argv.indexOf('--');
  const options = split === -1 ? argv : argv.slice(0, split);
  const command = split === -1 ? [] : argv.slice(split + 1);
  for (let i = 0; i < options.length; i += 2) {
    const name = options[i];
    const value = options[i + 1];
    if (value === undefined) return { error: `a opção ${name} pede um valor` };
    if (name === '--root') config.root = resolve(value);
    else if (name === '--quiet') config.quietSeconds = Number(value);
    else return { error: `opção desconhecida: ${name}` };
  }
  if (!Number.isFinite(config.quietSeconds) || config.quietSeconds < 0) {
    return { error: '--quiet pede um número de segundos (0 ou mais)' };
  }
  if (command.length === 0) return { error: 'falta o comando depois de "--"' };
  return { ...config, command: command[0], args: command.slice(1) };
}

/** Roda o watcher até SIGINT/SIGTERM. Devolve o código de saída (2 para uso incorreto). */
export async function main(argv) {
  const defaultRoot = join(dirname(SCRIPT_PATH), 'projetos');
  const config = parseArgs(argv, defaultRoot);
  if (config.error !== undefined) {
    log(config.error);
    log(USAGE);
    return 2;
  }
  return await new Promise((done) => {
    const runner = createRunner({
      root: config.root,
      quietMs: config.quietSeconds * 1000,
      command: config.command,
      args: config.args,
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
      log(`não foi possível observar ${config.root}: ${err.message}`);
      return done(1);
    }
    watcher.on('error', (err) => {
      log(`erro ao observar: ${err.message}`);
      quit(1);
    });
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    log(
      `observando ${config.root} (quietude de ${config.quietSeconds}s); Ctrl+C encerra`,
    );
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
