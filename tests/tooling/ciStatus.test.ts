// @vitest-environment node
// Stage #2783: the CI state of a commit read by a script (`scripts/ci/ciStatus.mjs`) from the check
// runs of the GitHub API, and the flow text that uses it. The unit and the CLI run with fixtures in a
// temporary folder; the rest is a text test.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error .mjs module without type declarations
import { CI_JOBS, ciState } from '../../scripts/ci/ciStatus.mjs';
import { between, section } from '../support/textSlice';

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
}
interface State {
  ci: string;
  sha: string;
  failed: string[];
  pending: string[];
}
const stateOf = ciState as (runs: CheckRun[], options?: { epico?: boolean }) => State;
const jobs = CI_JOBS as string[];

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
let nextId = 1;
function run(
  name: string,
  conclusion: string | null,
  status?: string,
  id?: number,
): CheckRun {
  return {
    id: id ?? nextId++,
    name,
    status: status ?? (conclusion === null ? 'in_progress' : 'completed'),
    conclusion,
    head_sha: SHA,
  };
}
const ok = (name: string): CheckRun => run(name, 'success');
const GREEN = [ok('static'), ok('check'), ok('e2e')];

let dir: string;
let counter = 0;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ci-status-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fixture(content: unknown): string {
  const path = join(dir, `checks-${counter++}.json`);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}
function cli(args: string[]): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, ['scripts/ci/ciStatus.mjs', ...args], {
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const cliRuns = (runs: unknown, extra: string[] = []) =>
  cli(['--checks', fixture(runs), ...extra]);

describe('ciState', () => {
  it('green: check and e2e at success, nothing pending or red', () => {
    expect(stateOf(GREEN)).toEqual({
      ci: 'green',
      sha: 'abcdef0',
      failed: [],
      pending: [],
    });
  });

  it.each(['failure', 'cancelled', 'timed_out'])('red for a %s job', (conclusion) => {
    const s = stateOf([...GREEN, run('build', conclusion)]);
    expect(s.ci).toBe('red');
    expect(s.failed).toEqual(['build']);
  });

  it('running with one job in progress', () => {
    const s = stateOf([...GREEN, run('coverage', null)]);
    expect(s.ci).toBe('running');
    expect(s.pending).toEqual(['coverage']);
  });

  it('running when check and e2e passed but a test shard is queued', () => {
    const s = stateOf([...GREEN, run('test (3)', null, 'queued')]);
    expect(s.ci).toBe('running');
    expect(s.pending).toEqual(['test (3)']);
  });

  it('running while e2e is missing', () => {
    const s = stateOf([ok('check')]);
    expect(s).toEqual({ ci: 'running', sha: 'abcdef0', failed: [], pending: ['e2e'] });
  });

  it('any status other than completed counts as not finished', () => {
    expect(stateOf([...GREEN, run('static', null, 'waiting')]).ci).toBe('running');
  });

  it('an older cancelled replaced by a later success of the same name is green', () => {
    const s = stateOf([
      run('check', 'cancelled', 'completed', 5),
      ok('e2e'),
      run('check', 'success', 'completed', 9),
    ]);
    expect(s.ci).toBe('green');
    expect(s.failed).toEqual([]);
  });

  it('an older success replaced by a later failure is red', () => {
    const s = stateOf([
      run('check', 'success', 'completed', 5),
      ok('e2e'),
      run('check', 'failure', 'completed', 9),
    ]);
    expect(s.ci).toBe('red');
    expect(s.failed).toEqual(['check']);
  });

  it('a skipped required job is not green', () => {
    const s = stateOf([ok('check'), run('e2e', 'skipped')]);
    expect(s.ci).toBe('running');
    expect(s.pending).toEqual(['e2e']);
  });

  it('a skipped non-required job does not make it red', () => {
    expect(stateOf([...GREEN, run('static', 'skipped')]).ci).toBe('green');
  });

  it('ignores a red rc-build and a red snapshot job', () => {
    const s = stateOf([
      ...GREEN,
      run('rc-build', 'failure'),
      run('snapshot-pr1', 'failure'),
    ]);
    expect(s.ci).toBe('green');
    expect(s.failed).toEqual([]);
  });

  it('--epico: a missing epic run is running, a red one is red, otherwise it does not matter', () => {
    const withEpico = stateOf(GREEN, { epico: true });
    expect(withEpico.ci).toBe('running');
    expect(withEpico.pending).toEqual(['epic']);
    expect(stateOf([...GREEN, run('epic', 'failure')], { epico: true }).ci).toBe('red');
    expect(stateOf([...GREEN, ok('epic')], { epico: true }).ci).toBe('green');
    expect(stateOf(GREEN).ci).toBe('green');
  });

  it('none for an empty list and for names that are not CI jobs', () => {
    expect(stateOf([])).toEqual({ ci: 'none', sha: 'none', failed: [], pending: [] });
    expect(stateOf([run('rc-build', 'failure'), run('cleanup', 'success')]).ci).toBe(
      'none',
    );
  });

  it('keeps failed and pending in CI_JOBS order', () => {
    const s = stateOf([
      run('e2e', 'failure'),
      run('build', 'failure'),
      run('static', null),
    ]);
    expect(s.failed).toEqual(['build', 'e2e']);
    expect(s.pending).toEqual(['static', 'check']);
  });
});

describe('CLI', () => {
  it('green: one line and exit 0', () => {
    const r = cliRuns({ total_count: 3, check_runs: GREEN });
    expect(r).toEqual({
      code: 0,
      out: 'ci=green sha=abcdef0 failed=none pending=none\n',
      err: '',
    });
  });

  it('red: names the failed jobs, exit 1', () => {
    const r = cliRuns([...GREEN, run('test (2)', 'failure'), run('build', 'timed_out')]);
    expect(r.code).toBe(1);
    expect(r.out).toBe('ci=red sha=abcdef0 failed=test (2),build pending=none\n');
  });

  it('running: names the pending jobs, exit 3', () => {
    const r = cliRuns([ok('static'), run('coverage', null, 'queued')]);
    expect(r.code).toBe(3);
    expect(r.out).toBe('ci=running sha=abcdef0 failed=none pending=coverage,check,e2e\n');
  });

  it('none: exit 4', () => {
    const empty = cliRuns({ total_count: 0, check_runs: [] });
    expect(empty).toEqual({
      code: 4,
      out: 'ci=none sha=none failed=none pending=none\n',
      err: '',
    });
    expect(cliRuns([]).code).toBe(4);
    expect(cliRuns([run('rc-build', 'success')]).code).toBe(4);
  });

  it('--epico through the CLI', () => {
    expect(cliRuns(GREEN, ['--epico']).code).toBe(3);
    expect(cliRuns([...GREEN, ok('epic')], ['--epico']).code).toBe(0);
  });

  it('invalid JSON: exit 2, message on stderr, empty stdout', () => {
    const r = cliRuns('{not json');
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).not.toBe('');
  });

  it('JSON of the wrong shape: exit 2', () => {
    for (const content of [{ foo: 1 }, 'null', '42', { check_runs: 'x' }]) {
      const r = cliRuns(content);
      expect(r.code).toBe(2);
      expect(r.out).toBe('');
      expect(r.err).not.toBe('');
    }
  });

  it('runs the CLI when started through a symlink', () => {
    const link = join(dir, 'ciStatus-link.mjs');
    symlinkSync(resolve('scripts/ci/ciStatus.mjs'), link);
    const r = spawnSync(
      process.execPath,
      [link, '--checks', fixture([...GREEN, run('build', 'failure')])],
      { encoding: 'utf8' },
    );
    expect(r.status).toBe(1);
    expect(r.stdout.startsWith('ci=red')).toBe(true);
  });

  it.each([
    ['without an id', { name: 'check', status: 'completed', conclusion: 'success' }],
    [
      'with a string id',
      { id: '7', name: 'check', status: 'completed', conclusion: 'success' },
    ],
  ])('a check run %s: exit 2, message on stderr, empty stdout', (_label, bad) => {
    const r = cliRuns([...GREEN, bad]);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/"id"/);
  });

  it('usage errors: exit 2 with nothing on stdout', () => {
    const file = fixture(GREEN);
    const cases = [
      [],
      ['--epico'],
      ['--checks'],
      ['--checks', file, '--checks', file],
      ['--checks', file, '--epico', '--epico'],
      ['--checks', file, '--unknown'],
      ['--checks', file, 'stray'],
      ['--checks', join(dir, 'does-not-exist.json')],
    ];
    for (const args of cases) {
      const r = cli(args);
      expect(r.code, args.join(' ')).toBe(2);
      expect(r.out).toBe('');
      expect(r.err).not.toBe('');
    }
  });
});

describe('CI_JOBS', () => {
  it('matches the jobs of .github/workflows/ci.yml', () => {
    const lines = readFileSync('.github/workflows/ci.yml', 'utf8').split('\n');
    const start = lines.findIndex((l) => l === 'jobs:');
    expect(start).toBeGreaterThan(-1);
    const names: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\S/.test(line) && !line.startsWith('#')) break;
      const m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (m) names.push(m[1]!);
    }
    const shard = lines.find((l) => /^\s+shard: \[[\d, ]+\]/.test(l));
    const shards = shard!.match(/\d+/g)!.map(Number);
    const expected = names.flatMap((n) =>
      n === 'test' ? shards.map((s) => `test (${s})`) : [n],
    );
    expect(expected.length).toBeGreaterThan(5);
    for (const name of expected) expect(jobs, name).toContain(name);
    for (const name of jobs) expect(expected, name).toContain(name);
  });
});

describe('docs/FLOW.md: Reading CI', () => {
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const phase = section(flow, '## For the phase session');
  const item6 = between(phase, '\n6. ', '\n7. ');

  it('Reading CI uses the script', () => {
    const reading = between(item6, '**Reading CI:**', '\n   - **');
    expect(reading).toContain('node scripts/ci/ciStatus.mjs --checks');
    expect(reading).toContain('--epico');
    expect(reading).toContain('ci=<green|red|running|none>');
    expect(reading).toContain('CI_JOBS');
    expect(reading).toContain('never with `get_status`');
    expect(reading).toMatch(/most recent run of each job/);
    expect(reading).toMatch(/other workflows do not count/);
    expect(reading).toMatch(/green of an earlier commit does not count/);
    expect(reading).not.toContain('get_check_runs');
  });

  it('Reading CI documents sha=none', () => {
    expect(between(item6, '**Reading CI:**', '\n   - **')).toContain('`sha=none`');
  });

  it('the transition sub-item names the stdout line and no stale exit range', () => {
    const transition = between(item6, '   - **Transition (CI script):**', '\n   - **');
    expect(transition).toMatch(/no `ci=` line on stdout/);
    expect(transition).not.toContain('outside 0 to 4');
  });

  it('the stuck sub-item separates ci=none from ci=running', () => {
    const stuck = between(item6, '   - **Run stuck in the queue:**', '   - **Ceiling of');
    expect(stuck).toContain('`ci=none`');
    expect(stuck).toContain('`ci=running`');
    expect(stuck).toMatch(/non-empty `actions_list`/);
    expect(stuck).not.toMatch(/read by Reading CI as "CI is still running"/);
  });

  it('the transition sub-item keeps get_check_runs for the commit that lacks the script', () => {
    const transition = between(item6, '   - **Transition (CI script):**', '\n   - **');
    expect(transition).toContain('git show origin/main:scripts/ci/ciStatus.mjs');
    expect(transition).toContain('`pull_request_read` `get_check_runs`');
    expect(item6.replace(transition, '')).not.toContain('get_check_runs');
  });

  it('the CI wait sub-item uses the script', () => {
    expect(between(item6, '   - **CI wait:**', '\n   - **')).toContain('ciStatus.mjs');
  });

  it('no run on the commit reads ci=none and an empty actions_list', () => {
    const noRun = between(
      item6,
      '   - **No run on the commit:**',
      '   - **Run stuck in the queue:**',
    );
    expect(noRun).toMatch(/`ci=none`[^.]*`actions_list`[^.]*empty/);
  });
});
