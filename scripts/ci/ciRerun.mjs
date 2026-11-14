// Decision of `ci-rerun.yml` (stage #1325): did the job die because of an abandoned runner? Node
// only, no dependencies. The YAML only gathers the data (the `main` `ci.yml` and the run's job list).
//   decide --ci <ci.yml> --jobs <file> [--output <file>]
//     Reads the expected jobs from `ci.yml` and the `actions/runs/<id>/jobs` response and writes
//     `rerun=true|false`, `abandoned=<list>` and `reason=<reason>` to `--output` (the
//     `$GITHUB_OUTPUT`; without it, to stdout).
//   queued --runs <file> --jobs <file> --head <sha> [--now <ISO>] [--output <file>]
//     Stage #1669: is the commit's latest CI run stuck in `queued` with no jobs for more than
//     15 min? Reads `actions/workflows/ci.yml/runs?head_sha=…` (`--runs`) and
//     `actions/runs/<id of the latest>/jobs` (`--jobs`) and writes seven lines (`preso`, `run`,
//     `link`, `minutos`, `execucoes`, `reaberto`, `reason`) to `--output`; without it, to stdout.
//     Whoever reads the CI (the phase, the coordinator) uses this answer, not the reader's impression.
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const AGGREGATOR = 'check';
const COVERAGE = 'coverage';
const TEST_PREFIX = 'test (';

/** Blocks of the top-level jobs: `[name, text]` in file order. */
function jobBlocks(yaml) {
  const start = yaml.search(/^jobs:\s*$/m);
  if (start < 0) throw new Error('ci.yml sem a chave jobs:.');
  const lines = yaml.slice(start).split('\n').slice(1);
  const blocks = [];
  for (const line of lines) {
    if (/^[^\s#]/.test(line)) break;
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key) blocks.push([key[1], []]);
    else if (blocks.length > 0) blocks[blocks.length - 1][1].push(line);
  }
  return blocks.map(([name, body]) => [name, body.join('\n')]);
}

/** Names of the jobs the `ci.yml` run must have (a list matrix becomes `job (value)`). */
export function expectedJobs(yaml) {
  const names = [];
  for (const [name, body] of jobBlocks(yaml)) {
    if (/^ {4}name:/m.test(body)) {
      throw new Error(
        `O job ${name} do ci.yml tem name: próprio; o ci-rerun não sabe lê-lo.`,
      );
    }
    if (!/^ {6}matrix:/m.test(body)) {
      names.push(name);
      continue;
    }
    const matrix = /^ {6}matrix:\n {8}([A-Za-z0-9_-]+): \[([^\]]*)\]\n(?! {8}\S)/m.exec(
      body,
    );
    if (!matrix) {
      throw new Error(
        `A matriz do job ${name} não é uma lista simples (chave: [a, b]); o ci-rerun não sabe lê-la.`,
      );
    }
    for (const value of matrix[2].split(',')) names.push(`${name} (${value.trim()})`);
  }
  return names;
}

/**
 * `expected`: expected names; `jobs`: `[{ name, conclusion }]` of the run.
 * Abandoned = expected but missing. Legitimate failure = present job that did not end in
 * `success`/`skipped`, except the `check` aggregator and `coverage` when some `test (n)` is missing.
 */
export function decideRerun({ expected, jobs }) {
  const seen = new Map(jobs.map((job) => [job.name, job.conclusion]));
  const abandoned = expected.filter((name) => !seen.has(name));
  const testAbandoned = abandoned.some((name) => name.startsWith(TEST_PREFIX));
  const legit = expected.filter((name) => {
    if (!seen.has(name) || name === AGGREGATOR) return false;
    if (name === COVERAGE && testAbandoned) return false;
    const conclusion = seen.get(name);
    return conclusion !== 'success' && conclusion !== 'skipped';
  });
  if (legit.length > 0) {
    return { rerun: false, abandoned, reason: `falha legítima (${legit.join(', ')})` };
  }
  if (abandoned.length === 0) {
    return { rerun: false, abandoned, reason: 'nenhum job abandonado' };
  }
  return { rerun: true, abandoned, reason: `abandonados ${abandoned.join(', ')}` };
}

/** Limit for a run queued with no jobs: more than 900 s since `created_at` (decision 1 of #1669). */
const QUEUED_LIMIT_SECONDS = 900;

/** The commit's runs and the latest of them (greatest `created_at`); `latest` is null with no run. */
export function latestRunOfCommit(runs, head) {
  const ofCommit = runs.filter((run) => run.head_sha === head);
  let latest = null;
  for (const run of ofCommit) {
    const at = Date.parse(run.created_at);
    if (Number.isNaN(at))
      throw new Error(`A execução ${run.id} tem created_at ilegível.`);
    if (latest === null || at > Date.parse(latest.created_at)) latest = run;
  }
  return { ofCommit, latest };
}

/**
 * `runs`: runs of `ci.yml` (`workflow_runs`); `jobsTotal`: `total_count` of the jobs of the commit's
 * latest run; `head`: the PR's `head.sha`; `now`: ISO (or `Date`).
 * Stuck = the commit's latest run (greatest `created_at`) in `queued`, with no jobs, for more than
 * 15 min. `reaberto` = the commit already has 2 or more runs (the PR was already closed and reopened).
 */
export function decideQueued({ runs, jobsTotal, head, now }) {
  const { ofCommit, latest } = latestRunOfCommit(runs, head);
  const empty = {
    preso: false,
    run: '',
    link: '',
    minutos: 0,
    execucoes: 0,
    reaberto: false,
  };
  if (latest === null) return { ...empty, reason: 'sem execução do CI no commit' };
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(nowMs)) throw new Error(`O now (--now) "${now}" não é uma data ISO.`);
  const seconds = Math.floor((nowMs - Date.parse(latest.created_at)) / 1000);
  const minutos = Math.max(0, Math.floor(seconds / 60));
  const decision = {
    preso: false,
    run: String(latest.id),
    link: latest.html_url,
    minutos,
    execucoes: ofCommit.length,
    reaberto: ofCommit.length >= 2,
  };
  if (jobsTotal > 0) return { ...decision, reason: `${jobsTotal} jobs` };
  if (latest.status !== 'queued')
    return { ...decision, reason: `status ${latest.status}` };
  if (seconds <= QUEUED_LIMIT_SECONDS) {
    return { ...decision, reason: `há ${minutos} min (limite 15)` };
  }
  return { ...decision, preso: true, reason: `na fila sem jobs há ${minutos} min` };
}

function option(argv, name) {
  const at = argv.indexOf(name);
  const value = at >= 0 ? argv[at + 1] : undefined;
  return value?.startsWith('--') ? undefined : value;
}

function runDecide(argv) {
  const ci = option(argv, '--ci');
  const jobsFile = option(argv, '--jobs');
  if (!ci || !jobsFile)
    throw new Error(
      'Uso: node scripts/ci/ciRerun.mjs decide --ci <ci.yml> --jobs <arquivo> [--output <arquivo>]',
    );
  const expected = expectedJobs(readFileSync(ci, 'utf8'));
  const payload = JSON.parse(readFileSync(jobsFile, 'utf8'));
  if (!Array.isArray(payload.jobs))
    throw new Error('O arquivo de jobs não tem a lista jobs.');
  const decision = decideRerun({ expected, jobs: payload.jobs });
  const text =
    `rerun=${decision.rerun}\n` +
    `abandoned=${decision.abandoned.join(', ')}\n` +
    `reason=${decision.reason}\n`;
  const output = option(argv, '--output');
  if (output) appendFileSync(output, text);
  else process.stdout.write(text);
  return 0;
}

const QUEUED_USAGE =
  'Uso: node scripts/ci/ciRerun.mjs queued --runs <arquivo> --jobs <arquivo> --head <sha> [--now <ISO>] [--output <arquivo>]';

function runQueued(argv) {
  const runsFile = option(argv, '--runs');
  const jobsFile = option(argv, '--jobs');
  const head = option(argv, '--head');
  if (!runsFile || !jobsFile || !head) throw new Error(QUEUED_USAGE);
  const runsPayload = JSON.parse(readFileSync(runsFile, 'utf8'));
  if (!Array.isArray(runsPayload.workflow_runs))
    throw new Error('O arquivo de execuções não tem a lista workflow_runs.');
  const runs = runsPayload.workflow_runs;
  const latest = latestRunOfCommit(runs, head).latest;
  const now = option(argv, '--now') ?? new Date().toISOString();
  let jobsTotal = 0;
  if (latest !== null) {
    const latestId = String(latest.id);
    const payload = JSON.parse(readFileSync(jobsFile, 'utf8'));
    if (!Array.isArray(payload.jobs) || typeof payload.total_count !== 'number')
      throw new Error('O arquivo de jobs não tem total_count nem a lista jobs.');
    const other = payload.jobs.find((job) => String(job.run_id) !== latestId);
    if (other)
      throw new Error(
        `O job ${other.name ?? '?'} tem run_id ${other.run_id}, diferente da execução mais recente do commit (${latestId}).`,
      );
    jobsTotal = payload.total_count;
  }
  const d = decideQueued({ runs, jobsTotal, head, now });
  const text =
    `preso=${d.preso}\n` +
    `run=${d.run}\n` +
    `link=${d.link}\n` +
    `minutos=${d.minutos}\n` +
    `execucoes=${d.execucoes}\n` +
    `reaberto=${d.reaberto}\n` +
    `reason=${d.reason}\n`;
  const output = option(argv, '--output');
  if (output) appendFileSync(output, text);
  else process.stdout.write(text);
  return 0;
}

function main(argv) {
  if (argv[0] === 'queued') return runQueued(argv);
  if (argv[0] !== 'decide')
    throw new Error(
      'Uso: node scripts/ci/ciRerun.mjs decide --ci <ci.yml> --jobs <arquivo> | queued --runs <arquivo> --jobs <arquivo> --head <sha>',
    );
  return runDecide(argv);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
