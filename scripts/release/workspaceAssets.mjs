// Arquivos do workspace que cada release do MCP publica junto com o `mapping-mcp.js`
// (etapa #681, decisão 1; etapa #735, decisão 1): `setup.sh`, `SKILL.md` (a skill `spec-author`),
// `AGENTS.mapping.md` (o bloco gerenciado do `examples/workspace/AGENTS.md`) e `watch-comments.mjs`
// (o watcher de conversas), cada um com o seu `.sha256`.
// Os três jobs de publicação (snapshot, rc e estável) usam este script, sem repetir a lista.
//   node scripts/release/workspaceAssets.mjs <pasta de saída> [--root <raiz do repositório>]
// Imprime os arquivos gravados, um por linha, com a pasta de saída na frente. Só Node, sem
// dependências. Sai com código ≠ 0 e uma mensagem em stderr se faltar origem ou se o esqueleto
// do `AGENTS.md` não tiver exatamente um bloco, com os marcadores na ordem.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BLOCK_BEGIN =
  '<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->';
export const BLOCK_END = '<!-- mapping:end -->';

const AGENTS_PATH = 'examples/workspace/AGENTS.md';

/** Origens (relativas à raiz) dos arquivos publicados: entram na lista de `releaseInputs.mjs`. */
export const WORKSPACE_SOURCES = [
  'examples/workspace/setup.sh',
  '.claude/skills/spec-author/SKILL.md',
  AGENTS_PATH,
  'examples/workspace/watch-comments.mjs',
];

/** Quantas vezes `needle` aparece em `text`. */
function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

/** Extrai o bloco gerenciado (marcadores inclusive) do `AGENTS.md` do esqueleto. */
export function extractBlock(agents) {
  const begins = occurrences(agents, BLOCK_BEGIN);
  const ends = occurrences(agents, BLOCK_END);
  if (begins === 0 && ends === 0) {
    throw new Error(
      `${AGENTS_PATH}: nenhum bloco gerenciado (faltam os marcadores mapping:begin e mapping:end).`,
    );
  }
  if (begins !== 1 || ends !== 1) {
    throw new Error(
      `${AGENTS_PATH}: esperado exatamente um bloco (um mapping:begin e um mapping:end), achei ${begins} e ${ends}.`,
    );
  }
  const start = agents.indexOf(BLOCK_BEGIN);
  const end = agents.indexOf(BLOCK_END);
  if (end < start) {
    throw new Error(
      `${AGENTS_PATH}: mapping:end vem antes do começo do bloco (marcadores fora de ordem).`,
    );
  }
  return agents.slice(start, end + BLOCK_END.length);
}

function readSource(root, path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    throw new Error(`Origem não encontrada: ${path}`);
  }
}

/** Linha do `.sha256` no formato do `sha256sum` (lido também por `shasum -a 256 -c`). */
export function checksumLine(name, content) {
  return `${createHash('sha256').update(content).digest('hex')}  ${name}\n`;
}

/** Grava os arquivos em `outDir` e devolve os caminhos, na ordem de publicação. */
export function buildWorkspaceAssets(outDir, root) {
  const files = [
    ['setup.sh', readSource(root, WORKSPACE_SOURCES[0])],
    ['SKILL.md', readSource(root, WORKSPACE_SOURCES[1])],
    ['AGENTS.mapping.md', `${extractBlock(readSource(root, WORKSPACE_SOURCES[2]))}\n`],
    ['watch-comments.mjs', readSource(root, WORKSPACE_SOURCES[3])],
  ];
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [name, content] of files) {
    writeFileSync(join(outDir, name), content);
    writeFileSync(join(outDir, `${name}.sha256`), checksumLine(name, content));
    written.push(join(outDir, name), join(outDir, `${name}.sha256`));
  }
  return written;
}

function parseArgs(argv) {
  const rest = argv.slice(2);
  const at = rest.indexOf('--root');
  const root = at >= 0 ? rest.splice(at, 2)[1] : undefined;
  return {
    out: rest[0],
    root: root ?? resolve(fileURLToPath(import.meta.url), '../../..'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { out, root } = parseArgs(process.argv);
  try {
    if (!out)
      throw new Error(
        'Uso: node scripts/release/workspaceAssets.mjs <pasta de saída> [--root <raiz>]',
      );
    process.stdout.write(`${buildWorkspaceAssets(out, root).join('\n')}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
