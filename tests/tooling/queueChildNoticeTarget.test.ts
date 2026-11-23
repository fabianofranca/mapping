// @vitest-environment node
// Bug #2704: a child's notice reaches the current coordinator through every switch (title pointer,
// followed by the child; the predecessor is archived only when idle). Text-only test.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const tester = readFileSync('docs/TESTING-NUVEM.md', 'utf8');

const phase = section(flow, '## For the phase session');
const item7 = between(phase, '\n7. ', '\n8. ');
const channel = item7.slice(item7.indexOf('   - **Channel:**'));
const switchSection = section(skill, '## Session switch');
const oldSession = between(
  switchSection,
  '**In the old session:**',
  '**In the new session**',
);
const newSession = between(
  switchSection,
  '**In the new session**',
  '5. **History, once**',
);
const delivery = between(
  tester,
  '**Delivery, at the end of the round:**',
  '6. **Paste the Summary',
);

describe('bug #2704 — child notices follow the coordinator through every switch', () => {
  it('the old session writes the pointer in its own title right after registering the successor', () => {
    expect(oldSession).toContain('`set_session_title`');
    expect(oldSession).toContain('replaced by <new id>');
    const register = oldSession.indexOf('painel.py role <folder> coordenador <new id>');
    const pointer = oldSession.indexOf('replaced by <new id>');
    const notify = oldSession.indexOf('3. Send each child session');
    expect(register).toBeGreaterThan(-1);
    expect(pointer).toBeGreaterThan(register);
    expect(pointer).toBeLessThan(notify);
  });

  it('the new session archives the predecessor only when it is not working', () => {
    const step4 = newSession.slice(newSession.indexOf('4. Check in `painel.py roles'));
    expect(step4).toContain('`status_bucket`');
    expect(step4).toMatch(/not `working`/);
    expect(step4).toContain('next cycle');
  });

  it('the Channel makes the child follow the pointer before sending, with a hop limit', () => {
    expect(channel).toContain('`get_session`');
    expect(channel).toContain('title');
    expect(channel).toContain('replaced by <id>');
    expect(channel).toMatch(/up to 8 hops/);
    expect(channel).toMatch(/before (every|each) message/);
  });

  it('the tester, who reads only docs/TESTING-NUVEM.md, gets the same rule in the delivery notice', () => {
    expect(delivery).toContain('`get_session`');
    expect(delivery).toContain('replaced by <id>');
    expect(delivery).toMatch(/up to 8 hops/);
  });
});
