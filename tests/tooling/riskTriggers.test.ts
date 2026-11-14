// @vitest-environment node
// Phase RS1 (stage #1384, decisions 1, 2 and 4): the `/code-review high` triggers at the Closing come
// from a script tested in a scratch git repository.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const SCRIPT = path.resolve('scripts/ci/riskTriggers.mjs');
let repo = '';

function git(...args: string[]): void {
  execFileSync(
    'git',
    [
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=t',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: repo, stdio: 'pipe' },
  );
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
}

function run(...args: string[]): { out: string; err: string; code: number } {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8' });
  return { out: r.stdout.trim(), err: r.stderr.trim(), code: r.status ?? -1 };
}

/** Changes the file in a new commit and runs the script against the base commit. */
function changed(file: string, from: string, to: string): string {
  const p = path.join(repo, file);
  writeFileSync(p, readFileSync(p, 'utf8').replace(from, to));
  git('commit', '-qam', 'change');
  return run('--base', 'base').out;
}

describe('riskTriggers.mjs (RS1)', () => {
  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'risk-'));
    git('init', '-q', '-b', 'main');
    write(
      'src/model/spec.ts',
      'export const SPEC_FORMAT_VERSION = 15;\nexport const X = 1;\n',
    );
    write('libraries/a.json', '{ "formatVersion": 3 }\n');
    write('docs/FLOW.md', 'One sentence.\n');
    write('.claude/skills/implementar-fila/painel/painel.py', 'x = 1\n');
    write('README.md', 'a\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('tag', 'base');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('SPEC_FORMAT_VERSION 15 → 16 in src/model/spec.ts is the formatVersion trigger', () => {
    expect(changed('src/model/spec.ts', '= 15', '= 16')).toBe(
      'gatilho: formatVersion: src/model/spec.ts',
    );
  });

  it('the formatVersion of a libraries/ JSON does not count', () => {
    expect(changed('libraries/a.json', '3', '4')).toBe('nenhum gatilho');
  });

  it('another line of src/model/spec.ts, without the constant, does not count', () => {
    expect(changed('src/model/spec.ts', 'X = 1', 'X = 2')).toBe('nenhum gatilho');
  });

  it('any change to docs/FLOW.md counts', () => {
    expect(changed('docs/FLOW.md', 'One sentence.', 'Another sentence.')).toBe(
      'gatilho: docs/FLOW.md: docs/FLOW.md',
    );
  });

  it('painel.py belongs to the implementar-fila trigger', () => {
    expect(changed('.claude/skills/implementar-fila/painel/painel.py', '1', '2')).toBe(
      'gatilho: implementar-fila: .claude/skills/implementar-fila/painel/painel.py',
    );
  });

  it('a version constant with a suffix or typed also counts; the array of accepted versions does not', () => {
    write(
      'src/model/components/componentFormat.ts',
      'export const COMPONENT_FORMAT_VERSION_REPEAT = 2;\nexport const COMPONENT_FORMAT_VERSIONS = [1, 2] as const;\n',
    );
    git('add', '-A');
    git('commit', '-qm', 'component');
    git('tag', '-f', 'base');
    expect(
      changed('src/model/components/componentFormat.ts', 'REPEAT = 2', 'REPEAT = 3'),
    ).toBe('gatilho: formatVersion: src/model/components/componentFormat.ts');
    git('tag', '-f', 'base');
    expect(
      changed('src/model/components/componentFormat.ts', '[1, 2]', '[1, 2, 3]'),
    ).toBe('nenhum gatilho');
  });

  it.each([
    ['.claude/skills/detalhar-backlog/SKILL.md', 'detalhar-backlog'],
    ['.claude/skills/supervisionar-fila/SKILL.md', 'supervisionar-fila'],
    ['.claude/skills/supervisionar-fila/custo.py', 'supervisionar-fila'],
    ['.claude/skills/via-rapida/SKILL.md', 'via-rapida'],
    ['docs/PROCESS.md', 'docs/PROCESS.md'],
    ['.github/workflows/ci.yml', '.github/workflows/'],
    ['scripts/release/a.mjs', 'scripts/release/'],
    ['scripts/ci/distBudget.mjs', 'scripts/ci/distBudget.mjs'],
    ['mcp/version.ts', 'mcp/version.ts'],
    ['src/store/session.ts', 'src/store/session.ts'],
    ['pwa/csp.ts', 'pwa/csp.ts'],
  ])('%s is the %s trigger', (file, id) => {
    write(file, 'a\n');
    git('add', '-A');
    git('commit', '-qm', 'trigger');
    git('tag', '-f', 'base');
    expect(changed(file, 'a', 'b')).toBe(`gatilho: ${id}: ${file}`);
  });

  it('scripts/ci/dist-budget.json, which the raise writes, is not a trigger (stage #1594, decision 3)', () => {
    write('scripts/ci/dist-budget.json', '{"indexHtmlMaxBytes": 1}\n');
    git('add', '-A');
    git('commit', '-qm', 'json');
    git('tag', '-f', 'base');
    expect(changed('scripts/ci/dist-budget.json', '1', '2')).toBe('nenhum gatilho');
  });

  it('a trigger file renamed out of the path still counts', () => {
    git('mv', 'docs/FLOW.md', 'docs/OTHER.md');
    git('commit', '-qm', 'rename');
    expect(run('--base', 'base').out).toBe('gatilho: docs/FLOW.md: docs/FLOW.md');
  });

  it('a usage error exits with 2 and the message on stderr', () => {
    for (const args of [[], ['--base'], ['--other', 'x'], ['--base', 'x', 'y']]) {
      const r = run(...args);
      expect(r.code).toBe(2);
      expect(r.err).not.toBe('');
    }
  });
});

describe('riskTriggers.mjs: TRIGGERS and the detalhar-backlog (decision 4)', () => {
  it('each TRIGGERS id appears in "Detailing effort", which cites the script', async () => {
    const { TRIGGERS } = (await import(path.resolve('scripts/ci/riskTriggers.mjs'))) as {
      TRIGGERS: Array<{ id: string }>;
    };
    expect(TRIGGERS.length).toBeGreaterThan(0);
    const effort = section(
      readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8'),
      '## Detailing effort',
    );
    for (const { id } of TRIGGERS) expect(effort).toContain(id);
    expect(effort).toContain('scripts/ci/riskTriggers.mjs');
  });
});
