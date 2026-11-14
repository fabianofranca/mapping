// @vitest-environment node
// Phase AF1 (stage #1602, decisions 1 to 4 and 11): the owner's authorization is asked in the phase
// chat, with the notice to the coordinator before the question, and every notice to the coordinator
// goes through the `send_message` of `claude-code-remote`. Text-only test (reads `docs/FLOW.md`).
// Phase AF2 (decisions 4 to 9 and 14): the coordinator does not relay authorization, checks the
// stopped phase's question against the closed list, and the panel separates "esperando o dono no
// chat da fase" from "esperando o coordenador" (text of the `implementar-fila` skill and output of
// `painel.py show`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const phase = section(flow, '## For the phase session');
const item6 = between(phase, '\n6. ', '\n7. ');
const item7 = between(phase, '\n7. ', '\n8. ');
const item8 = between(phase, '\n8. ', '\n9. ');

/** Text from `start` (inclusive) to the end of `text`; a missing anchor throws. */
function tail(text: string, start: string): string {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`anchor not found: ${start}`);
  return text.slice(from);
}

const ownerAuthorization = (): string => tail(item8, '   - **Owner authorization:**');

describe('AF1 — owner authorization in the phase chat (#1602)', () => {
  it('the first line of the block opens the item 8 exception', () => {
    const first = between(phase, 'Você é o agente da fase', '\n');
    expect(first).toContain('except the item 8 authorization');
  });

  it('item 8 is a list with "Product decision" and "Owner authorization"', () => {
    expect(item8).toContain('\n   - **Product decision:**');
    expect(item8).toContain('\n   - **Owner authorization:**');
  });

  it('the closed list has two cases and sends the rest to the sub-item "Product decision" (#1802, decision 7)', () => {
    const authorization = ownerAuthorization();
    expect(authorization).toMatch(/has only two cases/);
    expect(authorization).not.toMatch(/three cases/);
    expect(authorization).not.toMatch(/chama o dono/);
    expect(authorization).not.toContain('(c)');
    const caseA = between(authorization, '(a) ', '(b) ');
    expect(caseA).toContain('.github/workflows/');
    expect(caseA).toContain('.claude/settings.json');
    // `distBudget.mjs` only shows up inside (b), as the guard "outside `raise`"
    expect(caseA).not.toContain('distBudget.mjs');
    const caseB = between(authorization, '(b) ', 'What is not on this list');
    expect(caseB).toContain('the exception to a guard');
    expect(caseB).toContain('raising a budget outside `distBudget.mjs raise`');
    expect(authorization).toMatch(/the list is closed/);
    expect(authorization).toMatch(/stuck subagent/);
    expect(authorization).toContain('how to proceed');
    expect(authorization).toContain('"Product decision"');
  });

  it('the order: chat link, PushNotification, "Esperando o dono:" notice and only then the AskUserQuestion', () => {
    const authorization = ownerAuthorization();
    const link = authorization.indexOf('https://claude.ai/code/<id of this session>');
    const push = authorization.indexOf('(2) `PushNotification`');
    const notice = authorization.indexOf('Esperando o dono:');
    const question = authorization.indexOf('(4) `AskUserQuestion`');
    expect(link).toBeGreaterThanOrEqual(0);
    expect(push).toBeGreaterThan(link);
    expect(notice).toBeGreaterThan(push);
    expect(question).toBeGreaterThan(notice);
    expect(authorization).toContain('send_message');
    // The phase message has no "model check" step: the link cannot depend on it.
    expect(authorization).toContain('`get_session` without `session_id`');
    expect(authorization).not.toContain('model check');
  });

  it('recommended option, answer to the coordinator and refusal of a relayed "the owner approved"', () => {
    const authorization = ownerAuthorization();
    expect(authorization).toMatch(/recommended option/);
    expect(authorization).toContain('O dono respondeu:');
    expect(authorization).toMatch(/never accepts/);
    expect(authorization).toMatch(/the owner approved/);
    expect(authorization).toContain('schedules');
  });

  it('item 7: "Channel" sub-item with the claude-code-remote send_message and the delivered status', () => {
    expect(item7).toContain('\n   - **Channel:**');
    const channel = tail(item7, '   - **Channel:**');
    expect(channel).toContain('claude-code-remote');
    expect(channel).toContain('`send_message`');
    expect(channel).toContain('`session_id`');
    expect(channel).toContain('`status: delivered`');
    expect(channel).toContain('repeats once');
    expect(channel).toContain('never through `SendMessage`');
    expect(channel).toMatch(/items 6 to 9/);
  });

  it('item 7: the waiting messages swap "chama o dono" for "Esperando o dono" and "O dono respondeu"', () => {
    const list = between(item7, '(the waiting messages', ')');
    expect(list).toContain('Esperando o dono');
    expect(list).toContain('O dono respondeu');
    expect(list).not.toContain('"chama o dono"');
  });

  it('item 6: the ceiling no longer asks the owner for authorization; "another failure" still goes to the coordinator (#1802, decision 7)', () => {
    const ceiling = tail(item6, '   - **Ceiling of `dist/index.html`:**');
    expect(ceiling).not.toContain('item 8 (Owner authorization)');
    expect(ceiling).not.toMatch(/chama o dono/);
    expect(ceiling).not.toContain('send the numbers and the reason to the coordinator');
    expect(ceiling).toMatch(/another failure/);
    expect(ceiling).toContain('"Product decision"');
  });

  it('"Orchestrator — step by step": the limits do not relay authorization and read the stopped phase question', () => {
    const orchestrator = section(flow, '## Orchestrator — step by step');
    const limits = tail(orchestrator, '**Limits:**');
    expect(limits).toMatch(/does not relay the owner's answer/);
    expect(limits).toContain('Owner authorization');
    expect(limits).toContain('`AskUserQuestion`');
    expect(limits).toContain('`list_events`');
    expect(limits).toContain('"Product decision"');
  });

  it('the numbering 1 to 9 and the conditional 10 do not change', () => {
    for (let n = 1; n <= 9; n++) expect(phase).toContain(`\n${n}. `);
    expect(phase).toContain('10. Code review');
  });
});

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

describe('AF2 — painel.py: esperando o dono no chat da fase (#1602, decision 7)', () => {
  let dir = '';
  const run = (now: string, ...args: string[]): string =>
    execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-dono-'));
    run('2026-11-11T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function waitsForOwner(): void {
    run(
      '2026-11-11T10:00:00Z',
      'row',
      dir,
      '#10',
      'status=esperando dono',
      'child=session_a',
      'childAt=now',
      'wait=dono no chat da fase: teto',
    );
  }

  it('the esperando dono row with a child goes on the new line and not in "esperando o coordenador"', () => {
    waitsForOwner();
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    expect(out).toContain(
      'esperando o dono no chat da fase: #10 (dono no chat da fase: teto)',
    );
    expect(out).toMatch(/esperando o coordenador: nenhuma/);
    expect(out).not.toMatch(/esperando o coordenador:[^\n]*#10/);
  });

  it('the new line comes right before "esperando o coordenador:"', () => {
    waitsForOwner();
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    const owner = out.indexOf('esperando o dono no chat da fase:');
    const coordinator = out.indexOf('esperando o dono há mais de 1 h:');
    expect(owner).toBeGreaterThanOrEqual(0);
    expect(coordinator).toBeGreaterThan(owner);
    expect(out.slice(owner, coordinator).trim().split('\n')).toHaveLength(1);
  });

  it('it is not overdue after 40 min', () => {
    waitsForOwner();
    const out = run('2026-11-11T10:40:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
    expect(out).toContain('esperando o dono no chat da fase: #10');
  });

  it('without it, the line says nenhuma', () => {
    expect(run('2026-11-11T10:05:00Z', 'show', dir)).toContain(
      'esperando o dono no chat da fase: nenhuma',
    );
  });

  it('a row with child and wait in andamento stays in "esperando o coordenador"', () => {
    run(
      '2026-11-11T10:00:00Z',
      'row',
      dir,
      '#11',
      'status=em andamento',
      'child=session_b',
      'childAt=now',
      'wait=CI travado',
    );
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    expect(out).toMatch(/esperando o coordenador: #11 \(CI travado\)/);
    expect(out).toContain('esperando o dono no chat da fase: nenhuma');
  });

  it('"em andamento", wait= and childAt=now take the row off both lists', () => {
    waitsForOwner();
    run(
      '2026-11-11T10:10:00Z',
      'row',
      dir,
      '#10',
      'status=em andamento',
      'wait=',
      'childAt=now',
    );
    const out = run('2026-11-11T10:15:00Z', 'show', dir);
    expect(out).toContain('esperando o dono no chat da fase: nenhuma');
    expect(out).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('the import carries child, wait and sessions of the phase waiting for the owner (review finding)', () => {
    waitsForOwner();
    run(
      '2026-11-11T10:01:00Z',
      'session',
      dir,
      '#10',
      'session_a',
      'kind=fase',
      'label=AF2',
    );
    const fresh = mkdtempSync(path.join(tmpdir(), 'painel-dono-nova-'));
    try {
      run('2026-11-11T10:02:00Z', 'init', fresh);
      run('2026-11-11T10:02:00Z', 'import', fresh, dir);
      const out = run('2026-11-11T10:05:00Z', 'show', fresh);
      expect(out).toContain(
        'esperando o dono no chat da fase: #10 (dono no chat da fase: teto)',
      );
      const line = run('2026-11-11T10:05:00Z', 'show', fresh, '#10');
      expect(line).toContain('child: session_a');
      expect(line).toContain('session_a');
      expect(line).toMatch(/sessions:[^\n]*session_a/);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('the top docstring cites the new line', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    expect(between(source, '"""', '"""\nimport')).toContain(
      'esperando o dono no chat da fase',
    );
  });
});

describe('AF2 — implementar-fila skill: the coordinator does not relay authorization (#1602, decisions 4 to 9)', () => {
  const phases = (): string => between(skill, '2. **Phases**', '3. **Tester.**');
  const ownerParagraph = (): string =>
    between(
      tail(phases(), '**Child that waits for the owner**'),
      '**Child that waits for the owner**',
      '\n\n',
    );
  const coordinatorParagraph = (): string =>
    between(phases(), '**Child that waits for the coordinator**', '\n\n');
  const fallback = (): string => between(skill, '**Fallback checks:**', '**Red CI');

  it('"Child that waits for the coordinator" no longer lists the ceiling "chama o dono"', () => {
    expect(coordinatorParagraph()).toContain('CI travado');
    expect(coordinatorParagraph()).not.toContain('chama o dono');
    expect(coordinatorParagraph()).not.toContain('ceiling');
  });

  it('"Child that waits for the owner": the closed list with two cases, the panel and rule 1 outside it (#1802, decision 7)', () => {
    expect(ownerParagraph()).toContain('Esperando o dono');
    expect(ownerParagraph()).toMatch(
      /the list is closed[^:]*:[^:]*\(a\)[^;]*CI or permission edit[^;]*, \(b\)[^;]*the exception to a guard/,
    );
    expect(ownerParagraph()).not.toMatch(/three cases|all three/);
    // a phase of an earlier epic still uses the old letters: the coordinator checks the reason, not the letter
    expect(ownerParagraph()).toMatch(/check the reason[^.]*and not the letter/);
    expect(ownerParagraph()).toContain('(a) ceiling, (b) CI, (c) guard');
    expect(ownerParagraph()).not.toContain('of `distBudget.mjs raise`, (b)');
    expect(ownerParagraph()).toContain('status="esperando dono"');
    expect(ownerParagraph()).toContain('dono no chat da fase');
    expect(ownerParagraph()).toContain('wait=');
    expect(ownerParagraph()).toContain('step=');
    expect(ownerParagraph()).toMatch(/without `PushNotification`/);
    expect(ownerParagraph()).toContain('`send_message`');
    expect(ownerParagraph()).toContain('priority: "now"');
    expect(ownerParagraph()).toMatch(/rule 1/);
  });

  it('"Child that waits for the owner": the old phase with the ceiling "chama o dono" gets the transition (#1802, decision 8)', () => {
    const transition = tail(ownerParagraph(), `with the ceiling's "chama o dono"`);
    expect(transition).toContain(
      'Raising the ceiling no longer waits for the owner (stage #1802): bring in `main` (`git merge origin/main`), run `raise --write` again and follow item 6 of "For the phase session".',
    );
    expect(transition).toContain('priority: "now"');
    expect(transition).toContain('wait= childAt=now');
    expect(transition).toMatch(/do not send `PushNotification`/);
  });

  it('"Child that waits for the owner": O dono respondeu and the final notice go back to "em andamento"', () => {
    expect(ownerParagraph()).toContain('O dono respondeu');
    expect(ownerParagraph()).toContain('final notice');
    expect(ownerParagraph()).toContain('status="em andamento" wait= childAt=now');
  });

  it('"Child that waits for the owner": the coordinator relays neither authorization nor the owner answer', () => {
    expect(ownerParagraph()).toMatch(/does not relay authorization/);
    expect(ownerParagraph()).toMatch(/the owner approved/);
    expect(ownerParagraph()).toMatch(/queue chat/);
    expect(ownerParagraph()).toContain('É autorização do dono');
    expect(ownerParagraph()).toContain('link to the phase chat');
  });

  it('"Fallback checks": an overdue one in blocked reads the pending AskUserQuestion', () => {
    const blocked = fallback().indexOf('`blocked`');
    const failed = fallback().indexOf('failed, stopped asking for permission or died');
    expect(blocked).toBeGreaterThanOrEqual(0);
    expect(failed).toBeGreaterThan(blocked);
    const case_ = fallback().slice(blocked, failed);
    expect(case_).toContain('`AskUserQuestion`');
    expect(case_).toContain('`list_events`');
    expect(case_).toContain('kinds: ["assistant"]');
    expect(case_).toContain('"pedido de permissão"');
    expect(case_).toMatch(/rule 1/);
    expect(case_).toContain('PushNotification');
    expect(case_).not.toMatch(/a line with `wait` is not reread/);
  });

  it('"Fallback checks": the permission request still recreates the session', () => {
    const recreate = between(
      fallback(),
      'failed, stopped asking for permission or died',
      '\n',
    );
    expect(recreate).toContain('pedido de permissão');
    expect(recreate).toContain('create the session again');
  });

  it('step 7: the rule with the "#N mesclada" exit falls in the same cycle, after the skill check', () => {
    const between7 = between(skill, '7. **Between stages:**', '**Archive the sessions**');
    const newSkill = between7.indexOf('the skill changed on `main`');
    const rule = between7.indexOf('#N mesclada');
    expect(newSkill).toBeGreaterThanOrEqual(0);
    expect(rule).toBeGreaterThan(newSkill);
    expect(between7).toContain('rule end');
    expect(between7).toMatch(/same cycle/);
  });

  it('"Drain" and "End" count the esperando dono stage with a child as a stage that is still working', () => {
    const drain = between(skill, '- **Drain**', '- **An issue that stopped being');
    const end = section(skill, '## End');
    const first = end.split('\n').find((l) => l.startsWith('When no stage'))!;
    // Finding 3 (CL1): the same definition as the `show` ("esperando o dono no chat da fase"), with `child` and the `wait`.
    for (const text of [drain, first]) {
      expect(text).toContain('esperando dono');
      expect(text).toContain('`child`');
      expect(text).toContain('dono no chat da fase:');
      expect(text).toContain('`wait`');
    }
  });

  it('"Panel": the show cites "esperando o dono no chat da fase"', () => {
    const panel = section(skill, '## Panel');
    const commands = panel
      .split('\n')
      .find((l) => l.startsWith('painel.py show <folder>  '))!;
    expect(commands).toContain('esperando o dono no chat da fase');
    const paragraph = between(panel, 'The `show` brings, after `atual:`', '\n\n');
    expect(paragraph).toContain('esperando o dono no chat da fase:');
  });
});

describe('CL1 — epic review fix (#1627)', () => {
  let dir = '';
  const run = (now: string, ...args: string[]): string =>
    execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
  const phaseRow = (issue: string, ...pairs: string[]): void => {
    run('2026-11-11T10:00:00Z', 'row', dir, issue, ...pairs);
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-cl1-'));
    run('2026-11-11T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const waitsForOwner = (issue = '#10'): void =>
    phaseRow(
      issue,
      'status=esperando dono',
      'child=session_a',
      'childAt=now',
      'wait=dono no chat da fase: teto',
    );

  it('finding 1: the phase waiting for the owner is rechecked after 60 min and the 240 min deadline shows', () => {
    waitsForOwner();
    expect(run('2026-11-11T10:30:00Z', 'show', dir)).toContain(
      'esperando o dono há mais de 1 h: nenhuma',
    );
    expect(run('2026-11-11T11:10:00Z', 'show', dir)).toContain(
      'esperando o dono há mais de 1 h: #10 session_a (70 min)',
    );
    expect(run('2026-11-11T14:10:00Z', 'show', dir)).toContain(
      'esperando o dono há mais de 1 h: #10 session_a (250 min, prazo vencido)',
    );
  });

  it('finding 1: the row goes back to normal when the wait ends', () => {
    waitsForOwner();
    phaseRow('#10', 'status=em andamento', 'wait=', 'childAt=now');
    expect(run('2026-11-11T11:10:00Z', 'show', dir)).toContain(
      'esperando o dono há mais de 1 h: nenhuma',
    );
  });

  it('finding 2: a question to the coordinator from a phase whose epic is already "esperando dono" stays in "esperando o coordenador"', () => {
    phaseRow(
      '#20',
      'status=esperando dono',
      'child=session_c',
      'childAt=now',
      'wait=decision question',
    );
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    expect(out).toMatch(/esperando o coordenador: #20 \(decision question\)/);
    expect(out).toContain('esperando o dono no chat da fase: nenhuma');
    expect(out).toContain('esperando o dono há mais de 1 h: nenhuma');
  });

  it('finding 3: a requested merge ("esperando dono" with an old child and no wait) is not a phase waiting for the owner', () => {
    phaseRow('#21', 'status=esperando dono', 'child=session_d', 'childAt=now');
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    expect(out).toContain('esperando o dono no chat da fase: nenhuma');
    expect(out).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('finding 4: a single `is_owner_wait` helper in the three uses, without the repeated predicate', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    expect(source).toContain('def is_owner_wait(');
    expect(source.match(/is_owner_wait\(/g)!.length).toBeGreaterThanOrEqual(4);
    expect(source).not.toMatch(/get\("wait"\)[^\n]*== "esperando dono"/);
    expect(source).not.toMatch(/== "esperando dono" and old\.get\("child"\)/);
  });

  it('finding 5: the import summary counts the phase waiting for the owner as em andamento', () => {
    waitsForOwner();
    phaseRow('#11', 'status=aguardando');
    const fresh = mkdtempSync(path.join(tmpdir(), 'painel-cl1-nova-'));
    try {
      run('2026-11-11T10:02:00Z', 'init', fresh);
      run('2026-11-11T10:02:00Z', 'import', fresh, dir);
      const out = run('2026-11-11T10:05:00Z', 'show', fresh);
      expect(out).toMatch(/\(1 em andamento\)/);
      expect(out).not.toMatch(/\(0 em andamento\)/);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('CL1 — text of the check, the phase prompt and the delivery fallback (#1627, findings 1, 6 and 7)', () => {
  const skillFallback = between(skill, '**Fallback checks:**', '**Red CI');
  const authorization = ownerAuthorization();

  it('finding 1: the hourly check rechecks the phase waiting for the owner through get_session and defines what to do', () => {
    const case_ = between(skillFallback, 'esperando o dono há mais de 1 h', '\n  - ');
    expect(case_).toContain('`get_session`');
    expect(case_).toContain('`blocked`');
    expect(case_).toContain('create the session again');
    expect(case_).toContain('status="em andamento" wait= childAt=now');
    expect(case_).toContain('240 min');
    expect(case_).toContain('priority: "now"');
    expect(case_).toContain('Defeitos pendentes');
  });

  it('finding 6: the phase prompt no longer says nobody watches the session and the phase loads the tools', () => {
    const first = between(flow, 'Você é o agente da fase', '\n');
    expect(first).not.toContain('Ninguém está olhando');
    expect(first).toContain("in this session's chat");
    expect(authorization).toContain('`ToolSearch`');
    expect(authorization).toMatch(
      /without `PushNotification`|`PushNotification` does not exist/,
    );
  });

  it('finding 6: 240 min deadline without an answer and fallback recorded in "Defeitos pendentes"', () => {
    expect(authorization).toContain('240 min');
    expect(authorization).toContain('Defeitos pendentes');
    expect(authorization).toContain('`priority: "now"`');
  });

  it('finding 6: case (b) is an objective list', () => {
    expect(authorization).toContain('eslint-suppressions.json');
    expect(authorization).toContain('the `eslint-disable` of `complexity`');
    expect(authorization).toContain('the force push');
    expect(authorization).toMatch(/what is not on this list is not \(b\)/i);
    expect(authorization).not.toContain(
      'beyond what a written rule already lets the phase do on its own',
    );
  });

  it('finding 7: the Channel declares the hourly check and gives the "Aviso não entregue:" fallback on the sub-issue', () => {
    const channel = tail(item7, '   - **Channel:**');
    expect(channel).toContain('Aviso não entregue:');
    expect(channel).toContain('comment on the phase sub-issue');
    expect(channel).toContain("coordinator's hourly check");
    expect(channel).not.toContain('does not look for another channel');
    const list = between(skillFallback, 'Aviso não entregue:', '\n');
    expect(list).toContain('sub-issue');
  });
});
