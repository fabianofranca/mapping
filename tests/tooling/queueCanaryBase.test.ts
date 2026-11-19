// @vitest-environment node
// Phase CB1 (stage #2260, decisions 1 to 9): the canary baseline (`canario base`, the effective "before"), the `import` that
// freezes the baseline and keeps the canary's sessions, the `sem base` verdict, the cost per tested step and the
// `xFalso` and `naoExec` signals. The panel's output is Portuguese (frozen vocabulary), so the file is a guard block.
// portuguese-guard:begin expected panel output and session kinds, frozen vocabulary of decision 16 of #741
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const SUBPROCESS_TIMEOUT = 30_000;

let root = '';
let dir = '';
let old = '';

type Entry = Record<string, unknown>;

function runAt(now: string, ...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
}

function tryRunAt(now: string, ...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function readJson(d: string, name: string): Entry[] {
  return JSON.parse(readFileSync(path.join(d, `${name}.json`), 'utf8')) as Entry[];
}

function metaOf(d: string): Entry {
  return readJson(d, 'meta')[0]!;
}

function canary(id: string, d = dir): Entry {
  const hit = ((metaOf(d).canarios ?? []) as Entry[]).find((c) => c.id === id);
  if (!hit) throw new Error(`no canary ${id}`);
  return hit;
}

function summary(id: string): Entry {
  return canary(id).resumo as Entry;
}

function side(id: string, which: 'antes' | 'canario'): Entry {
  return summary(id)[which] as Entry;
}

function sessionEntry(d: string, sid: string): Entry | undefined {
  return ((metaOf(d).sessions ?? []) as Entry[]).find((e) => e.id === sid);
}

function snapshot(d = dir): string {
  return ['queue', 'meta', 'log']
    .map((n) => readFileSync(path.join(d, `${n}.json`), 'utf8'))
    .join('\n');
}

const D = (n: number): string => `2026-11-${String(n).padStart(2, '0')}T12:00:00Z`;
const START = D(12);

const FICHA =
  'dep=nenhuma | nivel=impact: low | mcp=não | schema=não | epico=epic/x | fases=CB1:#1:high | toca=.claude/skills/implementar-fila/painel/painel.py | testador=nenhum ; visual=nenhuma ; Sonnet medium';

function initPanel(d: string): void {
  runAt('2026-11-04T10:00:00Z', 'init', d);
  for (const n of ['#10', '#20']) {
    runAt('2026-11-04T10:00:00Z', 'row', d, n, `title=Stage ${n}`, `plan=${FICHA}`);
  }
}

interface Seed {
  at: string;
  id: string;
  issue?: string;
  kind?: string;
  usd: number;
  sinais?: string[];
  model?: string;
  effort?: string;
  canario?: string;
  noCost?: boolean;
}

/** A session in a panel, with the real `session`, `cost` and `sinal` commands. */
function seed(d: string, s: Seed): void {
  const kind = s.kind ?? 'testador';
  runAt(
    s.at,
    'session',
    d,
    s.issue ?? '#10',
    s.id,
    `kind=${kind}`,
    `label=${s.id.toUpperCase()}`,
    ...(s.canario ? [`canario=${s.canario}`] : []),
  );
  if (!s.noCost) {
    runAt(
      s.at,
      'cost',
      d,
      s.id,
      `usd=${s.usd}`,
      'ctx=1000',
      `model=${s.model ?? 'claude-sonnet-5-5'}`,
      `effort=${s.effort ?? 'medium'}`,
    );
  }
  if (s.sinais?.length) runAt(s.at, 'sinal', d, s.id, ...s.sinais);
}

function addC(extra: string[] = [], n = 2, volta = 2): string {
  return runAt(
    START,
    'canario',
    dir,
    'add',
    'C',
    'papel=testador',
    'de=Sonnet medium',
    'modelo=haiku',
    `n=${n}`,
    `volta=${volta}`,
    ...extra,
  );
}

function addB(): string {
  return runAt(
    START,
    'canario',
    dir,
    'add',
    'B',
    'papel=fase',
    'de=Sonnet high',
    'esforco=medium',
    'n=1',
    'volta=2',
  );
}

/** The old panel's tester side: two Sonnet medium sessions (US$ 8 for 10 steps and US$ 10 for 6), stage #10 merged. */
function seedOldTesters(): void {
  seed(old, { at: D(5), id: 'o1', usd: 8, sinais: ['ok=10'] });
  seed(old, { at: D(6), id: 'o2', usd: 10, sinais: ['ok=5', 'falha=1'] });
  runAt(D(7), 'merged', old, '#10');
}

function baseFrom(
  extra: string[] = [],
  at = D(13),
  id = 'C',
): { code: number | null; out: string; err: string } {
  return tryRunAt(at, 'canario', dir, 'base', id, old, ...extra);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'painel-base-'));
  dir = path.join(root, 'new');
  old = path.join(root, 'old');
  initPanel(dir);
  initPanel(old);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('decision 2: canario base', () => {
  it(
    'computes the side over the old sessions of the role, `de` and filter before `inicio`, with the old ruler, and prints the count',
    () => {
      seedOldTesters();
      // outside the side: another model, another role, and one created after the canary started
      seed(old, { at: D(6), id: 'o3', usd: 1, model: 'claude-haiku-5-5' });
      seed(old, { at: D(6), id: 'o4', usd: 30, kind: 'fase', effort: 'high' });
      seed(old, { at: D(13), id: 'o5', usd: 50, sinais: ['ok=1'] });
      // the old panel's escaped defect makes both decided sessions rework (the new panel has none)
      runAt(D(7), 'escapado', old, '#99', 'etapa=#10', 'sev=high');
      addC();
      const r = baseFrom();
      expect(r.code).toBe(0);
      expect(r.out).toContain('base: 2 sessões');
      expect(canary('C').base).toEqual({
        sessoes: 2,
        medianaSessao: 9,
        medianaEtapa: 18,
        decididas: 2,
        comRetrabalho: 2,
        passos: 16,
        usdPorPasso: 1.125,
        xFalso: null,
        naoExec: null,
        xFalsoPct: null,
        naoExecPct: null,
        fonte: 'painel anterior',
        at: D(13),
      });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'keeps the old folder untouched and takes `fonte=<text>`',
    () => {
      seedOldTesters();
      addC();
      const before = snapshot(old);
      expect(baseFrom(['fonte=https://claude.ai/code/artifact/xyz']).code).toBe(0);
      expect(canary('C').base).toMatchObject({
        fonte: 'https://claude.ai/code/artifact/xyz',
      });
      expect(snapshot(old)).toBe(before);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'with 0 sessions prints `base: 0 sessões`, exits with code 1 and writes nothing',
    () => {
      seed(old, { at: D(5), id: 'o1', usd: 3, kind: 'fase', effort: 'high' });
      addC();
      const before = snapshot();
      const r = baseFrom();
      expect(r.code).toBe(1);
      expect(r.out).toContain('base: 0 sessões');
      expect(snapshot()).toBe(before);
      expect(canary('C')).not.toHaveProperty('base');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    '`--nenhuma` writes `fonte: nenhuma` with no sessions and a repeat replaces the base',
    () => {
      seedOldTesters();
      addC();
      expect(tryRunAt(D(13), 'canario', dir, 'base', 'C', '--nenhuma').code).toBe(0);
      expect(canary('C').base).toEqual({ fonte: 'nenhuma', sessoes: 0 });
      expect(baseFrom(['fonte=primeira']).code).toBe(0);
      expect(baseFrom(['fonte=segunda'], D(14)).code).toBe(0);
      expect(canary('C').base).toMatchObject({ fonte: 'segunda', at: D(14), sessoes: 2 });
      expect(tryRunAt(D(15), 'canario', dir, 'base', 'C', '--nenhuma').code).toBe(0);
      expect(canary('C').base).toEqual({ fonte: 'nenhuma', sessoes: 0 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'an unknown canary, a missing folder or file and a bad field are code 2 and write nothing',
    () => {
      seedOldTesters();
      addC();
      const before = snapshot();
      const empty = path.join(root, 'empty');
      mkdirSync(empty);
      const cases: string[][] = [
        ['base', 'Z', old],
        ['base', 'C', path.join(root, 'nao-existe')],
        ['base', 'C', empty],
        ['base', 'C', old, 'origem=x'],
        ['base', 'C'],
        ['base'],
      ];
      for (const args of cases) {
        const r = tryRunAt(D(13), 'canario', dir, ...args);
        expect(r.code, args.join(' ')).toBe(2);
      }
      expect(snapshot()).toBe(before);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'inside `apply` it is code 2 and nothing of the batch is written',
    () => {
      seedOldTesters();
      addC();
      const before = snapshot();
      const batch = path.join(root, 'batch.txt');
      writeFileSync(batch, `current "texto novo"\ncanario base C ${old}\n`);
      const r = tryRunAt(D(13), 'apply', dir, batch);
      expect(r.code).toBe(2);
      expect(r.err).toContain('canario base');
      expect(snapshot()).toBe(before);
      expect(metaOf(dir).current).not.toBe('texto novo');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('decision 1: the effective "before"', () => {
  it(
    'a canary with no "before" session on the panel uses its `base`',
    () => {
      seedOldTesters();
      addC();
      baseFrom(['fonte=Lxx1VdqDosgPBBJsqp7Vt6']);
      expect(side('C', 'antes')).toMatchObject({
        fonte: 'Lxx1VdqDosgPBBJsqp7Vt6',
        sessoes: 2,
        medianaSessao: 9,
      });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'with "before" sessions on the panel it uses them (`fonte: painel`), even with a base',
    () => {
      seedOldTesters();
      seed(dir, { at: D(10), id: 'p1', usd: 4, sinais: ['ok=2'] });
      addC();
      baseFrom();
      expect(side('C', 'antes')).toMatchObject({
        fonte: 'painel',
        sessoes: 1,
        medianaSessao: 4,
      });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'with neither it is the empty side with `fonte: nenhuma`',
    () => {
      addC();
      expect(side('C', 'antes')).toMatchObject({
        fonte: 'nenhuma',
        sessoes: 0,
        medianaSessao: null,
      });
    },
    SUBPROCESS_TIMEOUT,
  );
});

/** The old panel's canary C with two counted sessions, a fix and a "before" session, as the import reads it. */
function seedOldCanary(): void {
  runAt(
    D(8),
    'canario',
    old,
    'add',
    'C',
    'papel=testador',
    'de=Sonnet medium',
    'modelo=haiku',
    'n=3',
    'volta=2',
  );
  seed(old, { at: D(3), id: 'b1', issue: '#20', usd: 8, sinais: ['ok=10'] });
  runAt(D(4), 'merged', old, '#20');
  seed(old, {
    at: D(9),
    id: 'c1',
    usd: 2,
    sinais: ['ok=4', 'falha=1', 'naoExec=0'],
    canario: 'C',
  });
  seed(old, { at: D(10), id: 'c2', usd: 3, sinais: ['ok=6'], canario: 'C' });
  seed(old, { at: D(11), id: 'fx', kind: 'correção', usd: 5, sinais: ['ci=1'] });
  seed(old, { at: D(11), id: 'other', issue: '#20', usd: 7 });
  runAt(D(12), 'merged', old, '#10');
}

function importPanel(): void {
  rmSync(dir, { recursive: true, force: true });
  runAt(D(14), 'init', dir);
  runAt(D(14), 'import', dir, old);
}

describe('decisions 3 and 4: import', () => {
  it(
    'freezes the old panel\'s "before" as `base` with `fonte: import` and keeps `k/n` and the canary side',
    () => {
      seedOldCanary();
      importPanel();
      const c = canary('C');
      expect(c.base).toMatchObject({
        fonte: 'import',
        sessoes: 1,
        medianaSessao: 8,
        passos: 10,
      });
      expect(c.contadas).toBe(2);
      expect(side('C', 'antes')).toMatchObject({ fonte: 'import', sessoes: 1 });
      expect(side('C', 'canario')).toMatchObject({ sessoes: 2, passos: 11 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'an old canary with only a `base` keeps it',
    () => {
      runAt(
        D(8),
        'canario',
        old,
        'add',
        'C',
        'papel=testador',
        'de=Sonnet medium',
        'modelo=haiku',
        'n=3',
        'volta=2',
      );
      runAt(D(8), 'canario', old, 'base', 'C', '--nenhuma');
      importPanel();
      expect(canary('C').base).toEqual({ fonte: 'nenhuma', sessoes: 0 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "brings the canary's sessions whole and the others of those stages without `cost`; the `custo:` counts only the canary's",
    () => {
      seedOldCanary();
      importPanel();
      const c1 = sessionEntry(dir, 'c1');
      expect(c1).toMatchObject({
        canario: 'C',
        cost: { usd: 2 },
        sinais: { ok: 4, falha: 1 },
      });
      expect(sessionEntry(dir, 'c2')).toHaveProperty('cost');
      const fx = sessionEntry(dir, 'fx');
      expect(fx).toMatchObject({
        issue: '#10',
        kind: 'correção',
        label: 'FX',
        sinais: { ci: 1 },
      });
      expect(fx).not.toHaveProperty('cost');
      // sessions of other stages stay behind
      expect(sessionEntry(dir, 'b1')).toBeUndefined();
      expect(sessionEntry(dir, 'other')).toBeUndefined();
      expect(runAt(D(15), 'show', dir)).toContain('custo: US$ 5.00 em 2 sessões');
      const log = readJson(dir, 'log').map((l) => String(l.text));
      expect(log[0]).toContain('sessões de canário 2');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "a fix of the canary's stage still counts as rework of canary B after the import",
    () => {
      runAt(
        D(8),
        'canario',
        old,
        'add',
        'B',
        'papel=fase',
        'de=Sonnet high',
        'esforco=medium',
        'n=3',
        'volta=2',
      );
      seed(old, {
        at: D(9),
        id: 'f1',
        kind: 'fase',
        usd: 6,
        effort: 'high',
        sinais: ['ci=0'],
        canario: 'B',
      });
      seed(old, { at: D(10), id: 'fx', kind: 'correção', usd: 2 });
      runAt(D(11), 'merged', old, '#10');
      importPanel();
      expect(canary('B').retrabalhos).toEqual(['fx']);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'an old panel without canaries still brings no session and the log line is the usual one',
    () => {
      seed(old, { at: D(5), id: 'o1', usd: 8, sinais: ['ok=10'] });
      importPanel();
      expect(metaOf(dir).sessions ?? []).toEqual([]);
      const log = readJson(dir, 'log').map((l) => String(l.text));
      expect(log[0]).not.toContain('sessões de canário');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('decision 5: the verdict', () => {
  /** Canary C (n=1) with one member of `usd` and `sinais`, its stage merged so that it is `encerrado`. */
  function finishC(usd: number, sinais: string[] = ['ok=10']): void {
    seed(dir, {
      at: D(13),
      id: 'c1',
      usd,
      model: 'claude-haiku-5-5',
      sinais,
      canario: 'C',
    });
    runAt(D(14), 'merged', dir, '#10');
  }

  it(
    '`sem base` with an empty "before" in `ativo`, `encerrado` and `terminado pelo dono`',
    () => {
      addC([], 1);
      expect(summary('C').veredito).toBe('sem base');
      seed(dir, { at: D(13), id: 'c1', usd: 1, sinais: ['ok=10'], canario: 'C' });
      runAt(D(14), 'merged', dir, '#10');
      expect(canary('C').estado).toBe('encerrado');
      expect(summary('C').veredito).toBe('sem base');
      runAt(
        D(15),
        'canario',
        dir,
        'add',
        'D',
        'papel=testador',
        'de=Haiku medium',
        'modelo=haiku',
        'esforco=low',
        'n=1',
        'volta=1',
      );
      runAt(D(15), 'canario', dir, 'end', 'D', 'motivo=dono');
      expect(canary('D').estado).toBe('terminado pelo dono');
      expect(summary('D').veredito).toBe('sem base');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    '`revertido` still wins over `sem base`',
    () => {
      addC([], 1, 1);
      seed(dir, { at: D(13), id: 'c1', usd: 1, sinais: ['ok=10'], canario: 'C' });
      runAt(D(14), 'escapado', dir, '#99', 'etapa=#10', 'sev=high');
      runAt(D(14), 'merged', dir, '#10');
      expect(canary('C').estado).toBe('revertido');
      expect(summary('C').veredito).toBe('revertido');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    '`pode promover` and `não promover` as before, now over a base',
    () => {
      seedOldTesters();
      addC([], 1);
      baseFrom();
      finishC(2, ['ok=10']);
      expect(summary('C').veredito).toBe('pode promover');
      // dearer than the base per step: the verdict goes the other way
      runAt(D(15), 'sinal', dir, 'c1', 'ok=1');
      expect(summary('C').veredito).toBe('não promover');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('decision 6: the cost per tested step', () => {
  it(
    'the tester sides have `passos` and `usdPorPasso` and the verdict compares per step',
    () => {
      seedOldTesters();
      addC([], 1);
      baseFrom();
      seed(dir, {
        at: D(13),
        id: 'c1',
        usd: 2,
        model: 'claude-haiku-5-5',
        sinais: ['ok=1'],
        canario: 'C',
      });
      runAt(D(14), 'merged', dir, '#10');
      expect(side('C', 'antes')).toMatchObject({ passos: 16, usdPorPasso: 1.125 });
      expect(side('C', 'canario')).toMatchObject({ passos: 1, usdPorPasso: 2 });
      expect(summary('C').medida).toBe('passo');
      // cheaper per session (2 < 9) but dearer per step (2 > 1.125)
      expect(side('C', 'canario').medianaSessao).toBe(2);
      expect(summary('C').veredito).toBe('não promover');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'a retest canary is compared per step too, rounded to 3 decimals',
    () => {
      seed(old, {
        at: D(5),
        id: 'r1',
        kind: 'reteste',
        usd: 1,
        sinais: ['ok=2', 'falha=1'],
      });
      runAt(D(6), 'merged', old, '#10');
      runAt(
        START,
        'canario',
        dir,
        'add',
        'A',
        'papel=reteste',
        'de=Sonnet medium',
        'modelo=haiku',
        'n=1',
        'volta=2',
      );
      expect(tryRunAt(D(13), 'canario', dir, 'base', 'A', old).code).toBe(0);
      expect(side('A', 'antes')).toMatchObject({ passos: 3, usdPorPasso: 0.333 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'without step data on one side it compares per session (`medida: sessão`)',
    () => {
      seedOldTesters();
      addC([], 1);
      baseFrom();
      seed(dir, { at: D(13), id: 'c1', usd: 2, model: 'claude-haiku-5-5', canario: 'C' });
      runAt(D(14), 'merged', dir, '#10');
      expect(side('C', 'canario')).toMatchObject({ passos: 0, usdPorPasso: null });
      expect(summary('C').medida).toBe('sessão');
      expect(summary('C').veredito).toBe('pode promover');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'a `fase` canary has `medida: sessão` and the new fields null',
    () => {
      seed(old, {
        at: D(5),
        id: 'f1',
        kind: 'fase',
        usd: 6,
        effort: 'high',
        sinais: ['ci=0'],
      });
      runAt(D(6), 'merged', old, '#10');
      addB();
      expect(tryRunAt(D(13), 'canario', dir, 'base', 'B', old).code).toBe(0);
      expect(summary('B').medida).toBe('sessão');
      for (const which of ['antes', 'canario'] as const) {
        expect(side('B', which)).toMatchObject({
          passos: null,
          usdPorPasso: null,
          xFalso: null,
          naoExec: null,
          xFalsoPct: null,
          naoExecPct: null,
        });
      }
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('decision 7: the signals xFalso and naoExec', () => {
  it(
    'are accepted on a tester and a retest: a number replaces and `+k` adds',
    () => {
      seed(dir, { at: D(10), id: 't1', usd: 1 });
      seed(dir, { at: D(10), id: 'r1', kind: 'reteste', usd: 1 });
      runAt(D(11), 'sinal', dir, 't1', 'xFalso=+1', 'naoExec=3');
      expect(sessionEntry(dir, 't1')).toMatchObject({
        sinais: { xFalso: 1, naoExec: 3 },
      });
      runAt(D(11), 'sinal', dir, 't1', 'xFalso=+1', 'naoExec=5');
      expect(sessionEntry(dir, 't1')).toMatchObject({
        sinais: { xFalso: 2, naoExec: 5 },
      });
      runAt(D(11), 'sinal', dir, 'r1', 'xFalso=2');
      expect(sessionEntry(dir, 'r1')).toMatchObject({ sinais: { xFalso: 2 } });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'on a phase session it is code 2 and writes nothing',
    () => {
      seed(dir, { at: D(10), id: 'f1', kind: 'fase', usd: 1 });
      const before = snapshot();
      for (const pair of ['xFalso=+1', 'naoExec=3']) {
        expect(tryRunAt(D(11), 'sinal', dir, 'f1', pair).code, pair).toBe(2);
      }
      expect(snapshot()).toBe(before);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    '`uso` shows them in `sinais` and they change neither the rework nor the verdict',
    () => {
      seedOldTesters();
      addC([], 1);
      baseFrom();
      seed(dir, {
        at: D(13),
        id: 'c1',
        usd: 2,
        model: 'claude-haiku-5-5',
        sinais: ['ok=10'],
        canario: 'C',
      });
      runAt(D(14), 'merged', dir, '#10');
      const rework = canary('C').retrabalhos;
      const verdict = summary('C').veredito;
      const compared = side('C', 'canario').comRetrabalho;
      runAt(D(15), 'sinal', dir, 'c1', 'xFalso=+4', 'naoExec=9', 'falha=1');
      expect(canary('C').retrabalhos).toEqual(rework);
      expect(summary('C').veredito).toBe(verdict);
      expect(side('C', 'canario').comRetrabalho).toBe(compared);
      const uso = runAt(D(15), 'uso', dir);
      expect(uso).toContain('xFalso 4');
      expect(uso).toContain('naoExec 9');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('decision 8: the false ❌ and not executed rates', () => {
  function members(specs: { id: string; sinais: string[] }[]): void {
    addC([], specs.length);
    specs.forEach((s, i) => {
      seed(dir, { at: D(13 + i), id: s.id, usd: 1, sinais: s.sinais, canario: 'C' });
    });
  }

  it(
    'are computed over the sessions with `naoExec`, with `xFalso` absent counted as 0',
    () => {
      members([
        { id: 'c1', sinais: ['ok=8', 'falha=2', 'naoExec=2', 'xFalso=1'] },
        { id: 'c2', sinais: ['ok=10', 'falha=0', 'naoExec=0'] },
        { id: 'c3', sinais: ['ok=100', 'falha=100', 'xFalso=50'] },
      ]);
      expect(side('C', 'canario')).toMatchObject({
        xFalso: 1,
        naoExec: 2,
        xFalsoPct: 50,
        naoExecPct: 9.1,
      });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'are null without a session with `naoExec` and with a 0 denominator',
    () => {
      members([{ id: 'c1', sinais: ['ok=8', 'falha=2', 'xFalso=1'] }]);
      expect(side('C', 'canario')).toMatchObject({ xFalsoPct: null, naoExecPct: null });
      runAt(D(20), 'sinal', dir, 'c1', 'ok=10', 'falha=0', 'naoExec=0');
      expect(side('C', 'canario')).toMatchObject({ xFalsoPct: null, naoExecPct: 0 });
      runAt(D(21), 'sinal', dir, 'c1', 'ok=0', 'falha=0', 'naoExec=0');
      expect(side('C', 'canario')).toMatchObject({ xFalsoPct: null, naoExecPct: null });
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('decision 9: show', () => {
  function canariesLine(): string {
    return runAt(D(20), 'show', dir)
      .split('\n')
      .find((l) => l.startsWith('canários:'))!;
  }

  it(
    'ends each canary entry with the verdict and, for `sem base`, asks to run `canario base`',
    () => {
      addC();
      expect(canariesLine()).toBe(
        'canários: C testador Sonnet medium → Haiku medium 0/2 (retrabalhos 0/2, ativo; sem base — rodar canario base)',
      );
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'does not ask again once the base is `nenhuma`, and prints the verdict with a base',
    () => {
      seedOldTesters();
      addC();
      runAt(D(13), 'canario', dir, 'base', 'C', '--nenhuma');
      expect(canariesLine()).toBe(
        'canários: C testador Sonnet medium → Haiku medium 0/2 (retrabalhos 0/2, ativo; sem base)',
      );
      baseFrom();
      expect(canariesLine()).toBe(
        'canários: C testador Sonnet medium → Haiku medium 0/2 (retrabalhos 0/2, ativo; não promover)',
      );
    },
    SUBPROCESS_TIMEOUT,
  );
});
// portuguese-guard:end
