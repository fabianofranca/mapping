// @vitest-environment node
// Phase CN1 (stage #1525, decisions 1 to 6 and 10): the nightly CR only reviews the epic without a
// `/code-review high` of the whole epic at the closing, the coordinator has an id and a way to be
// recreated, and the reviewer message in `docs/FLOW.md` is the copy of the one stored in the schedule.
// Phase CN2 (decisions 12 to 17): the list comes from the history of `main` (deepened clone) and step 2
// decides by the commit. Phase CA1 (stage #1600, decisions 2 to 9): the round issue comes from a REST
// listing before the script, the reviewer that fails gets one attempt per epic and `main` only accepts
// a merge commit. Text-only test: the CI does not read the schedule, so it checks the repository side
// (markers, absence of the `<…>` ones and the same id).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const processDoc = readFileSync('docs/PROCESS.md', 'utf8');

const COORDINATOR = 'session_01Y37a9rGc6hS2VxVbVDhCcq';
const SCHEDULE = 'trig_01NnLQbxT56N2JciyDxdnP4j';
const OLD_SCHEDULE = 'trig_01HVM7XdLhjVuhwHSFz7AiCf';

const howItRuns = section(flow, '### How it runs');
const limitations = section(flow, '### Known limitations');
const reviewerSection = section(flow, '### For the per-epic CR reviewer');
const reviewerMessage = between(reviewerSection, '```text\n', '\n```').replace(
  '```text\n',
  '',
);

describe('CN1 — the nightly CR skips the epics with a CR at the closing', () => {
  it('docs/PROCESS.md says the nightly review is only for the epic without a CR at the closing', () => {
    const item = processDoc.split('\n').find((l) => l.startsWith('- **Code review**'));
    expect(item).toBeDefined();
    expect(item).toContain(
      'without a `/code-review high` of the whole epic at the closing',
    );
    expect(item).toContain('`nenhum gatilho`');
    expect(item).toContain('2026-11-10');
  });

  it('"How it runs" carries the ids of the schedule, the coordinator and the old, disabled one', () => {
    expect(howItRuns).toContain(SCHEDULE);
    expect(howItRuns).toContain(COORDINATOR);
    expect(howItRuns).toContain(OLD_SCHEDULE);
    expect(howItRuns).toContain('CRON_TZ=America/Sao_Paulo 50 2 * * *');
  });

  it('"How it runs" describes the criterion, the command and the two outputs', () => {
    expect(howItRuns).toContain(
      'node scripts/ci/riskTriggers.mjs --base <merge_commit_sha>^1',
    );
    expect(howItRuns).toContain('gatilho:');
    expect(howItRuns).toContain('nenhum gatilho');
    expect(howItRuns).toContain('CR at closing');
    expect(howItRuns).toContain('another output');
  });

  it('"How it runs" teaches how to recreate the coordinator without `update_trigger` changing the session', () => {
    expect(howItRuns).toContain('create_session');
    expect(howItRuns).toContain('source_url');
    expect(howItRuns).toContain('create_trigger');
    expect(howItRuns).toContain('persistent_session_id');
    expect(howItRuns).toContain('enabled: false');
  });

  it('the "Known limitations" record the epic closed outside the queue', () => {
    const line = limitations.split('\n').find((l) => l.includes('outside the queue'));
    expect(line).toBeDefined();
    expect(line).toContain('implementar-fila');
  });

  it('the reviewer block uses the markers {nome}, {pr} and {sha}, without the old `<…>` ones', () => {
    expect(reviewerMessage).toContain('{nome}');
    expect(reviewerMessage).toContain('{pr}');
    expect(reviewerMessage).toContain('{sha}');
    expect(reviewerMessage).toContain('Read CLAUDE.md before starting.');
    expect(reviewerMessage).not.toContain('<nome>');
    expect(reviewerMessage).not.toContain('<pr>');
    expect(reviewerMessage).not.toContain('<sha>');
    expect(reviewerMessage).not.toContain('<coordinator id>');
  });

  it('reviewer step 8 carries the same coordinator id as "How it runs"', () => {
    const step8 = reviewerMessage.split('\n').find((l) => l.startsWith('8. '));
    expect(step8).toBeDefined();
    expect(step8).toContain(`session_id ${COORDINATOR}`);
    expect(step8).toContain(`Coordinator: \`${COORDINATOR}\``);
    expect(howItRuns).toContain(COORDINATOR);
  });
});

describe('CN2 — the schedule sees every epic since the CR baseline', () => {
  it('"How it runs" lists the epics from the history of main, with the deepened clone', () => {
    expect(howItRuns).toContain(
      'git fetch -q --shallow-since=2026-11-08T00:00:00Z origin main',
    );
    expect(howItRuns).toContain('git merge-base --is-ancestor 4532e75 origin/main');
    expect(howItRuns).toContain(
      "git log --reverse --first-parent --format='%H %s' 4532e75..origin/main",
    );
  });

  it('"How it runs" decides by the commit and handles the six merges without the script', () => {
    expect(howItRuns).toContain(
      'git merge-base --is-ancestor 55b2491 <merge_commit_sha>',
    );
    expect(howItRuns).toContain('63e58b9');
    expect(howItRuns).toContain('#1381, #1343, #1418 and #1417');
    expect(howItRuns).toContain('#1373 and #1419');
  });

  it('"How it runs" no longer reads the PR list with a page limit nor the hourly cut', () => {
    expect(howItRuns).not.toContain('pulls?state=closed');
    expect(howItRuns).not.toContain('merged_at');
    expect(howItRuns).not.toContain('2026-11-10T00:52:21Z');
  });

  it('the "Known limitations" record the shallow clone and --paginate', () => {
    const line = limitations.split('\n').find((l) => l.includes('shallow clone'));
    expect(line).toBeDefined();
    expect(line).toContain('--paginate');
  });

  it('the reviewer deepens the clone before reading the diff', () => {
    expect(reviewerMessage).toContain(
      'git fetch -q --shallow-since=2026-11-08T00:00:00Z origin main && git diff {sha}^1 {sha}',
    );
    expect(reviewerMessage).not.toContain('git fetch origin main && git diff');
  });
});

describe('CA1 — the round finds the issue by listing, one attempt per reviewer and only a merge commit', () => {
  it('"How it runs" lists the `code-review` issues by marker and title, with no search', () => {
    expect(howItRuns).toContain(
      'issues?labels=code-review&state=all&per_page=100&page=1',
    );
    expect(howItRuns).toContain('scan("cr-epic: pr=([0-9]+)")');
    expect(howItRuns).toContain('--jq length');
    expect(howItRuns).not.toContain('search/issues');
  });

  it('"How it runs" finds the round issue before running the script', () => {
    const listing = howItRuns.indexOf('issues?labels=code-review');
    const script = howItRuns.indexOf('node scripts/ci/riskTriggers.mjs');
    expect(listing).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(listing);
  });

  it('"How it runs" checks the ancestor of 63e58b9 with the whole command', () => {
    expect(howItRuns).toContain(
      'git merge-base --is-ancestor 63e58b9 <merge_commit_sha>',
    );
  });

  it('"How it runs" gives one attempt per reviewer, by the `status_bucket`', () => {
    expect(howItRuns).toContain('status_bucket');
    expect(howItRuns).toContain('one attempt per epic');
    expect(howItRuns).toContain('The automatic review failed');
  });

  it('"How it runs" says `main` only accepts a merge commit', () => {
    expect(howItRuns).toContain('only accepts a merge commit');
  });

  it('"How it runs" says only the conversation of the coordinator changes the prompt', () => {
    expect(howItRuns).toContain('Dono: aplicar este prompt no CR por épico');
    expect(howItRuns).not.toContain('updates it (`update_trigger`) in the same epic');
  });

  it('the "Known limitations" record the trigger criterion, the search and the script', () => {
    const outside = limitations.split('\n').find((l) => l.includes('outside the queue'));
    expect(outside).toContain(
      'does not check whether `/code-review high` ran at closing',
    );
    const search = limitations.split('\n').find((l) => l.includes('search/issues'));
    expect(search).toBeDefined();
    expect(search).toContain('30');
    expect(search).toContain('63e58b9');
  });

  it('`docs/FLOW.md` uses the same date in every `--shallow-since` and the same base point', () => {
    const review = section(flow, '## Code review');
    const dates = [...review.matchAll(/--shallow-since=(\S+)/g)].map((m) => m[1]);
    expect(dates.length).toBeGreaterThan(1);
    expect(new Set(dates)).toEqual(new Set(['2026-11-08T00:00:00Z']));
    const base = section(flow, '### CR baseline (2026-11-08)');
    expect(base).toMatch(/`4532e75[0-9a-f]{33}`/);
    expect(howItRuns).toContain('4532e75..origin/main');
  });
});
