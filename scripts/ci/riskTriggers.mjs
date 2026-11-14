// Triggers of `/code-review high` in the epic's Closing (stage #1384, decisions 1 and 2). Node only,
// no dependencies.
//   riskTriggers.mjs --base <ref>
//     Compares <ref>...HEAD and prints one line per trigger hit:
//       "gatilho: <id>: <files, separated by comma>"
//     or just "nenhum gatilho". Exits with 0 in both cases; a usage error exits with 2 and the message on stderr.
// The list is that of "Detailing effort" of the `detalhar-backlog` skill: whoever changes one changes the other
// in the same PR (the test checks that every `id` appears there).
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** Path triggers: the file matches if it is `path` or under it (`path` ending in `/`). */
const PATH_TRIGGERS = [
  { id: 'implementar-fila', path: '.claude/skills/implementar-fila/' },
  { id: 'detalhar-backlog', path: '.claude/skills/detalhar-backlog/' },
  { id: 'supervisionar-fila', path: '.claude/skills/supervisionar-fila/' },
  { id: 'via-rapida', path: '.claude/skills/via-rapida/' },
  // Any change counts (decision 2): the script does not tell a rule from text.
  { id: 'docs/FLOW.md', path: 'docs/FLOW.md' },
  { id: 'docs/PROCESS.md', path: 'docs/PROCESS.md' },
  { id: '.github/workflows/', path: '.github/workflows/' },
  { id: 'scripts/release/', path: 'scripts/release/' },
  // `scripts/ci/dist-budget.json` is left out: the raise through `raise --write` does not trigger the review (#1614, decision 7).
  { id: 'scripts/ci/distBudget.mjs', path: 'scripts/ci/distBudget.mjs' },
  { id: 'mcp/version.ts', path: 'mcp/version.ts' },
  { id: 'src/store/session.ts', path: 'src/store/session.ts' },
  { id: 'pwa/csp.ts', path: 'pwa/csp.ts' },
];

/**
 * Content trigger: a schema-version or format-version constant line in `src/model/`.
 * Accepts a suffix (`COMPONENT_FORMAT_VERSION_REPEAT = 2`) and a type (`: number`); the array of accepted
 * versions (`SPEC_FORMAT_VERSIONS = [...]`) does not match, because the value is not a number.
 */
export const FORMAT_VERSION_REGEX =
  '[A-Z_]*(FORMAT|SCHEMA)_VERSION[A-Z_]*(: [a-z]+)? = [0-9]+';

export const TRIGGERS = [
  ...PATH_TRIGGERS.map(({ id, path }) => ({ id, kind: 'path', path })),
  {
    id: 'formatVersion',
    kind: 'content',
    regex: FORMAT_VERSION_REGEX,
    dir: 'src/model/',
  },
];

function matchesPath(file, path) {
  return path.endsWith('/') ? file.startsWith(path) : file === path;
}

/**
 * Pure function: takes the changed files and those matching the content regex; returns the lines.
 */
export function triggerLines(files, contentFiles) {
  const lines = [];
  for (const t of TRIGGERS) {
    const hit =
      t.kind === 'path' ? files.filter((f) => matchesPath(f, t.path)) : [...contentFiles];
    if (hit.length > 0) lines.push(`gatilho: ${t.id}: ${hit.join(', ')}`);
  }
  return lines;
}

/** Git output with `-z`: names without quotes or escaping, even with accents. */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\0')
    .filter((l) => l !== '');
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a !== '--base') throw new Error(`Argumento desconhecido: ${a}.`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--'))
      throw new Error('--base precisa de um valor.');
    out.base = value;
  }
  if (!out.base) throw new Error('Uso: riskTriggers.mjs --base <ref>');
  return out;
}

export function main(argv) {
  const { base } = parseArgs(argv);
  const range = `${base}...HEAD`;
  const files = git(['diff', '--name-only', '--no-renames', '-z', range]);
  const content = TRIGGERS.find((t) => t.kind === 'content');
  const contentFiles = git([
    'diff',
    `-G${content.regex}`,
    '--name-only',
    '--no-renames',
    '-z',
    range,
    '--',
    content.dir,
  ]);
  const lines = triggerLines(files, contentFiles);
  return lines.length > 0 ? lines.join('\n') : 'nenhum gatilho';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${main(process.argv.slice(2))}\n`);
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
