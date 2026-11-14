// @vitest-environment node
// Phase PF1 (stage #1705): the queue panel shows every phase of the plan as soon as the ficha is written.
// The `todo` state ("to do") only comes from the ficha (`fases=`), and every write completes the rows.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const SKILL = '.claude/skills/implementar-fila/SKILL.md';
const NOW = '2026-11-12T10:00:00Z';
const TIMEOUT = 30_000;
const FICHA_3 =
  'dep=nenhuma | toca=a.ts | fases=D1:#1103:high,D2:#1104:high,D3:#1105:medium';

type Row = Record<string, unknown>;

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function json(d: string, name: string): Row[] {
  return JSON.parse(readFileSync(path.join(d, `${name}.json`), 'utf8')) as Row[];
}

function queueRow(d: string, issue: string): Row {
  const r = json(d, 'queue').find((x) => x.issue === issue);
  if (!r) throw new Error(`${issue} is not in the queue`);
  return r;
}

function changed(out: string): string {
  return /alterados: ([^\n]*)/.exec(out)?.[1] ?? '';
}

/** Hand-writes a queue like the one from before this stage: with no `todo` in the phases. */
function oldQueue(rows: Row[]): void {
  const base: Row = {
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
    exclusive: '',
  };
  const queue = rows.map((r, i) => ({ ...base, order: i + 1, ...r }));
  writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(queue, null, 1));
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'queue-plan-phases-'));
  run('init', dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py — the phases of the plan come in as todo (PF1)', () => {
  it(
    '(a) row … plan= with fases=D1,D2,D3 writes D1:todo|D2:todo|D3:todo, with 0 / 3',
    () => {
      run(
        'row',
        dir,
        '#1',
        'plan=dep=nenhuma | fases=D1:#1:high,D2:#2:high,D3:#3:medium',
      );
      const r = queueRow(dir, '#1');
      expect(r.phases).toBe('D1:todo|D2:todo|D3:todo');
      expect(r.phasesTotal).toBe(3);
      expect(r.phasesDone).toBe(0);
    },
    TIMEOUT,
  );

  it(
    '(b) the #1085 example: D1=ok and D2=open give D1:ok|D2:open|D3:todo, with 1 / 3',
    () => {
      run('row', dir, '#1085', `plan=${FICHA_3}`, 'status=em andamento');
      run('phase', dir, '#1085', 'D1=ok', 'D2=open');
      const r = queueRow(dir, '#1085');
      expect(r.phases).toBe('D1:ok|D2:open|D3:todo');
      expect(r.phasesTotal).toBe(3);
      expect(r.phasesDone).toBe(1);
      const show = run('show', dir, '#1085');
      expect(show).toContain('phases: D1:ok|D2:open|D3:todo');
    },
    TIMEOUT,
  );

  it(
    '(c) CL1=open goes at the end and the total rises: D1:ok|D2:open|D3:todo|CL1:open, with 1 / 4',
    () => {
      run('row', dir, '#1085', `plan=${FICHA_3}`, 'status=em andamento');
      run('phase', dir, '#1085', 'D1=ok', 'D2=open');
      run('phase', dir, '#1085', 'CL1=open');
      const show = run('show', dir, '#1085');
      expect(show).toContain('phases: D1:ok|D2:open|D3:todo|CL1:open');
      expect(show).toContain('phasesTotal: 4');
      expect(show).toContain('phasesDone: 1');
    },
    TIMEOUT,
  );

  it(
    '(d) a ficha with fases=? or without fases does not change phases',
    () => {
      run('row', dir, '#1', 'plan=dep=nenhuma | fases=?', 'phases=A1:open');
      run('row', dir, '#2', 'plan=dep=nenhuma | toca=a.ts', 'phases=B1:ok|B2:open');
      run('row', dir, '#3', 'plan=dep=nenhuma | fases=', 'phases=C1:open');
      run('log', dir, 'any write');
      expect(queueRow(dir, '#1').phases).toBe('A1:open');
      expect(queueRow(dir, '#2').phases).toBe('B1:ok|B2:open');
      expect(queueRow(dir, '#3').phases).toBe('C1:open');
      expect(queueRow(dir, '#2').phasesTotal).toBe(2);
    },
    TIMEOUT,
  );

  it(
    '(e) in a hand-written queue, a log completes the row and puts queue.json in alterados and in unpublished; a second log does not rewrite it',
    () => {
      oldQueue([
        {
          issue: '#10',
          status: 'em andamento',
          plan: FICHA_3,
          phases: 'D1:ok|D2:open',
          phasesTotal: 2,
          phasesDone: 1,
        },
      ]);
      const first = run('log', dir, 'first');
      expect(changed(first)).toContain('queue.json');
      expect(queueRow(dir, '#10').phases).toBe('D1:ok|D2:open|D3:todo');
      expect(queueRow(dir, '#10').phasesTotal).toBe(3);
      const meta = json(dir, 'meta')[0] as { unpublished?: { files: string[] } };
      expect(meta.unpublished?.files).toContain('queue.json');
      expect(run('show', dir)).toMatch(/não publicado desde [^\n]*queue\.json/);

      const second = run('log', dir, 'second');
      expect(changed(second)).not.toContain('queue.json');
    },
    TIMEOUT,
  );

  it(
    '(e) a context alone also completes the row and counts as not published',
    () => {
      oldQueue([{ issue: '#10', status: 'aguardando', plan: FICHA_3 }]);
      const out = run('context', dir, '20');
      expect(changed(out)).toContain('queue.json');
      expect(queueRow(dir, '#10').phases).toBe('D1:todo|D2:todo|D3:todo');
      const meta = json(dir, 'meta')[0] as { unpublished?: { files: string[] } };
      expect(meta.unpublished?.files).toContain('queue.json');
      // Already complete: the next context is quiet again and does not rewrite the queue.
      const again = run('context', dir, '21');
      expect(changed(again)).not.toContain('queue.json');
    },
    TIMEOUT,
  );

  it(
    '(f) the concluída row does not change',
    () => {
      oldQueue([
        {
          issue: '#10',
          status: 'concluída',
          plan: FICHA_3,
          phases: 'D1:ok',
          phasesTotal: 1,
          phasesDone: 1,
        },
      ]);
      const out = run('log', dir, 'something');
      expect(changed(out)).not.toContain('queue.json');
      expect(queueRow(dir, '#10').phases).toBe('D1:ok');
      expect(queueRow(dir, '#10').phasesTotal).toBe(1);
    },
    TIMEOUT,
  );

  it(
    '(g) the ficha redone without D3 drops D3:todo and keeps the open and the ok that it does not bring',
    () => {
      run('row', dir, '#10', `plan=${FICHA_3}`, 'status=em andamento');
      run('phase', dir, '#10', 'D1=ok', 'D2=open', 'CL1=open');
      expect(queueRow(dir, '#10').phases).toBe('D1:ok|D2:open|D3:todo|CL1:open');
      run('row', dir, '#10', 'plan=dep=nenhuma | fases=D1:#1103:high,D2:#1104:high');
      expect(queueRow(dir, '#10').phases).toBe('D1:ok|D2:open|CL1:open');

      run('row', dir, '#11', 'plan=dep=nenhuma | fases=D1:#1:high,D4:#4:high');
      run('phase', dir, '#11', 'D1=ok', 'D2=open', 'D3=ok');
      expect(queueRow(dir, '#11').phases).toBe('D1:ok|D4:todo|D2:open|D3:ok');
      run('row', dir, '#11', 'plan=dep=nenhuma | fases=D1:#1:high');
      expect(queueRow(dir, '#11').phases).toBe('D1:ok|D2:open|D3:ok');
      expect(queueRow(dir, '#11').phasesTotal).toBe(3);
      expect(queueRow(dir, '#11').phasesDone).toBe(2);
    },
    TIMEOUT,
  );

  it(
    '(g2) a phases item without ":" (hand-edited queue) becomes open, not an empty state',
    () => {
      oldQueue([
        {
          issue: '#12',
          status: 'em andamento',
          plan: 'dep=nenhuma | fases=D1:#1:high,D2:#2:high',
          phases: 'D1|D2:ok',
        },
      ]);
      run('row', dir, '#12', 'plan=dep=nenhuma | fases=D1:#1:high,D2:#2:high');
      expect(queueRow(dir, '#12').phases).toBe('D1:open|D2:ok');
      expect(queueRow(dir, '#12').phasesTotal).toBe(2);
      expect(queueRow(dir, '#12').phasesDone).toBe(1);
    },
    TIMEOUT,
  );

  it(
    '(h) phase … D3=todo exits with code 2 and the message lists ok and open',
    () => {
      run('row', dir, '#10', `plan=${FICHA_3}`);
      const r = runRaw('phase', dir, '#10', 'D3=todo');
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("'ok', 'open'");
    },
    TIMEOUT,
  );

  it(
    '(i) the import completes the imported rows from the ficha',
    () => {
      const previous = path.join(dir, 'previous');
      mkdirSync(previous);
      const rowWaiting: Row = {
        order: 1,
        issue: '#20',
        title: 'Waiting',
        kind: 'etapa',
        status: 'aguardando',
        plan: FICHA_3,
        phases: '',
        phasesTotal: 0,
        phasesDone: 0,
        hold: '',
      };
      const rowInProgress: Row = {
        ...rowWaiting,
        order: 2,
        issue: '#21',
        title: 'In progress',
        status: 'em andamento',
        phases: 'D1:ok|D2:open',
        phasesTotal: 2,
        phasesDone: 1,
      };
      writeFileSync(
        path.join(previous, 'queue.json'),
        JSON.stringify([rowWaiting, rowInProgress]),
      );
      writeFileSync(
        path.join(previous, 'meta.json'),
        JSON.stringify([{ runStart: '', updatedAt: NOW, current: '' }]),
      );
      writeFileSync(path.join(previous, 'log.json'), '[]');
      const fresh = path.join(dir, 'fresh');
      run('init', fresh);
      run('import', fresh, previous);
      expect(queueRow(fresh, '#20').phases).toBe('D1:todo|D2:todo|D3:todo');
      expect(queueRow(fresh, '#20').phasesTotal).toBe(3);
      expect(queueRow(fresh, '#21').phases).toBe('D1:ok|D2:open|D3:todo');
      expect(queueRow(fresh, '#21').phasesDone).toBe(1);
    },
    TIMEOUT,
  );
});

describe('SKILL.md — the todo state (PF1, decision 9)', () => {
  const skill = readFileSync(SKILL, 'utf8');

  it('(j) the Panel cites the todo and the =open; the Stage ficha and the Queue no longer say to write the phases as open', () => {
    const panel = section(skill, '## Panel');
    expect(panel).toContain('todo');
    expect(panel).toContain('=open');
    expect(panel).toContain('=ok');
    const ficha = section(skill, '### Stage ficha');
    expect(ficha).toContain('todo');
    expect(ficha).not.toContain('with the phases in `open`');
    const queue = section(skill, '## 2. Queue');
    expect(queue).not.toContain('the `open` phases');
    expect(queue).toContain('todo');
  });
});
