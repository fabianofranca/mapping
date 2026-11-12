// Gatilhos da `/code-review high` no Fechamento do épico (etapa #1384, decisões 1 e 2). Só Node,
// sem dependências.
//   riskTriggers.mjs --base <ref>
//     Compara <ref>...HEAD e imprime uma linha por gatilho atingido:
//       "gatilho: <id>: <arquivos, separados por vírgula>"
//     ou só "nenhum gatilho". Sai com 0 nos dois casos; erro de uso sai com 2 e a mensagem no stderr.
// A lista é a de "Esforço do detalhamento" do skill `detalhar-backlog`: quem muda uma muda a outra
// no mesmo PR (o teste confere que cada `id` aparece lá).
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** Gatilhos por caminho: o arquivo casa se for `path` ou estiver sob ele (`path` terminado em `/`). */
const PATH_TRIGGERS = [
  { id: 'implementar-fila', path: '.claude/skills/implementar-fila/' },
  { id: 'detalhar-backlog', path: '.claude/skills/detalhar-backlog/' },
  { id: 'supervisionar-fila', path: '.claude/skills/supervisionar-fila/' },
  // Qualquer mudança conta (decisão 2): o script não distingue regra de texto.
  { id: 'docs/FLOW.md', path: 'docs/FLOW.md' },
  { id: 'docs/PROCESS.md', path: 'docs/PROCESS.md' },
  { id: '.github/workflows/', path: '.github/workflows/' },
  { id: 'scripts/release/', path: 'scripts/release/' },
  // O `scripts/ci/dist-budget.json` fica de fora: a subida pelo `raise --write` não aciona a revisão (#1614, decisão 7).
  { id: 'scripts/ci/distBudget.mjs', path: 'scripts/ci/distBudget.mjs' },
  { id: 'mcp/version.ts', path: 'mcp/version.ts' },
  { id: 'src/store/session.ts', path: 'src/store/session.ts' },
  { id: 'pwa/csp.ts', path: 'pwa/csp.ts' },
];

/**
 * Gatilho por conteúdo: linha de constante de versão do schema ou de formato em `src/model/`.
 * Aceita sufixo (`COMPONENT_FORMAT_VERSION_REPEAT = 2`) e tipo (`: number`); o array das versões
 * aceitas (`SPEC_FORMAT_VERSIONS = [...]`) não casa, porque o valor não é um número.
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
 * Função pura: recebe os arquivos alterados e os que casam a regex de conteúdo; devolve as linhas.
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

/** Saída do git com `-z`: nomes sem aspas nem escape, mesmo com acento. */
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
