// @vitest-environment node
// Etapa #1803, fase WS1: `mappings-workspace/` é a cópia usada pelas sessões deste repositório do
// que `examples/workspace/` publica na release do MCP. O `serve.mjs` roda o `setup.sh` sem
// autoatualização (a cópia versionada é a fonte), então este teste confere que a cópia não derivou.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractBlock } from '../../scripts/release/workspaceAssets.mjs';

const ROOT = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** Modo no índice do git (`100755`, `100644`), ou `null` se o arquivo não está versionado. */
function gitMode(path: string): string | null {
  const out = spawnSync('git', ['ls-files', '-s', '--', path], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.stdout.split(' ')[0] || null;
}

const fix = (file: string) =>
  `copie examples/workspace/${file} para mappings-workspace/${file} (conteúdo e modo)`;

describe('mappings-workspace igual ao examples/workspace', () => {
  for (const file of ['setup.sh', 'watch-comments.mjs']) {
    it(`${file}: mesmo conteúdo`, () => {
      const copy = read(`mappings-workspace/${file}`);
      expect(copy === read(`examples/workspace/${file}`), fix(file)).toBe(true);
    });

    it(`${file}: mesmo modo no índice do git`, () => {
      const mode = gitMode(`mappings-workspace/${file}`);
      expect(mode, fix(file)).toBe(gitMode(`examples/workspace/${file}`));
    });
  }

  it('AGENTS.md: o bloco gerenciado é igual', () => {
    const copy = extractBlock(read('mappings-workspace/AGENTS.md'));
    const source = extractBlock(read('examples/workspace/AGENTS.md'));
    expect(
      copy === source,
      'copie o bloco entre mapping:begin e mapping:end de examples/workspace/AGENTS.md para mappings-workspace/AGENTS.md',
    ).toBe(true);
  });

  it('serve.mjs roda o setup.sh sem autoatualização', () => {
    expect(read('mappings-workspace/serve.mjs')).toMatch(
      /\[\s*'\.\/setup\.sh'\s*,\s*'--no-self-update'\s*\]/,
    );
  });
});
