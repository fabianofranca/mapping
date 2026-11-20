// @vitest-environment node
// Stage #2090, phase BP3: the read-only `scratch/` folder reaches the workspace template, this
// repository's workspace and the stdio client. Every place that starts the server passes
// `--scratch scratch` after the two roots, and both `.gitignore` files ignore the folder.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const CLIENT_CONFIGS = [
  'examples/workspace/.mcp.json',
  'examples/workspace/.codex/config.toml',
  'examples/workspace/.cursor/mcp.json',
  'examples/workspace/.gemini/settings.json',
  'examples/workspace/.vscode/mcp.json',
];

describe('scratch folder in the workspace (stage #2090, BP3)', () => {
  for (const file of CLIENT_CONFIGS) {
    it(`${file} passes --scratch scratch after the two roots`, () => {
      expect(read(file)).toMatch(
        /"--root",\s*"projects",\s*"--root",\s*"specializations",\s*"--scratch",\s*"scratch"/,
      );
    });
  }

  it('mappings-workspace/.mcp.json passes --scratch scratch after the two roots', () => {
    expect(read('mappings-workspace/.mcp.json')).toMatch(
      /"--root",\s*"projects",\s*"--root",\s*"specializations",\s*"--scratch",\s*"scratch"/,
    );
  });

  it('mappings-workspace/serve.mjs passes --scratch with the scratch folder', () => {
    expect(read('mappings-workspace/serve.mjs')).toMatch(
      /'--scratch',\s*join\(here, 'scratch'\)/,
    );
  });

  it('the stdio client default arguments carry --scratch scratch', () => {
    const src = read('scripts/testing/mcp-stdio-client.mjs');
    const block = /const DEFAULT_SERVER_ARGS = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
    expect(block).toMatch(/'--scratch',\s*'scratch'/);
    expect(src).toMatch(/--root specializations --scratch scratch/);
  });

  for (const file of ['examples/workspace/.gitignore', 'mappings-workspace/.gitignore']) {
    it(`${file} ignores scratch/`, () => {
      expect(read(file).split('\n')).toContain('scratch/');
    });
  }
});
