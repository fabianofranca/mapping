// @vitest-environment node
// Stage #1803, phase WS1: `mappings-workspace/` is the copy, used by this repository's sessions, of
// what `examples/workspace/` publishes in the MCP release. `serve.mjs` runs `setup.sh` without
// self-update (the versioned copy is the source), so this test checks that the copy has not drifted.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractBlock } from '../../scripts/release/workspaceAssets.mjs';

const ROOT = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** Mode in the git index (`100755`, `100644`), or `null` if the file is not versioned. */
function gitMode(path: string): string | null {
  const out = spawnSync('git', ['ls-files', '-s', '--', path], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.stdout.split(' ')[0] || null;
}

const fix = (file: string) =>
  `copy examples/workspace/${file} to mappings-workspace/${file} (content and mode)`;

describe('mappings-workspace equal to examples/workspace', () => {
  for (const file of ['setup.sh', 'watch-comments.mjs']) {
    it(`${file}: same content`, () => {
      const copy = read(`mappings-workspace/${file}`);
      expect(copy === read(`examples/workspace/${file}`), fix(file)).toBe(true);
    });

    it(`${file}: same mode in the git index`, () => {
      const mode = gitMode(`mappings-workspace/${file}`);
      expect(mode, fix(file)).toBe(gitMode(`examples/workspace/${file}`));
    });
  }

  it('AGENTS.md: the managed block is equal', () => {
    const copy = extractBlock(read('mappings-workspace/AGENTS.md'));
    const source = extractBlock(read('examples/workspace/AGENTS.md'));
    expect(
      copy === source,
      'copy the block between mapping:begin and mapping:end of examples/workspace/AGENTS.md to mappings-workspace/AGENTS.md',
    ).toBe(true);
  });

  it('serve.mjs runs setup.sh without self-update', () => {
    expect(read('mappings-workspace/serve.mjs')).toMatch(
      /\[\s*'\.\/setup\.sh'\s*,\s*'--no-self-update'\s*\]/,
    );
  });
});
