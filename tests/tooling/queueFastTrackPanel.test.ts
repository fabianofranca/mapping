// @vitest-environment node
// Phase FQ1 (stage #1791, decisions 3 to 7): `painel.py` for the fast track inside the queue: `phases=` validation, `ended` by
// status, `end`/`runEnd`, the `via-rapida` kind, the `recusada` status, the session kind, `canario usar` and the `merge pedido ao dono:` line.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-10T10:00:00Z';
const LATER = '2026-11-10T13:05:00Z';

type Entry = Record<string, unknown>;

let dir = '';

function runAt(now: string, ...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
}

function run(...args: string[]): string {
  return runAt(NOW, ...args);
}

function tryRun(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function json(name: string): Entry[] {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Entry[];
}

function row(issue: string): Entry {
  const found = json('queue').find((r) => r.issue === issue);
  if (!found) throw new Error(`row ${issue} not found`);
  return found;
}

function meta(): Entry {
  return json('meta')[0]!;
}

function slots(): string[] {
  return String(meta().vagas)
    .split(' · ')
    .filter((part) => part.startsWith('#'));
}

function ficha(dep: string, toca: string, fases = 'FQ0:#1:high'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=não | epico=epic/x | fases=${fases} | toca=${toca} | testador=nenhum ; visual=nenhuma ; nenhum`;
}

function add(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Item ${issue}`, `plan=${plan}`, ...extra);
}

function showLine(prefix: string, now = NOW): string {
  const line = runAt(now, 'show', dir)
    .split('\n')
    .find((l) => l.startsWith(prefix));
  if (line === undefined) throw new Error(`show has no line "${prefix}"`);
  return line;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'fast-track-panel-'));
  run('init', dir);
  run('start', dir, '--paralelo', '3');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py phases (FQ1, decision 4)', () => {
  it('(a) `row … phases=A|B:open` is an Erro (code 2) and writes nothing', () => {
    add('#1', ficha('nenhuma', 'scripts/ci/a.mjs'));
    const before = readFileSync(path.join(dir, 'queue.json'), 'utf8');
    for (const bad of ['A|B:open', 'A:xx', '1A:ok', 'A:ok|', 'A:ok:open']) {
      const r = tryRun('row', dir, '#1', `phases=${bad}`);
      expect(r.status, bad).toBe(2);
      expect(r.stderr, bad).toContain('erro:');
    }
    expect(readFileSync(path.join(dir, 'queue.json'), 'utf8')).toBe(before);
  });

  it('accepts a valid list and an empty one', () => {
    add('#1', ficha('nenhuma', 'scripts/ci/a.mjs', 'A:#1:high,B:#1:high,C-2:#1:high'));
    run('row', dir, '#1', 'phases=A:ok|B:open|C-2:todo');
    expect(row('#1').phases).toBe('A:ok|B:open|C-2:todo');
    run('row', dir, '#1', 'phases=');
    expect(row('#1').phases).toBe('A:todo|B:todo|C-2:todo'); // the ficha completes it again
  });

  it('(a) `phase` on a panel with an item without `:` treats it as `open` and does not raise', () => {
    add('#1', ficha('nenhuma', 'scripts/ci/a.mjs', 'A:#1:high,B:#1:high'));
    const queue = json('queue');
    queue[0]!.phases = 'A|B:open';
    writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(queue));
    run('phase', dir, '#1', 'A=ok');
    expect(row('#1').phases).toBe('A:ok|B:open');
    run('phase', dir, '#1', 'B=ok');
    expect(row('#1').phases).toBe('A:ok|B:ok');
  });
});

describe('painel.py row: `ended` follows the status (FQ1, decision 5)', () => {
  it.each(['concluída', 'falhou', 'recusada'])(
    '(b) status=%s without `ended` writes it',
    (status) => {
      add('#1', ficha('nenhuma', 'scripts/ci/a.mjs'), 'status=em andamento');
      expect(row('#1').ended).toBe('');
      runAt(LATER, 'row', dir, '#1', `status=${status}`);
      expect(row('#1').ended).toBe(LATER);
    },
  );

  it('(b) a row that already has `ended` keeps it, and an explicit `ended=` wins', () => {
    add('#1', ficha('nenhuma', 'scripts/ci/a.mjs'), 'status=concluída');
    expect(row('#1').ended).toBe(NOW);
    runAt(LATER, 'row', dir, '#1', 'status=falhou');
    expect(row('#1').ended).toBe(NOW);
    runAt(LATER, 'row', dir, '#1', 'status=concluída', 'ended=2026-11-09T08:00:00Z');
    expect(row('#1').ended).toBe('2026-11-09T08:00:00Z');
  });

  it.each(['aguardando', 'em andamento', 'esperando dono'])(
    '(b) status=%s without `ended` clears it',
    (status) => {
      add('#1', ficha('nenhuma', 'scripts/ci/a.mjs'), 'status=falhou');
      expect(row('#1').ended).toBe(NOW);
      run('row', dir, '#1', `status=${status}`);
      expect(row('#1').ended).toBe('');
    },
  );

  it('(b) a `row` with no `status` leaves `ended` alone', () => {
    add('#1', ficha('nenhuma', 'scripts/ci/a.mjs'), 'status=concluída');
    run('row', dir, '#1', 'step=ok');
    expect(row('#1').ended).toBe(NOW);
  });
});

describe('painel.py end (FQ1, decision 6)', () => {
  it('(c) writes `meta.runEnd` and `start` clears it', () => {
    expect(meta().runEnd).toBe('');
    const out = runAt(LATER, 'end', dir);
    expect(out).toContain('alterados:');
    expect(meta().runEnd).toBe(LATER);
    run('start', dir);
    expect(meta().runEnd).toBe('');
  });

  it('(c) goes into `apply`', () => {
    const file = path.join(dir, 'batch.txt');
    writeFileSync(file, 'log fim\nend\n');
    runAt(LATER, 'apply', dir, file);
    expect(meta().runEnd).toBe(LATER);
  });

  it('(c) is listed in --help', () => {
    expect(run('--help')).toContain('end');
  });
});

describe('painel.py via-rapida rows (FQ1, decision 7)', () => {
  const vr = (issue: string, toca: string, dep = 'nenhuma', ...extra: string[]) =>
    add(issue, ficha(dep, toca, 'VR:#1:high'), 'kind=via-rapida', ...extra);

  it('(d) takes a slot like a stage row', () => {
    vr('#10', 'scripts/ci/a.mjs');
    expect(row('#10').kind).toBe('via-rapida');
    expect(meta().vagas).toContain('#10 começa');
    run('row', dir, '#10', 'status=em andamento', 'started=now');
    expect(String(meta().vagas)).toMatch(/Vagas 1\/3/);
  });

  it('(d) waits for a dep, a file in common, a running exclusive and the draining', () => {
    add('#1', ficha('nenhuma', 'scripts/ci/b.mjs', 'S1:#1:high'));
    vr('#10', 'scripts/ci/a.mjs', '#1:open');
    expect(slots()).toContain('#10 dep #1');

    add(
      '#2',
      ficha('nenhuma', 'scripts/ci/e.mjs', 'S1:#1:high'),
      'status=em andamento',
      'started=now',
    );
    vr('#11', 'scripts/ci/e.mjs');
    expect(slots().find((s) => s.startsWith('#11'))).toMatch(
      /^#11 arquivo scripts\/ci\/e\.mjs com #2/,
    );

    add(
      '#3',
      ficha('nenhuma', 'scripts/ci/c.mjs', 'S1:#1:high'),
      'status=em andamento',
      'started=now',
      'exclusive=sim',
    );
    vr('#12', 'scripts/ci/d.mjs');
    expect(slots().find((s) => s.startsWith('#12'))).toBe(
      '#12 exclusiva #3 em andamento',
    );
  });

  it('(d) a via-rapida row is held by an exclusive stage that drains the queue', () => {
    add(
      '#1',
      ficha('nenhuma', 'scripts/ci/b.mjs', 'S1:#1:high'),
      'status=em andamento',
      'started=now',
    );
    add('#2', ficha('nenhuma', 'scripts/ci/c.mjs', 'S1:#1:high'), 'exclusive=sim');
    vr('#10', 'scripts/ci/a.mjs');
    expect(slots().find((s) => s.startsWith('#10'))).toBe(
      '#10 segurada para a exclusiva #2',
    );
    expect(runAt(NOW, 'show', dir)).toContain('drenando para a exclusiva: #2');
  });

  it('(d) a via-rapida row with an incomplete ficha goes into `fichas a refazer:`', () => {
    add('#10', 'dep=nenhuma | fases=VR:#10:high | toca=?', 'kind=via-rapida');
    expect(slots()).toContain('#10 ficha incompleta (toca)');
    expect(showLine('fichas a refazer:')).toContain('#10');
  });
});

describe('painel.py recusada (FQ1, decision 7)', () => {
  const refused = (issue: string, toca: string, ...extra: string[]) =>
    add(
      issue,
      ficha('nenhuma', toca, 'VR:#1:high'),
      'kind=via-rapida',
      'status=recusada',
      ...extra,
    );

  it('(e) accepts the status, is final, and does not start, conflict or take a slot', () => {
    refused('#10', 'scripts/ci/a.mjs', 'step=outside the criteria');
    expect(row('#10').status).toBe('recusada');
    expect(row('#10').ended).toBe(NOW);
    add('#11', ficha('nenhuma', 'scripts/ci/a.mjs'));
    expect(slots()).toEqual(['#11 começa']);
    expect(String(meta().vagas)).toContain('Vagas 0/3');
    expect(showLine('começar agora:')).toBe('começar agora: #11');
  });

  it('(e) is out of `grafoNos` and `fichas a refazer:`', () => {
    add('#10', 'dep=nenhuma | fases=? | toca=?', 'kind=via-rapida', 'status=recusada');
    add('#11', ficha('nenhuma', 'scripts/ci/a.mjs'));
    const nodes = (meta().grafoNos as Entry[]).map((n) => n.issue);
    expect(nodes).toEqual(['#11']);
    expect(showLine('fichas a refazer:')).toBe('fichas a refazer: nenhuma');
  });

  it('(e) keeps its `phases`, and `fill_phases` does not touch it', () => {
    refused('#10', 'scripts/ci/a.mjs', 'phases=VR:ok');
    run('row', dir, '#10', 'step=outra');
    expect(row('#10').phases).toBe('VR:ok');
    const second = json('queue');
    second[0]!.plan = ficha('nenhuma', 'scripts/ci/a.mjs', 'VR:#1:high,EXTRA:#2:high');
    writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(second));
    run('log', dir, 'x');
    expect(row('#10').phases).toBe('VR:ok');
  });

  it('(e) is not imported, and does not enter `meta.merged`', () => {
    refused('#10', 'scripts/ci/a.mjs');
    add('#11', ficha('nenhuma', 'scripts/ci/b.mjs'));
    const fresh = path.join(dir, 'new');
    run('init', fresh);
    run('import', fresh, dir);
    const imported = JSON.parse(
      readFileSync(path.join(fresh, 'queue.json'), 'utf8'),
    ) as Entry[];
    expect(imported.map((r) => r.issue)).toEqual(['#11']);
    const importedMeta = JSON.parse(
      readFileSync(path.join(fresh, 'meta.json'), 'utf8'),
    ) as Entry[];
    expect(importedMeta[0]!.merged ?? []).not.toContain('#10');
  });

  it('(e) a row that depends on it stays `dep`', () => {
    refused('#10', 'scripts/ci/a.mjs');
    add('#11', ficha('#10:open', 'scripts/ci/b.mjs'));
    expect(slots()).toEqual(['#11 dep #10']);
  });
});

describe('painel.py session kind via-rapida (FQ1, decision 7)', () => {
  it('(f) is accepted, shows in `costs` and `uso`, and has no ruler, signals or ceiling', () => {
    add(
      '#10',
      ficha('nenhuma', 'scripts/ci/a.mjs', 'VR:#1:high'),
      'kind=via-rapida',
      'status=em andamento',
    );
    run('session', dir, '#10', 'sess-vr', 'kind=via-rapida', 'label=VR');
    run(
      'cost',
      dir,
      'sess-vr',
      'usd=1.5',
      'ctx=350000',
      'model=claude-sonnet-5-5',
      'effort=high',
    );
    expect(run('costs', dir)).toContain('via-rapida: 1 sessões');
    const uso = run('uso', dir);
    expect(uso).toContain('via-rapida Sonnet high: 1 sessões');
    expect(uso).toContain('acima do teto —');
    expect(uso).toContain('retrabalho —');
    expect(uso).toContain('sequência —');
    expect(uso).toContain('candidato —');
    const r = tryRun('sinal', dir, 'sess-vr', 'ci=1');
    expect(r.status).toBe(2);
  });
});

describe('painel.py canario usar for via-rapida (FQ1, decision 7)', () => {
  it('(g) answers `atual` for a via-rapida row, and the canary for the same stage row', () => {
    run(
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
    add('#10', ficha('nenhuma', 'scripts/ci/a.mjs', 'VR:#1:high'), 'kind=via-rapida');
    add('#11', ficha('nenhuma', 'scripts/ci/a.mjs'), 'kind=etapa');
    const usar = (issue: string) =>
      run('canario', dir, 'usar', 'fase', issue, 'modelo=Sonnet', 'esforco=high').trim();
    expect(usar('#11')).toBe('canario=B modelo=Sonnet esforco=medium');
    expect(usar('#10')).toBe('atual');
  });
});

describe('painel.py show: `merge pedido ao dono:` (FQ1, decision 3)', () => {
  const ask = (issue: string, wait: string, ...extra: string[]) =>
    add(
      issue,
      ficha('nenhuma', 'scripts/ci/a.mjs'),
      'status=esperando dono',
      'stage=Fases',
      `wait=${wait}`,
      ...extra,
    );

  it('(h) is `nenhum` with nothing asked', () => {
    add('#1', ficha('nenhuma', 'scripts/ci/a.mjs'));
    expect(showLine('merge pedido ao dono:')).toBe('merge pedido ao dono: nenhum');
  });

  it('(h) `import` carries a merge ask (wait and childAt) to the new panel', () => {
    ask('#7', 'merge pedido ao dono: PR #42', 'child=');
    const fresh = path.join(dir, 'new');
    run('init', fresh);
    run('import', fresh, dir);
    const imported = (
      JSON.parse(readFileSync(path.join(fresh, 'queue.json'), 'utf8')) as Entry[]
    ).find((r) => r.issue === '#7');
    expect(imported?.wait).toBe('merge pedido ao dono: PR #42');
    expect(imported?.childAt).toBeTruthy();
  });

  it('(h) lists the row waiting for the merge with the PR and the hours', () => {
    ask('#7', 'merge pedido ao dono: PR #42');
    expect(showLine('merge pedido ao dono:')).toBe(
      'merge pedido ao dono: #7 (PR #42, há 0 h)',
    );
    expect(showLine('merge pedido ao dono:', LATER)).toBe(
      'merge pedido ao dono: #7 (PR #42, há 3 h)',
    );
    ask('#8', 'merge pedido ao dono: PR #43');
    expect(showLine('merge pedido ao dono:', LATER)).toBe(
      'merge pedido ao dono: #7 (PR #42, há 3 h); #8 (PR #43, há 3 h)',
    );
  });

  it('(h) ignores a row whose `wait` is another one, or that has a `child`', () => {
    ask('#7', 'finding de severidade alta: PR #42');
    ask('#8', 'merge pedido ao dono: PR #43', 'child=sess-8');
    expect(showLine('merge pedido ao dono:')).toBe('merge pedido ao dono: nenhum');
  });

  it('(h) keeps the age when the same call clears `child`, and restarts it on a new ask', () => {
    add(
      '#5',
      ficha('nenhuma', 'scripts/ci/a.mjs'),
      'status=em andamento',
      'child=sess-5',
      'childAt=now',
    );
    run(
      'row',
      dir,
      '#5',
      'status=esperando dono',
      'child=',
      'wait=merge pedido ao dono: PR #9',
    );
    expect(showLine('merge pedido ao dono:', LATER)).toBe(
      'merge pedido ao dono: #5 (PR #9, há 3 h)',
    );
    runAt(LATER, 'row', dir, '#5', 'wait=merge pedido ao dono: PR #12');
    expect(showLine('merge pedido ao dono:', LATER)).toBe(
      'merge pedido ao dono: #5 (PR #12, há 0 h)',
    );
  });

  it('(h) is not in `esperando o coordenador:` nor `atrasadas:`', () => {
    ask('#7', 'merge pedido ao dono: PR #42');
    expect(showLine('esperando o coordenador:', LATER)).toBe(
      'esperando o coordenador: nenhuma',
    );
    expect(showLine('atrasadas:', LATER)).toBe('atrasadas: nenhuma');
  });
});
