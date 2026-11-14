// @vitest-environment node
// Stage #681, phase WA1: each MCP release ships the workspace files (`setup.sh`, `SKILL.md`
// and `AGENTS.mapping.md`, with `sha256`), assembled by `scripts/release/workspaceAssets.mjs`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/release/workspaceAssets.mjs';
const BEGIN =
  '<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->';
const END = '<!-- mapping:end -->';
const read = (path: string): string => readFileSync(path, 'utf8');

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'wa-assets-'));
  dirs.push(dir);
  return dir;
};

/** Minimal skeleton (setup.sh, skill and AGENTS.md) in a test folder. */
function fakeRoot(agents: string): string {
  const root = tmp();
  mkdirSync(join(root, 'examples/workspace'), { recursive: true });
  mkdirSync(join(root, '.claude/skills/spec-author'), { recursive: true });
  writeFileSync(
    join(root, 'examples/workspace/setup.sh'),
    '#!/usr/bin/env bash\necho hi\n',
  );
  writeFileSync(join(root, '.claude/skills/spec-author/SKILL.md'), '# skill\n');
  writeFileSync(join(root, 'examples/workspace/watch-comments.mjs'), '// watcher\n');
  writeFileSync(join(root, 'examples/workspace/AGENTS.md'), agents);
  return root;
}

function run(out: string, root?: string) {
  const args = [SCRIPT, out, ...(root ? ['--root', root] : [])];
  return spawnSync('node', args, { encoding: 'utf8' });
}

describe('the examples/workspace/AGENTS.md skeleton', () => {
  const text = read('examples/workspace/AGENTS.md');
  const count = (s: string): number => text.split(s).length - 1;

  it('has exactly one managed block, with the markers in order', () => {
    expect(count(BEGIN)).toBe(1);
    expect(count(END)).toBe(1);
    expect(text.indexOf(BEGIN)).toBeLessThan(text.indexOf(END));
  });

  it('"What these mappings are for" stays outside the block, after the title', () => {
    const purpose = text.indexOf('## What these mappings are for');
    expect(purpose).toBeGreaterThan(text.indexOf('# Mappings'));
    expect(purpose).toBeLessThan(text.indexOf(BEGIN));
  });

  it('the block goes from the introduction to the end of "Typical flow"', () => {
    const block = text.slice(text.indexOf(BEGIN), text.indexOf(END) + END.length);
    expect(block).toContain('This folder centralizes');
    expect(block).toContain('## Typical flow');
    expect(block).not.toContain('What these mappings are for');
    expect(text.slice(text.indexOf(END) + END.length).trim()).toBe('');
  });

  it('the block says to apply the library by proposal, with the folder, and does not say it is refused', () => {
    const block = text.slice(text.indexOf(BEGIN), text.indexOf(END) + END.length);
    expect(block).not.toContain('recusa pacote v4');
    const item =
      block.split('\n').find((l) => l.startsWith('- **Specializations start')) ?? '';
    expect(item).toContain('`apply_specialization`');
    expect(item).toContain('`update_specialization`');
    expect(item).toMatch(/`file`\s*=\s*the folder/);
  });
});

describe('scripts/release/workspaceAssets.mjs', () => {
  it('writes the four files and the four .sha256, and prints the list (one per line)', () => {
    const out = tmp();
    const result = run(out);
    expect(result.status, result.stderr).toBe(0);
    const files = result.stdout.trim().split('\n');
    expect(files.map((f) => f.split(/[\\/]/).pop())).toEqual([
      'setup.sh',
      'setup.sh.sha256',
      'SKILL.md',
      'SKILL.md.sha256',
      'AGENTS.mapping.md',
      'AGENTS.mapping.md.sha256',
      'watch-comments.mjs',
      'watch-comments.mjs.sha256',
    ]);
    for (const file of files) expect(read(file).length).toBeGreaterThan(0);
  });

  it('each .sha256 matches sha256sum -c in the output folder', () => {
    const out = tmp();
    expect(run(out).status).toBe(0);
    for (const name of [
      'setup.sh',
      'SKILL.md',
      'AGENTS.mapping.md',
      'watch-comments.mjs',
    ]) {
      const check = spawnSync('sha256sum', ['-c', `${name}.sha256`], {
        cwd: out,
        encoding: 'utf8',
      });
      expect(check.status, check.stderr).toBe(0);
      expect(check.stdout).toContain(`${name}: OK`);
    }
  });

  it('setup.sh, SKILL.md and watch-comments.mjs are copies, and AGENTS.mapping.md is the part between the markers (inclusive)', () => {
    const out = tmp();
    expect(run(out).status).toBe(0);
    expect(read(join(out, 'setup.sh'))).toBe(read('examples/workspace/setup.sh'));
    expect(read(join(out, 'SKILL.md'))).toBe(read('.claude/skills/spec-author/SKILL.md'));
    expect(read(join(out, 'watch-comments.mjs'))).toBe(
      read('examples/workspace/watch-comments.mjs'),
    );
    const agents = read('examples/workspace/AGENTS.md');
    const block = agents.slice(agents.indexOf(BEGIN), agents.indexOf(END) + END.length);
    expect(read(join(out, 'AGENTS.mapping.md'))).toBe(`${block}\n`);
  });

  it('creates the output folder if it does not exist', () => {
    const out = join(tmp(), 'new/dist-mcp');
    expect(run(out).status).toBe(0);
    expect(read(join(out, 'setup.sh'))).toContain('#!');
  });

  it('fails, with a clear message, if the skeleton has no block', () => {
    const result = run(tmp(), fakeRoot('# Mappings\n\ntext\n'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('AGENTS.md');
    expect(result.stderr).toMatch(/no managed block/i);
  });

  it('fails if the skeleton has two blocks', () => {
    const block = `${BEGIN}\nrules\n${END}\n`;
    const result = run(tmp(), fakeRoot(`# T\n\n${block}\n${block}`));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/exactly one block/i);
  });

  it('fails if the end comes before the beginning', () => {
    const result = run(tmp(), fakeRoot(`# T\n\n${END}\nrules\n${BEGIN}\n`));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/out of order|before the start/i);
  });

  it('fails, naming the file, if the source watch-comments.mjs is missing', () => {
    const root = fakeRoot(`${BEGIN}\nx\n${END}\n`);
    rmSync(join(root, 'examples/workspace/watch-comments.mjs'));
    const result = run(tmp(), root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('watch-comments.mjs');
  });

  it('fails if a source file is missing', () => {
    const root = fakeRoot(`${BEGIN}\nx\n${END}\n`);
    rmSync(join(root, '.claude/skills/spec-author/SKILL.md'));
    const result = run(tmp(), root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SKILL.md');
  });
});

describe('the release workflows publish the workspace files', () => {
  const commandsOf = (yaml: string, verb: string): string[] =>
    yaml
      .split(/\n(?=\s*(?:- name:|- run:|- uses:))/)
      .join('\n')
      .split(/\n(?=\s*(?:gh release create|gh release upload))/)
      .filter((chunk) => new RegExp(`^\\s*gh release ${verb}`).test(chunk))
      .map((chunk) => chunk.split(/\n\s*\n|\n {6,8}- /)[0] ?? '');

  const cases: [string, string, string, string[]][] = [
    [
      'snapshot',
      '.github/workflows/mcp-prerelease.yml',
      'snapshot-publish',
      ['create', 'upload'],
    ],
    ['rc', '.github/workflows/mcp-prerelease.yml', 'rc-publish', ['create']],
    ['stable', '.github/workflows/mcp-release.yml', 'release', ['create', 'upload']],
  ];

  const jobOf = (yaml: string, name: string): string => {
    const start = yaml.indexOf(`\n  ${name}:\n`);
    const rest = yaml.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/);
    return end < 0 ? rest : rest.slice(0, end + 1);
  };

  it('each building job runs the script once, after Checksum, into release-assets/', () => {
    const call = 'node scripts/release/workspaceAssets.mjs release-assets';
    const prerelease = read('.github/workflows/mcp-prerelease.yml');
    const release = read('.github/workflows/mcp-release.yml');
    const jobs = [
      jobOf(prerelease, 'snapshot-build'),
      jobOf(prerelease, 'rc-build'),
      jobOf(release, 'release'),
    ];
    for (const job of jobs) {
      expect(job.split(call).length - 1).toBe(1);
      expect(job.indexOf('name: Checksum')).toBeLessThan(job.indexOf(call));
      expect(job).toContain(
        'cp dist-mcp/mapping-mcp.js dist-mcp/mapping-mcp.js.sha256 release-assets/',
      );
      // The extractor (S3 of #1079) goes along, with its hash, and is tested outside the repository.
      expect(job).toContain(
        'cp dist-mcp/mapping-signature.mjs dist-mcp/mapping-signature.mjs.sha256 release-assets/',
      );
      expect(job).toContain(
        'sha256sum mapping-signature.mjs > mapping-signature.mjs.sha256',
      );
      expect(job).toContain('node mapping-signature.mjs --help');
    }
  });

  for (const [job, file, name, verbs] of cases) {
    for (const verb of verbs) {
      it(`${job}: gh release ${verb} carries everything in release-assets/`, () => {
        const chunk = jobOf(read(file), name);
        const commands = commandsOf(chunk, verb);
        expect(commands.length).toBeGreaterThan(0);
        expect(chunk).toContain('assets=(release-assets/*)');
        for (const command of commands) expect(command).toContain('"${assets[@]}"');
      });
    }
  }

  it('the release notes quote the transition line', () => {
    for (const file of [
      '.github/workflows/mcp-prerelease.yml',
      '.github/workflows/mcp-release.yml',
    ]) {
      expect(read(file)).toContain('-o setup.sh && chmod +x setup.sh && ./setup.sh');
    }
  });
});
