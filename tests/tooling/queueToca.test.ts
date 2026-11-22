// @vitest-environment node
// Phase TA1 (stage #1812, decisions 1 to 7 and 12): the ficha's `toca` lists files and sections. A folder, `**`,
// a pattern outside the rule, a whole document with sections and an anchor outside the form give
// `ficha incompleta (toca: <citation>)`; the command `painel.py toca "<citations>"` checks a list. Phase TA2
// (decisions 10 and 12): the skill and doc texts state the rule only in the sections of the "Toca em:".
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-13T10:00:00Z';
// Tests that spawn dozens of painel.py subprocesses: headroom for CI under load.
const SUBPROCESS_TIMEOUT = 60_000;

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function slots(): string {
  const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Array<
    Record<string, unknown>
  >;
  return String(meta[0]?.vagas);
}

function reasons(): string[] {
  return slots().split(' · ').slice(1);
}

function ficha(dep: string, toca: string, schema = 'não'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=${schema} | formato=não | toca=${toca}`;
}

function stage(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${plan}`, ...extra);
}

/** The reason for candidate #2, alone in the queue, with the given `toca`. */
function reason(toca: string): string | undefined {
  stage('#2', ficha('nenhuma', toca));
  return reasons().find((m) => m.startsWith('#2 '));
}

const INVALID = [
  'src/model/',
  'src/model',
  'tests/tooling/**',
  'src/**/x.ts',
  'src/i18n/*',
  'tests/e2e/*Fixture.ts',
  'libraries/*/x.json',
  'docs/TESTING*.md',
  'README*.md',
  'docs/TESTING.md',
  'docs/ARCHITECTURE.md',
  'CLAUDE.md',
  '.claude/skills/implementar-fila/SKILL.md',
  'docs/TESTING.md#R9.12',
  'docs/FLOW.md#Parallel',
];

const VALID = [
  'src/model/markings.ts',
  'tests/storage/folder*.test.ts',
  'docs/TESTING.md#R9',
  'docs/TESTING.md#RP',
  'docs/TESTING.md#8-test-scripts',
  'docs/TESTING.md#inicio',
  'docs/ARCHITECTURE.md#performance',
  'CLAUDE.md#architecture-rules',
  'CLAUDE.md#inicio',
  '.claude/skills/implementar-fila/SKILL.md#parallel',
  'docs/does-not-exist.md',
  'viewer/README.md',
  'viewer/README.md#a',
  'package.json',
];

describe('painel.py — toca validation in the ficha (TA1, #1812)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'toca-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'folder, **, pattern outside the rule, whole document and anchor outside the form give ficha incompleta (toca: <citation>)',
    () => {
      for (const c of INVALID) {
        expect(reason(c), c).toBe(`#2 ficha incompleta (toca: ${c})`);
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'file, pattern with a prefix, section in the form, new document and new file are valid',
    () => {
      for (const c of [...VALID, 'src/x.ts (novo)']) {
        expect(reason(c), c).toBe('#2 começa');
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'what does not count is filtered before the validation',
    () => {
      for (const c of [
        'changelog/',
        'changelog/toca-por-arquivo.md',
        'docs/design-system/',
        'docs/design-system/x.md',
        'mcp/version.ts',
        'docs/TESTING-NUVEM.md#blocos',
        'docs/TESTING-NUVEM.md#full-round-in-blocks',
      ]) {
        expect(reason(`src/a.ts, ${c}`), c).toBe('#2 começa');
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it('order and combination: dep first, the first invalid citation is the one cited, fases after; ? stays (toca)', () => {
    stage('#1', ficha('?', 'docs/TESTING.md'));
    stage('#2', ficha('nenhuma', 'src/a.ts, src/model/, docs/TESTING.md'));
    stage('#3', `${ficha('nenhuma', 'src/b.ts, tests/**')} | fases=?`);
    stage('#4', ficha('nenhuma', '?'));
    expect(reasons().slice(0, 4)).toEqual([
      '#1 ficha incompleta (dep, toca: docs/TESTING.md)',
      '#2 ficha incompleta (toca: src/model/)',
      '#3 ficha incompleta (toca: tests/**, fases)',
      '#4 ficha incompleta (toca)',
    ]);
    expect(run('show', dir)).toContain('fichas a refazer: #1 #2 #3 #4');
  });

  it('a started stage with an old citation enters the fichas a refazer and keeps holding as today', () => {
    stage('#1', ficha('nenhuma', 'src/model/'), 'status=em andamento');
    stage('#2', ficha('nenhuma', 'src/model/a.ts'));
    stage('#3', ficha('nenhuma', 'docs/TESTING.md'), 'status=esperando dono');
    stage('#4', ficha('nenhuma', 'docs/TESTING.md#R9'));
    stage('#5', ficha('nenhuma', 'src/b.ts'));
    expect(reasons().slice(0, 3)).toEqual([
      '#2 arquivo src/model/a.ts com #1',
      '#4 arquivo docs/TESTING.md#R9 com #3',
      '#5 começa',
    ]);
    expect(run('show', dir)).toContain('fichas a refazer: #1 #3');
  });

  it('a ? in the middle of the list also leaves the ficha incomplete (review finding)', () => {
    stage('#1', ficha('nenhuma', 'src/a.ts, ?'));
    expect(reasons()[0]).toBe('#1 ficha incompleta (toca: ?)');
    expect(run('show', dir)).toContain('fichas a refazer: #1');
  });

  it('the exclusive does not go through the validation (only ? leaves it incomplete)', () => {
    stage('#1', ficha('nenhuma', 'tests/**, docs/FLOW.md'), 'exclusive=sim');
    expect(reasons()[0]).toBe('#1 começa');
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
    run('row', dir, '#1', `plan=${ficha('nenhuma', '?')}`);
    expect(reasons()[0]).toBe('#1 ficha incompleta (toca)');
    expect(run('show', dir)).toContain('fichas a refazer: #1');
  });

  it('a row that stops being exclusive goes through the validation', () => {
    stage('#1', ficha('nenhuma', 'tests/**'), 'exclusive=sim');
    run('row', dir, '#1', 'exclusive=');
    expect(reasons()[0]).toBe('#1 ficha incompleta (toca: tests/**)');
  });
});

describe('painel.py toca "<citations>" (TA1, decision 7)', () => {
  it('valid list: ok and code 0', () => {
    const r = runRaw('toca', 'src/a.ts, docs/TESTING.md#R9');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('ok\n');
    const all = runRaw('toca', VALID.join(', ') + ', `./src/x.ts` (novo), changelog/');
    expect(all.stdout).toBe('ok\n');
    expect(all.status).toBe(0);
  });

  it('one line per invalid citation, with the reason, and code 1', () => {
    const one = runRaw('toca', 'src/model/');
    expect(one.status).toBe(1);
    expect(one.stdout).toBe('inválida: src/model/ — pasta\n');
    const r = runRaw(
      'toca',
      'src/a.ts, src/model, `src/**/x.ts`, src/i18n/*, docs/TESTING*.md, docs/TESTING.md, docs/TESTING.md#R9.12, docs/FLOW.md#Parallel, docs/design-system/',
    );
    expect(r.status).toBe(1);
    expect(r.stdout.split('\n').filter(Boolean)).toEqual([
      'inválida: src/model — pasta',
      'inválida: src/**/x.ts — **',
      'inválida: src/i18n/* — padrão',
      'inválida: docs/TESTING*.md — padrão',
      'inválida: docs/TESTING.md — documento inteiro',
      'inválida: docs/TESTING.md#R9.12 — âncora',
      'inválida: docs/FLOW.md#Parallel — âncora',
    ]);
  });

  it('? says the ficha does not say and exits with 1, alone or in the middle of the list', () => {
    const r = runRaw('toca', '?');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('inválida: ? — a ficha não diz\n');
    const middle = runRaw('toca', 'src/a.ts, ?');
    expect(middle.status).toBe(1);
    expect(middle.stdout).toBe('inválida: ? — a ficha não diz\n');
  });

  it('the folder and the document are read at the repository root, not in the current directory', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'toca-cwd-'));
    try {
      const script = path.resolve(SCRIPT);
      const r = spawnSync('python3', [script, 'toca', 'src/model, CLAUDE.md'], {
        cwd,
        encoding: 'utf8',
      });
      expect(r.stdout.split('\n').filter(Boolean)).toEqual([
        'inválida: src/model — pasta',
        'inválida: CLAUDE.md — documento inteiro',
      ]);
      expect(r.status).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not enter the apply batch (code 2, like slug)', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'toca-'));
    try {
      run('init', dir);
      const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
        input: 'toca "src/a.ts"\n',
        encoding: 'utf8',
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('linha 1');
      expect(r.stderr).toContain('`toca` não entra no lote');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('painel.py toca — review fixes (CL1, #1812)', () => {
  const conflicts = (a: string, b: string): boolean => {
    const d = mkdtempSync(path.join(tmpdir(), 'toca-cl1-'));
    try {
      run('init', d);
      run('start', d, '--paralelo', '9');
      run(
        'row',
        d,
        '#1',
        'title=A',
        `plan=${ficha('nenhuma', a)}`,
        'status=em andamento',
      );
      run('row', d, '#2', 'title=B', `plan=${ficha('nenhuma', b)}`);
      const meta = JSON.parse(readFileSync(path.join(d, 'meta.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      return String(meta[0]?.vagas).includes('#2 arquivo');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  it(
    'finding 1: two globs that match the same file conflict; `?` and `[...]` are not accepted',
    () => {
      expect(conflicts('tests/a*x.ts', 'tests/ab*.ts')).toBe(true);
      expect(conflicts('tests/a*.ts', 'tests/b*.ts')).toBe(false);
      expect(conflicts('tests/a*.ts', 'tests/abc.ts')).toBe(true);
      for (const c of ['tests/a?.ts', 'tests/[ab].ts']) {
        const r = runRaw('toca', c);
        expect(r.status, c).toBe(1);
        expect(r.stdout, c).toBe(`inválida: ${c} — padrão\n`);
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it('finding 2: the lowercase script slug (#r9) is rejected and the case does not hide a conflict', () => {
    const r = runRaw('toca', 'docs/TESTING.md#r9');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('inválida: docs/TESTING.md#r9 — âncora\n');
  });

  it('finding 3: the anchor is checked against the `##` of the existing file', () => {
    const r = runRaw(
      'toca',
      'docs/FLOW.md#for-the-phase-sesion, docs/FLOW.md#for-the-phase-session, docs/FLOW.md#inicio, docs/novo-doc.md#qualquer',
    );
    expect(r.stdout).toBe('inválida: docs/FLOW.md#for-the-phase-sesion — âncora\n');
    expect(r.status).toBe(1);
  });

  it('finding 4: the Stage ficha text covers the exclusive line', () => {
    const queue = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
    const ficha = section(queue, '### Stage ficha');
    expect(ficha).toContain('exclusive=sim');
  });

  it('finding 5: the toca validation does not repeat the file system access', () => {
    const py = `
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("painel", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
n = {"c": 0}
for name in ("isdir", "isfile", "exists"):
    orig = getattr(os.path, name)
    def wrap(p, _o=orig):
        n["c"] += 1
        return _o(p)
    setattr(os.path, name, wrap)
plan = "dep=nenhuma | nivel=impact: low | mcp=não | schema=não | toca=docs/FLOW.md#inicio, src/a.ts, tests/a*.ts"
m.incomplete_fields(plan)
once = n["c"]
for _ in range(20):
    m.incomplete_fields(plan)
print(once, n["c"])
`;
    const r = spawnSync('python3', ['-c', py, SCRIPT], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    const [once, after] = r.stdout.trim().split(' ').map(Number);
    expect(after).toBe(once); // 20 repetitions do not access the disk again
  });

  it('finding 6: outside the expected tree the root comes from git or .git, or the check fails safe', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'toca-root-'));
    try {
      const copy = path.join(base, 'painel.py');
      writeFileSync(copy, readFileSync(SCRIPT));
      const repo = path.resolve('.');
      const inRepo = spawnSync('python3', [copy, 'toca', 'src/model, CLAUDE.md'], {
        cwd: repo,
        encoding: 'utf8',
      });
      expect(inRepo.stdout.split('\n').filter(Boolean)).toEqual([
        'inválida: src/model — pasta',
        'inválida: CLAUDE.md — documento inteiro',
      ]);
      const outside = spawnSync('python3', [copy, 'toca', 'src/model'], {
        cwd: base,
        encoding: 'utf8',
      });
      expect(outside.status).toBe(1);
      expect(outside.stdout).toBe(
        'inválida: src/model — raiz do repositório não achada\n',
      );
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('painel.py — standalone notes in toca (TN1, #2428)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'toca-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'two waiting fichas that share only a standalone note both start, with the note in any position',
    () => {
      for (const [first, second] of [
        ['a.ts,(novo),b.ts', 'c.ts,(novo)'],
        ['(novo),a.ts', 'c.ts,(novo)'],
        ['x.ts, (novo) ,y.ts', 'c.ts,(novo)'],
      ] as const) {
        run('init', dir, '--force');
        run('start', dir, '--paralelo', '9');
        stage('#1', ficha('nenhuma', first));
        stage('#2', ficha('nenhuma', second));
        expect(reasons().slice(0, 2), `${first} | ${second}`).toEqual([
          '#1 começa',
          '#2 começa',
        ]);
        expect(run('show', dir)).toContain('começar agora: #1 #2');
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it('a started stage with a standalone note does not hold a candidate; both rows are listed in fichas a refazer', () => {
    stage('#1', ficha('nenhuma', 'a.ts,(novo),b.ts'), 'status=em andamento');
    stage('#2', ficha('nenhuma', 'c.ts,(novo)'));
    expect(reasons()[0]).toBe('#2 começa');
    const out = run('show', dir);
    expect(out).toContain('começar agora: #2');
    expect(out).toContain('fichas a refazer: #1 #2');
  });

  it('a real file in common with a started stage still holds the candidate', () => {
    stage('#1', ficha('nenhuma', 'a.ts,(novo),b.ts'), 'status=em andamento');
    stage('#2', ficha('nenhuma', '(novo),b.ts'));
    expect(reasons()[0]).toBe('#2 arquivo b.ts com #1');
  });

  it('a note after its path keeps both citations (also with a comma inside) and is not listed', () => {
    stage('#1', ficha('nenhuma', 'x.ts (new, helper),y.ts'), 'status=em andamento');
    stage('#2', ficha('nenhuma', 'y.ts'));
    stage('#3', ficha('nenhuma', 'x.ts'));
    expect(reasons().slice(0, 2)).toEqual([
      '#2 arquivo y.ts com #1',
      '#3 arquivo x.ts com #1',
    ]);
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
  });

  it('concluída and recusada rows with a standalone note are not listed; waiting and started ones are', () => {
    stage('#1', ficha('nenhuma', 'a.ts,(novo)'), 'status=concluída');
    stage('#2', ficha('nenhuma', 'b.ts,(novo)'), 'status=recusada');
    stage('#3', ficha('nenhuma', 'c.ts,(novo)'), 'status=esperando dono');
    stage('#4', ficha('nenhuma', 'd.ts,(novo)'));
    expect(run('show', dir)).toContain('fichas a refazer: #3 #4');
  });

  it('a standalone note does not make the ficha incomplete', () => {
    stage('#1', ficha('nenhuma', 'a.ts,(novo),b.ts'));
    expect(reasons()[0]).toBe('#1 começa');
  });

  it('painel.py toca prints ok and conflito does not report the standalone note', () => {
    const r = runRaw('toca', 'a.ts,(novo),b.ts');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('ok\n');
    const c = runRaw('conflito', '(novo)', '--com', '#9=a.ts,(novo)');
    expect(c.status).toBe(0);
    expect(c.stdout).toBe('livre\n');
  });
});

describe('painel.py — nested notes and only ignored citations in toca (GW3, #2562, decisions 7 and 8)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'toca-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const NESTED = ['a.ts,(novo (ver #12)),b.ts', 'a.ts,(n)(m),b.ts'];

  it('a nested or adjacent standalone note is no citation: complete ficha, listed to redo, holds no slot', () => {
    for (const toca of NESTED) {
      run('init', dir, '--force');
      run('start', dir, '--paralelo', '9');
      stage('#1', ficha('nenhuma', toca), 'status=em andamento');
      stage('#2', ficha('nenhuma', 'c.ts,(novo (x))'));
      expect(reasons()[0], toca).toBe('#2 começa');
      expect(run('show', dir), toca).toContain('fichas a refazer: #1 #2');
      stage('#3', ficha('nenhuma', toca));
      expect(reasons().join('|'), toca).not.toContain('ficha incompleta');
      const r = runRaw('toca', toca);
      expect([r.status, r.stdout], toca).toEqual([0, 'ok\n']);
    }
  });

  it('a note nested after its path is dropped whole: x.ts and b.ts count and no ) is left behind', () => {
    const toca = 'x.ts (novo (ver #12)),b.ts';
    stage('#1', ficha('nenhuma', toca), 'status=em andamento');
    stage('#2', ficha('nenhuma', 'x.ts'));
    stage('#3', ficha('nenhuma', 'b.ts'));
    expect(reasons().slice(0, 2)).toEqual([
      '#2 arquivo x.ts com #1',
      '#3 arquivo b.ts com #1',
    ]);
    const r = runRaw('toca', toca);
    expect([r.status, r.stdout]).toEqual([0, 'ok\n']);
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
  });

  it('text outside the groups keeps it a citation: (a) x.ts (b) is neither a note nor listed', () => {
    stage('#1', ficha('nenhuma', '(a) x.ts (b)'), 'status=em andamento');
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
    expect(runRaw('toca', '(a) x.ts (b)').stdout).toBe('ok\n');
  });

  it('the plain TN1 cases pass unchanged', () => {
    for (const toca of ['a.ts,(novo),b.ts', 'x.ts (new, helper)']) {
      const r = runRaw('toca', toca);
      expect([r.status, r.stdout], toca).toEqual([0, 'ok\n']);
    }
  });

  it('a toca with only ignored citations is ficha incompleta (toca), also on an exclusive row', () => {
    for (const toca of ['changelog/x.md,docs/design-system/x.md', 'mcp/version.ts']) {
      stage('#2', ficha('nenhuma', toca));
      expect(
        reasons().find((m) => m.startsWith('#2 ')),
        toca,
      ).toContain('ficha incompleta (toca)');
      stage('#2', ficha('nenhuma', toca), 'exclusive=sim');
      expect(
        reasons().find((m) => m.startsWith('#2 ')),
        toca,
      ).toContain('ficha incompleta (toca)');
    }
  });

  it('a started row with only ignored citations conflicts with every candidate', () => {
    stage(
      '#1',
      ficha('nenhuma', 'changelog/x.md,docs/design-system/x.md'),
      'status=em andamento',
    );
    stage('#2', ficha('nenhuma', 'src/other.ts'));
    expect(reasons()[0]).toBe('#2 arquivo ? com #1');
  });

  it('painel.py toca refuses only ignored citations with the line and code 1', () => {
    const r = runRaw('toca', 'changelog/x.md');
    expect([r.status, r.stdout]).toEqual([
      1,
      'inválida: changelog/x.md — only ignored citations\n',
    ]);
  });

  it('an append-only citation is not ignored: a toca with only append-only citations stays complete (#2314)', () => {
    expect(reason('docs/MCP.md#tools')).toBe('#2 começa');
    const r = runRaw('toca', 'docs/MCP.md#tools');
    expect([r.status, r.stdout]).toEqual([0, 'ok\n']);
  });
});

describe('the texts of the standalone note (TN1, #2428, decision 7)', () => {
  const queue = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

  it('the "Parallel" and the "Panel" say fichas a refazer and carry the example ,(novo),', () => {
    for (const heading of ['## Parallel', '## Panel']) {
      const text = section(queue, heading);
      expect(text, heading).toContain('fichas a refazer');
      expect(text, heading).toContain(',(novo),');
    }
  });
});

describe('the texts of the toca rule (TA2, #1812, decision 12)', () => {
  const queue = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const detail = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const process = readFileSync('docs/PROCESS.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');

  it('the "Stage ficha" says to run painel.py toca, cites #inicio and says "never a folder"', () => {
    const ficha = section(queue, '### Stage ficha');
    expect(ficha).toContain('painel.py toca');
    expect(ficha).toContain('#inicio');
    expect(ficha).toContain('never a folder');
  });

  it('the "Parallel" gives the reason ficha incompleta (toca: <citation>)', () => {
    expect(section(queue, '## Parallel')).toContain('ficha incompleta (toca:');
  });

  it('the "Panel" lists the command painel.py toca', () => {
    expect(section(queue, '## Panel')).toContain('painel.py toca');
  });

  it('the "3. Per stage" cites the invalid citation and, in "Between stages", the redo without editing an issue', () => {
    const perStage = section(queue, '## 3. Per stage');
    expect(perStage).toContain('invalid citation');
    const between7 = perStage.slice(perStage.indexOf('7. **Between stages:**'));
    expect(between7).toContain('fichas a refazer');
    expect(between7).toContain('"Toca em:" of the phase sub-issues');
    expect(between7).toContain('without editing');
  });

  it('the detalhar-backlog briefing checks the "Toca em:" with painel.py toca and cites #inicio', () => {
    const briefing = between(detail, '3. Draft the whole plan', '5. Product decision');
    expect(briefing).toContain('painel.py toca');
    expect(briefing).toContain('#inicio');
    // the check is a sentence of its own, after the list of what each phase carries (review: not in the middle of it)
    expect(briefing.indexOf('painel.py toca')).toBeGreaterThan(
      briefing.indexOf('the checkboxes and the acceptance'),
    );
  });

  it('docs/PROCESS.md and docs/FLOW.md say "never a folder"', () => {
    const line = process.split('\n').find((l) => l.includes('**Detailing a stage:**'));
    expect(line).toContain('never a folder');
    expect(section(flow, '## For the owner, in the three chats')).toContain(
      'never a folder',
    );
  });
});
