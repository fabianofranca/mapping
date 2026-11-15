// @vitest-environment node
// Phase QM1 (stage #1889, decisions 2 to 7, the commands of 9 and 10): `painel.py` computes the usage per
// role x model x effort (`meta.uso`, `uso`), records the quality signals (`sinal`), the escaped defects
// (`escapado`) and the history marker (`historico`), and `show` prints the `escapados:`, `histórico:` and
// `candidatos a teste:` lines. The panel's output is Portuguese (frozen vocabulary), so the file is a guard block.
// portuguese-guard:begin expected panel output and session kinds, frozen vocabulary of decision 16 of #741
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
}

function runAt(now: string, ...args: string[]): string {
  return run('--now', now, ...args);
}

function tryRun(...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

type Entry = Record<string, unknown>;

function metaFile(): Entry {
  return (JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Entry[])[0]!;
}

function sessions(): Entry[] {
  return (metaFile().sessions ?? []) as Entry[];
}

function usage(): Entry[] {
  return (metaFile().uso ?? []) as Entry[];
}

/** The `meta.uso` entry of a key, written by the last write of the panel. */
function usageOf(papel: string, modelo = 'Sonnet', esforco = 'medium'): Entry {
  const hit = usage().find(
    (u) => u.papel === papel && u.modelo === modelo && u.esforco === esforco,
  );
  if (!hit) throw new Error(`no meta.uso for ${papel} ${modelo} ${esforco}`);
  return hit;
}

interface Seed {
  id: string;
  issue: string;
  kind: string;
  label?: string;
  created?: string;
  usd?: number;
  ctx?: number;
  model?: string;
  effort?: string;
  sinais?: Entry;
  noCost?: boolean;
}

function entry(s: Seed): Entry {
  const e: Entry = { id: s.id, issue: s.issue, kind: s.kind, label: s.label ?? '' };
  if (s.created) e.created = s.created;
  if (!s.noCost) {
    e.cost = {
      usd: s.usd ?? 1,
      ctx: s.ctx ?? 1000,
      model: s.model ?? 'claude-sonnet-5-5',
      effort: s.effort ?? 'medium',
      at: s.created ?? '2026-11-11T12:00:00Z',
    };
  }
  if (s.sinais) e.sinais = s.sinais;
  return e;
}

/** Writes sessions, merged stages and escaped defects straight into the meta, then makes the panel recompute `meta.uso`. */
function put(
  seeds: Seed[],
  extra: { merged?: string[]; escapados?: Entry[] } = {},
): void {
  const file = path.join(dir, 'meta.json');
  const m = JSON.parse(readFileSync(file, 'utf8')) as Entry[];
  m[0]!.sessions = seeds.map(entry);
  m[0]!.merged = extra.merged ?? [];
  m[0]!.escapados = extra.escapados ?? [];
  writeFileSync(file, JSON.stringify(m));
  runAt('2026-11-20T00:00:00Z', 'log', dir, 'recalc');
}

const T = (n: number): string => `2026-11-11T${String(n).padStart(2, '0')}:00:00Z`;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-quality-'));
  runAt('2026-11-11T10:00:00Z', 'init', dir);
  runAt('2026-11-11T10:00:00Z', 'row', dir, '#10', 'title=Stage ten');
  runAt('2026-11-11T10:00:00Z', 'row', dir, '#20', 'title=Stage twenty');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the key of the usage (decision 2)', () => {
  it('names the model by family, keeps the effort as written and leaves out a session without cost', () => {
    put([
      { id: 'a', issue: '#10', kind: 'fase', model: 'claude-sonnet-5-5', effort: 'high' },
      { id: 'b', issue: '#10', kind: 'fase', model: 'claude-opus-5-5', effort: 'xhigh' },
      { id: 'c', issue: '#10', kind: 'fase', model: 'claude-haiku-5-5', effort: 'low' },
      { id: 'd', issue: '#10', kind: 'fase', model: 'claude-fable-5-2', effort: 'max' },
      { id: 'e', issue: '#10', kind: 'fase', model: 'gpt-x', effort: 'default' },
      { id: 'f', issue: '#10', kind: 'fase', model: '', effort: '' },
      {
        id: 'g',
        issue: '#10',
        kind: 'fase',
        model: 'claude-sonnet-5-5',
        effort: 'unknown',
      },
      { id: 'h', issue: '#10', kind: 'fase', noCost: true },
    ]);
    const keys = usage().map((u) => `${u.papel} ${u.modelo} ${u.esforco}`);
    expect(keys.sort()).toEqual(
      [
        'fase Sonnet high',
        'fase Opus xhigh',
        'fase Haiku low',
        'fase Fable max',
        'fase gpt-x default',
        'fase — —',
        'fase Sonnet unknown',
      ].sort(),
    );
  });
});

describe('the usage per key (decision 3)', () => {
  it('gives sessions, US$, pct, median per session and median context', () => {
    put([
      { id: 'a', issue: '#10', kind: 'fase', usd: 1, ctx: 100000, effort: 'high' },
      { id: 'b', issue: '#10', kind: 'fase', usd: 2, ctx: 200000, effort: 'high' },
      { id: 'c', issue: '#20', kind: 'fase', usd: 3, ctx: 300000, effort: 'high' },
      { id: 'd', issue: '#10', kind: 'testador', usd: 1, ctx: 150000 },
      { id: 'e', issue: '#20', kind: 'testador', usd: 3, ctx: 250000 },
    ]);
    expect(usageOf('fase', 'Sonnet', 'high')).toMatchObject({
      sessoes: 3,
      usd: 6,
      pct: 60,
      medianaSessao: 2,
      ctxMediano: 200000,
    });
    expect(usageOf('testador')).toMatchObject({
      sessoes: 2,
      usd: 4,
      pct: 40,
      medianaSessao: 2,
      ctxMediano: 200000,
    });
  });

  it('medianaEtapa takes only merged stages (concluída in the queue or in meta.merged) and is null with none', () => {
    runAt(
      '2026-11-11T10:00:00Z',
      'row',
      dir,
      '#30',
      'title=Stage thirty',
      'status=em andamento',
    );
    runAt('2026-11-11T10:00:00Z', 'row', dir, '#10', 'status=concluída');
    put(
      [
        { id: 'a', issue: '#10', kind: 'fase', usd: 2 },
        { id: 'b', issue: '#10', kind: 'fase', usd: 1 },
        { id: 'c', issue: '#20', kind: 'fase', usd: 5 },
        { id: 'd', issue: '#30', kind: 'fase', usd: 100 },
        { id: 'e', issue: '#30', kind: 'testador', usd: 7 },
      ],
      { merged: ['#20'] },
    );
    // #10 gives 2 + 1 = 3, #20 gives 5, the stage in progress (#30) does not enter: median of [3, 5]
    expect(usageOf('fase').medianaEtapa).toBe(4);
    expect(usageOf('testador').medianaEtapa).toBeNull();
  });

  it('acimaTeto counts ctx > 300000 only in fase, correção, testador and reteste', () => {
    const over = (id: string, kind: string, ctx: number): Seed => ({
      id,
      issue: '#10',
      kind,
      ctx,
    });
    put([
      over('a', 'fase', 300000),
      over('b', 'fase', 300001),
      over('c', 'fase', 400000),
      over('d', 'correção', 350000),
      over('e', 'testador', 301000),
      over('f', 'reteste', 300000),
      over('g', 'fechamento', 999999),
      over('h', 'coordenador', 999999),
      over('i', 'supervisor', 999999),
    ]);
    expect(usageOf('fase').acimaTeto).toBe(2);
    expect(usageOf('correção').acimaTeto).toBe(1);
    expect(usageOf('testador').acimaTeto).toBe(1);
    expect(usageOf('reteste').acimaTeto).toBe(0);
    for (const kind of ['fechamento', 'coordenador', 'supervisor']) {
      expect(usageOf(kind).acimaTeto).toBeNull();
    }
  });

  it('meta.uso is written on every write, and `uso` prints one line per key', () => {
    put([
      { id: 'a', issue: '#10', kind: 'fase', usd: 2, ctx: 190000, effort: 'high' },
      { id: 'b', issue: '#10', kind: 'fase', usd: 4, ctx: 210000, effort: 'high' },
      { id: 'c', issue: '#10', kind: 'testador', usd: 4 },
    ]);
    runAt('2026-11-20T01:00:00Z', 'log', dir, 'another write');
    expect(usage()).toHaveLength(2);
    const out = run('uso', dir);
    const lines = out.split('\n').filter((l) => /^\S+ \S+ \S+: \d+ sessões/.test(l));
    expect(lines).toHaveLength(2);
    expect(out).toMatch(
      /^fase Sonnet high: 2 sessões, US\$ 6\.00 \(60\.0%\), mediana US\$ 3\.00/m,
    );
    expect(out).toMatch(/^testador Sonnet medium: 1 sessões, US\$ 4\.00 \(40\.0%\)/m);
  });

  it('uso --desde filters by created (without it, by cost.at), like costs', () => {
    put([
      { id: 'a', issue: '#10', kind: 'fase', usd: 2, created: '2026-11-11T11:00:00Z' },
      { id: 'b', issue: '#10', kind: 'fase', usd: 4, created: '2026-11-12T11:00:00Z' },
      { id: 'c', issue: '#10', kind: 'fase', usd: 8 },
    ]);
    // `c` has no created: the cost.at ('2026-11-11T12:00:00Z') applies, so it is before the date too
    const out = run('uso', '--desde', '2026-11-12T00:00:00Z', dir);
    expect(out).toMatch(/^fase Sonnet medium: 1 sessões, US\$ 4\.00 \(100\.0%\)/m);
    const all = run('uso', dir);
    expect(all).toMatch(/^fase Sonnet medium: 3 sessões, US\$ 14\.00/m);
    expect(tryRun('uso', '--desde', 'yesterday', dir).code).toBe(2);
  });

  it('uso does not go into an apply', () => {
    const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'uso\n',
    });
    expect(r.status).toBe(2);
  });

  it('adds up the interventions per key: dono and the context switches, without changing the rework', () => {
    runAt('2026-11-11T10:00:00Z', 'row', dir, '#10', 'status=concluída');
    put([
      // the first session of the stage and label is not a switch; the next two are (they carry the key of their own effort)
      {
        id: 'a',
        issue: '#10',
        kind: 'fase',
        label: 'QM1',
        created: T(11),
        effort: 'high',
        sinais: { dono: 1 },
      },
      { id: 'b', issue: '#10', kind: 'fase', label: 'QM1', created: T(12) },
      { id: 'c', issue: '#10', kind: 'fase', label: 'QM1', created: T(13) },
      // another label, another stage and an empty label do not link up
      { id: 'd', issue: '#10', kind: 'fase', label: 'QM2', created: T(14) },
      { id: 'e', issue: '#20', kind: 'fase', label: 'QM1', created: T(15) },
      { id: 'f', issue: '#10', kind: 'fase', label: '', created: T(16) },
      { id: 'g', issue: '#10', kind: 'fase', label: '', created: T(17) },
    ]);
    expect(usageOf('fase', 'Sonnet', 'high').intervencoes).toBe(1);
    expect(usageOf('fase', 'Sonnet', 'medium').intervencoes).toBe(2);
    expect(usageOf('fase', 'Sonnet', 'high').comRetrabalho).toBe(0);
    expect(usageOf('fase', 'Sonnet', 'medium').comRetrabalho).toBe(0);
  });

  it('a lone context does not mark not published (the recalculated meta.uso changes nothing there)', () => {
    put([{ id: 'a', issue: '#10', kind: 'fase' }]);
    runAt('2026-11-20T02:00:00Z', 'published', dir);
    runAt('2026-11-20T02:00:00Z', 'published', dir, '--done');
    const out = runAt('2026-11-20T03:00:00Z', 'context', dir, '20');
    expect(out).toMatch(/^alterados: meta\.json$/m);
    expect(metaFile().unpublished).toBeUndefined();
    expect(runAt('2026-11-20T03:00:00Z', 'show', dir)).toMatch(
      /^não publicado: nenhum$/m,
    );
  });
});

describe('painel.py sinal (decision 4)', () => {
  beforeEach(() => {
    runAt('2026-11-11T11:00:00Z', 'session', dir, '#10', 'f1', 'kind=fase', 'label=QM1');
    runAt(
      '2026-11-11T11:00:00Z',
      'session',
      dir,
      '#10',
      't1',
      'kind=testador',
      'label=blocks',
    );
    runAt(
      '2026-11-11T11:00:00Z',
      'session',
      dir,
      '#10',
      'r1',
      'kind=reteste',
      'label=r1',
    );
  });

  const sinais = (id: string): Entry =>
    (sessions().find((e) => e.id === id)!.sinais ?? {}) as Entry;

  it('writes the fields of a fase into meta.sessions[i].sinais', () => {
    runAt(
      '2026-11-11T12:00:00Z',
      'sinal',
      dir,
      'f1',
      'ci=2',
      'cr=5',
      'crFix=3',
      'sub=2 Sonnet medium, 1 Haiku low',
    );
    expect(sinais('f1')).toEqual({
      ci: 2,
      cr: 5,
      crFix: 3,
      sub: '2 Sonnet medium, 1 Haiku low',
    });
  });

  it('+k adds, a plain number replaces', () => {
    run('sinal', dir, 'f1', 'dono=+1');
    run('sinal', dir, 'f1', 'dono=+1');
    expect(sinais('f1').dono).toBe(2);
    run('sinal', dir, 'f1', 'ci=2');
    run('sinal', dir, 'f1', 'ci=1');
    expect(sinais('f1').ci).toBe(1);
    run('sinal', dir, 'f1', 'ciclo=+1');
    expect(sinais('f1').ciclo).toBe(1);
  });

  it('falso= appends to the list falsos of a reteste', () => {
    run('sinal', dir, 'r1', 'falso=medium');
    run('sinal', dir, 'r1', 'falso=low');
    expect(sinais('r1').falsos).toEqual(['medium', 'low']);
  });

  it('writes the result of a testador', () => {
    run('sinal', dir, 't1', 'ok=40', 'falha=2', 'alta=0', 'media=1', 'baixa=1');
    expect(sinais('t1')).toEqual({ ok: 40, falha: 2, alta: 0, media: 1, baixa: 1 });
  });

  it.each([
    ['an id outside meta.sessions', ['nope', 'ci=1']],
    ['a field of another role in a fase (ok=)', ['f1', 'ok=1']],
    ['a field of another role in a testador (ci=)', ['t1', 'ci=1']],
    ['an unknown field', ['f1', 'foo=1']],
    ['a negative number', ['f1', 'ci=-1']],
    ['text where a number is expected', ['f1', 'ci=abc']],
    ['falso= with another severity', ['r1', 'falso=critical']],
    ['a good field next to a bad one (all or nothing)', ['f1', 'ci=2', 'ok=1']],
  ])('%s exits with code 2 and writes nothing', (_name, args) => {
    const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    const r = tryRun('sinal', dir, ...args);
    expect(r.code).toBe(2);
    expect(r.err).not.toMatch(/Traceback/);
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
  });

  it('goes into an apply', () => {
    const ok = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'sinal f1 ci=2 "sub=1 Haiku low"\nsinal t1 ok=3\n',
    });
    expect(ok.status).toBe(0);
    expect(sinais('f1')).toEqual({ ci: 2, sub: '1 Haiku low' });
    expect(sinais('t1')).toEqual({ ok: 3 });
  });
});

describe('painel.py escapado (decision 5)', () => {
  it('writes meta.escapados and replaces the same bug without duplicating', () => {
    runAt('2026-11-12T10:00:00Z', 'escapado', dir, '#900', 'etapa=#800', 'sev=high');
    expect(metaFile().escapados).toEqual([
      { bug: '#900', etapa: '#800', sev: 'high', at: '2026-11-12T10:00:00Z' },
    ]);
    runAt('2026-11-12T11:00:00Z', 'escapado', dir, '#900', 'etapa=#800', 'sev=medium');
    runAt('2026-11-12T11:00:00Z', 'escapado', dir, '#901', 'etapa=#800', 'sev=low');
    expect((metaFile().escapados as Entry[]).map((x) => `${x.bug} ${x.sev}`)).toEqual([
      '#900 medium',
      '#901 low',
    ]);
  });

  it.each([
    ['a severity outside high|medium|low', ['#900', 'etapa=#800', 'sev=critical']],
    ['a missing etapa', ['#900', 'sev=high']],
    ['a missing sev', ['#900', 'etapa=#800']],
    ['a bug without #', ['900', 'etapa=#800', 'sev=high']],
    ['an unknown field', ['#900', 'etapa=#800', 'sev=high', 'foo=1']],
    ['no bug', []],
  ])('%s exits with code 2 and writes nothing', (_name, args) => {
    const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    expect(tryRun('escapado', dir, ...args).code).toBe(2);
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
  });

  it('--conferido writes meta.escapadosAt, and goes into an apply', () => {
    runAt('2026-11-12T10:00:00Z', 'escapado', dir, '--conferido');
    expect(metaFile().escapadosAt).toBe('2026-11-12T10:00:00Z');
    const batch = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: "escapado '#905' etapa='#800' sev=low\nescapado --conferido\n",
    });
    expect(batch.status).toBe(0);
    expect((metaFile().escapados as Entry[]).map((x) => x.bug)).toEqual(['#905']);
  });

  it('show prints the escapados line: never checked, checked 3 h ago, checked 25 h ago, and with none', () => {
    expect(runAt('2026-11-12T10:00:00Z', 'show', dir)).toMatch(
      /^escapados: 0 · conferidos: nunca — conferir$/m,
    );
    runAt('2026-11-12T10:00:00Z', 'escapado', dir, '#900', 'etapa=#800', 'sev=high');
    expect(runAt('2026-11-12T10:00:00Z', 'show', dir)).toMatch(
      /^escapados: 1 \(#900→#800 high\) · conferidos: nunca — conferir$/m,
    );
    runAt('2026-11-12T10:00:00Z', 'escapado', dir, '--conferido');
    expect(runAt('2026-11-12T13:00:00Z', 'show', dir)).toMatch(
      /^escapados: 1 \(#900→#800 high\) · conferidos há 3 h$/m,
    );
    expect(runAt('2026-11-13T11:00:00Z', 'show', dir)).toMatch(
      /^escapados: 1 \(#900→#800 high\) · conferidos há 25 h — conferir$/m,
    );
  });
});

describe('painel.py historico (decision 10)', () => {
  it('show says a recuperar without meta.historico, and recuperado after --feito', () => {
    expect(runAt('2026-11-12T10:00:00Z', 'show', dir)).toMatch(
      /^histórico: a recuperar$/m,
    );
    runAt(
      '2026-11-12T10:00:00Z',
      'historico',
      dir,
      '--feito',
      'desde=2026-11-11T06:08:32Z',
      'ate=2026-11-14T00:30:00Z',
      'linhas=3',
    );
    expect(metaFile().historico).toEqual({
      desde: '2026-11-11T06:08:32Z',
      ate: '2026-11-14T00:30:00Z',
      linhas: 3,
    });
    expect(runAt('2026-11-12T10:00:00Z', 'show', dir)).toMatch(
      /^histórico: recuperado \(2026-11-11T06:08:32Z a 2026-11-14T00:30:00Z; 3 linhas sem sessão\)$/m,
    );
  });

  it.each([
    [
      'desde outside ISO UTC',
      ['--feito', 'desde=2026-11-11', 'ate=2026-11-14T00:30:00Z'],
    ],
    ['ate outside ISO UTC', ['--feito', 'desde=2026-11-11T06:08:32Z', 'ate=tomorrow']],
    ['a missing ate', ['--feito', 'desde=2026-11-11T06:08:32Z']],
    [
      'an inverted range (desde after ate)',
      ['--feito', 'desde=2026-11-14T00:30:00Z', 'ate=2026-11-11T06:08:32Z'],
    ],
    ['no --feito', ['desde=2026-11-11T06:08:32Z', 'ate=2026-11-14T00:30:00Z']],
    [
      'linhas that is not a number',
      ['--feito', 'desde=2026-11-11T06:08:32Z', 'ate=2026-11-14T00:30:00Z', 'linhas=x'],
    ],
  ])('%s exits with code 2 and writes nothing', (_name, args) => {
    const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    expect(tryRun('historico', dir, ...args).code).toBe(2);
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
  });
});

describe('the rework ruler (decision 6)', () => {
  /** The stage #10 decided (merged), with the sessions of the case. */
  function decided(seeds: Seed[], extra: { escapados?: Entry[] } = {}): void {
    put(seeds, { merged: ['#10'], ...extra });
  }
  const phase = (sinais?: Entry): Seed => ({
    id: 'f1',
    issue: '#10',
    kind: 'fase',
    label: 'QM1',
    created: T(11),
    ...(sinais ? { sinais } : {}),
  });
  const reworked = (papel: string): [unknown, unknown] => {
    const u = usageOf(papel);
    return [u.comRetrabalho, u.decididas];
  };

  it('leaves a stage that is not merged out: neither clean nor with rework', () => {
    put([
      { ...phase({ ci: 3 }) },
      { id: 'c1', issue: '#10', kind: 'correção', label: 'CL1', created: T(12) },
    ]);
    expect(usageOf('fase')).toMatchObject({
      decididas: 0,
      comRetrabalho: 0,
      sequencia: 0,
    });
    expect(usageOf('correção')).toMatchObject({ decididas: 0, comRetrabalho: 0 });
    expect(usageOf('fase').candidato).toBeNull();
  });

  it('fase: rework through a correção in the stage', () => {
    decided([
      phase(),
      { id: 'c1', issue: '#10', kind: 'correção', label: 'CL1', created: T(12) },
    ]);
    expect(reworked('fase')).toEqual([1, 1]);
  });

  it.each([
    [{ alta: 1, media: 0 }, 1],
    [{ alta: 0, media: 1 }, 1],
    [{ alta: 0, media: 0, baixa: 3 }, 0],
  ])('fase: a testador of the stage with %j gives %i', (sinais, expected) => {
    decided([
      phase(),
      { id: 't1', issue: '#10', kind: 'testador', label: 'b', created: T(12), sinais },
    ]);
    expect(reworked('fase')).toEqual([expected, 1]);
  });

  it.each([
    ['high', 1],
    ['medium', 1],
    ['low', 0],
  ])('fase: an escaped defect %s of the stage gives %i', (sev, expected) => {
    decided([phase()], { escapados: [{ bug: '#900', etapa: '#10', sev, at: T(20) }] });
    expect(reworked('fase')).toEqual([expected, 1]);
  });

  it('fase: an escaped defect of another stage does not count', () => {
    decided([phase()], {
      escapados: [{ bug: '#900', etapa: '#20', sev: 'high', at: T(20) }],
    });
    expect(reworked('fase')).toEqual([0, 1]);
  });

  it.each([
    [{ ci: 2 }, 1],
    [{ ci: 1 }, 0],
    [{ ciclo: 1 }, 1],
    [{ ciclo: 0, ci: 0 }, 0],
  ])('fase: its own sinais %j give %i', (sinais, expected) => {
    decided([phase(sinais)]);
    expect(reworked('fase')).toEqual([expected, 1]);
  });

  it('a session without sinais (history) has no rework for the lack of data', () => {
    decided([phase()]);
    expect(reworked('fase')).toEqual([0, 1]);
    expect(usageOf('fase').sequencia).toBe(1);
  });

  it('correção: rework through a later correção of another label, not of the same one', () => {
    decided([
      { id: 'c1', issue: '#10', kind: 'correção', label: 'CL1', created: T(11) },
      { id: 'c2', issue: '#10', kind: 'correção', label: 'CL2', created: T(12) },
    ]);
    // c1 has a later correção of another label; c2 is the last one
    expect(reworked('correção')).toEqual([1, 2]);
    decided([
      { id: 'c1', issue: '#10', kind: 'correção', label: 'CL1', created: T(11) },
      { id: 'c2', issue: '#10', kind: 'correção', label: 'CL1', created: T(12) },
    ]);
    expect(reworked('correção')).toEqual([0, 2]);
  });

  it('correção: rework through a reteste created later with alta + media > 0', () => {
    const c1: Seed = {
      id: 'c1',
      issue: '#10',
      kind: 'correção',
      label: 'CL1',
      created: T(11),
    };
    const reteste = (created: string, sinais: Entry): Seed => ({
      id: 'r1',
      issue: '#10',
      kind: 'reteste',
      label: 'r1',
      created,
      sinais,
    });
    decided([c1, reteste(T(12), { alta: 0, media: 1 })]);
    expect(reworked('correção')).toEqual([1, 1]);
    decided([c1, reteste(T(10), { alta: 2, media: 0 })]); // created before the correção
    expect(reworked('correção')).toEqual([0, 1]);
    decided([c1, reteste(T(12), { alta: 0, media: 0, baixa: 4 })]);
    expect(reworked('correção')).toEqual([0, 1]);
  });

  it.each([
    [
      'escaped high',
      { escapados: [{ bug: '#900', etapa: '#10', sev: 'high', at: T(20) }] },
      undefined,
      1,
    ],
    [
      'escaped low',
      { escapados: [{ bug: '#900', etapa: '#10', sev: 'low', at: T(20) }] },
      undefined,
      0,
    ],
    ['ci 2', {}, { ci: 2 }, 1],
    ['ci 1', {}, { ci: 1 }, 0],
    ['ciclo 1', {}, { ciclo: 1 }, 1],
  ])('correção: %s', (_name, extra, sinais, expected) => {
    decided(
      [
        {
          id: 'c1',
          issue: '#10',
          kind: 'correção',
          label: 'CL1',
          created: T(11),
          ...(sinais ? { sinais } : {}),
        },
      ],
      extra,
    );
    expect(reworked('correção')).toEqual([expected, 1]);
  });

  it.each([
    ['high', 1],
    ['medium', 1],
    ['low', 0],
  ])('testador: an escaped defect %s of the stage gives %i', (sev, expected) => {
    decided([{ id: 't1', issue: '#10', kind: 'testador', label: 'b', created: T(11) }], {
      escapados: [{ bug: '#900', etapa: '#10', sev, at: T(20) }],
    });
    expect(reworked('testador')).toEqual([expected, 1]);
    decided([{ id: 't1', issue: '#10', kind: 'testador', label: 'b', created: T(11) }]);
    expect(reworked('testador')).toEqual([0, 1]);
  });

  it.each([
    [['medium'], 1],
    [['high', 'low'], 1],
    [['low'], 0],
    [undefined, 0],
  ])('reteste: falsos %j gives %i', (falsos, expected) => {
    decided([
      {
        id: 'r1',
        issue: '#10',
        kind: 'reteste',
        label: 'r1',
        created: T(11),
        ...(falsos ? { sinais: { falsos } } : {}),
      },
    ]);
    expect(reworked('reteste')).toEqual([expected, 1]);
  });

  it('fechamento, coordenador and supervisor have no ruler', () => {
    decided([
      { id: 'x1', issue: '#10', kind: 'fechamento', created: T(11) },
      { id: 'x2', issue: '#10', kind: 'coordenador', created: T(12) },
      { id: 'x3', issue: '#10', kind: 'supervisor', created: T(13) },
    ]);
    for (const kind of ['fechamento', 'coordenador', 'supervisor']) {
      expect(usageOf(kind)).toMatchObject({
        decididas: null,
        comRetrabalho: null,
        sequencia: null,
        candidato: null,
      });
    }
  });
});

describe('the clean streak and the candidate (decision 7)', () => {
  /** `n` sessions of the kind, each one in its own merged stage, in chronological order; `dirty` are the indexes with `ci` 2. */
  function streak(
    n: number,
    o: { kind?: string; model?: string; effort?: string; dirty?: number[] } = {},
  ): void {
    const seeds: Seed[] = [];
    const merged: string[] = [];
    for (let i = 0; i < n; i++) {
      const issue = `#${100 + i}`;
      merged.push(issue);
      seeds.push({
        id: `s${i}`,
        issue,
        kind: o.kind ?? 'correção',
        label: `L${i}`,
        created: `2026-11-${String(11 + Math.floor(i / 20)).padStart(2, '0')}T${String(i % 20).padStart(2, '0')}:00:00Z`,
        model: o.model ?? 'claude-sonnet-5-5',
        effort: o.effort ?? 'medium',
        ...(o.dirty?.includes(i) ? { sinais: { ci: 2 } } : {}),
      });
    }
    put(seeds, { merged });
  }

  it('10 clean correção Sonnet medium give sequencia 10 and the candidate Haiku medium, and show prints it', () => {
    streak(10);
    expect(usageOf('correção')).toMatchObject({
      decididas: 10,
      comRetrabalho: 0,
      sequencia: 10,
      candidato: 'Haiku medium',
    });
    expect(run('show', dir)).toMatch(
      /^candidatos a teste: correção Sonnet medium → Haiku medium \(10 seguidas\)$/m,
    );
  });

  it('9 do not give a candidate, and show says nenhum', () => {
    streak(9);
    expect(usageOf('correção')).toMatchObject({ sequencia: 9, candidato: null });
    expect(run('show', dir)).toMatch(/^candidatos a teste: nenhum$/m);
  });

  it('a session with rework in the middle zeroes the count from there back (the most recent ones count)', () => {
    streak(14, { dirty: [3] }); // 10 newer ones after the dirty one
    expect(usageOf('correção')).toMatchObject({
      comRetrabalho: 1,
      sequencia: 10,
      candidato: 'Haiku medium',
    });
    streak(14, { dirty: [5] }); // only 8 newer ones
    expect(usageOf('correção')).toMatchObject({
      comRetrabalho: 1,
      sequencia: 8,
      candidato: null,
    });
  });

  it('a fresh panel says candidatos a teste: nenhum', () => {
    expect(run('show', dir)).toMatch(/^candidatos a teste: nenhum$/m);
  });

  it.each([
    ['fase', 'claude-sonnet-5-5', 'high', 'Sonnet medium'],
    ['fase', 'claude-opus-5-5', 'xhigh', 'Opus high'],
    ['fase', 'claude-fable-5-2', 'max', 'Fable xhigh'],
    ['fase', 'claude-haiku-5-5', 'high', 'Haiku medium'],
    ['fase', 'claude-opus-5-5', 'medium', 'Sonnet medium'],
    ['fase', 'claude-fable-5-2', 'low', 'Opus low'],
    ['fase', 'claude-sonnet-5-5', 'low', 'Haiku low'],
    ['fase', 'claude-haiku-5-5', 'medium', null],
    ['fase', 'claude-haiku-5-5', 'low', null],
    ['fase', 'claude-sonnet-5-5', 'default', null],
    ['fase', 'claude-sonnet-5-5', 'unknown', null],
    ['fase', 'gpt-x', 'medium', null],
    ['fechamento', 'claude-sonnet-5-5', 'high', null],
  ])('%s %s %s gives the step below %s', (kind, model, effort, expected) => {
    streak(10, { kind, model, effort });
    const family = model.includes('haiku')
      ? 'Haiku'
      : model.includes('opus')
        ? 'Opus'
        : model.includes('fable')
          ? 'Fable'
          : model.includes('sonnet')
            ? 'Sonnet'
            : model;
    expect(usageOf(kind, family, effort).candidato).toBe(expected);
  });
});
// portuguese-guard:end
