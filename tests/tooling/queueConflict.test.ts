// @vitest-environment node
// Phase VR1 (stage #1864, decision 9): `painel.py conflito "<toca>" [--pasta <dir>] [--com "#N=<toca>"]…` checks
// a "Toca em:" against the folder's started and unmerged stages, the ones the `show` lists in `começar agora:`
// and each `--com`, with the same calculation as the queue. Read-only: `livre` (0), `conflito: … com #N (…)` (1) or
// `inválida: <citation> — <reason>` (2).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-13T10:00:00Z';
const NO_FULL_SLOTS = '9';
const SUBPROCESS_TIMEOUT = 30_000;
const SECTION = 'docs/FLOW.md#ci-and-preview';

let dir = '';

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function run(...args: string[]): string {
  const r = runRaw(...args);
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr}${r.stdout}`);
  return r.stdout;
}

function ficha(toca: string): string {
  return `dep=nenhuma | nivel=impact: low | mcp=não | schema=não | toca=${toca}`;
}

function stage(issue: string, toca: string, ...extra: string[]) {
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${ficha(toca)}`, ...extra);
}

function conflict(toca: string, ...extra: string[]) {
  return runRaw('conflito', toca, ...extra);
}

// The `APPEND_ONLY` list of painel.py (AO1, #2314), read by importing the module.
function appendOnlyList(): string[] {
  const code =
    'import json, sys; sys.path.insert(0, ".claude/skills/implementar-fila/painel"); import painel; print(json.dumps(list(painel.APPEND_ONLY)))';
  return JSON.parse(
    execFileSync('python3', ['-I', '-c', code], { encoding: 'utf8' }),
  ) as string[];
}

function files(): string[] {
  return ['queue', 'meta', 'log'].map((n) =>
    readFileSync(path.join(dir, `${n}.json`), 'utf8'),
  );
}

describe('painel.py conflito (VR1, #1864)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'conflito-'));
    run('init', dir);
    run('start', dir, '--paralelo', NO_FULL_SLOTS);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('without --pasta or --com it gives livre and 0', () => {
    const r = conflict(SECTION);
    expect(r.stdout).toBe('livre\n');
    expect(r.status).toBe(0);
  });

  it(
    'an em andamento stage with the same section gives conflito, and a different section of the same .md gives livre',
    () => {
      stage('#7', SECTION, 'status=em andamento', 'started=2026-11-13T09:00:00Z');
      const r = conflict(SECTION, '--pasta', dir);
      expect(r.stdout).toBe(`conflito: ${SECTION} com #7 (em andamento)\n`);
      expect(r.status).toBe(1);
      const other = conflict('docs/FLOW.md#fix-phase', '--pasta', dir);
      expect(other.stdout).toBe('livre\n');
      expect(other.status).toBe(0);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'esperando dono and falhou count; concluída and aguardando without started do not',
    () => {
      stage('#1', 'src/a.ts', 'status=esperando dono', 'started=2026-11-13T09:00:00Z');
      stage('#2', 'src/b.ts', 'status=falhou', 'started=2026-11-13T09:00:00Z');
      stage(
        '#3',
        'src/c.ts',
        'status=concluída',
        'started=2026-11-13T09:00:00Z',
        'ended=2026-11-13T09:30:00Z',
      );
      stage('#4', 'src/d.ts', 'hold=pausada pelo dono');
      const r = conflict('src/a.ts, src/b.ts, src/c.ts, src/d.ts', '--pasta', dir);
      expect(r.stdout.trim().split('\n')).toEqual([
        'conflito: src/a.ts com #1 (esperando dono)',
        'conflito: src/b.ts com #2 (falhou)',
      ]);
      expect(r.status).toBe(1);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'aguardando with started counts; a row in meta.merged that is still started follows the show (counts)',
    () => {
      stage('#5', 'src/e.ts', 'started=2026-11-13T09:00:00Z');
      stage('#6', 'src/f.ts', 'status=em andamento', 'started=2026-11-13T09:00:00Z');
      run('merged', dir, '#6');
      stage('#8', 'src/f.ts');
      expect(run('show', dir)).toContain('#8 arquivo src/f.ts com #6');
      const r = conflict('src/e.ts, src/f.ts', '--pasta', dir);
      expect(r.stdout.trim().split('\n')).toEqual([
        'conflito: src/e.ts com #5 (aguardando)',
        'conflito: src/f.ts com #6 (em andamento)',
      ]);
      expect(r.status).toBe(1);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'the --com of a stage that is also in the folder is compared, not discarded',
    () => {
      stage('#7', 'src/a.ts', 'status=em andamento', 'started=2026-11-13T09:00:00Z');
      const r = conflict('src/b.ts', '--pasta', dir, '--com', '#7=src/b.ts');
      expect(r.stdout).toBe('conflito: src/b.ts com #7 (fora do painel)\n');
      expect(r.status).toBe(1);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'the stage that the show lists in começar agora counts',
    () => {
      stage('#8', 'src/g.ts');
      expect(run('show', dir)).toContain('começar agora: #8');
      const r = conflict('src/g.ts', '--pasta', dir);
      expect(r.stdout).toBe('conflito: src/g.ts com #8 (começa agora)\n');
      expect(r.status).toBe(1);
    },
    SUBPROCESS_TIMEOUT,
  );

  it('--com with a file in common gives conflito fora do painel, and several --com add up', () => {
    const r = conflict(
      'src/a.ts',
      '--com',
      '#9=src/a.ts, src/z.ts',
      '--com',
      '#10=src/y.ts',
    );
    expect(r.stdout).toBe('conflito: src/a.ts com #9 (fora do painel)\n');
    expect(r.status).toBe(1);
    const two = conflict(
      'src/a.ts, src/y.ts',
      '--com',
      '#9=src/a.ts',
      '--com',
      '#10=src/y.ts',
    );
    expect(two.stdout.trim().split('\n')).toEqual([
      'conflito: src/a.ts com #9 (fora do painel)',
      'conflito: src/y.ts com #10 (fora do painel)',
    ]);
    expect(two.status).toBe(1);
  });

  it('what the ficha does not count stays out: changelog, design system, mcp/version.ts and the blocks table', () => {
    const ignored = [
      'changelog/x.md',
      'docs/design-system/x.md',
      'mcp/version.ts',
      'docs/TESTING-NUVEM.md#blocos',
    ].join(', ');
    const r = conflict(ignored, '--com', `#9=${ignored}`);
    expect(r.stdout).toBe('livre\n');
    expect(r.status).toBe(0);
  });

  it(
    'an append-only citation shared with an em andamento stage gives livre, the same through --com (AO1, #2314)',
    () => {
      stage(
        '#7',
        'docs/MCP.md#tools, src/i18n/en-US.ts',
        'status=em andamento',
        'started=2026-11-13T09:00:00Z',
      );
      const folder = conflict('docs/MCP.md#tools, src/i18n/en-US.ts', '--pasta', dir);
      expect(folder.stdout).toBe('livre\n');
      expect(folder.status).toBe(0);
      const all = appendOnlyList();
      const com = conflict(all.join(', '), '--com', `#9=${all.join(', ')}`);
      expect(com.stdout).toBe('livre\n');
      expect(com.status).toBe(0);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'a real citation shared in the same call still gives conflito: <real> com #N (AO1, #2314)',
    () => {
      stage(
        '#7',
        'docs/MCP.md#tools, src/a.ts',
        'status=em andamento',
        'started=2026-11-13T09:00:00Z',
      );
      const folder = conflict('docs/MCP.md#tools, src/a.ts', '--pasta', dir);
      expect(folder.stdout).toBe('conflito: src/a.ts com #7 (em andamento)\n');
      expect(folder.status).toBe(1);
      const com = conflict(
        'src/i18n/pt-BR.ts, src/b.ts',
        '--com',
        '#9=src/i18n/pt-BR.ts, src/b.ts',
      );
      expect(com.stdout).toBe('conflito: src/b.ts com #9 (fora do painel)\n');
      expect(com.status).toBe(1);
    },
    SUBPROCESS_TIMEOUT,
  );

  it('an invalid citation gives inválida: <citation> — <reason> and 2, without checking conflict', () => {
    const folder = conflict('src/model/', '--com', '#9=src/model/a.ts');
    expect(folder.stdout).toBe('inválida: src/model/ — pasta\n');
    expect(folder.status).toBe(2);
    const wholeDoc = conflict(`src/a.ts, docs/FLOW.md`);
    expect(wholeDoc.stdout).toBe('inválida: docs/FLOW.md — documento inteiro\n');
    expect(wholeDoc.status).toBe(2);
  });

  it('--com without the #N=<toca> format is a usage error (2)', () => {
    const r = conflict('src/a.ts', '--com', 'src/a.ts');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('erro:');
  });

  it('apply refuses conflito like the other read-only ones', () => {
    stage('#7', 'src/a.ts');
    const r = spawnSync('python3', [SCRIPT, '--now', NOW, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'conflito "src/a.ts"\n',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('`conflito` não entra no lote');
  });

  it(
    'nothing is written: the folder files stay the same',
    () => {
      stage('#7', SECTION, 'status=em andamento', 'started=2026-11-13T09:00:00Z');
      stage('#8', 'src/g.ts');
      const before = files();
      conflict(SECTION, '--pasta', dir, '--com', '#9=src/g.ts');
      conflict('src/model/', '--pasta', dir);
      expect(files()).toEqual(before);
    },
    SUBPROCESS_TIMEOUT,
  );

  it('the help and the docstring describe the subcommand', () => {
    const docstring = readFileSync(SCRIPT, 'utf8');
    expect(docstring).toContain('conflito "<toca>" [--pasta <dir>] [--com "#N=<toca>"]');
    const help = runRaw('conflito', '-h').stdout;
    expect(help).toContain('--pasta');
    expect(help).toContain('--com');
  });
});
