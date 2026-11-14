// Workspace files that each MCP release publishes along with `mapping-mcp.js`
// (stage #681, decision 1; stage #735, decision 1): `setup.sh`, `SKILL.md` (the `spec-author` skill),
// `AGENTS.mapping.md` (the managed block of `examples/workspace/AGENTS.md`) and `watch-comments.mjs`
// (the conversation watcher), each with its `.sha256`.
// The three publishing jobs (snapshot, rc and stable) use this script, without repeating the list.
//   node scripts/release/workspaceAssets.mjs <output folder> [--root <repository root>]
// Prints the files written, one per line, with the output folder in front. Node only, no
// dependencies. Exits with a code ≠ 0 and a message on stderr if a source is missing or if the
// `AGENTS.md` skeleton does not have exactly one block, with the markers in order.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BLOCK_BEGIN =
  '<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->';
export const BLOCK_END = '<!-- mapping:end -->';

const AGENTS_PATH = 'examples/workspace/AGENTS.md';

/** Sources (relative to the root) of the published files: `releaseInputs.mjs` spreads them into the inputs list. */
export const WORKSPACE_SOURCES = [
  'examples/workspace/setup.sh',
  '.claude/skills/spec-author/SKILL.md',
  AGENTS_PATH,
  'examples/workspace/watch-comments.mjs',
];

/** How many times `needle` appears in `text`. */
function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

/** Extracts the managed block (markers included) from the skeleton `AGENTS.md`. */
export function extractBlock(agents) {
  const begins = occurrences(agents, BLOCK_BEGIN);
  const ends = occurrences(agents, BLOCK_END);
  if (begins === 0 && ends === 0) {
    throw new Error(
      `${AGENTS_PATH}: no managed block (the mapping:begin and mapping:end markers are missing).`,
    );
  }
  if (begins !== 1 || ends !== 1) {
    throw new Error(
      `${AGENTS_PATH}: expected exactly one block (one mapping:begin and one mapping:end), found ${begins} and ${ends}.`,
    );
  }
  const start = agents.indexOf(BLOCK_BEGIN);
  const end = agents.indexOf(BLOCK_END);
  if (end < start) {
    throw new Error(
      `${AGENTS_PATH}: mapping:end comes before the start of the block (markers out of order).`,
    );
  }
  return agents.slice(start, end + BLOCK_END.length);
}

function readSource(root, path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    throw new Error(`Source not found: ${path}`);
  }
}

/** `.sha256` line in the `sha256sum` format (also read by `shasum -a 256 -c`). */
export function checksumLine(name, content) {
  return `${createHash('sha256').update(content).digest('hex')}  ${name}\n`;
}

/** Writes the files to `outDir` and returns the paths, in publishing order. */
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
        'Usage: node scripts/release/workspaceAssets.mjs <output folder> [--root <root>]',
      );
    process.stdout.write(`${buildWorkspaceAssets(out, root).join('\n')}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
