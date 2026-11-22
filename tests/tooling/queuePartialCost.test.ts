// Phase GW5 (stage #2293, decisions 12 to 14): the cost of an imported stage is partial (`meta.partialCost`, written by
// `import`), `costs` marks it, the per-stage medians and `outliers` leave it out, the page shows `(partial)`, and
// `painel.py cost` refuses a `ctx` in thousands. The panel's output is Portuguese (frozen vocabulary), so the file is a
// guard block.
// portuguese-guard:begin expected panel output and session kinds, frozen vocabulary of decision 16 of #741
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const PAGE = '.claude/skills/implementar-fila/painel/index.html';
const NOW = '2026-11-12T10:00:00Z';
const TOKENS = 150000;
const SUBPROCESS_TIMEOUT = 30_000;

type Row = Record<string, unknown>;

let root = '';
let dir = '';
let oldDir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function tryRun(...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, '--now', NOW, ...args], {
    encoding: 'utf8',
    input: '',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function json(where: string, name: string): Row[] {
  return JSON.parse(readFileSync(path.join(where, `${name}.json`), 'utf8')) as Row[];
}

function meta(where = dir): Row {
  return json(where, 'meta')[0]!;
}

/** Writes keys straight into the `meta.json` (what an old or published panel carries). */
function patchMeta(patch: Row, where = dir): void {
  writeFileSync(
    path.join(where, 'meta.json'),
    JSON.stringify([{ ...meta(where), ...patch }], null, 1),
  );
}

function legacyRow(over: Row): Row {
  return {
    order: 0,
    issue: '',
    title: '',
    kind: 'etapa',
    step: '',
    status: 'aguardando',
    pr: '',
    started: '',
    ended: '',
    phases: '',
    phasesTotal: 0,
    phasesDone: 0,
    stage: '',
    plan: '',
    child: '',
    childAt: '',
    ciWait: '',
    ciWaitAt: '',
    wait: '',
    sessions: '',
    hold: '',
    ...over,
  };
}

function writeOld(queue: Row[], oldMeta: Row): void {
  mkdirSync(oldDir, { recursive: true });
  writeFileSync(path.join(oldDir, 'queue.json'), JSON.stringify(queue, null, 1));
  writeFileSync(path.join(oldDir, 'meta.json'), JSON.stringify([oldMeta], null, 1));
  writeFileSync(path.join(oldDir, 'log.json'), JSON.stringify([], null, 1));
}

const canary = (sessoes: string[]): Row => ({
  id: 'A',
  papel: 'fase',
  de: 'Sonnet medium',
  modelo: 'Haiku',
  esforco: 'medium',
  n: 5,
  volta: 2,
  inicio: '2026-11-12T12:00:00Z',
  sessoes,
  estado: 'ativo',
  motivo: '',
  fim: null,
  resumo: { antes: { sessoes: 0 }, canario: { sessoes: 0 }, veredito: 'não promover' },
});

const costed = (id: string, issue: string, usd: number): Row => ({
  id,
  issue,
  kind: 'fase',
  label: 'P1',
  created: '2026-11-12T12:30:00Z',
  cost: { usd, ctx: TOKENS, model: 'claude-sonnet-5-5', effort: 'medium' },
});

/** The old panel of decision 12: a started row `#100`, a waiting one `#200` and a canary session of `#100`. */
function writeStartedOld(extraMeta: Row = {}): void {
  writeOld(
    [
      legacyRow({
        order: 1,
        issue: '#100',
        title: 'Started',
        status: 'em andamento',
        started: '2026-11-12T09:00:00Z',
      }),
      legacyRow({ order: 2, issue: '#200', title: 'Waiting', status: 'aguardando' }),
    ],
    {
      canarios: [canary(['sa1'])],
      sessions: [costed('sa1', '#100', 3), costed('sa2', '#100', 4)],
      ...extraMeta,
    },
  );
}

function stage(n: number, usd: number, status = 'concluída'): void {
  run('row', dir, `#${n}`, `title=Stage ${n}`, `status=${status}`);
  run('session', dir, `#${n}`, `s_${n}`, 'kind=fase', 'label=P1');
  run(
    'cost',
    dir,
    `s_${n}`,
    `usd=${usd}`,
    `ctx=${TOKENS}`,
    'model=claude-sonnet-5-5',
    'effort=medium',
  );
}

function fasePhase(): Row {
  const row = (meta().uso as Row[]).find((u) => u.papel === 'fase');
  if (!row) throw new Error('no usage row for fase');
  return row;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'painel-partial-'));
  dir = path.join(root, 'new');
  oldDir = path.join(root, 'old');
  run('init', dir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('painel.py import writes meta.partialCost (decision 12)', () => {
  it(
    'a started row and the stage of a canary session are partial; a waiting row is not',
    () => {
      writeStartedOld();
      run('import', dir, oldDir);
      expect(meta().partialCost).toEqual(['#100']);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'a stage that only comes through a carried canary session is partial too',
    () => {
      writeOld(
        [
          legacyRow({
            order: 1,
            issue: '#300',
            title: 'Done',
            status: 'concluída',
            started: '2026-11-11T09:00:00Z',
          }),
          legacyRow({ order: 2, issue: '#200', title: 'Waiting' }),
        ],
        { canarios: [canary(['sc1'])], sessions: [costed('sc1', '#300', 2)] },
      );
      run('import', dir, oldDir);
      expect(meta().partialCost).toEqual(['#300']);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "an old panel's own partialCost is carried in the union, sorted and without repeats",
    () => {
      writeStartedOld({ partialCost: ['#150', '#100'] });
      run('import', dir, oldDir);
      expect(meta().partialCost).toEqual(['#100', '#150']);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'with nothing partial there is no key',
    () => {
      writeOld([legacyRow({ order: 1, issue: '#200', title: 'Waiting' })], {});
      run('import', dir, oldDir);
      expect(meta()).not.toHaveProperty('partialCost');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('painel.py costs marks a partial stage (decision 13)', () => {
  it(
    'after the import, #100 prints (partial: imported) and #200 does not; the total stays',
    () => {
      writeStartedOld();
      run('import', dir, oldDir);
      run('session', dir, '#200', 'n200', 'kind=fase', 'label=P1');
      run('cost', dir, 'n200', 'usd=2', `ctx=${TOKENS}`);
      const out = run('costs', dir);
      const lines = out.split('\n');
      expect(lines.find((l) => l.startsWith('  #100:'))).toBe(
        '  #100: 1 sessões, US$ 3.00 (partial: imported)',
      );
      expect(lines.find((l) => l.startsWith('  #200:'))).toBe(
        '  #200: 1 sessões, US$ 2.00',
      );
      expect(lines[0]).toBe('custo total: US$ 5.00 em 2 sessões');
      expect(run('show', dir)).toContain('custo: US$ 5.00 em 2 sessões');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('the per-stage medians leave a decided partial stage out (decision 13)', () => {
  it('uso.medianaEtapa ignores #A once decided; usd and pct do not change', () => {
    stage(100, 5);
    stage(200, 2);
    expect(fasePhase().medianaEtapa).toBe(3.5);
    patchMeta({ partialCost: ['#100'] });
    run('log', dir, 'refresh');
    expect(fasePhase()).toMatchObject({ medianaEtapa: 2, usd: 7, pct: 100 });
  });

  it('a partial stage that is not decided yet changes nothing, and none decided gives null', () => {
    stage(100, 5, 'em andamento');
    stage(200, 2);
    patchMeta({ partialCost: ['#200'] });
    run('log', dir, 'refresh');
    expect(fasePhase().medianaEtapa ?? null).toBeNull();
  });

  it('medianaEtapa of a canary side leaves the partial stage out', () => {
    run('row', dir, '#10', 'status=concluída');
    run('row', dir, '#20', 'status=concluída');
    for (const [id, issue, usd, at] of [
      ['b1', '#10', 4, '2026-11-11T11:00:00Z'],
      ['b2', '#20', 6, '2026-11-11T12:00:00Z'],
    ] as const) {
      run('--now', at, 'session', dir, issue, id, 'kind=fase', 'label=P1');
      run(
        'cost',
        dir,
        id,
        `usd=${usd}`,
        `ctx=${TOKENS}`,
        'model=claude-sonnet-5-5',
        'effort=medium',
      );
    }
    run(
      '--now',
      '2026-11-12T12:00:00Z',
      'canario',
      dir,
      'add',
      'A',
      'papel=fase',
      'de=Sonnet medium',
      'modelo=haiku',
      'n=5',
      'volta=2',
    );
    const before = () => ((meta().canarios as Row[])[0]!.resumo as Row).antes as Row;
    expect(before().medianaEtapa).toBe(5);
    patchMeta({ partialCost: ['#10'] });
    run('log', dir, 'refresh');
    expect(before().medianaEtapa).toBe(6);
  });
});

describe('painel.py outliers leaves a partial stage out of the base (decision 13)', () => {
  const ficha =
    '| toca=src/model/x.ts,tests/model/x.test.ts | testador=R12 ; visual=nenhuma ; Sonnet medium';

  function outlierStage(n: number, usd: number): void {
    run(
      'row',
      dir,
      `#${n}`,
      `title=Stage ${n}`,
      'status=concluída',
      'started=2026-11-12T08:00:00Z',
      `plan=fases=P1:#1:high,P2:#1:high ${ficha}`,
    );
    run('session', dir, `#${n}`, `o_${n}`, 'kind=fase', 'label=P1');
    run('cost', dir, `o_${n}`, `usd=${usd}`, `ctx=${TOKENS}`);
  }

  it('takes the stage out of the base and prints ", partial: 1" in the header', () => {
    for (const n of [10, 11, 12, 13, 14]) outlierStage(n, 4);
    outlierStage(20, 20);
    patchMeta({ partialCost: ['#20'] });
    run('log', dir, 'refresh');
    const out = run('outliers', dir);
    expect(out.split('\n')[0]).toBe(
      'outliers (since all): 5 stages in the base, without ficha: 0, partial: 1',
    );
    expect(out).not.toContain('#20 ');
    expect(out).toContain('none above the ceiling');
  });

  it('without a partial stage the header says ", partial: 0" and #20 is still listed', () => {
    for (const n of [10, 11, 12, 13, 14]) outlierStage(n, 4);
    outlierStage(20, 20);
    const out = run('outliers', dir);
    expect(out.split('\n')[0]).toBe(
      'outliers (since all): 6 stages in the base, without ficha: 0, partial: 0',
    );
    expect(out).toContain('  #20 US$ 20.00');
  });
});

describe('painel.py cost refuses a ctx in thousands (decision 14)', () => {
  beforeEach(() => {
    run('row', dir, '#10', 'title=Stage ten');
    run('session', dir, '#10', 's1', 'kind=fase', 'label=P1');
  });

  it.each(['324', '1', '1000'])(
    'ctx=%s exits with 2, prints the error and writes nothing',
    (ctx) => {
      const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
      const r = tryRun('cost', dir, 's1', 'usd=1', `ctx=${ctx}`);
      expect(r.code).toBe(2);
      expect(r.err).toContain(
        `erro: ctx= is the token count (context_usage.used_tokens), not thousands: ${ctx}`,
      );
      expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
    },
  );

  it.each(['0', '1001', '324000'])('ctx=%s is accepted', (ctx) => {
    expect(tryRun('cost', dir, 's1', 'usd=1', `ctx=${ctx}`).code).toBe(0);
    const entry = (meta().sessions as Row[]).find((e) => e.id === 's1')!;
    expect((entry.cost as Row).ctx).toBe(Number(ctx));
  });

  it('inside apply it is an Erro with the line number and writes nothing', () => {
    const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    const r = spawnSync('python3', [SCRIPT, '--now', NOW, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'log ok\ncost s1 usd=1 ctx=324\n',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/linha 2\b/);
    expect(r.stderr).toContain('not thousands: 324');
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
  });
});
// portuguese-guard:end

describe('page: (partial) after the cost of a partial stage (decision 13)', () => {
  const QUEUE: Row[] = [1, 2].map((n) => ({
    order: n,
    issue: `#${n}`,
    title: `Stage ${n}`,
    kind: 'etapa',
    status: 'concluída',
    stage: '',
    step: '',
    pr: '',
    ciWait: '',
    started: '2026-11-13T09:00:00Z',
    ended: '2026-11-13T10:00:00Z',
    phases: '',
    phasesTotal: 0,
    phasesDone: 0,
  }));
  const NODES = [1, 2].map((n) => ({
    issue: `#${n}`,
    titulo: `Stage ${n}`,
    onda: 0,
    rank: null,
    estado: 'livre',
    motivo: '',
    fase: '',
    feitas: 0,
    total: 0,
  }));
  const SESSIONS = [
    { id: 's1', kind: 'fase', issue: '#1', cost: { usd: 2 } },
    { id: 's2', kind: 'fase', issue: '#2', cost: { usd: 3 } },
  ];

  function mount(extra: Row): void {
    const parsed = new DOMParser().parseFromString(
      readFileSync(PAGE, 'utf8'),
      'text/html',
    );
    const script = parsed.querySelector('script')?.textContent ?? '';
    document.body.replaceChildren(...Array.from(parsed.body.childNodes));
    const datasets: Record<string, Row[]> = {
      queue: QUEUE,
      meta: [{ sessions: SESSIONS, grafoNos: NODES, grafoSetas: [], ...extra }],
      log: [],
    };
    const calcs = new Map<string, { inputs: string[]; fn: (...d: Row[][]) => Row[] }>();
    let onData: () => void = () => undefined;
    const dash = {
      calc: (id: string, spec: { inputs: string[]; fn: (...d: Row[][]) => Row[] }) =>
        calcs.set(id, spec),
      data: (id: string) => {
        const calc = calcs.get(id);
        return {
          status: 'ok',
          data: calc
            ? calc.fn(...calc.inputs.map((i) => datasets[i] ?? []))
            : (datasets[id] ?? []),
        };
      },
      onData: (cb: () => void) => {
        onData = cb;
      },
    };
    new Function('dash', 'setInterval', script)(dash, () => 0);
    onData();
  }

  const graph = (issue: string) =>
    document.querySelector(`#mp-grafo article[data-issue="${issue}"] .custo`)
      ?.textContent ?? null;
  const done = (issue: string) =>
    Array.from(document.querySelectorAll('#mp-concluidas .cl'))
      .find((l) => l.querySelector('a.num')?.textContent?.includes(issue.slice(1)))
      ?.querySelector('.custo')?.textContent ?? null;
  const bars = () =>
    Array.from(document.querySelectorAll('#mp-custo-etapas .hb')).map((b) => [
      b.querySelector('.n')?.textContent,
      b.querySelector('.v')?.textContent,
    ]);

  it('the graph card, "Completed" and the most expensive stages bar show (partial) for #1 only', () => {
    mount({ partialCost: ['#1'] });
    expect(graph('#1')).toBe('US$ 2,00 (partial)');
    expect(graph('#2')).toBe('US$ 3,00');
    expect(done('#1')).toBe('US$ 2,00 (partial)');
    expect(done('#2')).toBe('US$ 3,00');
    expect(bars()).toEqual([
      ['#2', 'US$ 3,00'],
      ['#1', 'US$ 2,00 (partial)'],
    ]);
  });

  it('reads partialCost as JSON text too', () => {
    mount({ partialCost: JSON.stringify(['#2']) });
    expect(graph('#2')).toBe('US$ 3,00 (partial)');
    expect(graph('#1')).toBe('US$ 2,00');
  });

  it.each([[undefined], ['{'], [{ a: 1 }], ['text'], [[1, null]]])(
    'partialCost %j (missing or invalid) is none',
    (value) => {
      mount(value === undefined ? {} : { partialCost: value });
      expect(graph('#1')).toBe('US$ 2,00');
      expect(done('#2')).toBe('US$ 3,00');
      expect(bars()[1]).toEqual(['#1', 'US$ 2,00']);
    },
  );
});
