// @vitest-environment node
// Phase FM7 (stage #1532, decisions 17 and 25): hot switch on the existing panel (`upgrade`) and optional migration
// to a new panel (`import`, `importar=`). The old folder is built here, in the format of the current panel (the three JSON
// files with no new field: no `exclusive` on the rows and no `sessions`, `requests`, `rules`, `roles` or `unpublished`).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const SKILL = '.claude/skills/implementar-fila/SKILL.md';
const NOW = '2026-11-11T10:00:00Z';
const SUBPROCESS_TIMEOUT = 30_000;
const HOLD_EMPTY = 'ordem do dono (só com a fila vazia)';

type Row = Record<string, unknown>;

let root = '';
let oldDir = '';
let newDir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function json(dir: string, name: string): Row[] {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Row[];
}

function row(dir: string, issue: string): Row {
  const r = json(dir, 'queue').find((x) => x.issue === issue);
  if (!r) throw new Error(`${issue} is not in the queue of ${dir}`);
  return r;
}

function logTexts(dir: string): string[] {
  return json(dir, 'log').map((e) => String(e.text));
}

/** Row in the format of the current panel: every earlier field, none of the new ones (`exclusive`). */
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

function writeQueue(dir: string, queue: Row[], meta: Row, log: Row[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(queue, null, 1));
  writeFileSync(path.join(dir, 'meta.json'), JSON.stringify([meta], null, 1));
  writeFileSync(path.join(dir, 'log.json'), JSON.stringify(log, null, 1));
}

const FICHA = (dep: string, toca: string) =>
  `dep=${dep} | nivel=impact: low | mcp=não | schema=não | formato=não | epico=epic/x | fases=A1:#9:high | toca=${toca}`;

/** The phase's acceptance example queue, in the old format. */
function oldQueue(): Row[] {
  return [
    legacyRow({
      order: 1,
      issue: '#883',
      title: 'Pages',
      status: 'aguardando',
      hold: HOLD_EMPTY,
      plan: FICHA('nenhuma', 'a.ts'),
    }),
    legacyRow({
      order: 2,
      issue: '#898',
      title: 'Paused',
      status: 'aguardando',
      hold: 'pausada pelo dono',
      plan: FICHA('nenhuma', 'b.ts'),
    }),
    legacyRow({
      order: 3,
      issue: '#900',
      title: 'Done',
      status: 'concluída',
      pr: 'PR #90',
      started: '2026-11-10T09:00:00Z',
      ended: '2026-11-10T11:00:00Z',
      plan: FICHA('nenhuma', 'c.ts'),
    }),
    legacyRow({
      order: 4,
      issue: '#905',
      title: 'In progress',
      kind: 'bug',
      status: 'em andamento',
      stage: 'Fases',
      step: 'phase 2',
      pr: 'PR #91',
      started: '2026-11-10T12:00:00Z',
      phases: 'A1:ok|A2:open',
      phasesTotal: 2,
      phasesDone: 1,
      plan: FICHA('nenhuma', 'd.ts'),
      child: 'session_child',
      childAt: '2026-11-11T09:30:00Z',
      wait: 'question',
      ciWait: 'PR #91',
      ciWaitAt: '2026-11-11T09:40:00Z',
      sessions: 'session_child session_old',
      ended: '2026-11-10T13:00:00Z',
    }),
    legacyRow({
      order: 5,
      issue: '#910',
      title: 'Waiting',
      status: 'esperando dono',
      step: 'choice',
      stage: 'Testador',
      started: '2026-11-10T08:00:00Z',
      hold: 'esperando dono (merge)',
      child: 'session_x',
      sessions: 'session_x',
    }),
    legacyRow({
      order: 6,
      issue: '#911',
      title: 'Failed',
      status: 'falhou',
      step: 'CI',
      started: '2026-11-10T07:00:00Z',
    }),
    legacyRow({
      order: 7,
      issue: '#920',
      title: 'Last',
      status: 'aguardando',
      hold: 'ordem do dono (aguarda a #905)',
      plan: FICHA('#905:aberta', 'e.ts'),
    }),
  ];
}

function oldMeta(): Row {
  return {
    runStart: '2026-11-10T08:00:00Z',
    waitingSince: '2026-11-10T08:00:00Z',
    updatedAt: '2026-11-11T09:50:00Z',
    current: 'running #905',
    reserve: 'trig_old',
    context: 40,
    contextAt: '2026-11-11T09:00:00Z',
    paralelo: 3,
    merged: ['#500', '#900'],
    vagas: '1/3',
    vagasItens: [],
    publishedAt: '2026-11-11T09:00:00Z',
  };
}

function buildOld() {
  writeQueue(oldDir, oldQueue(), oldMeta(), [
    { at: '2026-11-10T08:00:00Z', text: 'Execução iniciada' },
    { at: '2026-11-10T21:06:00Z', text: 'owner rule: budget revised' },
  ]);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'queue-import-'));
  oldDir = path.join(root, 'old');
  newDir = path.join(root, 'new');
  buildOld();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('painel.py — hot switch on a panel without the new fields (FM7, decision 25)', () => {
  it(
    'show, row, apply, cost, role, sup, rule and costs work, and show prints "—" or "nenhum" where data is missing',
    () => {
      const show = run('show', oldDir);
      expect(show).toContain('custo: ');
      expect(show).toContain('pedidos do supervisor: ');
      expect(show).toMatch(/regras em vigor:/);
      expect(show).toContain('não publicado: nenhum');
      expect(run('roles', oldDir)).toContain('—');
      expect(run('costs', oldDir)).toBeTruthy();
      expect(run('requests', oldDir)).toBeTruthy();

      run('row', oldDir, '#883', 'step=ok');
      run(
        'cost',
        oldDir,
        'session_new',
        'usd=1.5',
        'ctx=100000',
        'model=claude-sonnet-5-5',
        'effort=high',
        'issue=#905',
        'kind=fase',
      );
      run(
        'role',
        oldDir,
        'coordenador',
        'session_c1',
        'link=https://claude.ai/code/session_c1',
      );
      run('sup', oldDir, 'SUP-1', 'tipo=A', 'pedido=hold #920', 'estado=enviado');
      run('rule', oldDir, 'add', 'do not start anything at 3am', 'origem=dono');
      const batchFile = path.join(root, 'batch.txt');
      writeFileSync(batchFile, "row '#883' 'step=again'\nlog 'inside the batch'\n");
      run('apply', oldDir, batchFile);
      const meta = json(oldDir, 'meta')[0]!;
      expect(meta.roles).toBeTruthy();
      expect(meta.rules).toHaveLength(1);
      expect(meta.requests).toHaveLength(1);
      expect(row(oldDir, '#883').step).toBe('again');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('painel.py upgrade (FM7, decisions 17 and 25)', () => {
  it(
    'replaces the empty-queue hold with exclusive=sim, leaves the other holds and records it in the log',
    () => {
      const out = run('upgrade', oldDir);
      expect(out).toContain('alterados: ');
      const a = row(oldDir, '#883');
      expect(a.exclusive).toBe('sim');
      expect(a.hold).toBe('');
      expect(row(oldDir, '#898').hold).toBe('pausada pelo dono');
      expect(row(oldDir, '#898').exclusive ?? '').toBe('');
      expect(row(oldDir, '#910').hold).toBe('esperando dono (merge)');
      expect(row(oldDir, '#920').hold).toBe('ordem do dono (aguarda a #905)');
      const log = logTexts(oldDir);
      expect(log).toHaveLength(3);
      expect(log[2]).toMatch(/upgrade/);
      expect(log[2]).toContain('#883');
      expect(log[2]).toContain('exclusive=sim');
      const meta = json(oldDir, 'meta')[0]!;
      expect((meta.unpublished as { files: string[] }).files).toContain('queue.json');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'is idempotent: run again it changes nothing and writes nothing to the log',
    () => {
      run('upgrade', oldDir);
      const before = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(oldDir, `${n}.json`), 'utf8'),
      );
      const out = run('upgrade', oldDir);
      expect(out).toContain('alterados: nenhum');
      const after = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(oldDir, `${n}.json`), 'utf8'),
      );
      expect(after).toEqual(before);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'with no empty-queue hold, it changes nothing',
    () => {
      run('row', oldDir, '#883', 'hold=');
      const before = readFileSync(path.join(oldDir, 'queue.json'), 'utf8');
      expect(run('upgrade', oldDir)).toContain('alterados: nenhum');
      expect(readFileSync(path.join(oldDir, 'queue.json'), 'utf8')).toBe(before);
      expect(logTexts(oldDir).filter((t) => /upgrade/.test(t))).toEqual([]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'the converted exclusive stage only starts with the queue empty (show already handles it)',
    () => {
      run('upgrade', oldDir);
      expect(run('show', oldDir)).toContain('exclusiva');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'goes in the apply batch',
    () => {
      const batchFile = path.join(root, 'batch.txt');
      writeFileSync(batchFile, 'upgrade\nlog "after the upgrade"\n');
      run('apply', oldDir, batchFile);
      expect(row(oldDir, '#883').exclusive).toBe('sim');
      expect(logTexts(oldDir).at(-1)).toBe('after the upgrade');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('painel.py import (FM7, decision 17)', () => {
  beforeEach(() => {
    run('init', newDir);
  });

  it(
    'carries meta.escapados, meta.escapadosAt and meta.historico (QC1, F1) and adds none when the old panel has no such keys',
    () => {
      run('import', newDir, oldDir);
      const plain = json(newDir, 'meta')[0]!;
      expect(plain).not.toHaveProperty('escapados');
      expect(plain).not.toHaveProperty('escapadosAt');
      expect(plain).not.toHaveProperty('historico');

      const escapados = [
        { bug: '#1', etapa: '#2', sev: 'medium', at: '2026-11-12T10:00:00Z' },
      ];
      const historico = {
        desde: '2026-11-11T00:00:00Z',
        ate: '2026-11-14T00:00:00Z',
        linhas: 12,
      };
      writeQueue(
        oldDir,
        oldQueue(),
        { ...oldMeta(), escapados, escapadosAt: '2026-11-13T09:00:00Z', historico },
        [{ at: '2026-11-10T08:00:00Z', text: 'Execução iniciada' }],
      );
      rmSync(newDir, { recursive: true, force: true });
      run('init', newDir);
      run('import', newDir, oldDir);
      const meta = json(newDir, 'meta')[0]!;
      expect(meta.escapados).toEqual(escapados);
      expect(meta.escapadosAt).toBe('2026-11-13T09:00:00Z');
      expect(meta.historico).toEqual(historico);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'carries meta.canarios with its baseline next to meta.historico (QC2, F2) and adds none when the old panel has no canary',
    () => {
      run('import', newDir, oldDir);
      expect(json(newDir, 'meta')[0]!).not.toHaveProperty('canarios');

      const canarios = [
        {
          id: 'A',
          papel: 'reteste',
          de: 'Sonnet medium',
          modelo: 'Haiku',
          esforco: 'medium',
          n: 5,
          volta: 2,
          inicio: '2026-11-12T12:00:00Z',
          sessoes: [],
          estado: 'ativo',
          motivo: '',
          fim: null,
          resumo: {
            antes: { sessoes: 3 },
            canario: { sessoes: 0 },
            veredito: 'não promover',
          },
        },
      ];
      const historico = {
        desde: '2026-11-11T00:00:00Z',
        ate: '2026-11-14T00:00:00Z',
        linhas: 12,
      };
      writeQueue(oldDir, oldQueue(), { ...oldMeta(), canarios, historico }, [
        { at: '2026-11-10T08:00:00Z', text: 'Execução iniciada' },
      ]);
      rmSync(newDir, { recursive: true, force: true });
      run('init', newDir);
      run('import', newDir, oldDir);
      const meta = json(newDir, 'meta')[0]!;
      expect(meta.historico).toEqual(historico);
      const carried = meta.canarios as Record<string, unknown>[];
      expect(carried).toHaveLength(1);
      expect(carried[0]).toMatchObject({
        id: 'A',
        papel: 'reteste',
        de: 'Sonnet medium',
        n: 5,
        volta: 2,
        inicio: '2026-11-12T12:00:00Z',
      });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'brings aguardando, em andamento, esperando dono and falhou, in order and renumbered from 1 to n, with the ficha',
    () => {
      run('import', newDir, oldDir);
      const q = json(newDir, 'queue');
      expect(q.map((r) => r.issue)).toEqual([
        '#883',
        '#898',
        '#905',
        '#910',
        '#911',
        '#920',
      ]);
      expect(q.map((r) => r.order)).toEqual([1, 2, 3, 4, 5, 6]);
      const r = row(newDir, '#905');
      expect(r).toMatchObject({
        issue: '#905',
        title: 'In progress',
        kind: 'bug',
        plan: FICHA('nenhuma', 'd.ts'),
        phases: 'A1:ok|A2:open',
        phasesTotal: 2,
        phasesDone: 1,
        stage: 'Fases',
        step: 'phase 2',
        pr: 'PR #91',
        started: '2026-11-10T12:00:00Z',
        hold: '',
        status: 'em andamento',
      });
      expect(row(newDir, '#911').status).toBe('falhou');
      expect(row(newDir, '#910').status).toBe('esperando dono');
      expect(row(newDir, '#920').status).toBe('aguardando');
      // decision 12 of #2293: the started rows come with a partial cost, the waiting ones do not
      expect(json(newDir, 'meta')[0]!.partialCost).toEqual(['#905', '#910', '#911']);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'the em andamento rows carry child, childAt, wait, ciWait, ciWaitAt and sessions; ended does not come',
    () => {
      run('import', newDir, oldDir);
      const r = row(newDir, '#905');
      expect(r).toMatchObject({
        child: 'session_child',
        childAt: '2026-11-11T09:30:00Z',
        wait: 'question',
        ciWait: 'PR #91',
        ciWaitAt: '2026-11-11T09:40:00Z',
        sessions: 'session_child session_old',
      });
      expect(r.ended).toBe('');
      // the rows that are not em andamento do not carry the tracking fields
      expect(row(newDir, '#910').child).toBe('');
      expect(row(newDir, '#910').sessions).toBe('');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'does not bring from the meta: previous sessions, requests, current, paralelo, reserve, context, roles and unpublished; nor the log',
    () => {
      const meta = json(oldDir, 'meta')[0]!;
      meta.sessions = [{ id: 'session_a', issue: '#1', kind: 'fase' }];
      meta.requests = [{ id: 'SUP-1', estado: 'enviado' }];
      meta.roles = { coordenador: { id: 'session_c', n: 2 } };
      meta.unpublished = { since: '2026-11-11T09:00:00Z', files: ['log.json'] };
      writeFileSync(path.join(oldDir, 'meta.json'), JSON.stringify([meta]));
      run('import', newDir, oldDir);
      const m = json(newDir, 'meta')[0]!;
      for (const k of [
        'sessions',
        'requests',
        'roles',
        'reserve',
        'context',
        'contextAt',
        'paralelo',
      ]) {
        expect(m[k], k).toBeUndefined();
      }
      expect(m.current).toBe('');
      expect(m.runStart).toBe('');
      expect((m.unpublished as { files: string[] }).files).toEqual([
        'queue.json',
        'meta.json',
        'log.json',
      ]);
      const log = logTexts(newDir);
      expect(log).toHaveLength(1);
      expect(log[0]).not.toContain('Execução iniciada');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'erases the "pausada pelo dono", converts the empty-queue one into exclusive=sim and keeps the other holds',
    () => {
      run('import', newDir, oldDir);
      expect(row(newDir, '#898').hold).toBe('');
      expect(row(newDir, '#883').hold).toBe('');
      expect(row(newDir, '#883').exclusive).toBe('sim');
      expect(row(newDir, '#920').hold).toBe('ordem do dono (aguarda a #905)');
      expect(row(newDir, '#910').hold).toBe('esperando dono (merge)');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'the concluída ones go to meta.merged together with the old merged, without repeating; #900 does not become a row',
    () => {
      run('import', newDir, oldDir);
      const m = json(newDir, 'meta')[0]!;
      expect(m.merged).toEqual(['#500', '#900']);
      expect(json(newDir, 'queue').some((r) => r.issue === '#900')).toBe(false);
      const meta = json(oldDir, 'meta')[0]!;
      meta.merged = ['#500'];
      writeFileSync(path.join(oldDir, 'meta.json'), JSON.stringify([meta]));
      run('init', '--force', newDir);
      run('import', newDir, oldDir);
      expect(json(newDir, 'meta')[0]!.merged).toEqual(['#500', '#900']);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'brings the rules in force from meta.rules, with the origem, and leaves the ended ones',
    () => {
      const meta = json(oldDir, 'meta')[0]!;
      meta.rules = [
        { id: 'R1', texto: 'live rule', origem: 'dono', at: '2026-11-10T10:00:00Z' },
        {
          id: 'R2',
          texto: 'dead rule',
          origem: 'SUP-3',
          at: '2026-11-10T11:00:00Z',
          endedAt: '2026-11-10T12:00:00Z',
        },
      ];
      writeFileSync(path.join(oldDir, 'meta.json'), JSON.stringify([meta]));
      run('import', newDir, oldDir);
      const rules = json(newDir, 'meta')[0]!.rules as Row[];
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({ texto: 'live rule', origem: 'dono' });
      expect(run('show', newDir)).toContain('live rule');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'with a non-empty new folder, exits with code 2 and writes nothing',
    () => {
      run('row', newDir, '#1', 'title=Already has');
      const before = readFileSync(path.join(newDir, 'queue.json'), 'utf8');
      const r = runRaw('import', newDir, oldDir);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/erro:/);
      expect(readFileSync(path.join(newDir, 'queue.json'), 'utf8')).toBe(before);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'old or new folder without the files: code 2',
    () => {
      expect(runRaw('import', newDir, path.join(root, 'does-not-exist')).status).toBe(2);
      expect(runRaw('import', path.join(root, 'no-init'), oldDir).status).toBe(2);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'does not change the old folder',
    () => {
      const before = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(oldDir, `${n}.json`), 'utf8'),
      );
      run('import', newDir, oldDir);
      const after = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(oldDir, `${n}.json`), 'utf8'),
      );
      expect(after).toEqual(before);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'records in the log "importado de <old folder>: <n> linhas (<k> em andamento); exclusivas …; holds …; merged <m>"',
    () => {
      run('import', newDir, oldDir);
      const log = logTexts(newDir);
      expect(log).toHaveLength(1);
      expect(log[0]).toBe(
        `importado de ${oldDir}: 6 linhas (1 em andamento); exclusivas #883; holds #898 apagado, #910 mantido, ` +
          '#920 mantido; merged 2',
      );
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'the imported queue marks what is left to publish and the vagas are recomputed',
    () => {
      run('import', newDir, oldDir);
      const m = json(newDir, 'meta')[0]!;
      expect((m.unpublished as { files: string[] }).files).toEqual([
        'queue.json',
        'meta.json',
        'log.json',
      ]);
      expect(typeof m.vagas).toBe('string');
      const show = run('show', newDir);
      expect(show).toContain('fila: 6 linhas');
      // the rows without a ficha on the old panel (#910 and #911) go into the fichas a refazer
      expect(show).toContain('fichas a refazer: #910 #911');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'import does not go in the apply batch',
    () => {
      const batchFile = path.join(root, 'batch.txt');
      writeFileSync(batchFile, `import ${oldDir}\n`);
      const r = runRaw('apply', newDir, batchFile);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('linha 1');
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('SKILL.md — hot switch and importar= (FM7)', () => {
  const skill = readFileSync(SKILL, 'utf8');

  it('"In the new session" cites upgrade, the page swap and the role', () => {
    const s = section(skill, '## Session switch');
    const newSession = s.slice(s.indexOf('**In the new session**'));
    expect(newSession).toContain('painel.py upgrade');
    expect(newSession).toMatch(/files\/index\.html/);
    expect(newSession).toMatch(/page/);
    expect(newSession).toContain('role <folder> coordenador');
  });

  it('"Arguments" cites importar= as optional', () => {
    const s = section(skill, '## Arguments');
    expect(s).toContain('importar=<old panel url>');
    expect(s).toMatch(/importar=[^\n]*optional/);
  });

  it('"Panel" describes the import path', () => {
    const s = section(skill, '## Panel');
    expect(s).toContain('importar=');
    expect(s).toContain('painel.py import');
    expect(s).toMatch(/datasets/);
    expect(s).toContain('init');
  });

  it('step 3 of "Queue" asks for the ficha of all the imported rows', () => {
    const s = section(skill, '## 2. Queue');
    const step3 = s.slice(
      s.indexOf('3. Ask **one** subagent'),
      s.indexOf('4. **Order:**'),
    );
    expect(step3).toMatch(/importar=/);
    expect(step3).toMatch(/all the imported rows/);
  });

  it('whoever imports with a stage in progress is the coordinator that has it and notifies the child sessions', () => {
    const s = section(skill, '## Panel');
    expect(s).toMatch(/em andamento/);
    expect(s).toContain('O coordenador mudou');
  });
});
