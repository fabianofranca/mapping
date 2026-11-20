// @vitest-environment node
// Phase FM3 (stage #1532, decisions 5, 6 and 26): the panel keeps the cost, the context, the model and the
// effort of each session of the queue (`session kind=`, `cost`, `costs`, `custo:` line of `show`, card
// "Queue cost"), and the child sessions are born with the table's effort, checked after creation.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const BASE = '.claude/skills/implementar-fila';

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

function json(name: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Array<
    Record<string, unknown>
  >;
}

function sessions(): Entry[] {
  return (json('meta')[0]!.sessions ?? []) as Entry[];
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-cost-'));
  runAt('2026-11-11T10:00:00Z', 'init', dir);
  runAt('2026-11-11T10:00:00Z', 'row', dir, '#10', 'title=Stage ten');
  runAt('2026-11-11T10:00:00Z', 'row', dir, '#20', 'title=Stage twenty');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py session with kind= (FM3, decision 5)', () => {
  it('with kind= and label=, adds to meta.sessions without repeating, with created', () => {
    runAt(
      '2026-11-11T11:00:00Z',
      'session',
      dir,
      '#10',
      'sess_a',
      'kind=fase',
      'label=FM3',
    );
    runAt(
      '2026-11-11T11:05:00Z',
      'session',
      dir,
      '#10',
      'sess_a',
      'kind=fase',
      'label=FM3',
    );
    expect(sessions()).toEqual([
      {
        id: 'sess_a',
        issue: '#10',
        kind: 'fase',
        label: 'FM3',
        created: '2026-11-11T11:00:00Z',
      },
    ]);
    expect(json('queue')[0]!.sessions).toBe('sess_a');
  });

  it('accepts the seven kinds and refuses another with code 2', () => {
    for (const kind of [
      'fase',
      'correção',
      'testador',
      'reteste',
      'fechamento',
      'coordenador',
      'supervisor',
    ]) {
      runAt('2026-11-11T11:00:00Z', 'session', dir, '#10', `s_${kind}`, `kind=${kind}`);
    }
    expect(sessions()).toHaveLength(7);
    const bad = tryRun('session', dir, '#10', 'sess_x', 'kind=geral');
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/kind inválido/);
    expect(sessions()).toHaveLength(7);
  });

  it("without kind, it still writes only the row's sessions, as today", () => {
    run('session', dir, '#10', 'sess_a');
    expect(json('queue')[0]!.sessions).toBe('sess_a');
    expect(json('meta')[0]!.sessions).toBeUndefined();
  });

  it('an unknown field exits with code 2', () => {
    expect(tryRun('session', dir, '#10', 'sess_a', 'kind=fase', 'foo=1').code).toBe(2);
  });
});

describe('painel.py cost (FM3, decision 5)', () => {
  it('updates the entry by id and writes at', () => {
    runAt(
      '2026-11-11T11:00:00Z',
      'session',
      dir,
      '#10',
      'sess_a',
      'kind=fase',
      'label=FM3',
    );
    runAt(
      '2026-11-11T12:00:00Z',
      'cost',
      dir,
      'sess_a',
      'usd=2.5',
      'ctx=180000',
      'model=claude-sonnet-5-5',
      'effort=high',
    );
    const e = sessions()[0]!;
    expect(e.kind).toBe('fase');
    expect(e.created).toBe('2026-11-11T11:00:00Z');
    expect(e.cost).toEqual({
      usd: 2.5,
      ctx: 180000,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      at: '2026-11-11T12:00:00Z',
    });
    runAt('2026-11-11T13:00:00Z', 'cost', dir, 'sess_a', 'usd=3', 'ctx=200000');
    expect(sessions()).toHaveLength(1);
    expect((sessions()[0]!.cost as Entry).usd).toBe(3);
    expect((sessions()[0]!.cost as Entry).at).toBe('2026-11-11T13:00:00Z');
  });

  it('creates the entry with issue= and kind=, and keeps served= when it comes', () => {
    runAt(
      '2026-11-11T12:00:00Z',
      'cost',
      dir,
      'sess_b',
      'usd=1',
      'ctx=1000',
      'model=claude-sonnet-5-5',
      'effort=medium',
      'served=claude-opus-5-5',
      'issue=#20',
      'kind=testador',
    );
    const e = sessions()[0]!;
    expect(e).toMatchObject({ id: 'sess_b', issue: '#20', kind: 'testador' });
    expect(e.created).toBeUndefined();
    expect((e.cost as Entry).served).toBe('claude-opus-5-5');
  });

  it('kind is required when the id is new', () => {
    const r = tryRun('cost', dir, 'sess_c', 'usd=1', 'ctx=10');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/kind/);
    expect(sessions()).toHaveLength(0);
  });

  it.each([
    ['usd', ['usd=expensive', 'ctx=10']],
    ['ctx', ['usd=1', 'ctx=lots']],
    ['usd missing', ['ctx=10']],
  ])('%s non-numeric or missing exits with code 2 and writes nothing', (_n, args) => {
    const r = tryRun('cost', dir, 'sess_d', ...args, 'kind=fase');
    expect(r.code).toBe(2);
    expect(sessions()).toHaveLength(0);
  });

  it('goes in an apply, and costs does not', () => {
    const ok = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'cost sess_e usd=1 ctx=5 kind=coordenador\n',
    });
    expect(ok.status).toBe(0);
    const bad = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'costs\n',
    });
    expect(bad.status).toBe(2);
  });
});

describe('review findings (FM3)', () => {
  it('infinite or huge ctx exits with code 2, with no traceback', () => {
    for (const ctx of ['inf', 'nan', '1e999']) {
      const r = tryRun('cost', dir, 'sess_i', 'usd=1', `ctx=${ctx}`, 'kind=fase');
      expect(r.code).toBe(2);
      expect(r.err).not.toMatch(/Traceback/);
    }
  });

  it('a new cost does not erase the model, effort and served already written', () => {
    runAt(
      '2026-11-11T12:00:00Z',
      'cost',
      dir,
      'sess_m',
      'usd=1',
      'ctx=10',
      'model=claude-sonnet-5-5',
      'effort=high',
      'served=claude-opus-5-5',
      'kind=coordenador',
    );
    runAt('2026-11-11T13:00:00Z', 'cost', dir, 'sess_m', 'usd=2', 'ctx=20');
    expect(sessions()[0]!.cost).toEqual({
      usd: 2,
      ctx: 20,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      served: 'claude-opus-5-5',
      at: '2026-11-11T13:00:00Z',
    });
  });

  it('registering the session again without label does not erase the label', () => {
    run('session', dir, '#10', 'sess_l', 'kind=testador', 'label=block2');
    run('session', dir, '#10', 'sess_l', 'kind=testador');
    expect(sessions()[0]!.label).toBe('block2');
  });

  it('an entry with cost but no usd does not break show or costs', () => {
    run('session', dir, '#10', 'sess_p', 'kind=fase');
    const file = path.join(dir, 'meta.json');
    const m = json('meta');
    (m[0]!.sessions as Entry[])[0]!.cost = { ctx: 1 };
    writeFileSync(file, JSON.stringify(m));
    expect(run('show', dir)).toMatch(/^custo: US\$ 0\.00 em 1 sessões$/m);
    expect(run('costs', dir)).toMatch(/^custo total: US\$ 0\.00 em 1 sessões$/m);
  });

  it('costs sorts the stages by number and the kinds by flow order', () => {
    for (const [issue, id] of [
      ['#1000', 'a'],
      ['#999', 'b'],
    ] as const) {
      runAt('2026-11-11T10:00:00Z', 'row', dir, issue, 'title=X');
      runAt('2026-11-11T11:00:00Z', 'session', dir, issue, id, 'kind=testador');
      runAt('2026-11-11T11:00:00Z', 'cost', dir, id, 'usd=1', 'ctx=1');
    }
    runAt('2026-11-11T11:00:00Z', 'session', dir, '#10', 'c', 'kind=fase');
    runAt('2026-11-11T11:00:00Z', 'cost', dir, 'c', 'usd=1', 'ctx=1');
    const out = run('costs', dir);
    expect(out.indexOf('#10:')).toBeLessThan(out.indexOf('#999:'));
    expect(out.indexOf('#999:')).toBeLessThan(out.indexOf('#1000:'));
    expect(out.indexOf('  fase:')).toBeLessThan(out.indexOf('  testador:'));
  });

  it('the page sorts like costs (flow kinds, stages by number)', () => {
    const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');
    expect(page).toMatch(/KINDS\s*=\s*\[\s*'fase',\s*'correção',\s*'testador'/);
    expect(page).toMatch(/localeCompare\([^)]*numeric/);
  });

  it('the page lists every SESSION_KINDS entry of painel.py in KINDS', () => {
    const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');
    const py = readFileSync(`${BASE}/painel/painel.py`, 'utf8');
    const kinds = /SESSION_KINDS = \[([^\]]*)\]/.exec(py)?.[1]?.match(/"[^"]+"/g) ?? [];
    const pageKinds =
      /const KINDS = \[([^\]]*)\]/.exec(page)?.[1]?.match(/'[^']+'/g) ?? [];
    expect(pageKinds.map((k) => k.slice(1, -1))).toEqual(
      kinds.map((k) => k.slice(1, -1)),
    );
  });

  it('the SKILL says to record the cost on every path that archives', () => {
    const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');
    const perStage = section(skill, '## 3. Per stage');
    const end = section(skill, '## End');
    expect(perStage.split('\n').find((l) => l.includes('archive what is left'))).toMatch(
      /painel\.py cost/,
    );
    expect(end.split('\n').find((l) => l.startsWith('4. '))).toMatch(/painel\.py cost/);
    expect(
      perStage.split('\n').find((l) => l.includes('When a tester notifies')),
    ).toMatch(/painel\.py cost/);
  });
});

function seed(): void {
  const t = '2026-11-11T11:00:00Z';
  runAt(t, 'session', dir, '#10', 'f1', 'kind=fase', 'label=FM1');
  runAt(t, 'session', dir, '#10', 'f2', 'kind=fase', 'label=FM2');
  runAt(t, 'session', dir, '#20', 't1', 'kind=testador');
  const c = (id: string, usd: string) =>
    runAt('2026-11-11T12:00:00Z', 'cost', dir, id, `usd=${usd}`, 'ctx=1000');
  c('f1', '2');
  c('f2', '4');
  c('t1', '5');
}

describe('painel.py costs and the custo: line of show (FM3, decisions 5 and 26)', () => {
  it('prints the total, one line per kind (sessions, US$ and median) and one per stage', () => {
    seed();
    const out = run('costs', dir);
    expect(out).toMatch(/^custo total: US\$ 11\.00 em 3 sessões$/m);
    expect(out).toMatch(/^ {2}fase: 2 sessões, US\$ 6\.00, mediana US\$ 3\.00$/m);
    expect(out).toMatch(/^ {2}testador: 1 sessões, US\$ 5\.00, mediana US\$ 5\.00$/m);
    expect(out).toMatch(/^ {2}#10: 2 sessões, US\$ 6\.00$/m);
    expect(out).toMatch(/^ {2}#20: 1 sessões, US\$ 5\.00$/m);
    expect(out).not.toMatch(/correção:/);
  });

  it('with --desde, counts only those with created from the date; a cost without a session stays out', () => {
    seed();
    runAt(
      '2026-11-11T09:00:00Z',
      'cost',
      dir,
      'old',
      'usd=50',
      'ctx=1',
      'kind=fase',
      'issue=#10',
    );
    runAt('2026-11-11T14:00:00Z', 'session', dir, '#20', 'f3', 'kind=fase');
    runAt('2026-11-11T14:30:00Z', 'cost', dir, 'f3', 'usd=1', 'ctx=1');
    const all = run('costs', dir);
    expect(all).toMatch(/US\$ 62\.00 em 5 sessões/);
    const since = run('costs', '--desde', '2026-11-11T11:00:00Z', dir);
    expect(since).toMatch(/^custo total: US\$ 12\.00 em 4 sessões$/m);
    expect(since).not.toMatch(/50\.00/);
    const after = run('costs', '--desde', '2026-11-11T13:00:00Z', dir);
    expect(after).toMatch(/^custo total: US\$ 1\.00 em 1 sessões$/m);
  });

  it('with no cost recorded, costs and show say "—"', () => {
    expect(run('costs', dir)).toMatch(/^custo total: —$/m);
    expect(run('show', dir)).toMatch(/^custo: —$/m);
  });

  it('show prints custo: US$ <total> em <k> sessões', () => {
    seed();
    expect(run('show', dir)).toMatch(/^custo: US\$ 11\.00 em 3 sessões$/m);
  });

  it('costs writes nothing', () => {
    seed();
    const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    run('costs', dir);
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
  });

  it('an invalid --desde exits with code 2', () => {
    expect(tryRun('costs', '--desde', 'yesterday', dir).code).toBe(2);
  });
});

describe('page: the "Queue cost" card (FM3, decision 5)', () => {
  const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');

  it('reads meta.sessions in a dash.calc and shows "—" without it', () => {
    expect(page).toContain('Queue cost');
    expect(page).toMatch(/dash\.calc\('custo'/);
    expect(page).toMatch(/dash\.calc\('custoResumo'/);
    expect(page).toMatch(/dash\.calc\('custoDia'/);
    expect(page).toMatch(/\.sessions/);
    expect(page).toMatch(/'—'/);
  });

  it('the card text goes through textContent, without innerHTML', () => {
    const script = page.slice(page.indexOf('<script>'));
    expect(script).toMatch(/mp-custo/);
    expect(script).toMatch(/textContent/);
    expect(script).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });

  it('the charts carry data-source and the table of today stays collapsed in a details (PA2)', () => {
    expect(page).toMatch(/id="mp-custo-dias"[^>]*data-source="custoDia"/);
    expect(page).toMatch(/id="mp-custo-tipo"[^>]*data-source="custo"/);
    expect(page).toMatch(/id="mp-custo-etapas"[^>]*data-source="custo"/);
    expect(page).toMatch(
      /<details[^>]*>\s*<summary>Show the table of all stages and kinds/,
    );
  });
});

describe('implementar-fila/SKILL.md: effort and cost (FM3, decisions 5 and 6)', () => {
  const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');
  const perStage = section(skill, '## 3. Per stage');

  it("step 2 sends the coordinator row's effort in create_session", () => {
    expect(perStage).toMatch(/`effort`/);
    expect(perStage).toMatch(/`fases=` of the ficha/);
    expect(perStage).toMatch(/with or without `modelo=tabela`/);
  });

  it('the tester and the retest take the effort of the Tester column, and the fix, medium', () => {
    expect(perStage).toMatch(/Tester column/);
    expect(perStage).toMatch(/fix[^\n]*`medium`/);
  });

  it('the cycle subagent checks the effort_level; if it differs, log, and the queue goes on', () => {
    expect(perStage).toMatch(/`effort_level`/);
    expect(perStage).toMatch(/differs[^\n]*`log`/);
  });

  it('refusal because of the effort: creates the session without it and puts the case in the log', () => {
    expect(perStage).toMatch(/refused[^\n]*`effort`[^\n]*without it[^\n]*`log`/);
  });

  it('"Archive the sessions" records the child\'s cost in the same apply', () => {
    const archive = skill.slice(skill.indexOf('**Archive the sessions**'));
    const block = archive.slice(0, archive.indexOf('**Fallback checks:**'));
    expect(block).toMatch(/painel\.py cost/);
    expect(block).toMatch(/same subagent/);
    expect(block).toMatch(/same `apply`/);
  });

  it('the "Session switch" records the coordinator\'s cost before the successor', () => {
    const switchSection = section(skill, '## Session switch');
    expect(switchSection).toMatch(/painel\.py cost[^\n]*kind=coordenador/);
    expect(switchSection).toMatch(/before creating the successor/);
  });

  it('the "End" gets the US$ column and the total', () => {
    const end = section(skill, '## End');
    expect(end).toMatch(/US\$ column/);
    expect(end).toMatch(/painel\.py costs/);
  });

  it('the "Panel" lists session with kind=, cost and costs, and the custo: line of show', () => {
    const panel = section(skill, '## Panel');
    expect(panel).toMatch(/painel\.py session <folder> '#n' <id> kind=/);
    expect(panel).toMatch(/painel\.py cost <folder> <id> usd=/);
    expect(panel).toMatch(/painel\.py costs \[--desde <ISO>\] <folder>/);
    expect(panel).toMatch(/`custo:`/);
    expect(panel).toMatch(/costs --desde <time of the hot switch>/);
  });

  it('the comparison with the baseline is costs --desde of the hot switch time', () => {
    expect(skill).toMatch(/costs --desde <time of the hot switch>/);
  });
});

describe('docs: the effort of create_session (FM3, decision 6)', () => {
  it('docs/PROCESS.md no longer says "chooses the model and not the effort"', () => {
    const process = readFileSync('docs/PROCESS.md', 'utf8');
    expect(process).not.toMatch(/chooses the model and not the effort/);
    expect(process).toMatch(/`effort` of `create_session`/);
  });

  it("docs/FLOW.md sends the table's effort in create_session", () => {
    const flow = readFileSync('docs/FLOW.md', 'utf8');
    const step = section(flow, '## Orchestrator — step by step');
    expect(step).toMatch(/`effort`[^\n]*table/);
  });

  it('detalhar-backlog no longer says "would only accept the model"', () => {
    const skill = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
    expect(skill).not.toMatch(/would only accept the model/);
  });
});

describe('painel.py cost and upgrade (findings of the closing review)', () => {
  it('the cost of a new session (without created) enters costs --desde by the cost time', () => {
    runAt('2026-11-11T10:00:00Z', 'cost', dir, 's1', 'usd=1', 'ctx=10', 'kind=fase');
    const out = run('costs', dir, '--desde', '2026-11-11T00:00:00Z');
    expect(out).toMatch(/1[,.]00/);
  });

  it('cost keeps the normalized issue (no spaces)', () => {
    runAt(
      '2026-11-11T10:00:00Z',
      'cost',
      dir,
      's1',
      'usd=1',
      'ctx=10',
      'kind=fase',
      'issue= #10 ',
    );
    expect(sessions()[0]!.issue).toBe('#10');
  });

  it('an upgrade with no change inside apply does not print alterados: twice', () => {
    const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'upgrade\nlog "x"\n',
    });
    expect(r.stdout.match(/alterados:/g)).toHaveLength(1);
  });
});

describe('painel.py: the tester ceiling of 300 thousand (TC2, decision 9 of #1639)', () => {
  const at = '2026-11-11T12:00:00Z';

  function recordCost(id: string, kind: string, ctx: number, issue = '#20', label = '') {
    runAt(
      at,
      'session',
      dir,
      issue,
      id,
      `kind=${kind}`,
      ...(label ? [`label=${label}`] : []),
    );
    return runAt(at, 'cost', dir, id, 'usd=3', `ctx=${ctx}`);
  }

  it.each(['testador', 'reteste'])(
    'cost of %s with ctx=300001 writes, exits with 0 and warns about the excess',
    (kind) => {
      runAt(at, 'session', dir, '#20', 'sess_t', `kind=${kind}`, 'label=group1-R25');
      const r = tryRun('--now', at, 'cost', dir, 'sess_t', 'usd=3', 'ctx=300001');
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/^acima do teto do testador \(300 mil\): sess_t 300001$/m);
      expect((sessions()[0]!.cost as Entry).ctx).toBe(300001);
    },
  );

  it('cost of a new session with kind=testador in the same call also warns', () => {
    const out = runAt(at, 'cost', dir, 'sess_n', 'usd=1', 'ctx=400000', 'kind=testador');
    expect(out).toMatch(/acima do teto do testador \(300 mil\): sess_n 400000/);
  });

  it('with ctx=300000, or with kind=fase above the ceiling, it does not warn', () => {
    expect(recordCost('sess_a', 'testador', 300000)).not.toMatch(/acima do teto/);
    expect(recordCost('sess_b', 'fase', 450000)).not.toMatch(/acima do teto/);
    expect(recordCost('sess_c', 'coordenador', 450000)).not.toMatch(/acima do teto/);
  });

  it('the warning comes out inside an apply, without preventing the write', () => {
    const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'cost sess_e usd=1 ctx=350000 kind=testador\n',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/acima do teto do testador \(300 mil\): sess_e 350000/);
    expect((sessions()[0]!.cost as Entry).ctx).toBe(350000);
  });

  it('show lists testador acima do teto: stage, label and ctx in thousands', () => {
    recordCost('sess_a', 'testador', 339000, '#20', 'group2-R3-R13');
    recordCost('sess_b', 'reteste', 523000, '#10', 'retest1');
    recordCost('sess_c', 'testador', 271000, '#10', 'group3-R17');
    recordCost('sess_d', 'fase', 600000, '#10', 'TC2');
    const line = run('show', dir).match(/^testador acima do teto: (.*)$/m);
    expect(line).not.toBeNull();
    expect(line![1]).toContain('#20 group2-R3-R13 339k');
    expect(line![1]).toContain('#10 retest1 523k');
    expect(line![1]).not.toContain('group3-R17');
    expect(line![1]).not.toContain('TC2');
  });

  it('show does not list a concluída stage nor one in meta.merged', () => {
    recordCost('sess_a', 'testador', 339000, '#20', 'group2');
    recordCost('sess_b', 'testador', 523000, '#10', 'group1');
    expect(run('show', dir)).toMatch(/^testador acima do teto: .*#20 group2 339k/m);
    runAt(at, 'row', dir, '#20', 'status=concluída');
    const after = run('show', dir);
    expect(after).not.toMatch(/#20 group2/);
    expect(after).toMatch(/#10 group1 523k/);
    runAt(at, 'merged', dir, '#10');
    expect(run('show', dir)).toMatch(/^testador acima do teto: nenhum$/m);
  });

  it('show does not list the stage of a recusada row', () => {
    recordCost('sess_a', 'testador', 339000, '#20', 'group2');
    recordCost('sess_b', 'testador', 523000, '#10', 'group1');
    expect(run('show', dir)).toMatch(/^testador acima do teto: .*#20 group2 339k/m);
    runAt(at, 'row', dir, '#20', 'status=recusada');
    const after = run('show', dir);
    expect(after).not.toMatch(/#20 group2/);
    expect(after).toMatch(/#10 group1 523k/);
  });

  it('show does not trap forever the tester above the ceiling with no registered stage', () => {
    runAt(at, 'cost', dir, 'sess_n', 'usd=1', 'ctx=400000', 'kind=testador');
    expect(run('show', dir)).toMatch(/^testador acima do teto: nenhum$/m);
  });

  it('show says nenhum with no excess and, with the cost without a label, uses the id', () => {
    expect(run('show', dir)).toMatch(/^testador acima do teto: nenhum$/m);
    recordCost('sess_a', 'testador', 300000);
    expect(run('show', dir)).toMatch(/^testador acima do teto: nenhum$/m);
    recordCost('sess_nolabel', 'testador', 310000);
    expect(run('show', dir)).toMatch(/^testador acima do teto: #20 sess_nolabel 310k$/m);
  });

  it('show rounds the context up: above the ceiling never appears as 300k', () => {
    recordCost('sess_a', 'testador', 300001, '#20', 'group2');
    expect(run('show', dir)).toMatch(/^testador acima do teto: #20 group2 301k$/m);
  });

  it('show writes nothing and the index.html page does not change', () => {
    recordCost('sess_a', 'testador', 339000, '#20', 'group2');
    const before = JSON.stringify(json('meta'));
    run('show', dir);
    expect(JSON.stringify(json('meta'))).toBe(before);
    const pageHtml = readFileSync(`${BASE}/painel/index.html`, 'utf8');
    expect(pageHtml).not.toMatch(/acima do teto/);
  });
});

describe('docs and skill: the tester ceiling checked by the queue (TC2, decisions 8 to 10)', () => {
  const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');
  const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');

  it('the Tester item and "Archive the sessions" record the excess in the log, in the same apply as the cost', () => {
    const perStage = section(skill, '## 3. Per stage');
    const tester = perStage.slice(
      perStage.indexOf('3. **Tester.**'),
      perStage.indexOf('4. **Fix**'),
    );
    expect(tester).toMatch(/contexto <ctx>k acima do teto do testador/);
    expect(tester).toMatch(/same `apply`/);
    const archive = skill.slice(skill.indexOf('**Archive the sessions**'));
    const costItem = archive.slice(0, archive.indexOf('**Fallback checks:**'));
    expect(costItem).toMatch(/<label>: contexto <ctx>k acima do teto do testador/);
    expect(costItem).toMatch(/acima do teto do testador \(300 mil\)/);
    expect(costItem).toMatch(/rounded up/);
    expect(costItem).toMatch(/without a label, the session id/);
  });

  it('the closing comments each excess on the fixed roadmap "Teto de contexto do testador"', () => {
    const perStage = section(skill, '## 3. Per stage');
    const closing = perStage.slice(
      perStage.indexOf('5. **Closing**'),
      perStage.indexOf('6. **Merge**'),
    );
    expect(closing).toMatch(/"Teto de contexto do testador"/);
    expect(closing).toMatch(/at the first excess/);
    expect(closing).toMatch(/Impacto: medium — menos custo recorrente do testador/);
    expect(closing).toMatch(/stays open/);
    expect(closing).toMatch(/before commenting or creating, look for/);
  });

  it('the "Panel" documents the new show line and the cost output', () => {
    const panel = section(skill, '## Panel');
    expect(panel).toMatch(/`testador acima do teto:`/);
    expect(panel).toMatch(/acima do teto do testador \(300 mil\): <id> <ctx>/);
  });

  it('the "Context up to 300 thousand" paragraph no longer says to move scripts or call the owner', () => {
    const i = cloud.indexOf('**Context up to 300 thousand.**');
    const excerpt = cloud.slice(i, cloud.indexOf('\n\n', i));
    expect(excerpt).not.toMatch(/move (test )?scripts between the (5 )?blocks/);
    expect(excerpt).not.toMatch(/\bcalls? the owner/);
    expect(excerpt).toMatch(/every tester session/);
    expect(excerpt).toMatch(/main session/);
    expect(excerpt).toMatch(/subagents? per batch/);
    expect(excerpt).toMatch(/without holding up the stage/);
    expect(excerpt).toMatch(/Teto de contexto do testador/);
  });

  it('the summary template gets the Context column and the Contexto: line', () => {
    const summary = between(
      flow,
      '## Summary of the round in blocks',
      '## Final notification',
    );
    expect(summary).toMatch(
      /\| Block \| ✅ +\| ❌ +\| not executed \| Time +\| Context +\|/,
    );
    expect(summary).toMatch(
      /\*\*Context:\*\* above the ceiling \(300 thousand\): .* or none/,
    );
    expect(summary).toMatch(/groups/);
  });
});
