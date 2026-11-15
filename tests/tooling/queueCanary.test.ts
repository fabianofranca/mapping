// @vitest-environment node
// Phase QM3 (stage #1889, decisions 12 to 15): `painel.py canario` (`add`, `end`, `usar`), the `canario=` of `session`,
// the states, the rework and the before x canary summary that every write refreshes in `meta.canarios`, the
// `canários:` line of `show` and the candidates that leave out a role under a canary. The panel's output is
// Portuguese (frozen vocabulary), so the file is a guard block.
// portuguese-guard:begin expected panel output and session kinds, frozen vocabulary of decision 16 of #741
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';

let dir = '';

function runAt(now: string, ...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
}

function tryRunAt(now: string, ...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

type Entry = Record<string, unknown>;

function readJson(name: string): Entry[] {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Entry[];
}

function metaFile(): Entry {
  return readJson('meta')[0]!;
}

function canaries(): Entry[] {
  return (metaFile().canarios ?? []) as Entry[];
}

function canary(id: string): Entry {
  const hit = canaries().find((c) => c.id === id);
  if (!hit) throw new Error(`no canary ${id}`);
  return hit;
}

function summary(id: string): Entry {
  return canary(id).resumo as Entry;
}

function side(id: string, which: 'antes' | 'canario'): Entry {
  return summary(id)[which] as Entry;
}

function logTexts(): string[] {
  return readJson('log').map((l) => String(l.text));
}

const D = (n: number): string => `2026-11-${String(n).padStart(2, '0')}T12:00:00Z`;
const START = D(12);

function ficha(toca: string, testador = 'nenhum'): string {
  return `dep=nenhuma | nivel=impact: low | mcp=não | schema=não | epico=epic/x | fases=QM1:#1:high | toca=${toca} | testador=${testador} ; visual=nenhuma ; Sonnet medium`;
}

const PROCESS_TOCA =
  '.claude/skills/implementar-fila/painel/painel.py,.claude/skills/implementar-fila/SKILL.md#painel,tests/tooling/x.test.ts,docs/FLOW.md#item-7,CLAUDE.md,scripts/ci/x.mjs,docs/PROCESS.md,docs/TESTING-NUVEM.md#relato,.github/workflows/ci.yml';

function addA(extra: string[] = [], at = START, id = 'A'): string {
  return runAt(
    at,
    'canario',
    dir,
    'add',
    id,
    'papel=reteste',
    'de=Sonnet medium',
    'modelo=haiku',
    'n=5',
    'volta=2',
    ...extra,
  );
}

function addB(extra: string[] = [], at = START): string {
  return runAt(
    at,
    'canario',
    dir,
    'add',
    'B',
    'papel=fase',
    'de=Sonnet high',
    'esforco=medium',
    'filtro=processo',
    'n=5',
    'volta=2',
    ...extra,
  );
}

/** A session created at `at` for a stage, with the kind, label and optional canary of the real `session` command. */
function session(
  at: string,
  id: string,
  issue: string,
  kind: string,
  label: string,
  canario?: string,
): void {
  runAt(
    at,
    'session',
    dir,
    issue,
    id,
    `kind=${kind}`,
    `label=${label}`,
    ...(canario ? [`canario=${canario}`] : []),
  );
}

function cost(
  at: string,
  id: string,
  usd: number,
  model = 'claude-sonnet-5-5',
  effort = 'medium',
): void {
  runAt(
    at,
    'cost',
    dir,
    id,
    `usd=${usd}`,
    'ctx=1000',
    `model=${model}`,
    `effort=${effort}`,
  );
}

function usar(papel: string, issue: string, modelo: string, esforco: string): string {
  return runAt(
    D(20),
    'canario',
    dir,
    'usar',
    papel,
    issue,
    `modelo=${modelo}`,
    `esforco=${esforco}`,
  ).trim();
}

function snapshot(): string {
  return ['queue', 'meta', 'log']
    .map((n) => readFileSync(path.join(dir, `${n}.json`), 'utf8'))
    .join('\n');
}

/** Rewrites `meta.sessions` and `meta.merged` (a seed for the clean streak), then recomputes with a lone `log` write. */
function seedRetests(count: number): void {
  const file = path.join(dir, 'meta.json');
  const m = JSON.parse(readFileSync(file, 'utf8')) as Entry[];
  m[0]!.sessions = Array.from({ length: count }, (_, i) => ({
    id: `rt${i}`,
    issue: '#10',
    kind: 'reteste',
    label: `RT${i}`,
    created: `2026-11-11T${String(i).padStart(2, '0')}:30:00Z`,
    sinais: { ok: 1 },
    cost: {
      usd: 1,
      ctx: 1000,
      model: 'claude-sonnet-5-5',
      effort: 'medium',
      at: `2026-11-11T${String(i).padStart(2, '0')}:40:00Z`,
    },
  }));
  m[0]!.merged = ['#10'];
  writeFileSync(file, JSON.stringify(m));
  runAt(D(20), 'log', dir, 'recalc');
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-canary-'));
  runAt('2026-11-11T10:00:00Z', 'init', dir);
  runAt(
    '2026-11-11T10:00:00Z',
    'row',
    dir,
    '#10',
    'title=Process stage',
    `plan=${ficha(PROCESS_TOCA)}`,
  );
  runAt(
    '2026-11-11T10:00:00Z',
    'row',
    dir,
    '#20',
    'title=Product stage',
    `plan=${ficha('src/model/x.ts,tests/model/x.test.ts')}`,
  );
  runAt(
    '2026-11-11T10:00:00Z',
    'row',
    dir,
    '#30',
    'title=Tested process',
    `plan=${ficha(PROCESS_TOCA, 'R12')}`,
  );
  runAt(
    '2026-11-11T10:00:00Z',
    'row',
    dir,
    '#40',
    'title=Process too',
    `plan=${ficha(PROCESS_TOCA)}`,
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('canario add (decision 13)', () => {
  it('writes the canary with the fields of the panel and the time it started', () => {
    const out = addA();
    expect(out).toContain('alterados: meta.json');
    expect(canary('A')).toMatchObject({
      id: 'A',
      papel: 'reteste',
      de: 'Sonnet medium',
      modelo: 'Haiku',
      esforco: 'medium',
      n: 5,
      volta: 2,
      inicio: START,
      sessoes: [],
      estado: 'ativo',
      motivo: '',
    });
    expect(canary('A').filtro ?? null).toBeNull();
    expect(canary('A').fim ?? null).toBeNull();
  });

  it('B takes the model of `de` when only the effort changes, and keeps the filter', () => {
    addB();
    expect(canary('B')).toMatchObject({
      papel: 'fase',
      de: 'Sonnet high',
      modelo: 'Sonnet',
      esforco: 'medium',
      filtro: 'processo',
      n: 5,
      volta: 2,
      estado: 'ativo',
    });
  });

  it('refuses a repeated id, a role without ruler, a bad n or volta, another filter and no change, writing nothing', () => {
    addA();
    const before = snapshot();
    const bad: string[][] = [
      ['add', 'A', 'papel=reteste', 'de=Sonnet medium', 'modelo=haiku', 'n=5', 'volta=2'],
      [
        'add',
        'C',
        'papel=coordenador',
        'de=Sonnet medium',
        'modelo=haiku',
        'n=5',
        'volta=2',
      ],
      [
        'add',
        'C',
        'papel=fechamento',
        'de=Sonnet medium',
        'modelo=haiku',
        'n=5',
        'volta=2',
      ],
      ['add', 'C', 'papel=reteste', 'de=Sonnet medium', 'modelo=haiku', 'n=0', 'volta=2'],
      ['add', 'C', 'papel=reteste', 'de=Sonnet medium', 'modelo=haiku', 'n=5', 'volta=0'],
      [
        'add',
        'C',
        'papel=reteste',
        'de=Sonnet medium',
        'modelo=haiku',
        'n=-1',
        'volta=2',
      ],
      ['add', 'C', 'papel=reteste', 'de=Sonnet medium', 'modelo=haiku', 'n=x', 'volta=2'],
      [
        'add',
        'C',
        'papel=fase',
        'de=Sonnet high',
        'esforco=medium',
        'filtro=produto',
        'n=5',
        'volta=2',
      ],
      ['add', 'C', 'papel=reteste', 'de=Sonnet medium', 'n=5', 'volta=2'],
      ['add', 'C', 'papel=reteste', 'de=Sonnet', 'modelo=haiku', 'n=5', 'volta=2'],
      [
        'add',
        'C',
        'papel=reteste',
        'de=Sonnet medium',
        'modelo=sonnet',
        'esforco=medium',
        'n=5',
        'volta=2',
      ],
      ['add', 'C', 'papel=reteste', 'modelo=haiku', 'n=5', 'volta=2'],
    ];
    for (const args of bad) {
      const r = tryRunAt(START, 'canario', dir, ...args);
      expect(r.code, args.join(' ')).toBe(2);
    }
    expect(snapshot()).toBe(before);
  });
});

describe('canario usar (decisions 12 and 14)', () => {
  it('A: gives the Haiku configuration while it is active, and `atual` otherwise', () => {
    addA();
    expect(usar('reteste', '#10', 'Sonnet', 'medium')).toBe(
      'canario=A modelo=Haiku esforco=medium',
    );
    expect(usar('reteste', '#10', 'Opus', 'medium')).toBe('atual');
    expect(usar('reteste', '#10', 'Sonnet', 'high')).toBe('atual');
    expect(usar('fase', '#10', 'Sonnet', 'medium')).toBe('atual');
  });

  it('refuses a role or an effort that does not exist, instead of answering `atual` for a typo', () => {
    addA();
    for (const args of [
      ['bogus', '#10', 'modelo=Sonnet', 'esforco=medium'],
      ['reteste', '#10', 'modelo=Sonnet', 'esforco=medum'],
      ['reteste', '#10', 'modelo=Sonet', 'esforco=medium'],
    ]) {
      const r = tryRunAt(D(13), 'canario', dir, 'usar', ...args);
      expect(r.code, args.join(' ')).toBe(2);
    }
  });

  it('does not write anything', () => {
    addA();
    const before = snapshot();
    usar('reteste', '#10', 'Sonnet', 'medium');
    expect(snapshot()).toBe(before);
  });

  it('gives `atual` once the canary has 5 counted, was ended by the owner or reverted', () => {
    addA();
    for (let i = 1; i <= 5; i++) session(D(13), `r${i}`, '#10', 'reteste', `RT${i}`, 'A');
    expect(canary('A').estado).toBe('em avaliação');
    expect(usar('reteste', '#10', 'Sonnet', 'medium')).toBe('atual');

    runAt(
      D(14),
      'canario',
      dir,
      'add',
      'A2',
      'papel=reteste',
      'de=Sonnet medium',
      'modelo=haiku',
      'n=5',
      'volta=2',
    );
    expect(usar('reteste', '#10', 'Sonnet', 'medium')).toBe(
      'canario=A2 modelo=Haiku esforco=medium',
    );
    runAt(D(14), 'canario', dir, 'end', 'A2', 'motivo=promovido pelo dono');
    expect(usar('reteste', '#10', 'Sonnet', 'medium')).toBe('atual');

    runAt(
      D(15),
      'canario',
      dir,
      'add',
      'A3',
      'papel=reteste',
      'de=Sonnet medium',
      'modelo=haiku',
      'n=5',
      'volta=2',
    );
    session(D(15), 'x1', '#20', 'reteste', 'RT9', 'A3');
    runAt(D(15), 'sinal', dir, 'x1', 'falso=high');
    runAt(D(15), 'sinal', dir, 'x1', 'falso=medium');
    expect(canary('A3').estado).toBe('revertido');
    expect(usar('reteste', '#10', 'Sonnet', 'medium')).toBe('atual');
  });

  it('B: only a stage whose ficha passes the process filter gets `medium`', () => {
    addB();
    expect(usar('fase', '#10', 'Sonnet', 'high')).toBe(
      'canario=B modelo=Sonnet esforco=medium',
    );
    expect(usar('fase', '#40', 'Sonnet', 'high')).toBe(
      'canario=B modelo=Sonnet esforco=medium',
    );
    // a citation of src/ and a tester script are product, a stage outside the queue cannot be proved
    expect(usar('fase', '#20', 'Sonnet', 'high')).toBe('atual');
    expect(usar('fase', '#30', 'Sonnet', 'high')).toBe('atual');
    expect(usar('fase', '#999', 'Sonnet', 'high')).toBe('atual');
    // a phase that already runs in medium has nothing to change
    expect(usar('fase', '#10', 'Sonnet', 'medium')).toBe('atual');
  });

  it('B: one citation outside the list is enough for `atual`, a `#section` and the ignored prefixes are not', () => {
    runAt(
      D(11),
      'row',
      dir,
      '#50',
      'title=Mixed',
      `plan=${ficha(`${PROCESS_TOCA},src/store/x.ts`)}`,
    );
    runAt(
      D(11),
      'row',
      dir,
      '#51',
      'title=Sections',
      `plan=${ficha('CLAUDE.md#project,docs/FLOW.md#for-the-phase-session,changelog/x.md,docs/design-system/x.md,scripts/ci/a.mjs')}`,
    );
    addB();
    expect(usar('fase', '#50', 'Sonnet', 'high')).toBe('atual');
    expect(usar('fase', '#51', 'Sonnet', 'high')).toBe(
      'canario=B modelo=Sonnet esforco=medium',
    );
  });
});

describe('session canario= (decision 13)', () => {
  it('adds the id to the canary and keeps the session kind and label', () => {
    addA();
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    expect(canary('A').sessoes).toEqual(['r1']);
    expect(canary('A').contadas).toBe(1);
    // the same id again does not repeat
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    expect(canary('A').sessoes).toEqual(['r1']);
  });

  it('refuses an unknown canary, another role and a canary that is not active, writing nothing', () => {
    addA();
    addB();
    const before = snapshot();
    const tries: string[][] = [
      ['#10', 'r1', 'kind=reteste', 'label=RT1', 'canario=Z'],
      ['#10', 'r1', 'kind=testador', 'label=G1', 'canario=A'],
      ['#10', 'r1', 'kind=fase', 'label=QM1', 'canario=A'],
      ['#10', 'r1', 'canario=A'],
    ];
    for (const args of tries) {
      const r = tryRunAt(D(13), 'session', dir, ...args);
      expect(r.code, args.join(' ')).toBe(2);
    }
    expect(snapshot()).toBe(before);

    runAt(D(13), 'canario', dir, 'end', 'A', 'motivo=promovido pelo dono');
    const r = tryRunAt(
      D(13),
      'session',
      dir,
      '#10',
      'r1',
      'kind=reteste',
      'label=RT1',
      'canario=A',
    );
    expect(r.code).toBe(2);
    expect(r.err).toContain('A');
  });

  it('B counts distinct phases (stage + label): the successor by context enters without counting again', () => {
    addB([]);
    session(D(13), 'f1', '#10', 'fase', 'QM1', 'B');
    session(D(13), 'f2', '#10', 'fase', 'QM1', 'B');
    expect(canary('B').sessoes).toEqual(['f1', 'f2']);
    expect(canary('B').contadas).toBe(1);
    session(D(13), 'f3', '#10', 'fase', 'QM2', 'B');
    session(D(13), 'f4', '#40', 'fase', 'QM1', 'B');
    expect(canary('B').contadas).toBe(3);
  });

  it('the successor of a phase of the canary still joins it when the canary is already under evaluation', () => {
    runAt(
      START,
      'canario',
      dir,
      'add',
      'B',
      'papel=fase',
      'de=Sonnet high',
      'esforco=medium',
      'filtro=processo',
      'n=1',
      'volta=2',
    );
    session(D(13), 'f1', '#10', 'fase', 'QM1', 'B');
    expect(canary('B').estado).toBe('em avaliação');
    session(D(13), 'f2', '#10', 'fase', 'QM1', 'B');
    expect(canary('B').sessoes).toEqual(['f1', 'f2']);
    expect(canary('B').contadas).toBe(1);
    // a different phase does not join: it runs outside the canary (QC2, F4)
    expect(
      tryRunAt(D(13), 'session', dir, '#10', 'f3', 'kind=fase', 'label=QM2', 'canario=B')
        .code,
    ).toBe(0);
    expect(canary('B').sessoes).toEqual(['f1', 'f2']);
  });

  it('the successor registered without a label (kind= alone) still joins the canary under evaluation', () => {
    runAt(
      START,
      'canario',
      dir,
      'add',
      'B',
      'papel=fase',
      'de=Sonnet high',
      'esforco=medium',
      'filtro=processo',
      'n=1',
      'volta=2',
    );
    runAt(D(13), 'session', dir, '#10', 'f1', 'kind=fase', 'canario=B');
    expect(canary('B').estado).toBe('em avaliação');
    runAt(D(13), 'session', dir, '#10', 'f2', 'kind=fase', 'canario=B');
    expect(canary('B').sessoes).toEqual(['f1', 'f2']);
  });

  it('refuses to move a session that is already in a canary to another one, writing nothing', () => {
    addA();
    addA([], START, 'A2');
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    const before = snapshot();
    const r = tryRunAt(D(13), 'session', dir, '#10', 'r1', 'canario=A2');
    expect(r.code).toBe(2);
    expect(r.err).toContain('A');
    expect(snapshot()).toBe(before);
    expect(canary('A2').sessoes).toEqual([]);
  });

  it('A counts sessions, even with the same label', () => {
    addA();
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    session(D(13), 'r2', '#10', 'reteste', 'RT1', 'A');
    expect(canary('A').contadas).toBe(2);
  });
});

describe('a session that arrives after the canary reached n (QC2, F4)', () => {
  const addUnit = (): void => {
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
  };

  it('two parallel applies: the second `session ... canario=A` runs outside the canary, with a log line, and does not abort', () => {
    addUnit();
    const one = path.join(dir, 'one.txt');
    const two = path.join(dir, 'two.txt');
    writeFileSync(one, "session '#10' r1 kind=reteste label=RT1 canario=A\n");
    writeFileSync(
      two,
      'session \'#10\' r2 kind=reteste label=RT2 canario=A\nlog "after r2"\n',
    );
    runAt(D(13), 'apply', dir, one);
    const r = tryRunAt(D(13), 'apply', dir, two);
    expect(r.code, r.err).toBe(0);
    expect(canary('A').sessoes).toEqual(['r1']);
    expect(canary('A').contadas).toBe(1);
    expect(logTexts().some((t) => t.includes('r2') && t.includes('A'))).toBe(true);
    expect(logTexts()).toContain('after r2');
    const r2 = (metaFile().sessions as Entry[]).find((e) => e.id === 'r2')!;
    expect(r2.kind).toBe('reteste');
    expect(r2.canario).toBeUndefined();
  });

  it('two session lines in one apply do not overshoot n', () => {
    addUnit();
    const file = path.join(dir, 'batch.txt');
    writeFileSync(
      file,
      [
        "session '#10' r1 kind=reteste label=RT1 canario=A",
        "session '#10' r2 kind=reteste label=RT2 canario=A",
        '',
      ].join('\n'),
    );
    const r = tryRunAt(D(13), 'apply', dir, file);
    expect(r.code, r.err).toBe(0);
    expect(canary('A').sessoes).toEqual(['r1']);
    expect(canary('A').contadas).toBe(1);
  });

  it('a canary ended by the owner still refuses the session', () => {
    addUnit();
    runAt(D(13), 'canario', dir, 'end', 'A', 'motivo=parou');
    expect(
      tryRunAt(D(13), 'session', dir, '#10', 'r1', 'kind=reteste', 'canario=A').code,
    ).toBe(2);
  });
});

describe('the states of the canary (decision 13)', () => {
  it('goes ativo → em avaliação at n → encerrado when every stage of the canary is merged', () => {
    runAt(
      START,
      'canario',
      dir,
      'add',
      'A',
      'papel=reteste',
      'de=Sonnet medium',
      'modelo=haiku',
      'n=2',
      'volta=2',
    );
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    expect(canary('A').estado).toBe('ativo');
    session(D(13), 'r2', '#40', 'reteste', 'RT1', 'A');
    expect(canary('A').estado).toBe('em avaliação');
    runAt(D(14), 'merged', dir, '#10');
    expect(canary('A').estado).toBe('em avaliação');
    runAt(D(14), 'merged', dir, '#40');
    expect(canary('A').estado).toBe('encerrado');
    expect(canary('A').fim).toBe(D(14));
  });

  it('a `concluída` row also counts as merged', () => {
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
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    runAt(D(14), 'row', dir, '#10', 'status=concluída');
    expect(canary('A').estado).toBe('encerrado');
  });

  it('is reverted as soon as the rework reaches volta, at any time, with one log line written once', () => {
    addA();
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    session(D(13), 'r2', '#10', 'reteste', 'RT2', 'A');
    runAt(D(14), 'sinal', dir, 'r1', 'falso=high');
    expect(canary('A').estado).toBe('ativo');
    expect(canary('A').retrabalhos).toHaveLength(1);
    runAt(D(15), 'sinal', dir, 'r2', 'falso=medium');
    expect(canary('A').estado).toBe('revertido');
    expect(canary('A').fim).toBe(D(15));
    const lines = logTexts().filter((t) =>
      t.startsWith('canário A revertido: 2 retrabalhos ('),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('r1');
    expect(lines[0]).toContain('r2');
    // later writes do not repeat the line nor change the state
    runAt(D(16), 'log', dir, 'another write');
    runAt(D(16), 'sinal', dir, 'r2', 'falso=high');
    expect(canary('A').estado).toBe('revertido');
    expect(logTexts().filter((t) => t.includes('canário A revertido'))).toHaveLength(1);
  });

  it('an `end` makes it `terminado pelo dono` with the reason, and a closed canary cannot end again', () => {
    addA();
    runAt(D(14), 'canario', dir, 'end', 'A', 'motivo=promovido pelo dono');
    expect(canary('A')).toMatchObject({
      estado: 'terminado pelo dono',
      motivo: 'promovido pelo dono',
      fim: D(14),
    });
    expect(tryRunAt(D(14), 'canario', dir, 'end', 'A', 'motivo=de novo').code).toBe(2);
    expect(tryRunAt(D(14), 'canario', dir, 'end', 'Z', 'motivo=x').code).toBe(2);
  });

  it('an encerrado canary can still be ended by the owner, and a reverted one cannot', () => {
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
      'volta=1',
    );
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    runAt(D(14), 'merged', dir, '#10');
    expect(canary('A').estado).toBe('encerrado');
    runAt(D(15), 'canario', dir, 'end', 'A', 'motivo=promovido pelo dono');
    expect(canary('A').estado).toBe('terminado pelo dono');

    runAt(
      D(15),
      'canario',
      dir,
      'add',
      'A4',
      'papel=reteste',
      'de=Sonnet medium',
      'modelo=haiku',
      'n=5',
      'volta=1',
    );
    session(D(16), 'r4', '#40', 'reteste', 'RT4', 'A4');
    runAt(D(16), 'sinal', dir, 'r4', 'falso=high');
    expect(canary('A4').estado).toBe('revertido');
    expect(tryRunAt(D(16), 'canario', dir, 'end', 'A4', 'motivo=x').code).toBe(2);
  });
});

describe('the rework of the canary (decisions 12 and 14)', () => {
  it('A: `falso` high and medium in a session of the canary count, low does not', () => {
    addA();
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    runAt(D(14), 'sinal', dir, 'r1', 'falso=low');
    expect(canary('A').retrabalhos).toHaveLength(0);
    runAt(D(14), 'sinal', dir, 'r1', 'falso=medium');
    expect(canary('A').retrabalhos).toHaveLength(1);
    // a `falso` of a retest outside the canary does not count
    session(D(13), 'out', '#10', 'reteste', 'RT2');
    runAt(D(14), 'sinal', dir, 'out', 'falso=high');
    expect(canary('A').retrabalhos).toHaveLength(1);
    expect(canary('A').estado).toBe('ativo');
  });

  it('B: a `correção` in the stage of the canary counts once per stage, even with two phases of the canary there', () => {
    addB();
    session(D(13), 'f1', '#10', 'fase', 'QM1', 'B');
    session(D(13), 'f2', '#10', 'fase', 'QM2', 'B');
    expect(canary('B').retrabalhos).toHaveLength(0);
    session(D(14), 'c1', '#10', 'correção', 'CL1');
    expect(canary('B').retrabalhos).toHaveLength(1);
    session(D(14), 'c2', '#10', 'correção', 'CL2');
    expect(canary('B').retrabalhos).toHaveLength(1);
    // a `correção` in a stage with no phase of the canary does not count
    session(D(14), 'c3', '#40', 'correção', 'CL1');
    expect(canary('B').retrabalhos).toHaveLength(1);
    expect(canary('B').estado).toBe('ativo');
  });

  it('B: each `ciclo` in a session of the canary counts, and two stages with a fix revert it', () => {
    addB();
    session(D(13), 'f1', '#10', 'fase', 'QM1', 'B');
    runAt(D(14), 'sinal', dir, 'f1', 'ciclo=+1');
    expect(canary('B').retrabalhos).toHaveLength(1);
    // a `ciclo` of a phase outside the canary does not count
    session(D(14), 'other', '#20', 'fase', 'QM1');
    runAt(D(14), 'sinal', dir, 'other', 'ciclo=+3');
    expect(canary('B').retrabalhos).toHaveLength(1);
    runAt(D(15), 'sinal', dir, 'f1', 'ciclo=+1');
    expect(canary('B').estado).toBe('revertido');
    expect(
      logTexts().some((t) => t.startsWith('canário B revertido: 2 retrabalhos (')),
    ).toBe(true);
  });
});

describe('the summary before x canary (decision 13)', () => {
  /** Retests on Sonnet medium before the canary, two on Haiku after it: a comparison where the canary is cheaper. */
  function scenarioA(): void {
    session('2026-11-11T11:00:00Z', 'b1', '#10', 'reteste', 'RT1');
    cost('2026-11-11T11:30:00Z', 'b1', 4);
    session('2026-11-11T12:00:00Z', 'b2', '#10', 'reteste', 'RT2');
    cost('2026-11-11T12:30:00Z', 'b2', 6);
    // outside the "before": another effort, another role and another model
    session('2026-11-11T13:00:00Z', 'o1', '#10', 'reteste', 'RT3');
    cost('2026-11-11T13:30:00Z', 'o1', 50, 'claude-sonnet-5-5', 'high');
    session('2026-11-11T14:00:00Z', 'o2', '#10', 'testador', 'G1');
    cost('2026-11-11T14:30:00Z', 'o2', 60);
    runAt('2026-11-11T15:00:00Z', 'merged', dir, '#10');
    addA(['n=2']);
    session(D(13), 'c1', '#40', 'reteste', 'RT1', 'A');
    cost(D(13), 'c1', 1, 'claude-haiku-5-5', 'medium');
    session(D(13), 'c2', '#40', 'reteste', 'RT2', 'A');
    cost(D(13), 'c2', 3, 'claude-haiku-5-5', 'medium');
    // after the start, not in the canary and in the old configuration: in neither side
    session(D(13), 'late', '#40', 'reteste', 'RT3');
    cost(D(13), 'late', 70);
    // the signals of each retest were recorded (a session with none is "sem dado", QC2 F3)
    for (const id of ['b1', 'b2', 'c1', 'c2']) runAt(D(13), 'sinal', dir, id, 'ok=1');
  }

  it('each side brings sessions, median per session, median per merged stage, decided and with rework', () => {
    scenarioA();
    runAt(D(14), 'merged', dir, '#40');
    expect(side('A', 'antes')).toMatchObject({
      sessoes: 2,
      medianaSessao: 5,
      medianaEtapa: 10,
      decididas: 2,
      comRetrabalho: 0,
    });
    expect(side('A', 'canario')).toMatchObject({
      sessoes: 2,
      medianaSessao: 2,
      medianaEtapa: 4,
      decididas: 2,
      comRetrabalho: 0,
    });
  });

  it('a stage that is not merged leaves the "decididas" and the stage median of the canary side out', () => {
    scenarioA();
    expect(side('A', 'canario')).toMatchObject({
      sessoes: 2,
      medianaSessao: 2,
      decididas: 0,
    });
    expect(side('A', 'canario').medianaEtapa ?? null).toBeNull();
  });

  it('counts the rework of the ruler of decision 6 on both sides', () => {
    scenarioA();
    runAt(D(14), 'merged', dir, '#40');
    runAt(D(14), 'sinal', dir, 'c1', 'falso=low');
    runAt(D(14), 'sinal', dir, 'c2', 'falso=medium');
    expect(side('A', 'canario')).toMatchObject({ decididas: 2, comRetrabalho: 1 });
    expect(side('A', 'antes')).toMatchObject({ decididas: 2, comRetrabalho: 0 });
  });

  it('`pode promover` with the canary encerrado, at most 1 rework and a lower median per session', () => {
    scenarioA();
    expect(summary('A').veredito).toBe('não promover');
    runAt(D(14), 'merged', dir, '#40');
    expect(canary('A').estado).toBe('encerrado');
    expect(summary('A').veredito).toBe('pode promover');
    runAt(D(14), 'sinal', dir, 'c1', 'falso=high');
    expect(canary('A').estado).toBe('encerrado');
    expect(summary('A').veredito).toBe('pode promover');
  });

  it('`não promover` when the canary is not cheaper per session', () => {
    scenarioA();
    cost(D(13), 'c1', 9, 'claude-haiku-5-5', 'medium');
    cost(D(13), 'c2', 9, 'claude-haiku-5-5', 'medium');
    runAt(D(14), 'merged', dir, '#40');
    expect(canary('A').estado).toBe('encerrado');
    expect(side('A', 'canario').medianaSessao).toBe(9);
    expect(summary('A').veredito).toBe('não promover');
  });

  it('`revertido` when it came back, and `não promover` for one the owner ended', () => {
    scenarioA();
    runAt(D(14), 'sinal', dir, 'c1', 'falso=high');
    runAt(D(14), 'sinal', dir, 'c2', 'falso=medium');
    expect(summary('A').veredito).toBe('revertido');

    runAt(
      D(15),
      'canario',
      dir,
      'add',
      'A2',
      'papel=reteste',
      'de=Sonnet medium',
      'modelo=haiku',
      'n=5',
      'volta=2',
    );
    runAt(D(15), 'canario', dir, 'end', 'A2', 'motivo=promovido pelo dono');
    expect(summary('A2').veredito).toBe('não promover');
  });

  it('B: the "before" is the same role and configuration and the same filter, created before the start', () => {
    // a process stage and a product stage on Sonnet high before the canary, and a Sonnet medium one
    session('2026-11-11T11:00:00Z', 'p1', '#10', 'fase', 'QM1');
    cost('2026-11-11T11:30:00Z', 'p1', 6, 'claude-sonnet-5-5', 'high');
    session('2026-11-11T12:00:00Z', 'p2', '#10', 'fase', 'QM2');
    cost('2026-11-11T12:30:00Z', 'p2', 8, 'claude-sonnet-5-5', 'high');
    session('2026-11-11T13:00:00Z', 'q1', '#20', 'fase', 'QM1');
    cost('2026-11-11T13:30:00Z', 'q1', 100, 'claude-sonnet-5-5', 'high');
    session('2026-11-11T14:00:00Z', 'm1', '#10', 'fase', 'QM3');
    cost('2026-11-11T14:30:00Z', 'm1', 1, 'claude-sonnet-5-5', 'medium');
    session('2026-11-11T14:40:00Z', 'k1', '#10', 'correção', 'CL1');
    cost('2026-11-11T14:50:00Z', 'k1', 1, 'claude-sonnet-5-5', 'high');
    runAt('2026-11-11T15:00:00Z', 'merged', dir, '#10');
    runAt('2026-11-11T15:00:00Z', 'merged', dir, '#20');
    runAt(
      START,
      'canario',
      dir,
      'add',
      'B',
      'papel=fase',
      'de=Sonnet high',
      'esforco=medium',
      'filtro=processo',
      'n=2',
      'volta=2',
    );
    session(D(13), 'f1', '#40', 'fase', 'QM1', 'B');
    cost(D(13), 'f1', 2, 'claude-sonnet-5-5', 'medium');
    session(D(13), 'f2', '#40', 'fase', 'QM2', 'B');
    cost(D(13), 'f2', 4, 'claude-sonnet-5-5', 'medium');
    runAt(D(14), 'merged', dir, '#40');

    expect(canary('B').estado).toBe('encerrado');
    // `p1` and `p2` count; `q1` is a product stage, `m1` another effort, `k1` another role
    expect(side('B', 'antes')).toMatchObject({
      sessoes: 2,
      medianaSessao: 7,
      medianaEtapa: 14,
    });
    expect(side('B', 'canario')).toMatchObject({
      sessoes: 2,
      medianaSessao: 3,
      medianaEtapa: 6,
    });
    expect(summary('B').veredito).toBe('pode promover');
  });
});

describe('`show` and the candidates (decisions 7 and 13)', () => {
  it('prints `canários: nenhum` without a canary', () => {
    expect(runAt(D(20), 'show', dir)).toContain('canários: nenhum');
  });

  it('prints one entry per canary, with the count, the rework and the state', () => {
    addA();
    addB();
    session(D(13), 'r1', '#10', 'reteste', 'RT1', 'A');
    session(D(13), 'r2', '#10', 'reteste', 'RT2', 'A');
    expect(runAt(D(20), 'show', dir)).toContain(
      'canários: A reteste Sonnet medium → Haiku medium 2/5 (retrabalhos 0/2, ativo); B fase Sonnet high → Sonnet medium 0/5 (retrabalhos 0/2, ativo)',
    );
    runAt(D(14), 'sinal', dir, 'r1', 'falso=high');
    runAt(D(14), 'canario', dir, 'end', 'B', 'motivo=parou');
    expect(runAt(D(20), 'show', dir)).toContain(
      'A reteste Sonnet medium → Haiku medium 2/5 (retrabalhos 1/2, ativo); B fase Sonnet high → Sonnet medium 0/5 (retrabalhos 0/2, terminado pelo dono)',
    );
  });

  it('`candidatos a teste:` leaves out a role with an active or under-evaluation canary, and brings it back after', () => {
    seedRetests(10);
    expect(runAt(D(20), 'show', dir)).toContain(
      'candidatos a teste: reteste Sonnet medium → Haiku medium (10 seguidas)',
    );
    addA([], D(21));
    expect(runAt(D(22), 'show', dir)).toContain('candidatos a teste: nenhum');
    expect(
      (metaFile().uso as Entry[]).find((u) => u.papel === 'reteste')?.candidato ?? null,
    ).toBeNull();
    for (let i = 1; i <= 5; i++) session(D(23), `r${i}`, '#40', 'reteste', `X${i}`, 'A');
    expect(canary('A').estado).toBe('em avaliação');
    expect(runAt(D(24), 'show', dir)).toContain('candidatos a teste: nenhum');
    runAt(D(24), 'canario', dir, 'end', 'A', 'motivo=promovido pelo dono');
    expect(runAt(D(25), 'show', dir)).toContain(
      'candidatos a teste: reteste Sonnet medium',
    );
  });
});

describe('a reverted canary keeps its step out of the candidates (QC2, F5)', () => {
  it('the step the canary tried is not offered again, and another step of the role still is', () => {
    seedRetests(10);
    addA([], D(21));
    session(D(22), 'x1', '#20', 'reteste', 'RT9', 'A');
    runAt(D(22), 'sinal', dir, 'x1', 'falso=high');
    runAt(D(22), 'sinal', dir, 'x1', 'falso=medium');
    expect(canary('A').estado).toBe('revertido');
    expect(runAt(D(23), 'show', dir)).toContain('candidatos a teste: nenhum');
    expect(
      (metaFile().uso as Entry[]).find(
        (u) => u.papel === 'reteste' && u.modelo === 'Sonnet',
      )?.candidato ?? null,
    ).toBeNull();
  });
});

describe('the batch (`apply`)', () => {
  it('takes `canario add` and `end` and `session … canario=`, but not `usar`', () => {
    const file = path.join(dir, 'batch.txt');
    writeFileSync(
      file,
      [
        'canario add A papel=reteste de="Sonnet medium" modelo=haiku n=5 volta=2',
        'canario add B papel=fase de="Sonnet high" esforco=medium filtro=processo n=5 volta=2',
        "session '#10' r1 kind=reteste label=RT1 canario=A",
        'canario end B motivo="create_session recusou Haiku: x"',
        '',
      ].join('\n'),
    );
    const out = runAt(START, 'apply', dir, file);
    expect(out.match(/alterados:/g)).toHaveLength(1);
    expect(canary('A').sessoes).toEqual(['r1']);
    expect(canary('B')).toMatchObject({
      estado: 'terminado pelo dono',
      motivo: 'create_session recusou Haiku: x',
    });

    const bad = path.join(dir, 'bad.txt');
    writeFileSync(bad, "canario usar reteste '#10' modelo=Sonnet esforco=medium\n");
    const r = tryRunAt(START, 'apply', dir, bad);
    expect(r.code).toBe(2);
    expect(r.err).toContain('linha 1');
  });

  it('is all or nothing: a refused `canario add` in the middle writes none of the batch', () => {
    const file = path.join(dir, 'batch.txt');
    writeFileSync(
      file,
      [
        'canario add A papel=reteste de="Sonnet medium" modelo=haiku n=5 volta=2',
        'canario add A papel=reteste de="Sonnet medium" modelo=haiku n=5 volta=2',
      ].join('\n'),
    );
    const before = snapshot();
    expect(tryRunAt(START, 'apply', dir, file).code).toBe(2);
    expect(snapshot()).toBe(before);
  });
});

describe('what stays as it was', () => {
  it('a panel without a canary keeps `meta.canarios` empty and the `alterados:` line of a write as before', () => {
    const out = runAt(D(13), 'log', dir, 'x');
    expect(out.trim()).toBe('alterados: meta.json log.json');
    expect((metaFile().canarios ?? []) as Entry[]).toHaveLength(0);
  });
});
// portuguese-guard:end
