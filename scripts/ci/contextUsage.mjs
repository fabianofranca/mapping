// Context measure of the session itself (stage #1699): the usage of the last model call, read from
// the local Claude Code transcript. Node only, no dependencies. The `used_tokens` of `get_session`
// only changes at the end of a turn (it is 0 in the first one); the transcript follows every call.
//   node scripts/ci/contextUsage.mjs [--teto <n>] [--max <n>] [--arquivo <path>]
//     Reads `$CLAUDE_CONFIG_DIR` (or `~/.claude`), `projects/*/$CLAUDE_CODE_SESSION_ID.jsonl`. Without the
//     variable, the most recent `.jsonl` directly in `projects/*/` (never those in `subagents/`).
//     `--arquivo` reads that file. Writes, one key per line: `contexto=<n>`, `mil=<n/1000 rounded
//     up>`, `acima=<true|false>` (`n` > `--teto`, default 300000), `fonte=<sessao|recente|arquivo>`,
//     `arquivo=<path>` and, with `--max <n>`, `pct=<100·contexto/n rounded up>`.
//     Exit code 0 with a measure; 1 without one (`contexto=?` and `motivo=<text>`); 2 on a usage error.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const USAGE =
  'Uso: node scripts/ci/contextUsage.mjs [--teto <n>] [--max <n>] [--arquivo <caminho>]';
const DEFAULT_CEILING = 300000;

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Soma das entradas de uma linha do transcript que vale como medida, ou `null`. */
function lineContext(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (entry === null || typeof entry !== 'object') return null;
  if (entry.type !== 'assistant' || entry.isSidechain === true) return null;
  const message = entry.message;
  if (message === null || typeof message !== 'object') return null;
  if (message.model === '<synthetic>') return null;
  const usage = message.usage;
  if (usage === null || typeof usage !== 'object') return null;
  const total =
    count(usage.input_tokens) +
    count(usage.cache_read_input_tokens) +
    count(usage.cache_creation_input_tokens);
  return total > 0 ? total : null;
}

/** Context of the last main-thread message of the transcript, or `null` with none that counts. */
export function lastContext(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const total = lineContext(lines[i]);
    if (total !== null) return total;
  }
  return null;
}

function safeDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return [];
  }
}

// Os `.jsonl` direto em cada pasta de `<config>/projects`, sem descer em `<id>/subagents`.
function transcripts(config) {
  const found = [];
  for (const folder of safeDirs(join(config, 'projects'))) {
    const base = join(config, 'projects', folder.name);
    let names;
    try {
      names = readdirSync(base);
    } catch {
      continue;
    }
    for (const name of names) if (name.endsWith('.jsonl')) found.push(join(base, name));
  }
  return found;
}

function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** `{ path, fonte }` of the transcript to measure, or `{ motivo }` when there is no file. */
export function locate({ config, sessionId, arquivo }) {
  if (arquivo) return { path: arquivo, fonte: 'arquivo' };
  const all = transcripts(config);
  if (sessionId) {
    const wanted = `${sessionId}.jsonl`;
    const matches = all.filter(
      (p) => p.endsWith(`/${wanted}`) || p.endsWith(`\\${wanted}`),
    );
    // The same id may exist in more than one folder (session resumed from another cwd): the newest wins.
    matches.sort((a, b) => mtime(b) - mtime(a));
    if (matches.length > 0) return { path: matches[0], fonte: 'sessao' };
    return { motivo: `transcript ${wanted} não achado em ${join(config, 'projects')}` };
  }
  if (all.length === 0)
    return { motivo: `nenhum transcript em ${join(config, 'projects')}` };
  all.sort((a, b) => mtime(b) - mtime(a));
  return { path: all[0], fonte: 'recente' };
}

function positive(raw, name) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${name} pede um inteiro positivo. ${USAGE}`);
  return n;
}

const FLAGS = new Set(['--teto', '--max', '--arquivo']);

// Reads left to right: each flag takes one value, once only. A usage error throws with the
// cause stated (stray token, unknown, repeated or valueless flag).
function parseArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('--')) throw new Error(`Argumento solto: ${flag}. ${USAGE}`);
    if (!FLAGS.has(flag)) throw new Error(`Argumento desconhecido: ${flag}. ${USAGE}`);
    if (values.has(flag)) throw new Error(`${flag} repetida: use uma vez só. ${USAGE}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--'))
      throw new Error(
        `${flag} pede um valor, mas veio ${value === undefined ? 'nada' : `"${value}"`} (caminho que começa com "--": use "./"). ${USAGE}`,
      );
    values.set(flag, value);
    i++;
  }
  return {
    teto: positive(values.get('--teto'), '--teto') ?? DEFAULT_CEILING,
    max: positive(values.get('--max'), '--max'),
    arquivo: values.get('--arquivo'),
  };
}

function noMeasure(motivo) {
  process.stdout.write(`contexto=?\nmotivo=${motivo}\n`);
  return 1;
}

/** Runs the CLI and returns the exit code; a usage error throws. */
export function run(argv, env = process.env) {
  const { teto, max, arquivo } = parseArgs(argv);
  const config = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const sessionId = env.CLAUDE_CODE_SESSION_ID || '';
  const found = locate({ config, sessionId, arquivo });
  if (found.motivo) return noMeasure(found.motivo);
  let text;
  try {
    text = readFileSync(found.path, 'utf8');
  } catch {
    return noMeasure(`transcript ilegível: ${found.path}`);
  }
  const contexto = lastContext(text);
  if (contexto === null)
    return noMeasure(`nenhuma mensagem do assistente com usage em ${found.path}`);
  let out =
    `contexto=${contexto}\n` +
    `mil=${Math.ceil(contexto / 1000)}\n` +
    `acima=${contexto > teto}\n` +
    `fonte=${found.fonte}\n` +
    `arquivo=${found.path}\n`;
  if (max !== undefined) out += `pct=${Math.ceil((100 * contexto) / max)}\n`;
  process.stdout.write(out);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}
