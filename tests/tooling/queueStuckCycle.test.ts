// @vitest-environment node
// Fast track #1884: the check of the overdue ones looks at the phase that works in a red CI cycle
// (R5 of #1096: 6 pushes in 80 min, no notice). Text-only test of `implementar-fila`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const perStage = section(skill, '## 3. Per stage');
const working = between(
  perStage,
  '  - working:',
  '  - `review_ready` or `idle` with the last turn ended on a `send_later`',
);

describe('#1884 — overdue phase that is working in a red CI cycle', () => {
  it('with no suspicion it goes on as before: row childAt=now', () => {
    expect(working).toContain("`row '#n' childAt=now`");
    expect(working).toMatch(/With no suspicion, only the `childAt=now`/);
  });

  it('the trigger reads the open PR through the GitHub MCP, in a Sonnet subagent, by the Reading CI', () => {
    expect(working).toMatch(/With the phase PR open/);
    expect(working).toMatch(/the cycle's subagent, Sonnet/);
    expect(working).toContain('**Reading CI**');
    expect(working).toMatch(/the PR's commits after it was opened/);
    expect(working).toMatch(
      /`sha` of each commit.*persists after the `ci-rerun.yml` rerun/,
    );
  });

  it('cycle suspicion: 3 red commits or the same failure in 2 consecutive ones', () => {
    expect(working).toMatch(/3 or more commits with red CI after opening/);
    expect(working).toMatch(
      /same job and same error message, even in different tests\) in 2 consecutive commits/,
    );
  });

  it('the diagnosis: Sonnet facts in up to 10 lines, Opus only from the summary in up to 6', () => {
    expect(working).toMatch(/up to 10 lines/);
    expect(working).toMatch(
      /\*\*Opus\*\* subagent reads only that summary, never the transcript/,
    );
    expect(working).toMatch(/up to 6 lines/);
    expect(working).toMatch(/is it a cycle or not, the probable cause and the direction/);
  });

  it('one diagnosis per phase every 60 min, recorded in the log', () => {
    expect(working).toMatch(/60 min \(within them, only the `childAt=now`\)/);
    expect(working).toMatch(/[Aa]t most one diagnosis per phase every 60 min/);
    expect(working).toContain('<code>: diagnóstico de ciclo');
  });

  it('if it is a cycle: send_message with priority now, childAt=now and the log of the direction sent', () => {
    expect(working).toContain('`send_message`');
    expect(working).toContain('`priority: "now"`');
    expect(working).toContain(
      '<code>: ciclo de CI (<n> commits vermelhos) → direção enviada',
    );
  });

  it('a direction outside the "Toca em:" is not sent: asks the owner with a recommended option', () => {
    expect(working).toMatch(/outside the sub-issue's "Toca em:", do not send it/);
    expect(working).toContain('`AskUserQuestion`');
    expect(working).toMatch(/recommended option/);
  });

  it('the other cases of the overdue one stay as they were', () => {
    const cases = between(
      perStage,
      '- For each overdue one,',
      '- **Worst case of detection:**',
    );
    expect(cases).toContain('  - `blocked` (the `status` is REQUIRES_ACTION');
    expect(cases).toContain('  - if it happens again, the stage becomes `falhou`');
  });
});
