// @vitest-environment node
// Phase LS1 (stage #1814, decision 12): the round in which every finding is of low severity goes
// from the fix to the closing, without a retest; the mixed round retests only the high and medium
// ones; the low finding that the fix does not reproduce gets a retest of just that one. Text-only
// test (reads the files).
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const process = readFileSync('docs/PROCESS.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

describe('LS1 — a low-severity-only finding goes from the fix to the closing, without a retest', () => {
  it("the orchestrator's step by step skips the retest of the all-low round", () => {
    const s = section(flow, '## Orchestrator — step by step');
    expect(s).toContain('all low severity');
    expect(s).toContain('without retest');
  });

  it('the fix phase records the severity, the retest yes|no and handles the unreproduced low', () => {
    const s = section(flow, '## Fix phase');
    expect(s).toContain('all of low severity');
    expect(s).toContain('the scale in section 7');
    expect(s).toContain('when in doubt, the higher one');
    expect(s).toContain('`reteste: não`');
    expect(s).toContain('directed retest of only its steps');
    // the fix notice rules over the line recorded earlier (finding of the /code-review)
    expect(s).toContain('the notice prevails over the `reteste:` line');
    // `bloqueia`, `alta` and `média` are the rule's high and medium
    expect(s).toContain('`bloqueia`, `alta` or `média`');
  });

  it('the retest leaves out the low-severity findings, in "For the tester" and "Retest together"', () => {
    const t = between(flow, 'Retest, after the fix', '## Directed round in groups');
    expect(t).toContain('findings of low severity stay out of the retest');
    expect(section(flow, '## Retest together')).toContain(
      'findings of low severity stay out of the retest',
    );
  });

  it('docs/PROCESS.md states the rule in the "With ❌ or a pending defect" bullet and fits in 25,000 bytes', () => {
    const bullet = between(
      process,
      '**With ❌ or a pending defect**',
      '\n  - **Without ❌',
    );
    expect(bullet).toContain('all of low severity');
    expect(bullet).toContain('without a retest');
    expect(statSync('docs/PROCESS.md').size).toBeLessThanOrEqual(25000);
  });

  it('implementar-fila repeats the rule in "Rules of this queue" and in step 4 of "Per stage"', () => {
    expect(section(skill, '## Rules of this queue')).toContain('all of low severity');
    const p4 = between(section(skill, '## 3. Per stage'), '4. **Fix**', '5. **Closing**');
    expect(p4).toContain('`reteste: não`');
    expect(p4).toContain('scale of section 7');
    expect(p4).toContain('directed retest of only its steps');
  });
});
