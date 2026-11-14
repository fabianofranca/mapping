// @vitest-environment node
// Phase FM6 (stage #1532, decisions 15 and 16): the retest asks only for the steps of the findings,
// the fix reproduces each finding before changing the code and checks it afterwards, and the
// subagents that edit run at `medium`. Text-only test (reads the files); `docs/TESTING-NUVEM.md`
// is not involved.
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

describe('FM6 — restricted retest, fix that reproduces the finding, subagents at medium', () => {
  it("the orchestrator's step by step retests only the steps, not the scripts that failed", () => {
    const s = section(flow, '## Orchestrator — step by step');
    expect(s).not.toContain('retests only the scripts that failed');
    expect(s).toContain('retests only the steps');
  });

  it('the fix phase reproduces the finding before the code and checks it afterwards', () => {
    const s = section(flow, '## Fix phase');
    expect(s).toContain('reproduces each finding before touching the code');
    expect(s).toContain('checks again afterwards');
    expect(s).toMatch(/"before" and "after"/);
    expect(s).toContain('checked after');
    expect(s).toContain('a finding that was not reproduced is not reported as fixed');
  });

  it('item 3 of the phase message puts the editing subagents at medium and replaces above ~200k', () => {
    const s = between(
      section(flow, '## For the phase session'),
      '3. Subagents and effort',
      '4. Every briefing',
    );
    expect(s).toMatch(/Editing subagents[^.]*`medium`/);
    expect(s).toMatch(/`high` only for review or check/);
    expect(s).toContain('~200k');
  });

  it('docs/PROCESS.md says "steps that failed" and fits in 25,000 bytes', () => {
    const p = readFileSync('docs/PROCESS.md', 'utf8');
    expect(p).toContain('retests only the steps that failed');
    expect(p).not.toContain('retests only the scripts that failed');
    expect(statSync('docs/PROCESS.md').size).toBeLessThanOrEqual(26000);
  });

  it("step 4 of SKILL.md asks for the reproduction of each finding in the fix's briefing", () => {
    const s = between(section(skill, '## 3. Per stage'), '4. **Fix**', '5. **Closing**');
    expect(s).toContain('reproducing each finding');
    expect(s).toContain('**steps**, not scripts');
    expect(s).toContain('checking after');
    expect(s).not.toContain('the scripts that failed');
  });
});
