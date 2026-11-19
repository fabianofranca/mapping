// @vitest-environment node
// Phase CC2 (stage #1937, decisions 3 to 11): `painel.py outliers` flags the stages whose cost per planned
// phase is above twice the median of their group (product or process), with the cause. Read-only.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const AT = '2026-11-12T10:00:00Z';

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', AT, ...args], { encoding: 'utf8' });
}

function tryRun(...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, '--now', AT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const PRODUCT_TOCA = 'src/model/x.ts,tests/model/x.test.ts';
const PROCESS_TOCA = 'docs/FLOW.md#for-the-phase-session,tests/tooling/x.test.ts';

type Spec = [kind: string, usd: number, ctx?: number, label?: string];

interface StageOptions {
  phases?: number;
  toca?: string;
  testador?: string;
  started?: string;
  fases?: string;
  status?: string;
}

function ficha(o: StageOptions): string {
  const codes = Array.from({ length: o.phases ?? 2 }, (_, i) => `P${i + 1}:#1:high`).join(
    ',',
  );
  return `fases=${
    o.fases ?? codes
  } | toca=${o.toca ?? PRODUCT_TOCA} | testador=${o.testador ?? 'R12'} ; visual=nenhuma ; Sonnet medium`;
}

/** A finished stage with its sessions (kind, US$, ctx, label). */
function stage(n: number, specs: Spec[], o: StageOptions = {}): void {
  run(
    'row',
    dir,
    `#${n}`,
    `title=Stage ${n}`,
    `status=${o.status ?? 'concluída'}`,
    `started=${o.started ?? '2026-11-12T08:00:00Z'}`,
    `plan=${ficha(o)}`,
  );
  specs.forEach(([kind, usd, ctx, label], i) => {
    const id = `s_${n}_${i}`;
    run(
      'session',
      dir,
      `#${n}`,
      id,
      `kind=${kind}`,
      ...(label ? [`label=${label}`] : []),
    );
    run('cost', dir, id, `usd=${usd}`, `ctx=${ctx ?? 1000}`);
  });
}

/** Four cheap stages (US$ 4 in 2 phases, i.e. US$ 2 per phase), numbered from `from`. */
function cheap(from: number, count = 4, o: StageOptions = {}): void {
  for (let i = 0; i < count; i++) stage(from + i, [['fase', 4]], o);
}

function files(): Record<string, [string, number]> {
  const out: Record<string, [string, number]> = {};
  for (const f of ['queue', 'meta', 'log']) {
    const p = path.join(dir, `${f}.json`);
    out[f] = [readFileSync(p, 'utf8'), statSync(p).mtimeMs];
  }
  return out;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-outliers-'));
  run('init', dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py outliers: base and ceiling (decisions 4, 5, 7 and 9)', () => {
  it('lists only the stage above twice the group median, in the format of decision 9', () => {
    cheap(10);
    stage(20, [['fase', 20]]);
    const out = run('outliers', dir);
    expect(out.split('\n')[0]).toBe(
      'outliers (since all): 5 stages in the base, without ficha: 0',
    );
    expect(out).toContain(
      'product: 5 stages, median US$ 2.00 per phase, ceiling US$ 4.00',
    );
    expect(out).toContain(
      '  #20 US$ 20.00 (2 phases, US$ 10.00 per phase) — cause: fase US$ 20.00 (group median US$ 4.00); switches 0; above 300k 0; testers 0; retests 0; fixes 0',
    );
    for (const n of [10, 11, 12, 13]) expect(out).not.toContain(`#${n} `);
  });

  it('does not list a stage whose cost per phase equals the ceiling (only strictly above counts)', () => {
    cheap(10);
    stage(20, [['fase', 40]], { phases: 10 });
    const out = run('outliers', dir);
    expect(out).toContain(
      'product: 5 stages, median US$ 2.00 per phase, ceiling US$ 4.00',
    );
    expect(out).not.toContain('#20 ');
    expect(out).toContain('none above the ceiling');
  });

  it('only the concluída rows count, and a concluída row with no session counts with US$ 0', () => {
    cheap(10);
    stage(20, [], {});
    stage(21, [['fase', 100]], { status: 'em andamento' });
    const out = run('outliers', dir);
    expect(out.split('\n')[0]).toContain('5 stages in the base');
    expect(out).toContain('median US$ 2.00 per phase');
    expect(out).not.toContain('#21 ');
  });
});

describe('painel.py outliers: cause and counts (decision 8)', () => {
  it('names the kind with the largest positive difference against its group median', () => {
    cheap(10);
    stage(20, [
      ['fase', 4],
      ['testador', 16],
    ]);
    const out = run('outliers', dir);
    expect(out).toContain('— cause: testador US$ 16.00 (group median US$ 0.00);');
  });

  it('a tie goes to the first kind of SESSION_KINDS', () => {
    cheap(10);
    stage(20, [
      ['correção', 6],
      ['fase', 10],
    ]);
    const out = run('outliers', dir);
    expect(out).toContain('— cause: fase US$ 10.00 (group median US$ 4.00);');
  });

  it('counts switches, sessions above 300k, testers, retests and fixes', () => {
    cheap(10);
    stage(20, [
      ['fase', 8, 301000, 'P1'],
      ['fase', 8, 300000, 'P1'],
      ['correção', 2, 300001, 'CL1'],
      ['testador', 2, 400000],
      ['reteste', 2, 350000],
      ['fechamento', 2, 500000],
    ]);
    const out = run('outliers', dir);
    expect(out).toContain('switches 1; above 300k 4; testers 1; retests 1; fixes 1');
  });
  it('a session whose cost has no numeric ctx does not break the report', () => {
    cheap(10);
    stage(20, [['fase', 20]]);
    const metaFile = path.join(dir, 'meta.json');
    const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Array<
      Record<string, unknown>
    >;
    const list = meta[0]!.sessions as Array<{
      id: string;
      cost: Record<string, unknown>;
    }>;
    list.find((e) => e.id === 's_20_0')!.cost.ctx = null;
    writeFileSync(metaFile, JSON.stringify(meta));
    expect(run('outliers', dir)).toContain('#20 US$ 20.00');
  });
});

describe('painel.py outliers: groups, small base and without ficha (decisions 4, 6 and 7)', () => {
  it('testador=nenhum with only process citations is process; a src/ citation or testador=R12 is product', () => {
    for (let n = 10; n < 15; n++)
      stage(n, [['fase', 4]], { toca: PROCESS_TOCA, testador: 'nenhum' });
    stage(30, [['fase', 4]], {
      toca: `${PROCESS_TOCA},src/model/x.ts`,
      testador: 'nenhum',
    });
    stage(31, [['fase', 4]], { toca: PROCESS_TOCA, testador: 'R12' });
    const out = run('outliers', dir);
    expect(out).toContain(
      'process: 5 stages, median US$ 2.00 per phase, ceiling US$ 4.00',
    );
    expect(out).toContain('product: base too small (2 stages)');
  });

  it('with 4 stages in the group prints `<group>: base too small (4 stages)` and lists nothing', () => {
    cheap(10, 3);
    stage(20, [['fase', 400]]);
    stage(21, [['fase', 400]], { toca: PROCESS_TOCA, testador: 'nenhum' });
    const out = run('outliers', dir);
    expect(out).toContain('product: base too small (4 stages)');
    expect(out).toContain('process: base too small (1 stages)');
    expect(out).not.toContain('#20 ');
  });

  it('a stage only in meta.merged, fases=? or toca=? stays out and enters `without ficha`', () => {
    cheap(10);
    stage(20, [['fase', 400]], { fases: '?' });
    stage(21, [['fase', 400]], { toca: '?' });
    const metaFile = path.join(dir, 'meta.json');
    const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Array<
      Record<string, unknown>
    >;
    meta[0]!.merged = ['#99'];
    writeFileSync(metaFile, JSON.stringify(meta));
    const out = run('outliers', dir);
    expect(out.split('\n')[0]).toBe(
      'outliers (since all): 4 stages in the base, without ficha: 3',
    );
    expect(out).toContain('product: base too small (4 stages)');
  });
});

describe('painel.py outliers: --desde and read-only (decisions 3 and 4)', () => {
  it('--desde filters by the started of the row', () => {
    cheap(10, 4, { started: '2026-11-12T08:00:00Z' });
    cheap(20, 2, { started: '2026-11-10T08:00:00Z' });
    const all = run('outliers', dir);
    expect(all).toContain('6 stages in the base');
    const since = run('outliers', '--desde', '2026-11-11T00:00:00Z', dir);
    expect(since.split('\n')[0]).toBe(
      'outliers (since 2026-11-11T00:00:00Z): 4 stages in the base, without ficha: 0',
    );
  });

  it('--desde leaves out of the without-ficha count the merged-only stages with no session since then', () => {
    cheap(10, 4, { started: '2026-11-12T08:00:00Z' });
    const metaFile = path.join(dir, 'meta.json');
    const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Array<
      Record<string, unknown>
    >;
    meta[0]!.merged = ['#99'];
    writeFileSync(metaFile, JSON.stringify(meta));
    const since = run('outliers', '--desde', '2026-11-11T00:00:00Z', dir);
    expect(since.split('\n')[0]).toBe(
      'outliers (since 2026-11-11T00:00:00Z): 4 stages in the base, without ficha: 0',
    );
  });

  it('a stage with a session that has no cost does not break the report', () => {
    cheap(10);
    stage(20, [['fase', 20]]);
    run('session', dir, '#20', 's_20_x', 'kind=testador');
    const r = tryRun('outliers', dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain('#20');
  });

  it('a --desde that is not ISO UTC exits with code 2 and writes nothing', () => {
    cheap(10);
    const before = files();
    const r = tryRun('outliers', '--desde', 'yesterday', dir);
    expect(r.code).toBe(2);
    expect(files()).toEqual(before);
  });

  it('changes no file, prints no `alterados:` line and is rejected inside an apply', () => {
    cheap(10);
    stage(20, [['fase', 20]]);
    const before = files();
    const out = run('outliers', dir);
    expect(out).not.toContain('alterados:');
    expect(files()).toEqual(before);
    const bad = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      input: `outliers ${dir}\n`,
      encoding: 'utf8',
    });
    expect(bad.status).toBe(2);
    expect(files()).toEqual(before);
  });
});
