// @vitest-environment node
// Phase CX1 (stage #1638): context ceiling of the phase session. Text-only test (reads the
// delivery flow files): the phase checks its own context at 300 thousand, hands over through a
// handoff on the sub-issue, the coordinator (or the orchestrator of a single stage) creates the
// successor and archives the previous one, and the fifth session does not switch (PP2, stage
// #1595: resume line in a single source, squash of the WIP and up to 5 sessions).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scriptMeasureProblems } from '../support/contextMeasure';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

const phase = section(flow, '## For the phase session');
const item3 = between(phase, '3. Subagents and effort', '4. Every briefing');
const anchor = item3.indexOf('   - **Phase context ceiling:**');
if (anchor < 0)
  throw new Error('anchor not found: sub-item "Phase context ceiling" of item 3');
const ceiling = item3.slice(anchor);
const perStage = section(skill, '## 3. Per stage');
const handover = between(
  perStage,
  '**Phase that hands over by context**',
  '**PR that waits for the coordinator:**',
);
const notified = between(perStage, 'When the phase notifies (', '3. **Tester.**');
const item6 = between(phase, '6. Follow the PR', '7. When done, notify');
const LINE =
  'Retomada por contexto (<k> de 5): a sessão anterior (<id>) passou a vez com <n> mil; a passagem está em <link>. Continue no branch <branch>, que já existe (não o recrie da origin/epic/<nome>), e não refaça o que a passagem dá como feito, e não releia o que a passagem dá como lido.';
const occurrences = (text: string, piece: string): number => text.split(piece).length - 1;

describe('CX1 — "For the phase session" of docs/FLOW.md, sub-item of item 3', () => {
  it('the sub-item sits under item 3, without changing the first line or the numbering', () => {
    expect(item3.split('\n')[0]).toMatch(
      /^3\. Subagents and effort: <from the sub-issue, e\.g\.: /,
    );
    expect(item3).toContain('~200k');
    expect(phase).toContain('\n4. Every briefing');
    expect(phase).toContain('\n9. A defect found along the way');
  });

  it('the ceiling is 300 thousand, measured by scripts/ci/contextUsage.mjs (not by the used_tokens of get_session)', () => {
    expect(ceiling).toContain('300 thousand');
    expect(ceiling).toContain('300,000');
    expect(ceiling).toContain('`acima=true`');
    expect(ceiling).toContain('`get_session` without `session_id`');
    // Finding CL1.5: the script as an instruction and `used_tokens` only as a prohibition.
    expect(scriptMeasureProblems(ceiling)).toEqual([]);
    expect(ceiling).toMatch(/only changes at the end of a turn/);
  });

  it('CL1.4: a missing script in the transition (git show fails or empty file) counts as "no measurement"', () => {
    const transition = between(ceiling, '**Transition:**', '**No measurement**');
    expect(transition).toContain('git show origin/main:scripts/ci/contextUsage.mjs');
    expect(transition).toContain('script ausente');
    expect(transition).toContain('no measurement');
    expect(transition).toContain('`contexto=`');
    expect(transition).toMatch(/code other than 0 and 1/);
  });

  it('the check is before a new subagent task and before the gates of item 5', () => {
    expect(ceiling).toMatch(/before sending a new task to a subagent/);
    expect(ceiling).toMatch(/before running the gates of item 5/);
  });

  it('after the PR is open there is no switch: the phase ends in the same session', () => {
    expect(ceiling).toMatch(/Once the phase PR is open[^.]*there is no switch/);
    expect(ceiling).toContain('ends in the same session');
  });

  it('the handoff: waits for the subagents, WIP with push, comment on the sub-issue, no PR', () => {
    expect(ceiling).toContain('waits for the running subagents');
    expect(ceiling).toContain('`WIP <código>: passagem por contexto`');
    expect(ceiling).toContain('`git push -u origin <branch>`');
    expect(ceiling).toMatch(/Does not open a PR/);
    expect(ceiling).toContain('`Passagem da fase <código> (contexto <n> mil):`');
    for (const field of [
      'the branch and the commit',
      'the checkboxes done and those missing',
      'the tests seen failing before the code',
      'the decisions made outside the sub-issue',
      'the pending defects',
      'the next step',
      'the files and sections already read',
    ]) {
      expect(ceiling).toContain(field);
    }
  });

  it('the message to the coordinator goes through the Channel of item 7, and the phase ends the turn', () => {
    expect(ceiling).toContain(
      '`Troca de sessão da fase <código>: contexto <n> mil; passagem em <link do comentário>.`',
    );
    expect(ceiling).toContain('through the Channel of item 7');
    expect(ceiling).toContain('Ends the turn');
  });

  it('the successor reads the handoff in item 1 and continues on the branch that already exists', () => {
    expect(ceiling).toContain(`\`${LINE}\``);
    expect(ceiling).toContain('in item 1 (');
    expect(ceiling).toContain('`git switch <branch>`');
    expect(ceiling).toMatch(/continues on the branch that already exists/);
    expect(ceiling).toMatch(/does not recreate it/);
  });

  it('#1996: item 1 reads the stage issue through one subagent, never whole in the main thread', () => {
    const item1 = between(phase, '\n1. Read', '\n2. Branch');
    expect(item1).toContain('`CLAUDE.md`, `docs/PROCESS.md`');
    expect(item1).toMatch(/sub-issue #<phase> with its comments/);
    expect(item1).toMatch(/issue #<stage> \*\*through one subagent\*\*/);
    expect(item1).toContain('the sections and numbered decisions the sub-issue cites');
    expect(item1).toContain('"out of scope" section');
    expect(item1).toMatch(/never loads the whole stage issue or its comments/);
    expect(item1).toContain('do not reopen decisions already made');
  });

  it('#1996: the reading rule is a sub-item of item 3: grep -n and a range, never a whole long file', () => {
    const anchorRead = item3.indexOf('   - **Reading rule:**');
    expect(anchorRead).toBeGreaterThan(0);
    expect(anchorRead).toBeLessThan(item3.indexOf('   - **Phase context ceiling:**'));
    const rule = item3.slice(
      anchorRead,
      item3.indexOf('   - **Phase context ceiling:**'),
    );
    expect(rule).toContain('~300 lines');
    expect(rule).toContain('`grep -n`');
    expect(rule).toContain("`sed -n '<a>,<b>p'`");
    expect(rule).toContain('`Read` with `offset`/`limit`');
    expect(rule).toContain('`| head -40`');
  });

  it('#1996: the successor does not reread what the handoff gives as read', () => {
    expect(ceiling).toMatch(
      /without redoing what the handoff gives as done or rereading what it gives as read/,
    );
  });

  it('PP2: the whole resume line appears only once in FLOW + skill, and it is in the sub-item of item 3', () => {
    expect(occurrences(flow + skill, LINE)).toBe(1);
    expect(occurrences(ceiling, LINE)).toBe(1);
    // No partial copy of the line elsewhere (the old "de 3" included).
    expect(occurrences(flow + skill, 'Retomada por contexto (<k> de')).toBe(1);
  });

  it('PP2: at most 4 switches (5 sessions); the fifth does not switch and says "passou de 300 mil na quinta sessão"', () => {
    expect(ceiling).toContain('4 switches');
    expect(ceiling).toContain('5 sessions');
    expect(ceiling).toContain('`5 de 5`');
    expect(ceiling).toContain('passou de 300 mil na quinta sessão');
    for (const old of ['2 switches', '3 sessions', 'third session', '3 de 3'])
      expect(ceiling).not.toContain(old);
  });

  it('PP2: the squash of item 6 takes the WIP out of the epic history (step 2 of the handoff)', () => {
    const step2 = between(ceiling, '2. commits', '3. comments');
    expect(step2).toContain('the squash of item 6 takes the WIP out of the epic history');
  });

  it('it also holds for the fix phase and does not cite send_later, ci-rerun.yml or distBudget.mjs', () => {
    expect(ceiling).toContain('fix phase');
    expect(ceiling).not.toContain('send_later');
    expect(ceiling).not.toContain('ci-rerun.yml');
    expect(ceiling).not.toContain('distBudget.mjs');
  });
});

describe('PP2 — item 6 of "For the phase session": squash of the PR with a WIP commit', () => {
  it('the phase or fix PR with the WIP commit is merged with merge_method squash; the others with merge', () => {
    expect(item6).toContain('`WIP <código>: passagem por contexto`');
    expect(item6).toContain('`git log --format=%s origin/epic/<name>..HEAD`');
    expect(item6).toContain('`merge_pull_request` `merge_method: squash`');
    expect(item6).toMatch(/The other PRs stay with `merge`/);
    expect(item6).toMatch(/the red commit does not enter the epic history/);
    expect(item6).toMatch(/fix/);
    // The merge-into-the-epic sentence stays.
    expect(item6).toMatch(/merge your own PR into the epic/);
  });
});

describe('CX1 — "Orchestrator — step by step" of docs/FLOW.md, "Limits" paragraph', () => {
  const step = section(flow, '## Orchestrator — step by step');
  const limits = step.slice(step.indexOf('**Limits:**'));

  it('the orchestrator answers the switch request by creating the successor and archiving the previous one', () => {
    expect(limits).toContain('Troca de sessão da fase <código>');
    expect(limits).toContain('successor');
    expect(limits).toContain('archives the previous one');
    expect(limits).toContain('Phase context ceiling');
  });

  it('PP2: cites the resume line of the sub-item, without copying it', () => {
    expect(limits).toContain(
      'the resume line of the sub-item "Phase context ceiling" (item 3 of "For the phase session")',
    );
    expect(limits).not.toContain('Retomada por contexto (');
    expect(limits).not.toContain(
      'passou a vez com <n> mil; a passagem está em <link>. Continue',
    );
  });

  it('PP2: at most 4 switches, the fifth session does not switch and the owner notice goes on the 4th and 5th', () => {
    expect(limits).toContain('at most 4 switches per phase');
    expect(limits).toContain('the fifth session does not switch');
    expect(limits).toMatch(/(4th|fourth)[^.]*(5th|fifth)[^.]*`PushNotification`/);
    expect(limits).toContain('Fase <código> da #<n> na sessão <k> de 5 por contexto');
    for (const old of ['2 switches', 'third session', '<k> de 3'])
      expect(limits).not.toContain(old);
  });
});

describe('CX1 — implementar-fila skill, "3. Per stage"', () => {
  it('the paragraph comes in step 2, after "Child that waits for the owner"', () => {
    const owner = perStage.indexOf('**Child that waits for the owner**');
    const context = perStage.indexOf('**Phase that hands over by context**');
    expect(owner).toBeGreaterThan(0);
    expect(context).toBeGreaterThan(owner);
  });

  it('the coordinator creates the successor with the same model, effort and source_revision', () => {
    expect(handover).toContain('whoever creates the successor is the coordinator');
    expect(handover).toContain('`create_session`');
    expect(handover).toMatch(/same `model`, `effort` and `source_revision`/);
    expect(handover).toContain(' · retomada <k>');
  });

  it('PP2: the message is the short one of step 2 with the resume line of the FLOW, read by section name, without a copy', () => {
    expect(handover).toContain('the short one of step 2');
    expect(handover).toContain('the resume line of the sub-item "Phase context ceiling"');
    expect(handover).toContain('before "Coordenador"');
    expect(handover).toContain('item 9 of "Context economy"');
    expect(handover).toContain('"For the phase session"');
    // Where the line starts and ends, and what is filled in (review finding: unambiguous extraction).
    expect(handover).toContain(
      'the part between backticks of the sub-item that starts with `Retomada por contexto`',
    );
    expect(handover).toContain('with the `<…>` fields filled in');
    expect(handover).not.toContain('Retomada por contexto (');
    expect(handover).not.toContain('Continue no branch <branch>');
  });

  it('the panel gets the child=, the session with the same label and the log, in a single apply', () => {
    expect(handover).toContain("row '#n' child=<new> childAt=now");
    expect(handover).toContain("session <folder> '#n' <new> kind=fase label=<code>");
    expect(handover).toContain('<código>: troca por contexto (<n> mil) → <id novo>');
    expect(handover).toContain('`apply`');
  });

  it('the previous one is archived in the same cycle, by the cycle subagent, with the cost first', () => {
    expect(handover).toContain("the cycle's subagent");
    expect(handover).toContain('`painel.py cost`');
    expect(handover).toContain('"Archive the sessions" › "Cost"');
    expect(handover).toContain('`archive_session`');
  });

  it('PP2: at most 4 switches: the `5 de 5` session does not switch and the log records the case', () => {
    expect(handover).toContain('At most 4 switches per phase (5 sessions)');
    expect(handover).toContain('the `5 de 5` session does not switch');
    expect(handover).toContain('passou de 300 mil na quinta sessão');
    expect(handover).toContain('<código>: passou de 300 mil na quinta sessão');
    expect(handover).toContain('the log records the case');
    expect(handover).toContain("The child's session is `<k-1>` of 5");
    for (const old of ['2 switches', '3 sessions', 'third session', '3 de 3', '` de 3'])
      expect(handover).not.toContain(old);
  });

  it('PP2: the 4th and 5th sessions send PushNotification to the owner and write the notice in the log, without waiting for an answer', () => {
    expect(handover).toContain('`k` equal to 4 or 5');
    expect(handover).toContain('`PushNotification`');
    expect(handover).toContain('Fase <código> da #<n> na sessão <k> de 5 por contexto');
    expect(handover).toContain('<código>: sessão <k> de 5 (aviso ao dono)');
    expect(handover).toContain('without waiting for an answer (rule 1 of the queue)');
  });

  it('PP2: the phase PR with a WIP commit is merged with squash, also when the coordinator merges', () => {
    expect(notified).toContain('notified without having merged');
    expect(notified).toContain('`WIP <código>: passagem por contexto`');
    // The coordinator's clone is not on the phase branch: the `HEAD` of item 6 becomes the origin branch.
    expect(notified).toContain(
      '`git log --format=%s origin/epic/<name>..origin/<phase branch>`',
    );
    expect(notified).not.toContain('..HEAD`');
    // The origin ref may be missing or stale in the coordinator's clone: fetch before the `git log`.
    expect(notified).toMatch(
      /`git fetch origin <phase branch>`[^]*?`git log --format=%s origin\/epic\/<name>\.\.origin\/<phase branch>`/,
    );
    expect(notified).toContain('`merge_method: squash`');
    expect(notified).toContain('item 6');
    expect(notified).toMatch(/The other PRs keep `merge`/);
  });

  it('"What is not archived" has the exception of the child that handed over by context', () => {
    const toArchive = between(
      section(skill, '## 3. Per stage'),
      '- **What is not archived:**',
      '- **Record:**',
    );
    expect(toArchive).toContain('handed over by context');
    expect(toArchive).toMatch(/is archived/);
  });

  it('the successor brings the branch with a refspec that works in a single-branch clone', () => {
    expect(ceiling).toContain('`git fetch origin <branch>:<branch>`');
  });

  it('the switch request holds in item 7 and in the Channel; the count uses meta.sessions', () => {
    const item7 = between(phase, '7. When done, notify', '8. ');
    expect(item7).toContain('context switch request');
    expect(item7).toContain('the context switch request of item 3 too');
    expect(handover).toContain('`meta.sessions`');
    expect(handover).toContain('already has a `label=<code>` entry newer than its own');
  });
});

// PP3 (stage #1595, decision 8): the copies of the context-switch text are compared with each
// other (numbers and start of the request), and the panel commands the skill says to run really run.
const limitsText = (() => {
  const step = section(flow, '## Orchestrator — step by step');
  return step.slice(step.indexOf('**Limits:**'));
})();
const places: Array<[string, string]> = [
  ['item 3 (Phase context ceiling)', ceiling],
  ['"Limits" of the FLOW', limitsText],
  ['skill (Phase that hands over by context)', handover],
];

interface Numbers {
  switches: number[];
  sessions: number[];
  kOfN: number[];
  last: number[];
}

/** The numbers of the switch in a piece of text: max switches, total sessions, `<k> de N` and the `N de N` of the last one. */
function numbers(text: string): Numbers {
  const all = (re: RegExp, group = 1): number[] => [
    ...new Set([...text.matchAll(re)].map((m) => Number(m[group]))),
  ];
  return {
    switches: all(/at most (\d+) switches per phase/gi),
    sessions: all(/\((\d+) sessions\)/g),
    kOfN: all(/<k(?:-1)?>`? de (\d+)/g),
    last: [
      ...new Set(
        [...text.matchAll(/`(\d+) de (\d+)`/g)].flatMap((m) => [
          Number(m[1]),
          Number(m[2]),
        ]),
      ),
    ],
  };
}

describe('PP3 — copies of the context-switch text compared (decision 8)', () => {
  it('the numbers of the switch (switches, sessions, <k> de N) are the same in the three places', () => {
    const found = places.map(([name, text]) => ({ name, ...numbers(text) }));
    for (const a of found) {
      // Each place states the max switches once and the `<k> de N` with a single N.
      expect(a.switches, `${a.name}: max switches`).toHaveLength(1);
      expect(a.kOfN, `${a.name}: <k> de N`).toHaveLength(1);
    }
    const [ref, ...others] = found;
    for (const o of others) {
      expect(o.switches, `${o.name} x ${ref!.name}: switches`).toEqual(ref!.switches);
      expect(o.kOfN, `${o.name} x ${ref!.name}: <k> de N`).toEqual(ref!.kOfN);
    }
    // The total of sessions, where the text states it, is the same N, and N = switches + 1.
    const [switches] = ref!.switches;
    const [n] = ref!.kOfN;
    expect(n).toBe(switches! + 1);
    for (const a of found) {
      for (const total of [...a.sessions, ...a.last])
        expect(total, `${a.name}: total of sessions`).toBe(n);
    }
    expect(found.some((a) => a.sessions.length > 0)).toBe(true);
    expect(found.some((a) => a.last.length > 0)).toBe(true);
  });

  it('the switch request has the same start in item 3, in "Limits" and in the skill', () => {
    const start = (text: string): string[] => [
      ...new Set(
        [
          ...text.matchAll(
            /Troca de sessão da fase <código>: contexto <n> mil; passagem em/g,
          ),
        ].map((m) => m[0]),
      ),
    ];
    const found = places.map(([name, text]) => ({ name, start: start(text) }));
    for (const a of found) expect(a.start, a.name).toHaveLength(1);
    const [ref, ...others] = found;
    for (const o of others)
      expect(o.start, `${o.name} x ${ref!.name}`).toEqual(ref!.start);
  });

  it('the resume line has a single source: the backticked part of item 3, once in FLOW + skill', () => {
    const sources = [...(flow + skill).matchAll(/`(Retomada por contexto \([^`]*)`/g)];
    expect(sources).toHaveLength(1);
    expect(occurrences(flow + skill, 'Retomada por contexto (')).toBe(1);
    expect(ceiling).toContain(sources[0]![0]);
    expect(occurrences(skill, 'Retomada por contexto (')).toBe(0);
    expect(occurrences(limitsText, 'Retomada por contexto (')).toBe(0);
  });
});

describe('PP3 — skill panel commands run on a temporary panel (decision 8)', () => {
  const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
  const NOW = '2026-11-12T10:00:00Z';
  const BEFORE = '2026-11-12T09:00:00Z';
  const SUBPROCESS_TIMEOUT = 30_000;
  const cost = between(perStage, '- **Cost:**', '**Sentinel:**');
  let dir = '';

  const panel = (now: string, ...args: string[]) => {
    const r = spawnSync('python3', [SCRIPT, '--now', now, ...args], {
      encoding: 'utf8',
    });
    expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
    return r.stdout;
  };
  const batch = (now: string, text: string) => {
    const r = spawnSync('python3', [SCRIPT, '--now', now, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: text,
    });
    expect(r.status, r.stderr).toBe(0);
  };
  const json = (name: string): Array<Record<string, unknown>> =>
    JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Array<
      Record<string, unknown>
    >;

  /** The backticked command of the skill that starts with `prefix`, without the leading `painel.py `. */
  function command(text: string, prefix: string): string {
    const found = [...text.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1]!.replace(/^painel\.py /, ''))
      .find((c) => c.startsWith(prefix));
    if (!found) throw new Error(`command not found in the skill: ${prefix}`);
    return found;
  }

  /** Replaces the skill's placeholders with values and drops the `<folder>` (`apply` does not take it). */
  function fill(cmd: string, kind: string): string {
    return cmd
      .replace('<folder> ', '')
      .replace("'#n'", "'#10'")
      .replace('<new>', 'session_nova')
      .replace('<previous id>', 'session_velha')
      .replace('<id>', 'session_velha')
      .replace('<code>', 'PP3')
      .replace('kind=fase', `kind=${kind}`)
      .replace('usd=…', 'usd=1.5')
      .replace('ctx=…', 'ctx=250000')
      .replace('model=…', 'model=claude-sonnet-5-5')
      .replace('effort=…', 'effort=medium');
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-troca-'));
    panel(BEFORE, 'init', dir);
    panel(BEFORE, 'start', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['fase', 'fase'],
    ['correção', 'correção'],
  ])(
    'the child switch (kind=%s) in a single apply: new child, sessions with both ids, meta.sessions with the same label and the previous one cost',
    (_name, kind) => {
      panel(
        BEFORE,
        'row',
        dir,
        '#10',
        'title=Stage ten',
        'status=em andamento',
        'child=session_velha',
        'childAt=now',
        'wait=question',
      );
      panel(BEFORE, 'session', dir, '#10', 'session_velha', `kind=${kind}`, 'label=PP3');
      // The row before the switch: old child, with `wait`.
      expect(json('queue')[0]).toMatchObject({
        child: 'session_velha',
        wait: 'question',
      });

      const row = fill(command(handover, "row '#n' child="), kind);
      const session = fill(command(handover, 'session <folder> '), kind);
      const costCmd = fill(command(cost, 'cost <folder> <id>'), kind);
      expect(session).toContain(`kind=${kind}`);
      batch(NOW, [row, session, costCmd].join('\n'));

      const line = json('queue')[0]!;
      expect(line.child).toBe('session_nova');
      expect(line.childAt).toBe(NOW);
      expect(line.wait).toBe('');
      expect(String(line.sessions).split(' ').sort()).toEqual([
        'session_nova',
        'session_velha',
      ]);

      const sessions = (json('meta')[0]!.sessions ?? []) as Array<
        Record<string, unknown>
      >;
      const ofCode = sessions.filter((e) => e.label === 'PP3');
      // The count of the entries with the label is the <k> of the rule: the successor is the 2nd session.
      expect(ofCode.map((e) => e.id).sort()).toEqual(['session_nova', 'session_velha']);
      expect(ofCode.map((e) => e.kind)).toEqual([kind, kind]);
      const old = ofCode.find((e) => e.id === 'session_velha')!;
      expect(old.cost).toMatchObject({ usd: 1.5, ctx: 250000 });
      expect(ofCode.find((e) => e.id === 'session_nova')!.cost).toBeUndefined();
    },
    SUBPROCESS_TIMEOUT,
  );
});
