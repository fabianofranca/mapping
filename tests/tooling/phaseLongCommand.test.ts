// @vitest-environment node
// Issue #1922 (fast track): text test of the flow files (long local commands, the last-PR handover
// exemption, the `via-rapida` label and the spelling rule).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const read = (file: string): string => readFileSync(file, 'utf8');
const flow = read('docs/FLOW.md');
const phase = section(flow, '## For the phase session');
const item5 = between(phase, '\n5. Before the PR', '\n6. Follow the PR');
const ceiling = between(phase, '   - **Phase context ceiling:**', '\n4. Every briefing');
const checks = between(
  section(read('.claude/skills/implementar-fila/SKILL.md'), '## 3. Per stage'),
  '**Fallback checks:**',
  '**Worst case of detection',
);

describe('#1922 — long local command in the phase session (docs/FLOW.md, item 5)', () => {
  it('only `run_in_background` of the Bash tool; never a detached process', () => {
    expect(item5).toContain('Long local command');
    expect(item5).toContain('`run_in_background`');
    for (const word of ['`nohup`', '`&`', '`setsid`', '`disown`'])
      expect(item5).toContain(word);
  });

  it('woken without the notice of the command (container restart), it runs the command again', () => {
    expect(item5).toContain('Woken without the notice of the command');
  });
});

describe('#1922 — the handover exemption holds only for the phase last PR', () => {
  it('FLOW.md: the PR exemption is for the last PR; several PRs in sequence hand over between them', () => {
    expect(ceiling).toContain("the phase's **last** PR");
    expect(ceiling).toContain('between a merged PR and the next one');
  });

  it('implementar-fila: above 300 thousand, with no switch request and no last PR open, the coordinator sends the handover; the `5 de 5` session does not receive it', () => {
    expect(checks).toContain('above 300 thousand');
    expect(checks).toContain('without its last PR open');
    expect(checks).toContain('`send_message`');
    expect(checks).toContain('The `5 de 5` session does not receive it');
  });
});

describe('#1922 — label `via-rapida` and spelling', () => {
  it('PROCESS.md, detalhar-backlog and via-rapida cite the label', () => {
    expect(read('docs/PROCESS.md')).toContain('`via-rapida` marks');
    const label = read('docs/PROCESS.md');
    expect(label).toContain('that the queue runs in a slot');
    expect(label).toContain(
      're-adding it after a refusal brings the issue back to the queue',
    );
    expect(label).not.toContain('planned for the fast track');
    expect(read('.claude/skills/detalhar-backlog/SKILL.md')).toContain(
      '**neither** `ready`, `in-progress`, `via-rapida` nor `step`',
    );
    const skill = read('.claude/skills/via-rapida/SKILL.md');
    expect(skill).toContain('remove `via-rapida`');
    expect(skill).toContain('add the `via-rapida` label');
  });

  it('CLAUDE.md: American English, external values stay as they come', () => {
    const code = section(read('CLAUDE.md'), '## Code');
    expect(code).toContain('American English');
    expect(code).toContain('`canceled`');
  });
});
