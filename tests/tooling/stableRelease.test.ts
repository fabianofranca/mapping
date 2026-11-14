// @vitest-environment node
// Stage #920, phase RA1: the decision to publish the MCP stable release on the epic merge (job
// `decide` of `mcp-release.yml`) and the version lock on the epic PR (job `epic` of `ci.yml`) live
// in `scripts/release/stableRelease.mjs`; the YAML only gathers the data and calls the script.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkEpicVersion,
  compareVersions,
  decideRelease,
  latestStable,
  parseTags,
  readServerVersion,
} from '../../scripts/release/stableRelease.mjs';

const TAGS = ['mcp-v0.27.0', 'mcp-v0.28.1', 'mcp-v0.28.2', 'mcp-v0.28.2-rc.1'];

describe('parseTags', () => {
  it('reads the output of `git ls-remote --tags` and `git tag -l`, without the ^{}', () => {
    const text = [
      'abc123\trefs/tags/mcp-v0.28.1',
      'def456\trefs/tags/mcp-v0.28.1^{}',
      'mcp-v0.28.2',
      '',
    ].join('\n');
    expect(parseTags(text)).toEqual(['mcp-v0.28.1', 'mcp-v0.28.2']);
  });
});

describe('versions', () => {
  it('compares by number, not by text', () => {
    expect(compareVersions('0.28.10', '0.28.2')).toBeGreaterThan(0);
    expect(compareVersions('0.28.2', '0.28.2')).toBe(0);
    expect(compareVersions('0.9.0', '0.28.0')).toBeLessThan(0);
  });

  it('the latest stable ignores rc and snapshot', () => {
    expect(latestStable(TAGS)).toBe('0.28.2');
    expect(latestStable(['mcp-v0.29.0-rc.1', 'mcp-snapshot-pr12'])).toBeNull();
  });

  it('reads SERVER_VERSION from mcp/version.ts', () => {
    expect(readServerVersion("export const SERVER_VERSION = '0.28.2';")).toBe('0.28.2');
    expect(() => readServerVersion('nothing')).toThrow(/SERVER_VERSION/);
  });
});

describe('decideRelease (job decide, push to main)', () => {
  it('a new version publishes and returns the tag', () => {
    const r = decideRelease({ version: '0.29.0', tags: TAGS });
    expect(r.publish).toBe(true);
    expect(r.tag).toBe('mcp-v0.29.0');
  });

  it('an existing tag skips, with the already-published notice', () => {
    const r = decideRelease({ version: '0.28.2', tags: TAGS });
    expect(r.publish).toBe(false);
    expect(r.level).toBe('notice');
    expect(r.message).toBe('mcp-v0.28.2 already published; nothing to do');
  });

  it('an rc of the same version does not count as stable', () => {
    const r = decideRelease({ version: '0.29.0', tags: ['mcp-v0.29.0-rc.1'] });
    expect(r.publish).toBe(true);
  });
});

describe('checkEpicVersion (job epic of ci.yml)', () => {
  it('a new version greater than the latest stable passes', () => {
    const r = checkEpicVersion({
      version: '0.29.0',
      tags: TAGS,
      changed: ['mcp/tools.ts'],
    });
    expect(r.ok).toBe(true);
  });

  it('a new version lower than the latest stable fails', () => {
    const r = checkEpicVersion({ version: '0.28.0', tags: TAGS, changed: [] });
    expect(r.ok).toBe(false);
    expect(r.level).toBe('error');
    expect(r.message).toContain('0.28.0');
    expect(r.message).toContain('0.28.2');
  });

  it('a new version equal to the latest stable (existing tag) falls into the existing-tag case', () => {
    const r = checkEpicVersion({ version: '0.28.2', tags: TAGS, changed: [] });
    expect(r.ok).toBe(true);
  });

  it('existing tag and changed release input fails, with the message and up to 5 files', () => {
    const changed = [
      'README.md',
      'mcp/a.ts',
      'mcp/b.ts',
      'src/model/c.ts',
      'src/model/d.ts',
      'docs/AGENT-GUIDE.md',
      'libraries/notas/index.ts',
    ];
    const r = checkEpicVersion({ version: '0.28.2', tags: TAGS, changed });
    expect(r.ok).toBe(false);
    expect(r.level).toBe('error');
    expect(r.message).toBe(
      'The epic changes what goes in the MCP release (mcp/a.ts, mcp/b.ts, src/model/c.ts, src/model/d.ts, docs/AGENT-GUIDE.md and 1 more) and keeps version 0.28.2, which already has the stable mcp-v0.28.2. Raise SERVER_VERSION in mcp/version.ts (and the docs that cite it).',
    );
  });

  it('existing tag with no changed input passes with a notice that the merge does not publish', () => {
    const r = checkEpicVersion({
      version: '0.28.2',
      tags: TAGS,
      changed: ['README.md', 'src/store/history.ts', 'docs/MCP.md'],
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe('notice');
    expect(r.message).toContain('does not publish');
  });
});

describe('CLI', () => {
  const SCRIPT = resolve('scripts/release/stableRelease.mjs');
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length > 0)
      rmSync(dirs.pop() as string, { recursive: true, force: true });
  });

  const git = (cwd: string, ...args: string[]): void => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd,
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
  };

  /** Test repository with `mcp-v0.28.2` on the first commit and a file changed afterwards. */
  function repo(changedAfterTag: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'stable-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'mcp'), { recursive: true });
    writeFileSync(
      join(dir, 'mcp/version.ts'),
      "export const SERVER_VERSION = '0.28.2';\n",
    );
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'one');
    git(dir, 'tag', 'mcp-v0.28.2');
    mkdirSync(join(dir, changedAfterTag, '..'), { recursive: true });
    writeFileSync(join(dir, changedAfterTag), 'x\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'two');
    return dir;
  }

  const run = (cwd: string, ...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });

  it('epic: fails with ::error:: when a release input changes and the version stays', () => {
    const dir = repo('mcp/novo.ts');
    const r = run(dir, 'epic', '--version-file', 'mcp/version.ts');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(
      '::error::The epic changes what goes in the MCP release (mcp/novo.ts)',
    );
  });

  it('epic: a release input renamed out of the list counts by the old path', () => {
    const dir = repo('docs/outro.md');
    // `mcp/antigo.ts` enters the tag commit and leaves renamed: without `--no-renames` the diff
    // would only show the new path (outside the list) and the change would pass without bumping the version.
    mkdirSync(join(dir, 'mcp'), { recursive: true });
    writeFileSync(join(dir, 'mcp/antigo.ts'), 'export const a = 1;\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'three');
    git(dir, 'tag', '-f', 'mcp-v0.28.2');
    git(dir, 'mv', 'mcp/antigo.ts', 'docs/antigo.md');
    git(dir, 'commit', '-q', '-m', 'four');
    const r = run(dir, 'epic', '--version-file', 'mcp/version.ts');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('mcp/antigo.ts');
  });

  it('version: prints the SERVER_VERSION of the file, without sed in the workflows', () => {
    const dir = repo('docs/outro.md');
    const r = run(dir, 'version', '--version-file', 'mcp/version.ts');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('0.28.2\n');
  });

  it('epic: passes with ::notice:: when nothing in the release changed', () => {
    const dir = repo('docs/outro.md');
    const r = run(dir, 'epic', '--version-file', 'mcp/version.ts');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('::notice::');
  });

  it('decide: writes publish, tag and sha to the output file', () => {
    const dir = repo('docs/outro.md');
    writeFileSync(
      join(dir, 'mcp/version.ts'),
      "export const SERVER_VERSION = '0.29.0';\n",
    );
    writeFileSync(join(dir, 'tags.txt'), 'abc\trefs/tags/mcp-v0.28.2\n');
    const out = join(dir, 'out.txt');
    const r = run(
      dir,
      'decide',
      '--version-file',
      'mcp/version.ts',
      '--tags-file',
      join(dir, 'tags.txt'),
      '--sha',
      'abc123',
      '--output',
      out,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('tag=mcp-v0.29.0\nsha=abc123\npublish=true\n');
  });

  it('decide: an existing tag ends green with the notice and publish=false', () => {
    const dir = repo('docs/outro.md');
    writeFileSync(join(dir, 'tags.txt'), 'abc\trefs/tags/mcp-v0.28.2\n');
    const out = join(dir, 'out.txt');
    const r = run(
      dir,
      'decide',
      '--version-file',
      'mcp/version.ts',
      '--tags-file',
      join(dir, 'tags.txt'),
      '--sha',
      'abc123',
      '--output',
      out,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('::notice::mcp-v0.28.2 already published; nothing to do');
    expect(readFileSync(out, 'utf8')).toContain('publish=false');
  });
});
