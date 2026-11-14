// @vitest-environment node
// Stage #1325, phase CA1 (decision 5): the rule "the job died from an abandoned runner" of
// `ci-rerun.yml`, with the real job lists of 2026-11-09 as fixtures.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error .mjs module without type declarations
import { decideQueued, decideRerun, expectedJobs } from '../../scripts/ci/ciRerun.mjs';

interface Job {
  name: string;
  conclusion: string | null;
}
interface Decision {
  rerun: boolean;
  abandoned: string[];
  reason: string;
}
const expectedOf = expectedJobs as (yaml: string) => string[];
const decide = decideRerun as (input: { expected: string[]; jobs: Job[] }) => Decision;

const ciYml = readFileSync('.github/workflows/ci.yml', 'utf8');
const expected = expectedOf(ciYml);
const ok = (name: string): Job => ({ name, conclusion: 'success' });
const bad = (name: string, conclusion = 'failure'): Job => ({ name, conclusion });
const allOk = expected.map(ok);
const without = (jobs: Job[], ...names: string[]): Job[] =>
  jobs.filter((job) => !names.includes(job.name));
const replace = (jobs: Job[], job: Job): Job[] =>
  jobs.map((other) => (other.name === job.name ? job : other));

describe('expected jobs, read from ci.yml', () => {
  it('the current ci.yml reads whole, with the test matrix expanded', () => {
    expect(expected).toEqual([
      'epic',
      'static',
      'test (1)',
      'test (2)',
      'test (3)',
      'test (4)',
      'coverage',
      'build',
      'check',
      'e2e',
    ]);
  });

  it('a comment at column 0 between jobs does not truncate the list', () => {
    const yaml = 'jobs:\n  a:\n    runs-on: x\n# solto\n\n  b:\n    runs-on: x\n';
    expect(expectedOf(yaml)).toEqual(['a', 'b']);
  });

  it('a top-level key after jobs: ends the list', () => {
    const yaml = 'jobs:\n  a:\n    runs-on: x\nenv:\n  b:\n';
    expect(expectedOf(yaml)).toEqual(['a']);
  });

  it('a job with its own name: makes the script fail', () => {
    const yaml = 'jobs:\n  static:\n    name: Static\n    runs-on: ubuntu-latest\n';
    expect(() => expectedOf(yaml)).toThrow(/name:/);
  });

  it('a matrix of another format makes the script fail', () => {
    const yaml =
      'jobs:\n  test:\n    strategy:\n      matrix:\n        os: [a, b]\n        node: [1, 2]\n    runs-on: x\n';
    expect(() => expectedOf(yaml)).toThrow(/matriz/);
  });
});

describe('rerun decision', () => {
  // Run 42672468793, attempt 1 (#925): only test (3), coverage and check appear.
  it('run 42672468793 (attempt 1): reruns the abandoned ones', () => {
    const jobs = [ok('test (3)'), ok('coverage'), bad('check')];
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(true);
    expect(decision.abandoned).toEqual([
      'epic',
      'static',
      'test (1)',
      'test (2)',
      'test (4)',
      'build',
      'e2e',
    ]);
  });

  // Run 42672325637, attempt 1 (#971): only the check exists.
  it('run 42672325637 (attempt 1): reruns the abandoned ones', () => {
    const decision = decide({ expected, jobs: [bad('check')] });
    expect(decision.rerun).toBe(true);
    expect(decision.abandoned).toHaveLength(expected.length - 1);
    expect(decision.reason).toContain('epic');
  });

  it('an ordinary test failure does not rerun', () => {
    const jobs = replace(allOk, bad('test (2)'));
    const decision = decide({ expected, jobs: replace(jobs, bad('check')) });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (test (2))');
  });

  it('a timeout (job present with a failure) does not rerun', () => {
    const jobs = replace(replace(allOk, bad('static')), bad('check'));
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (static)');
  });

  it('a cancelled job counts as a legitimate failure', () => {
    const decision = decide({
      expected,
      jobs: replace(allOk, bad('build', 'cancelled')),
    });
    expect(decision.rerun).toBe(false);
  });

  it('an abandoned test (n) with a red coverage reruns', () => {
    // As in attempt 3 of run 42672468793: the coverage fails for lack of the blobs.
    const jobs = replace(
      replace(without(allOk, 'test (4)'), bad('coverage')),
      bad('check'),
    );
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(true);
    expect(decision.abandoned).toEqual(['test (4)']);
    expect(decision.reason).toBe('abandonados test (4)');
  });

  it('a red coverage with no abandoned test is a legitimate failure', () => {
    const decision = decide({ expected, jobs: replace(allOk, bad('coverage')) });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (coverage)');
  });

  it('a legitimate failure does not rerun even with abandoned jobs', () => {
    const jobs = [bad('static'), bad('check')];
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (static)');
  });

  it('with no abandoned jobs, does not rerun', () => {
    const decision = decide({ expected, jobs: allOk });
    expect(decision.rerun).toBe(false);
    expect(decision.abandoned).toEqual([]);
    expect(decision.reason).toBe('nenhum job abandonado');
  });

  it('a skipped job is not a failure', () => {
    const jobs = replace(allOk, bad('epic', 'skipped'));
    expect(decide({ expected, jobs }).reason).toBe('nenhum job abandonado');
  });

  it('an extra job in the PR (outside main) does not count', () => {
    const jobs = [...allOk, bad('new-job')];
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(false);
    expect(decision.abandoned).toEqual([]);
  });
});

describe('decide command', () => {
  const run = (jobs: Job[], extra: string[] = []) => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-rerun-'));
    const jobsFile = join(dir, 'jobs.json');
    const output = join(dir, 'output');
    writeFileSync(jobsFile, JSON.stringify({ total_count: jobs.length, jobs }));
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ci/ciRerun.mjs',
        'decide',
        '--ci',
        '.github/workflows/ci.yml',
        '--jobs',
        jobsFile,
        '--output',
        output,
        ...extra,
      ],
      { encoding: 'utf8' },
    );
    return { result, output: readFileSync(output, 'utf8') };
  };

  it('writes rerun, abandoned and reason to --output', () => {
    const { result, output } = run([bad('check')]);
    expect(result.status).toBe(0);
    expect(output).toContain('rerun=true\n');
    expect(output).toContain('abandoned=epic, static, test (1)');
    expect(output).toContain('reason=abandonados epic, static');
  });

  it('does not rerun a legitimate failure', () => {
    const { output } = run(replace(allOk, bad('static')));
    expect(output).toContain('rerun=false\n');
    expect(output).toContain('abandoned=\n');
    expect(output).toContain('reason=falha legítima (static)');
  });

  it('exits with an error when ci.yml cannot be read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-rerun-'));
    const ci = join(dir, 'ci.yml');
    writeFileSync(ci, 'jobs:\n  a:\n    name: x\n');
    const jobs = join(dir, 'jobs.json');
    writeFileSync(jobs, '{"jobs":[]}');
    const result = spawnSync(
      process.execPath,
      ['scripts/ci/ciRerun.mjs', 'decide', '--ci', ci, '--jobs', jobs],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('name:');
  });
});

// Stage #1669 (QF1): a CI run stuck in `queued` with no jobs, with the real runs of
// 2026-11-11 (PR #1664) as fixtures.
interface Run {
  id: number;
  head_sha: string;
  status: string;
  created_at: string;
  html_url: string;
}
interface QueuedDecision {
  preso: boolean;
  run: string;
  link: string;
  minutos: number;
  execucoes: number;
  reaberto: boolean;
  reason: string;
}
const decideQ = decideQueued as (input: {
  runs: Run[];
  jobsTotal: number;
  head: string;
  now: string;
}) => QueuedDecision;

const OLD = 'b1221ea';
const HEAD = 'e871e5c';
const run = (id: number, sha: string, createdAt: string, status = 'queued'): Run => ({
  id,
  head_sha: sha,
  status,
  created_at: createdAt,
  html_url: `https://github.com/fabianofranca/mapping/actions/runs/${id}`,
});
const r2676 = run(43095704874, OLD, '2026-11-11T20:22:56Z');
const r2677 = run(43097220825, HEAD, '2026-11-11T20:38:06Z');
const r2678 = run(43103790776, HEAD, '2026-11-11T21:31:27Z');

describe('decideQueued: run stuck in the queue (#1669)', () => {
  it('the 2677 alone on the commit, at 20:57Z, is stuck and has not been reopened yet', () => {
    const d = decideQ({
      runs: [r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T20:57:00Z',
    });
    expect(d).toEqual({
      preso: true,
      run: '43097220825',
      link: 'https://github.com/fabianofranca/mapping/actions/runs/43097220825',
      minutos: 18,
      execucoes: 1,
      reaberto: false,
      reason: 'queued with no jobs for 18 min',
    });
  });

  it('exactly 15 min is not stuck; 15 min and 1 s is', () => {
    const at15 = decideQ({
      runs: [r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T20:53:06Z',
    });
    expect(at15.preso).toBe(false);
    expect(at15.reason).toBe('15 min (limit 15)');
    const over = decideQ({
      runs: [r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T20:53:07Z',
    });
    expect(over.preso).toBe(true);
    expect(over.minutos).toBe(15);
    expect(over.reason).toBe('queued with no jobs for 15 min');
  });

  it('the latest one with jobs is not stuck', () => {
    const d = decideQ({
      runs: [r2677, r2678],
      jobsTotal: 10,
      head: HEAD,
      now: '2026-11-11T21:40:00Z',
    });
    expect(d.preso).toBe(false);
    expect(d.reason).toBe('10 jobs');
    expect(d.run).toBe('43103790776');
    expect(d.execucoes).toBe(2);
    expect(d.reaberto).toBe(true);
  });

  it.each(['in_progress', 'waiting'])('the latest one %s is not stuck', (status) => {
    const d = decideQ({
      runs: [run(43097220825, HEAD, '2026-11-11T20:38:06Z', status)],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:40:00Z',
    });
    expect(d.preso).toBe(false);
    expect(d.reason).toBe(`status ${status}`);
  });

  it('a stuck run of an earlier commit does not count: no run of the current commit', () => {
    const d = decideQ({
      runs: [r2676],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:40:00Z',
    });
    expect(d).toEqual({
      preso: false,
      run: '',
      link: '',
      minutos: 0,
      execucoes: 0,
      reaberto: false,
      reason: 'sem execução do CI no commit',
    });
  });

  it('2677 and 2678 on the same commit with the 2678 stuck: stuck again, already reopened', () => {
    const d = decideQ({
      runs: [r2677, r2678],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:50:00Z',
    });
    expect(d.preso).toBe(true);
    expect(d.reaberto).toBe(true);
    expect(d.execucoes).toBe(2);
    expect(d.run).toBe('43103790776');
    expect(d.minutos).toBe(18);
  });

  it('the latest one comes from created_at, not from the list order', () => {
    const d = decideQ({
      runs: [r2678, r2676, r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:50:00Z',
    });
    expect(d.run).toBe('43103790776');
    expect(d.execucoes).toBe(2);
  });
});

describe('decideQueued: invalid input (#1669, review)', () => {
  it('an invalid now is an error, not preso=true with NaN', () => {
    expect(() =>
      decideQ({ runs: [r2677], jobsTotal: 0, head: HEAD, now: 'tomorrow' }),
    ).toThrow(/now/);
  });

  it('an unreadable created_at is an error', () => {
    expect(() =>
      decideQ({
        runs: [run(1, HEAD, 'yesterday')],
        jobsTotal: 0,
        head: HEAD,
        now: '2026-11-11T21:50:00Z',
      }),
    ).toThrow(/created_at/);
  });
});

describe('queued command (#1669)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-queued-'));
  const write = (name: string, value: unknown): string => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const exec = (args: string[]) =>
    spawnSync(process.execPath, ['scripts/ci/ciRerun.mjs', 'queued', ...args], {
      encoding: 'utf8',
    });

  it('writes the seven lines to --output', () => {
    const runs = write('runs.json', { total_count: 2, workflow_runs: [r2676, r2677] });
    const jobs = write('jobs.json', { total_count: 0, jobs: [] });
    const output = join(dir, 'out-file');
    const result = exec([
      '--runs',
      runs,
      '--jobs',
      jobs,
      '--head',
      HEAD,
      '--now',
      '2026-11-11T20:57:00Z',
      '--output',
      output,
    ]);
    expect(result.status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(
      'preso=true\n' +
        'run=43097220825\n' +
        'link=https://github.com/fabianofranca/mapping/actions/runs/43097220825\n' +
        'minutos=18\n' +
        'execucoes=1\n' +
        'reaberto=false\n' +
        'reason=queued with no jobs for 18 min\n',
    );
  });

  it('without --output writes the same lines to stdout', () => {
    const runs = write('runs2.json', { workflow_runs: [r2677, r2678] });
    const jobs = write('jobs2.json', {
      total_count: 10,
      jobs: [{ run_id: 43103790776, name: 'epic' }],
    });
    const result = exec(['--runs', runs, '--jobs', jobs, '--head', HEAD]);
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').filter(Boolean)).toHaveLength(7);
    expect(result.stdout).toContain('preso=false\n');
    expect(result.stdout).toContain('reaberto=true\n');
    expect(result.stdout).toContain('reason=10 jobs\n');
  });

  it('with no run of the commit, --jobs is not read', () => {
    const runs = write('runs3.json', { workflow_runs: [r2676] });
    const result = exec([
      '--runs',
      runs,
      '--jobs',
      join(dir, 'missing.json'),
      '--head',
      HEAD,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('preso=false\n');
    expect(result.stdout).toContain('reason=sem execução do CI no commit\n');
  });

  it('a job of another run_id is an error', () => {
    const runs = write('runs4.json', { workflow_runs: [r2677, r2678] });
    const jobs = write('jobs4.json', {
      total_count: 1,
      jobs: [{ run_id: 43097220825, name: 'epic' }],
    });
    const result = exec(['--runs', runs, '--jobs', jobs, '--head', HEAD]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('run_id');
  });

  it('an unreadable --now exits with an error', () => {
    const runs = write('runs6.json', { workflow_runs: [r2677] });
    const jobs = write('jobs6.json', { total_count: 0, jobs: [] });
    const result = exec([
      '--runs',
      runs,
      '--jobs',
      jobs,
      '--head',
      HEAD,
      '--now',
      'tomorrow',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--now');
  });

  it('an option value that is another flag counts as a missing argument', () => {
    const runs = write('runs7.json', { workflow_runs: [r2677] });
    const jobs = write('jobs7.json', { total_count: 0, jobs: [] });
    const result = exec(['--runs', runs, '--jobs', jobs, '--head', '--now', 'x']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Uso: node scripts/ci/ciRerun.mjs queued');
  });

  it('a missing argument exits with an error and the usage message', () => {
    const result = exec(['--runs', write('runs5.json', { workflow_runs: [] })]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Uso: node scripts/ci/ciRerun.mjs queued');
  });
});
