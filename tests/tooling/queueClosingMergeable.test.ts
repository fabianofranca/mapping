// @vitest-environment node
// Fast track #2488: an epic PR that conflicts with `main` (`mergeable_state: dirty`) gets no CI run,
// and nobody brought `main` in. Text-only test of `implementar-fila` and `docs/FLOW.md`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const flow = readFileSync('docs/FLOW.md', 'utf8');
const closing = between(
  section(skill, '## 3. Per stage'),
  '5. **Closing**',
  '6. **Merge**',
);
const phaseSession = section(flow, '## For the phase session');
const noRun = between(
  phaseSession,
  '   - **No run on the commit:**',
  '   - **Run stuck in the queue:**',
);

describe('#2488 — closing brings main in when the epic PR cannot merge', () => {
  it('checks the conflict and the ancestry, not only the MCP version', () => {
    expect(closing).toContain('git fetch origin main');
    expect(closing).toContain('git merge-tree --write-tree origin/main HEAD');
    expect(closing).toContain('git merge-base --is-ancestor origin/main HEAD');
    expect(closing).toMatch(/`git merge origin\/main`, never rebase/);
    expect(closing).toMatch(/`mergeable_state: dirty`/);
  });

  it('redoes the version choice and the gates after bringing main in', () => {
    expect(closing).toMatch(
      /bring `main` in.*redo the version choice below and the gates/s,
    );
  });

  it('when the coordinator runs the closing itself it tells the owner, not itself', () => {
    expect(closing).toMatch(/coordinator itself.*`esperando dono`.*`PushNotification`/s);
  });

  it('acts on dirty only and reads an unknown state again', () => {
    expect(closing).toMatch(/`mergeable_state: dirty`.*`unknown`.*again/s);
    expect(noRun).toMatch(/`unknown`.*read.*again/);
  });

  it('a closing session that still ends with no CI run notifies the coordinator', () => {
    expect(closing).toMatch(/still ends with no CI run.*notifies the coordinator/s);
  });
});

describe('#2488 — Reading CI: no run on the current commit', () => {
  it('waits ~10 min, then reads the PR mergeable_state instead of waiting or ending', () => {
    expect(noRun).toMatch(/~10 min/);
    expect(noRun).toContain('`pull_request_read` `get`');
    expect(noRun).toContain('`mergeable_state`');
    expect(noRun).toMatch(/instead of (waiting|ending)/);
  });

  it('with dirty it brings the base in by merge (never rebase), pushes and restarts the CI wait', () => {
    expect(noRun).toContain('`dirty`');
    expect(noRun).toMatch(/`git merge origin\/main`/);
    expect(noRun).toMatch(/never rebase/);
    expect(noRun).toMatch(/restart the \*\*CI wait\*\*/);
  });

  it('a session that ends without a CI run notifies the coordinator with the reason, never silently', () => {
    expect(noRun).toMatch(/ends without a CI run on its PR/);
    expect(noRun).toContain('through the Channel of item 7');
    expect(noRun).toMatch(/never ends silently/);
  });

  it('the other states go on to the stuck-in-the-queue check', () => {
    expect(noRun).toMatch(/go on to the check below/);
  });
});
