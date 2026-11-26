// CI state of a commit (stage #2783), from the check runs of the GitHub API. Node only, no dependencies.
//   node scripts/ci/ciStatus.mjs --checks <file> [--epico]
//     `<file>` is the output of `gh api repos/<owner>/<repo>/commits/<sha>/check-runs?per_page=100`
//     (an object with `check_runs`, or a bare array of check runs). Only the jobs of `CI_JOBS` count, and
//     only the most recent run (highest `id`) of each name. `--epico` also requires the `epic` job.
//     Writes one line: `ci=<green|red|running|none> sha=<7 characters> failed=<names|none> pending=<names|none>`.
//     Exit code 0 green, 1 red, 3 running, 4 none; 2 on a usage error or an invalid file.
import { readFileSync, realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const USAGE = 'Usage: node scripts/ci/ciStatus.mjs --checks <file> [--epico]';

/** The jobs of `.github/workflows/ci.yml`, the `test` matrix expanded (a test checks the match). */
export const CI_JOBS = [
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
];
const RED = new Set(['failure', 'cancelled', 'timed_out']);
const EXIT = { green: 0, red: 1, running: 3, none: 4 };

const inOrder = (names) => CI_JOBS.filter((name) => names.has(name));

/** State of the commit: `{ ci, sha, failed, pending }` (names in `CI_JOBS` order). */
export function ciState(checkRuns, { epico = false } = {}) {
  const latest = new Map();
  for (const run of checkRuns) {
    if (!CI_JOBS.includes(run.name)) continue;
    const seen = latest.get(run.name);
    if (!seen || run.id > seen.id) latest.set(run.name, run);
  }
  if (latest.size === 0) return { ci: 'none', sha: 'none', failed: [], pending: [] };

  const failed = new Set();
  const pending = new Set();
  for (const [name, run] of latest) {
    if (run.status !== 'completed') pending.add(name);
    else if (RED.has(run.conclusion)) failed.add(name);
  }
  const required = epico ? ['epic', 'check', 'e2e'] : ['check', 'e2e'];
  let allPassed = true;
  for (const name of required) {
    if (
      latest.get(name)?.conclusion === 'success' &&
      latest.get(name).status === 'completed'
    )
      continue;
    allPassed = false;
    if (!failed.has(name)) pending.add(name);
  }
  const ci =
    failed.size > 0 ? 'red' : allPassed && pending.size === 0 ? 'green' : 'running';
  const first = [...latest.values()][0];
  return {
    ci,
    sha: String(first.head_sha ?? '').slice(0, 7) || 'none',
    failed: inOrder(failed),
    pending: inOrder(pending),
  };
}

function parseArgs(argv) {
  let checks;
  let epico = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--checks') {
      const value = argv[++i];
      if (checks !== undefined || value === undefined || value.startsWith('--'))
        throw new Error(USAGE);
      checks = value;
    } else if (arg === '--epico') {
      if (epico) throw new Error(USAGE);
      epico = true;
    } else throw new Error(USAGE);
  }
  if (checks === undefined) throw new Error(USAGE);
  return { checks, epico };
}

function readRuns(path) {
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read check runs from ${path}: ${error.message}`, {
      cause: error,
    });
  }
  const runs = Array.isArray(data) ? data : data?.check_runs;
  if (!Array.isArray(runs))
    throw new Error(`${path}: expected an array or an object with "check_runs"`);
  for (const run of runs) {
    if (run === null || typeof run !== 'object' || typeof run.name !== 'string')
      throw new Error(`${path}: every check run needs a string "name"`);
    if (typeof run.id !== 'number' || !Number.isFinite(run.id))
      throw new Error(`${path}: every check run needs a finite numeric "id"`);
  }
  return runs;
}

/** Runs the CLI and returns the exit code; a usage error or an invalid file throws. */
export function run(argv) {
  const { checks, epico } = parseArgs(argv);
  const state = ciState(readRuns(checks), { epico });
  const list = (names) => (names.length > 0 ? names.join(',') : 'none');
  process.stdout.write(
    `ci=${state.ci} sha=${state.sha} failed=${list(state.failed)} pending=${list(state.pending)}\n`,
  );
  return EXIT[state.ci];
}

/** True when this file is the entry point; `import.meta.url` is realpath-resolved, `argv[1]` is not. */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}
