// @vitest-environment node
// Fast track #2488: an epic PR that conflicts with `main` (`mergeable_state: dirty`) got no CI run and
// nobody brought `main` in. Text-only test of `implementar-fila` and `docs/FLOW.md`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const flow = readFileSync('docs/FLOW.md', 'utf8');
const perStage = section(skill, '## 3. Per stage');
const closing = between(perStage, '5. **Closing**', '6. **Merge**');
const wait = between(
  perStage,
  '**PR that waits for the coordinator:**',
  'When the phase notifies',
);
const noRun = between(
  section(flow, '## For the phase session'),
  '   - **No run on the commit:**',
  '   - **Run stuck in the queue:**',
);

// prettier-ignore
const closingRules: [string, RegExp][] = [
  ['conflict check, not only the MCP version', /git merge-tree --write-tree origin\/main HEAD.*whatever the MCP version says/],
  ['ancestry check', /git merge-base --is-ancestor origin\/main HEAD/],
  ['merge, never rebase, and a dirty PR gets no CI', /`git merge origin\/main`, never rebase.*`mergeable_state: dirty`/],
  ['exit 1 is a conflict, 128 an error (shallow clone)', /exit 1 means conflict.*128 is an error.*`git fetch --unshallow`/],
  ['before the renames and records, on a clean tree', /before the renames and records below/],
  ['version choice and gates redone afterwards', /redo the version choice below and the gates/],
  ['unknown is read again; only dirty brings main in', /`unknown` is read again; only `dirty` brings `main` in/],
  ['the coordinator tells the owner, not itself', /coordinator itself.*`esperando dono`.*`PushNotification`/],
  ['a closing session notifies the coordinator, never silently', /still ends with no CI run notifies the coordinator[^;]*never silently/],
];
// prettier-ignore
const noRunRules: [string, RegExp][] = [
  ['reads mergeable_state after ~10 min instead of waiting or ending', /~10 min[^.]*`mergeable_state`[^.]*`pull_request_read` `get`[^.]*instead of waiting or ending/],
  ['unknown re-read up to 3 times, then the coordinator is notified', /`unknown`[^.]*up to 3 times, then notify the coordinator/],
  ['no run means empty check runs and actions_list', /`get_check_runs` and `actions_list`[^.]*empty/],
  ['dirty: merge the base, never rebase, restart the CI wait', /`dirty`: .*`git merge origin\/main`.*never rebase.*restart the \*\*CI wait\*\*/],
  ['version choice only on an epic PR', /on an epic PR redo the version choice[^.]*\(a phase PR has none\)/],
  ['ending without a CI run notifies through the Channel, never silently', /ends without a CI run on its PR notifies the coordinator through the Channel of item 7[^.]*never ends silently/],
  ['other states go on to the stuck-in-the-queue check', /go on to the check below/],
];

describe('#2488 — the closing brings main in when the epic PR cannot merge', () => {
  it.each(closingRules)('%s', (_name, re) => expect(closing).toMatch(re));
  it('is no longer limited to the MCP version catching up', () => {
    expect(closing).not.toMatch(/only when the version caught up/);
  });
});

describe('#2488 — Reading CI: no run on the current commit', () => {
  it.each(noRunRules)('%s', (_name, re) => expect(noRun).toMatch(re));
});

describe("#2488 — the coordinator's PR-wait paragraph", () => {
  it('reads the mergeable_state when no run shows up and never waits silently', () => {
    expect(wait).toMatch(/no CI run on the current commit 10 min after the push/);
    expect(wait).toContain('**No run on the commit**');
    expect(wait).toMatch(
      /`dirty` the coordinator brings `main` in and pushes.*never a silent wait/,
    );
  });
});
