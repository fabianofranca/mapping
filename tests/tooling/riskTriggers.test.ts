// @vitest-environment node
// Fase RS1 (etapa #1384, decisões 1, 2 e 4): os gatilhos da `/code-review high` no Fechamento saem
// de um script testado num repositório git de rascunho.
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

/** Muda o arquivo num commit novo e roda o script contra o commit-base. */
function changed(file: string, from: string, to: string): string {
  const p = path.join(repo, file);
  writeFileSync(p, readFileSync(p, 'utf8').replace(from, to));
  git('commit', '-qam', 'muda');
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
    write('docs/FLOW.md', 'Uma frase.\n');
    write('.claude/skills/implementar-fila/painel/painel.py', 'x = 1\n');
    write('README.md', 'a\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('tag', 'base');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('SPEC_FORMAT_VERSION 15 → 16 em src/model/spec.ts é o gatilho formatVersion', () => {
    expect(changed('src/model/spec.ts', '= 15', '= 16')).toBe(
      'gatilho: formatVersion: src/model/spec.ts',
    );
  });

  it('o formatVersion de um JSON de libraries/ não conta', () => {
    expect(changed('libraries/a.json', '3', '4')).toBe('nenhum gatilho');
  });

  it('outra linha de src/model/spec.ts, sem a constante, não conta', () => {
    expect(changed('src/model/spec.ts', 'X = 1', 'X = 2')).toBe('nenhum gatilho');
  });

  it('qualquer mudança no docs/FLOW.md conta', () => {
    expect(changed('docs/FLOW.md', 'Uma frase.', 'Outra frase.')).toBe(
      'gatilho: docs/FLOW.md: docs/FLOW.md',
    );
  });

  it('o painel.py é do gatilho implementar-fila', () => {
    expect(changed('.claude/skills/implementar-fila/painel/painel.py', '1', '2')).toBe(
      'gatilho: implementar-fila: .claude/skills/implementar-fila/painel/painel.py',
    );
  });

  it('erro de uso sai com 2 e a mensagem no stderr', () => {
    for (const args of [[], ['--base'], ['--outra', 'x'], ['--base', 'x', 'y']]) {
      const r = run(...args);
      expect(r.code).toBe(2);
      expect(r.err).not.toBe('');
    }
  });
});

describe('riskTriggers.mjs: TRIGGERS e o detalhar-backlog (decisão 4)', () => {
  it('cada id de TRIGGERS aparece em "Esforço do detalhamento", que cita o script', async () => {
    const { TRIGGERS } = (await import(path.resolve('scripts/ci/riskTriggers.mjs'))) as {
      TRIGGERS: Array<{ id: string }>;
    };
    expect(TRIGGERS.length).toBeGreaterThan(0);
    const esforco = section(
      readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8'),
      '## Esforço do detalhamento',
    );
    for (const { id } of TRIGGERS) expect(esforco).toContain(id);
    expect(esforco).toContain('scripts/ci/riskTriggers.mjs');
  });
});
