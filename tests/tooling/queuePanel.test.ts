// @vitest-environment node
// Phase FC1 (stage #1285): the queue panel keeps the ficha of each stage (`plan`), the child sessions
// that owe a notice (`child`, `childAt`) and the fallback check (`reserve`), and the `show` summarizes
// everything without printing the whole JSON, so the coordinator does not fill the context.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
}

function runAt(now: string, ...args: string[]): string {
  return run('--now', now, ...args);
}

function json(name: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8'));
}

describe('painel.py (FC1)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-'));
    runAt('2026-11-09T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('the row keeps the ficha (plan) and the show of one row prints it', () => {
    run('row', dir, '#10', 'title=Stage ten', 'plan=dep=nenhuma; fases=AB1:#11');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.plan).toBe('dep=nenhuma; fases=AB1:#11');
    const out = run('show', dir, '#10');
    expect(out).toContain('#10');
    expect(out).toContain('dep=nenhuma; fases=AB1:#11');
  });

  it('child and childAt=now register the child; show lists only the overdue ones (more than 30 min; decision 5 of #1324)', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'status=em andamento',
      'child=session_a',
      'childAt=now',
    );
    runAt(
      '2026-11-09T10:50:00Z',
      'row',
      dir,
      '#20',
      'status=em andamento',
      'child=session_b',
      'childAt=now',
    );
    const out = runAt('2026-11-09T11:10:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas:[^\n]*#10[^\n]*session_a/);
    expect(out).not.toMatch(/atrasadas:[^\n]*#20/);
  });

  it('overdue is only a child with more than 30 min: 30 does not count, 31 does (decision 5 of #1324)', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    expect(runAt('2026-11-09T10:30:00Z', 'show', dir)).toMatch(/atrasadas: nenhuma/);
    expect(runAt('2026-11-09T10:31:00Z', 'show', dir)).toMatch(/atrasadas:[^\n]*#10/);
  });

  it('an empty child= clears childAt and the stage stops being overdue', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    run('row', dir, '#10', 'child=');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.childAt).toBe('');
    const out = runAt('2026-11-09T12:00:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
  });

  it('reserve keeps the check id in the meta and the show displays it', () => {
    const changed = run('reserve', dir, 'trig_abc');
    expect(changed).toContain('meta.json');
    const meta = json('meta') as Array<Record<string, unknown>>;
    expect(meta[0]?.reserve).toBe('trig_abc');
    expect(run('show', dir)).toContain('reserva: trig_abc');
  });

  it('a child with wait is not overdue and appears in "esperando o coordenador" (RS1, decision 5)', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    runAt('2026-11-09T10:01:00Z', 'row', dir, '#10', 'wait=product question');
    const out = runAt('2026-11-09T12:00:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
    expect(out).toMatch(/esperando o coordenador: #10 \(product question\)/);
  });

  it('with no child waiting, the show says "esperando o coordenador: nenhuma"', () => {
    expect(run('show', dir)).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('wait= with childAt=now puts the child back in the count', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=CI travado',
    );
    runAt('2026-11-09T12:00:00Z', 'row', dir, '#10', 'wait=', 'childAt=now');
    expect(runAt('2026-11-09T12:20:00Z', 'show', dir)).toMatch(/atrasadas: nenhuma/);
    const out = runAt('2026-11-09T12:31:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas:[^\n]*#10/);
    expect(out).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('switching the child (recreated session) without passing wait also clears the wait', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=question',
    );
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'child=session_b', 'childAt=now');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.wait).toBe('');
    expect(runAt('2026-11-09T10:40:00Z', 'show', dir)).toMatch(/atrasadas:[^\n]*#10/);
  });

  it('an empty child= clears the wait', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=call the owner',
    );
    run('row', dir, '#10', 'child=');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.wait).toBe('');
    expect(run('show', dir)).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('an invalid childAt is refused', () => {
    expect(() => run('row', dir, '#10', 'childAt=yesterday')).toThrow();
  });
});

// Stage #1298 (FT1) and #1315 (FC2); decision 11 of #1322 (FS1) only changes the criterion: a large skill switches the session.
describe('implementar-fila: new skill on main and session switch (FT1, FC2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const switching = section(skill, '## Session switch');
  const CHECK =
    'git fetch -q origin main && git diff --quiet HEAD origin/main -- .claude/skills/implementar-fila/SKILL.md';

  it('"Session switch" says to pull and reread the whole SKILL.md (decision 5; decision 11 of #1322)', () => {
    expect(switching).toContain(CHECK);
    expect(switching).toContain('git pull -q --ff-only origin main');
    expect(switching).toMatch(/reread the whole `SKILL.md`/);
    expect(switching).not.toContain('even below 60%');
    expect(switching).not.toContain('skill updated on main');
  });

  it('the switch is by context above 35% or by a large skill (decision 6; decision 11 of #1322)', () => {
    expect(switching).toMatch(/Session switch for context or for a large skill/);
    expect(switching).toMatch(/Above 35%/);
  });

  it('before creating the successor it checks lineage.depth + 2 > limit (decision 7)', () => {
    expect(switching).toContain('lineage.depth');
    expect(switching).toContain('lineage.limit');
    expect(switching).toContain('depth + 2 > limit');
    expect(switching).toMatch(/aguardando o dono abrir a sessão nova da fila/);
  });

  it('the fallback check and the "Between stages" step do the same check', () => {
    const between7 = between(skill, '7. **Between stages:**', '**Fallback checks:**');
    expect(between7).toMatch(/skill changed on `main`/);
    const check = between(skill, '**Fallback checks:**', '**Red CI');
    expect(check).toMatch(/skill changed on `main`/);
  });
});

// Stage #1315 (FC2): context fine-tuning, archiving of the sessions and waiting for a workflow.
describe('implementar-fila: coordinator fine-tuning (FC2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const TITLES = [
    'For the phase session',
    'Fix phase',
    'For the tester',
    'Directed round in groups',
    'Retest together',
    'Full round in blocks',
  ];

  it('lists the exact titles of the FLOW.md messages and the read command (decision 2)', () => {
    for (const title of TITLES) {
      expect(skill).toContain(`"${title}"`);
      expect(flow).toMatch(new RegExp(`^## ${title}$`, 'm'));
    }
    expect(skill).toContain(
      "awk '/^## <title>$/{f=1;print;next} /^## /{f=0} f' docs/FLOW.md",
    );
    expect(skill).toMatch(/never by `grep`/);
  });

  it('the panel is published once per turn that wrote, even with the subagent running (decision 3 of #1532)', () => {
    expect(skill).toMatch(/once per turn, at the end/);
    expect(skill).toMatch(/even with the cycle's subagent still running/);
    expect(skill).toMatch(/only with the changed files/);
    expect(skill).toMatch(
      /The hourly check with no overdue ones and no unpublished file does not publish/i,
    );
    expect(skill).not.toMatch(/There are never two publications in the same cycle/);
  });

  it('the chat stays almost silent (decision 3)', () => {
    expect(skill).toMatch(/The chat stays almost silent/);
    expect(skill).toMatch(/writes no summary/);
  });

  it('one subagent per cycle for the GitHub tasks (decision 4)', () => {
    expect(skill).toMatch(/One subagent per cycle/);
    expect(skill).toMatch(/one line per task/);
  });

  it('archives each child when it finishes, registers the sessions and archives the previous one (decision 8)', () => {
    expect(skill).toContain('archive_session');
    expect(skill).toContain("painel.py session <folder> '#n' <id>");
    expect(skill).toMatch(/<código> arquivada/);
    expect(skill).toMatch(/not archived/i);
    expect(skill).toMatch(/archives the `anterior`/);
    expect(skill).toMatch(/does not archive itself/);
  });

  it('the wait for a workflow follows the measured duration (decision 10)', () => {
    expect(skill).toMatch(/in the same cycle as the merge/);
    expect(skill).toMatch(/`release` job skipped/);
    expect(skill).toMatch(/5 min after the merge/);
    expect(skill).toMatch(/every 1 min/);
    expect(skill).toMatch(/does not hold the next epic's merge/);
  });

  it('the label swap sends the complete list (decision 11), in the skill and in detalhar-backlog', () => {
    for (const text of [skill, detalhar]) {
      expect(text).toMatch(/replaces all the (issue's )?labels/);
      expect(text).toMatch(/(complete|full) list/);
      expect(text).toMatch(/`severity:`/);
    }
  });

  it('detalhar-backlog archives each detailing or grouping subagent (decision 9)', () => {
    expect(detalhar).toContain('archive_session');
    expect(detalhar).toMatch(/archiv/i);
    expect(detalhar).toMatch(/final summary/);
  });

  it('FLOW.md says how the switch and the archiving work', () => {
    const line = flow
      .split('\n')
      .find((l) => l.startsWith('To implement all the `ready` ones in sequence'));
    expect(line).toMatch(/by context/);
    expect(line).toMatch(/lineage limit/);
    expect(line).toMatch(/archived/);
  });
});

describe('painel.py: sessions per stage (FC2, decision 8)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-'));
    runAt('2026-11-09T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('session appends the id to sessions without repeating, and the stage show displays it', () => {
    run('row', dir, '#10', 'title=Stage ten');
    run('session', dir, '#10', 'session_a');
    run('session', dir, '#10', 'session_b');
    const out = run('session', dir, '#10', 'session_a');
    expect(out).toContain('queue.json');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.sessions).toBe('session_a session_b');
    expect(run('show', dir, '#10')).toContain('sessions: session_a session_b');
  });

  it('session on a stage outside the queue is refused', () => {
    expect(() => run('session', dir, '#99', 'session_a')).toThrow();
  });
});

// Stage #1324 (CR1): resilient CI on the phase's and the coordinator's side.
describe('Resilient CI: phase, check and dist ceiling (CR1)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const processDoc = readFileSync('docs/PROCESS.md', 'utf8');
  const phase = section(flow, '## For the phase session');
  // Item 6 is a list: the block goes from "6." to "7." (stage #1466, decision 9).
  const item6 = between(phase, '\n6. ', '\n7. ');
  const reading = between(item6, '**Reading CI:**', '\n   - **');
  const fallback = between(skill, '**Fallback checks:**', '**Red CI');
  const redCi = between(skill, '**Red CI', '## Queue changes during the run');

  it('"For the phase session": send_later of 4 min and every 2 min, second rerun by the phase and notice (decisions 1 and 2)', () => {
    expect(item6).toMatch(/first check with a `send_later` of 4 min/);
    expect(item6).toMatch(/every 2 min up to 20 min/);
    expect(item6).toMatch(/after that, every 8/);
    expect(item6).not.toMatch(/`send_later` of 8 min/);
    expect(item6).toMatch(/never end the turn/i);
    expect(item6).toContain('ci-rerun.yml');
    expect(item6).toContain('node scripts/ci/ciRerun.mjs decide');
    expect(item6).toContain('gh run rerun <id> --failed');
    expect(item6).toMatch(/after \*\*2 reruns without success\*\*/);
    expect(item6).toContain('CI travado: <link da execução>, tentativas 1 a 3');
    expect(item6).toMatch(/legitimate failure/i);
  });

  it('Reading CI: check runs, no get_status, current commit and only the CI workflow (decisions 1 to 4)', () => {
    expect(reading).toContain('`get_check_runs`');
    expect(reading).toMatch(/never with `get_status`/);
    expect(reading).toMatch(/`perPage` 100/);
    for (const job of ['epic', 'static', 'test', 'coverage', 'build', 'check', 'e2e'])
      expect(reading).toContain(`\`${job}\``);
    expect(reading).toMatch(/`queued` or `in_progress`/);
    expect(reading).toMatch(/`failure`, `cancelled` or `timed_out`/);
    expect(reading).toMatch(/most recent run of each job/);
    expect(reading).toMatch(/other workflows do not count/);
    expect(reading).toMatch(/green of an earlier commit does not count/);
    expect(reading).toMatch(
      /Without `check` and `e2e` \(and `epic`, on an epic PR\) at `success` and with no failure, CI is still running/,
    );
    expect(reading).not.toMatch(/Ignore the `skipped` check runs/);
    expect(reading).not.toMatch(/no other with/);
  });

  it('item 6 is a list with CI wait, Reading CI, Abandoned runner and Ceiling; the phase merges its own PR (decisions 9 and 12)', () => {
    for (const sub of [
      'CI wait',
      'Reading CI',
      'Abandoned runner',
      'Ceiling of `dist/index.html`',
    ])
      expect(item6).toContain(`   - **${sub}:**`);
    expect(item6).toMatch(/merge your own PR into the epic/);
    expect(item6).toMatch(/never left to the coordinator/);
    expect(item6).toMatch(/each push[^\n]*restarts the 20 min count/);
    expect(item6).toMatch(/never rebase/);
    const item7 = between(phase, '\n7. ', '\n8. ');
    expect(item7).toMatch(/PR already merged/);
    const fix = section(flow, '## Fix phase');
    expect(fix).toMatch(/merges its own PR/);
  });

  it('green requires each ci.yml job outside the check needs, together with success (finding 6, decision 11)', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const afterJobs = ci.slice(ci.indexOf('\njobs:\n'));
    const jobs = [...afterJobs.matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1]!);
    expect(jobs).toContain('check');
    const needsLine = afterJobs.match(
      /^ {2}check:\n(?:(?: {4}|\n).*\n)*? {4}needs: \[([^\]]*)\]/m,
    );
    if (needsLine === null) throw new Error('needs of the check job not found');
    const needs = needsLine[1]!.split(',').map((n) => n.trim());
    for (const job of jobs) expect(reading).toContain(`\`${job}\``);
    const green = between(reading, 'Green = ', '`check` does not wait');
    const outside = jobs.filter((j) => j !== 'check' && !needs.includes(j));
    expect(outside).toContain('e2e');
    expect(outside).toContain('epic');
    for (const job of outside) {
      expect(green).toContain(`\`${job}\``);
      expect(green).toContain('`success`');
    }
  });

  it('the Merge briefing points to the Reading CI and does not repeat the definition (decision 10)', () => {
    const check = between(
      skill,
      'Whoever checks the CI and whether the PR can be merged',
      '\n\n',
    );
    expect(check).toContain('Reading CI');
    expect(check).toContain('docs/FLOW.md');
    expect(check).not.toContain('no other with');
    expect(check).not.toMatch(/ignore the `skipped`/i);
    expect(skill).not.toMatch(/Ignore the `skipped` check runs/);
    expect(flow).not.toMatch(/Ignore the `skipped` check runs/);
  });

  it('PR that waits for the coordinator: send_later, triggers, notice log and merge in the same turn (#1476, decisions 12 to 15)', () => {
    const waiting = between(skill, '**PR that waits for the coordinator:**', '\n\n');
    expect(waiting).toMatch(/`send_later` 4 min after/);
    expect(waiting).toMatch(/every 2 min up to 20 min/);
    expect(waiting).toMatch(/then every 8/);
    expect(waiting).toMatch(/push by the coordinator/);
    expect(waiting).toMatch(/left the merge/);
    expect(waiting).toMatch(/restarts the chain/);
    expect(waiting).toMatch(/Reading CI/);
    expect(fallback).toMatch(/per-PR `send_later` that waits for the coordinator/);
    expect(fallback).toMatch(/No `send_later` per child/);
    expect(fallback).toMatch(
      /Worst case of detection:[^\n]*PR that waits for the coordinator/,
    );
    expect(fallback).toMatch(/does not use `subscribe_pr_activity`/);
    const economy = section(skill, '## Context economy');
    const item7 = economy.split('\n').find((l) => l.startsWith('7. '));
    expect(item7).toMatch(/another cycle/);
    expect(item7).toMatch(/`log` line/);
    expect(item7).toMatch(/same turn/);
    const phases = between(skill, '2. **Phases**', '3. **Tester.**');
    expect(phases).toMatch(/merges[^\n]*same turn/);
  });

  it('"For the owner, in the three chats": summaries of Depende de, of parallel and of the check (#1442, decision 18)', () => {
    const owner = section(flow, '## For the owner, in the three chats');
    expect(owner).toMatch(/`Depende de`[^\n]*`docs\/TESTING\.md` per script/);
    expect(owner).toContain('docs/TESTING-NUVEM.md#full-round-in-blocks');
    expect(owner).toMatch(/`paralelo=N`[^\n]*`Vagas k\/N`/);
    expect(owner).not.toMatch(/disjoint files/);
    expect(owner).toMatch(/hourly check[^\n]*context[^\n]*35%/);
  });

  it('"For the phase session": margin and dist ceiling for the phase (decisions 3, 6, 7 and 8)', () => {
    expect(item6).toMatch(/abaixo de 2 KiB/);
    expect(item6).toMatch(/trim/);
    expect(item6).toContain('node scripts/ci/distBudget.mjs raise');
    // Stage #1614 (decision 5): the ceiling lives in `scripts/ci/dist-budget.json`; the `--ci` left the command.
    expect(item6).toContain('scripts/ci/dist-budget.json');
    expect(item6).not.toContain('--ci .github/workflows/ci.yml');
    expect(item6).not.toMatch(/INDEX_HTML_MAX_BYTES[^\n]*of `ci\.yml`/);
    // Decision 6: the transition of a branch that raised the ceiling in `ci.yml` before the stage.
    expect(item6).toMatch(/keeping the `ci\.yml` from `main`/);
    expect(item6).toMatch(/`history`/);
    expect(item6).toMatch(/16 KiB/);
    expect(item6).toMatch(/up to 14 KiB/);
    expect(item6).toMatch(/32 KiB/);
    expect(item6).toMatch(/64 KiB/);
    expect(item6).toMatch(/`send_message`/);
  });

  it('"For the phase session": the ceiling always goes up and the phase opens the ceiling `bug` (#1802, decisions 1 to 6)', () => {
    const ceiling = between(
      item6,
      '   - **Ceiling of `dist/index.html`:**',
      '**Transition:**',
    );
    expect(ceiling).not.toMatch(/calls the owner/);
    expect(ceiling).not.toContain('ask the owner for authorization');
    expect(ceiling).toMatch(/always raises/);
    expect(ceiling).toContain('`bug:`');
    expect(ceiling).toContain('Teto do dist/index.html acima dos limites');
    expect(ceiling).toContain('`severity: low`');
    expect(ceiling).toContain('is:issue in:title');
    expect(ceiling).toMatch(/one per raise/);
    expect(ceiling).toMatch(/after the commit[^\n]*before the notice/);
    expect(ceiling).toContain('Teto do `dist/index.html` subiu');
    expect(ceiling).toContain('acima dos limites, `bug` #<n> para o dono revisar');
    // the `bug` number only exists after it is opened: the 1st commit carries the line without it, and the 2nd completes it before the push
    expect(ceiling).toMatch(
      /the commit ends it in "; acima dos limites, `bug` para o dono revisar"/,
    );
    expect(ceiling).toMatch(/second commit completes the line[^\n]*only then the push/);
    expect(ceiling).toMatch(/no `PushNotification`|the owner looks later/);
    expect(ceiling).toContain('#1493');
    expect(ceiling).toMatch(/another failure/);
  });

  it("a phase's CI stays only in item 6 (owner's decision)", () => {
    const others = phase
      .split('\n')
      .filter((l) => /^\d+\. /.test(l) && !l.startsWith('6. '));
    expect(others.length).toBeGreaterThan(0);
    for (const line of others) {
      expect(line).not.toContain('send_later');
      expect(line).not.toContain('ci-rerun.yml');
      expect(line).not.toContain('distBudget.mjs');
    }
  });

  it('"Fallback checks": 30 min, review_ready/idle with no notice and send_message before recreating (decision 5)', () => {
    expect(fallback).toMatch(/more than 30 min/);
    expect(fallback).not.toMatch(/more than 60 min/);
    expect(fallback).toContain('`review_ready`');
    expect(fallback).toContain('`idle`');
    const msg = 'Conferência da fila: a fase não avisou. Retome do ponto em que parou';
    expect(fallback).toContain(msg);
    expect(fallback).toMatch(
      new RegExp(
        `${msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*create the session again`,
      ),
    );
    expect(fallback).toMatch(/the check after the `send_message`/);
  });

  it('"Per stage" › 2 and "Panel" say when the wait is written and cleared (RS1, decision 5)', () => {
    const phases = between(skill, '2. **Phases**', '3. **Tester.**');
    expect(phases).toContain('waits for the coordinator');
    expect(phases).toContain('CI travado');
    expect(phases).toContain(
      'Raising the ceiling no longer waits for the owner (stage #1802): bring in `main` (`git merge origin/main`), run `raise --write` again and follow item 6 of "For the phase session".',
    );
    expect(phases).toContain('row \'#n\' wait="<short reason>"');
    expect(phases).toContain('wait= childAt=now');
    const panel = section(skill, '## Panel');
    expect(panel).toContain('wait="<reason>"');
  });

  it('"Fallback checks": a pending send_later is a legitimate wait, and the worst case is written (RS1, decisions 6 and 7)', () => {
    expect(fallback).toMatch(/`send_later` still to fire/);
    expect(fallback).toMatch(/less than 5 min ago/);
    expect(fallback).toMatch(/`row '#n' childAt=now`, no message/);
    expect(fallback).toMatch(/~60 min/);
    expect(fallback).toMatch(/~90 min/);
    expect(fallback).toMatch(
      /phase's own CI wait \(4 min, every 2 min up to 20 min, then every 8\)/,
    );
    expect(fallback).toMatch(/frequency and the cutoff do not change/);
  });

  it('the coordinator does not rerun the CI; it calls the owner (decision 4)', () => {
    expect(skill).not.toMatch(/reruns once if it died before testing/);
    expect(redCi).toMatch(/does not rerun the CI/);
    expect(redCi).toContain('ci-rerun.yml');
    expect(redCi).toContain('CI travado');
    expect(redCi).toContain('esperando dono');
    expect(redCi).toContain('PushNotification');
  });

  it('"Red CI on the epic PR": ceiling rule, script and roadmap (decisions 6 to 9)', () => {
    expect(redCi).toContain('Tamanho do dist/index.html');
    expect(redCi).toMatch(/16 KiB/);
    expect(redCi).toContain('up to 14 KiB (14,336 bytes)');
    expect(redCi).toContain('excess above 14 KiB');
    expect(redCi).toMatch(/32 KiB/);
    expect(redCi).toMatch(/64 KiB/);
    expect(redCi).toMatch(/disposable worktree/);
    expect(redCi).toContain('npm ci && npm run build');
    expect(redCi).toContain('node scripts/ci/distBudget.mjs raise');
    expect(redCi).toContain('scripts/ci/dist-budget.json');
    expect(redCi).not.toContain('--ci .github/workflows/ci.yml');
    expect(redCi).not.toMatch(/INDEX_HTML_MAX_BYTES[^\n]*of `ci\.yml`/);
    expect(redCi).toMatch(/keeping `main`'s `ci\.yml`/);
    expect(redCi).toMatch(/`history`/);
    expect(redCi).toContain('changelog/<name>.md');
    expect(redCi).toContain('Orçamento do dist/index.html');
    expect(redCi).toContain('Teto na última revisão do dono');
    expect(redCi).toMatch(/first raise/);
    expect(redCi).toMatch(/including the phases'|raise done by the phase/);
  });

  it('"Red CI on the epic PR": the ceiling always goes up, the `bug` comes from the raise subagent (#1802, decisions 2, 3 and 6)', () => {
    const ceiling = between(
      redCi,
      '- **`dist/index.html` ceiling',
      '\n\n**CI stuck in the queue',
    );
    expect(ceiling).toMatch(/goes up by itself, without waiting for the owner/);
    expect(ceiling).not.toMatch(/calls the owner/);
    expect(ceiling).not.toContain('Otherwise, call the owner');
    expect(ceiling).toMatch(/a failure other than the size/);
    expect(ceiling).toMatch(/always goes up/);
    expect(ceiling).toContain('"bug: …"');
    expect(ceiling).toMatch(/ceiling `bug`/);
    expect(ceiling).toMatch(/raise subagent/);
    expect(ceiling).toContain('item 6 of "For the phase session"');
    // the format of the `bug` stays in FLOW.md and is not copied into the skill
    expect(ceiling).not.toContain('severity: low');
    expect(ceiling).not.toContain('in:title');
    expect(ceiling).toContain('without `PushNotification`');
    expect(ceiling).toContain('<code>: teto +<K> KiB acima dos limites, bug #<n>');
    expect(ceiling).toMatch(
      /#1493[^\n]*cites the ceiling `bug`|cites the ceiling `bug`[^\n]*#1493/,
    );
    expect(ceiling).toContain('Teto do `dist/index.html` subiu');
    expect(ceiling).toMatch(/second commit[^\n]*before the push/);
    expect(ceiling).toContain('up to 14 KiB (14,336 bytes)');
    expect(ceiling).toMatch(/32 KiB/);
    expect(ceiling).toMatch(/64 KiB/);
  });

  it('detalhar-backlog: "1. Candidates" leaves out the dist ceiling `bug` (#1802, decision 10)', () => {
    const candidates = section(detalhar, '## 1. Candidates');
    const step2 = between(candidates, '2. ', '\n3. ');
    expect(step2).toContain('Teto do dist/index.html acima dos limites');
    expect(step2).toContain("supervisor's chat");
    expect(step2).toMatch(/title starts with/);
  });

  it('PROCESS.md, "Labels": the `bug` admits the ceiling raise above the limits, severity: low (#1802, decision 9)', () => {
    const labels = between(processDoc, '**Labels:**', '\n');
    expect(labels).toContain('raising the `dist/index.html` ceiling above the limits');
    expect(labels).toContain('a review request to the owner');
    expect(labels).toContain('severity: low');
    expect(labels).toContain('`docs/FLOW.md`, item 6');
  });

  it('detalhar-backlog: risk triggers (a) and reclassification (b) (decision 11)', () => {
    const effort = section(detalhar, '## Detailing effort');
    for (const trigger of [
      '`implementar-fila`',
      'painel.py',
      '.github/workflows/',
      'scripts/release/',
      'mcp/version.ts',
      'formatVersion',
      'src/store/session.ts',
      'pwa/csp.ts',
      '`/code-review high`',
    ]) {
      expect(effort).toContain(trigger);
    }
    expect(effort).toMatch(/whatever its size/);
    expect(effort).toMatch(/trigger/);
    expect(effort).toMatch(/reclassif/);
  });

  it('implementar-fila: /code-review high on the epic diff, in the Closing (decision 11, c)', () => {
    const closing = between(skill, '5. **Closing**', '6. **Merge**');
    expect(closing).toContain('/code-review high');
    expect(closing).toMatch(/epic's whole diff/);
    expect(closing).toMatch(/base `main`/);
    expect(closing).toMatch(/before the merge/);
    expect(closing).toMatch(/test first/);
    expect(closing).toMatch(/even if the phases were medium/);
  });

  it('the "safety net" item decides by the riskTriggers output, with no path list of its own (RS1, decision 3)', () => {
    const closing = between(skill, '5. **Closing**', '6. **Merge**');
    const item = closing.split('\n').find((l) => l.includes('**safety net'));
    expect(item).toBeDefined();
    expect(item).toContain('node scripts/ci/riskTriggers.mjs --base origin/main');
    expect(item).toContain('`log`');
    expect(item).toContain('`gatilho:`');
    expect(item).toContain('`nenhum gatilho`');
    for (const filePath of [
      'src/store/session.ts',
      'pwa/csp.ts',
      'scripts/release/',
      'mcp/version.ts',
      '.github/workflows/',
    ]) {
      expect(item).not.toContain(filePath);
    }
    expect(closing).toContain('git diff --name-only origin/main...HEAD'); // the choice of the MCP version stays
  });

  it("schema version chosen when creating the epic, like the MCP's (owner's decision of 2026-11-10)", () => {
    const rule = between(skill, '3. **One MCP version per epic', '## Context economy');
    expect(rule).toMatch(/[Ss]chema version/);
    expect(rule).toMatch(/origin\/main/);
    expect(rule).toMatch(/next/);
    expect(rule).toMatch(/comment on the issue/);
    expect(rule).toMatch(/first phase's message/);
  });

  it('PROCESS.md: the ci-rerun.yml line in the main rule (decision 10)', () => {
    const item = processDoc
      .split('\n')
      .find((l) => l.includes('`main` only accepts PRs from `epic/*`'));
    expect(item).toContain('ci-rerun.yml');
  });
});

// Stage #1669 (QF1): CI run stuck in `queued` with no jobs; the text of the phase and of the queue.
describe('CI stuck in the queue (#1669)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const phase = section(flow, '## For the phase session');
  const item6 = between(phase, '\n6. ', '\n7. ');
  const item7 = between(phase, '\n7. ', '\n8. ');
  const stuckSub = () => between(item6, '   - **Run stuck in the queue:**', '\n   - **');
  const perStage = section(skill, '## 3. Per stage');
  // The paragraph is the opening and the sub-items, up to the end of the section "3. Per stage"
  // (prettier separates the opening from the list by a blank line).
  const stuckParagraph = () => {
    const mark = '**CI stuck in the queue (phase or epic PR)';
    const at = perStage.indexOf(mark);
    if (at < 0) throw new Error(`starting anchor not found: ${mark}`);
    return perStage.slice(at);
  };

  it('item 6 of the phase: sub-item after the Abandoned runner, with the script, the commit list and the notice (decisions 1 to 3)', () => {
    const stuck = stuckSub();
    expect(item6.indexOf('**Abandoned runner:**')).toBeLessThan(
      item6.indexOf('**Run stuck in the queue:**'),
    );
    expect(stuck).toContain('node scripts/ci/ciRerun.mjs queued');
    expect(stuck).toContain('actions/workflows/ci.yml/runs?head_sha=');
    expect(stuck).toContain('16 min');
    expect(stuck).toContain('CI preso na fila: <link da execução>');
    expect(stuck).toMatch(
      /does not close, does not reopen, does not rerun and does not make an empty commit/,
    );
    expect(stuck).toMatch(/once per `run`/);
    expect(stuck).toMatch(/does not ask the owner anything/);
  });

  it("item 6 of the phase: closing and reopening is the coordinator's and the phase does not treat closed/reopened as the end (decisions 5, 6 and 8)", () => {
    const stuck = stuckSub();
    expect(stuck).toMatch(/restart the CI wait/);
    expect(stuck).toContain('`closed`');
    expect(stuck).toContain('`reopened`');
    expect(stuck).toMatch(/not as the end of the PR/);
  });

  it('item 7 cites "CI preso na fila" among the waiting messages', () => {
    expect(item7).toContain('CI preso na fila');
  });

  it('"CI and preview" forbids the empty commit and only admits closing and reopening for a run stuck in the queue (decision 9)', () => {
    const ci = between(flow, 'CI runs only on PRs', '\n\n');
    expect(ci).toMatch(/no empty commits/);
    expect(ci).toMatch(/run is stuck in the queue/);
    expect(ci).toMatch(/owner's `reabrir #<n>`/);
    expect(ci).toContain('item 6');
  });

  it('skill: CI stuck in the queue paragraph with the question, the options and the effects (decisions 3 to 7)', () => {
    const paragraph = stuckParagraph();
    expect(paragraph).toContain('`reabrir #<etapa>`');
    expect(paragraph).toContain('`esperar #<etapa>`');
    expect(paragraph).not.toContain('Fechar e reabrir (Recomendado)');
    expect(paragraph).toContain('update_pull_request');
    expect(paragraph).toContain('reaberto=true');
    expect(paragraph).toContain('instabilidade do GitHub');
    expect(paragraph).toContain('esperando dono');
    expect(paragraph).toContain('PushNotification');
    expect(paragraph).toContain('node scripts/ci/ciRerun.mjs queued');
    expect(paragraph).toMatch(/16 min/);
    expect(paragraph).toMatch(/[Oo]nly the owner's own message in the queue chat counts/);
  });

  it('skill: the paragraph comes after the red CI on the epic PR and before the item that refers to it', () => {
    expect(skill.indexOf('**Red CI on the epic PR**')).toBeLessThan(
      skill.indexOf('**CI stuck in the queue (phase or epic PR)'),
    );
  });

  it('skill: "The coordinator does not rerun the CI" stays and refers to the new paragraph', () => {
    const item = between(skill, '- **The coordinator does not rerun the CI.**', '\n- **');
    expect(item).toContain('CI travado');
    expect(item).toMatch(
      /except for a run stuck in the queue \(paragraph \*\*CI stuck in the queue\*\*\)/,
    );
    expect(item).toMatch(/abandoned runner/);
  });

  it('skill: "Child that waits for the coordinator", the PR that waits and the hourly check cite the case', () => {
    const child = between(skill, '**Child that waits for the coordinator**', '\n\n');
    expect(child).toContain('CI preso na fila');
    const waiting = between(skill, '**PR that waits for the coordinator:**', '\n\n');
    expect(waiting).toContain('CI stuck in the queue');
    const fallback = between(skill, '**Fallback checks:**', '**Red CI');
    expect(fallback).toContain('CI stuck in the queue');
  });

  it('the skill stayed small: the new paragraph and the references add up to less than 60 lines (decision 11)', () => {
    const paragraph = stuckParagraph();
    expect(paragraph.split('\n').length).toBeLessThan(60);
  });
});
