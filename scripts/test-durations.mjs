// Regenerates tests/support/durations.json (relative path → seconds) for the shard
// sequencer (tests/support/timedSequencer.ts). Measures like CI: the 4 shards, one after the
// other, with coverage and no report. Measuring the whole suite at once inflates the component
// files (jsdom competes for CPU) and unbalances the shards; with a single worker Vitest
// kills the process (vmThreads). A file's time changes a little with its shard neighbors,
// so running again refines it (each round uses the split of the previous one). Takes ~3 min; only
// needs to run when the suite changes a lot. Stale times unbalance, but never lose a file.
//   npm run test:durations                    runs the 4 shards and writes the times
//   npm run test:durations -- a.json b.json   uses already generated reports (`--reporter=json`)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join, relative } from 'node:path';

const SHARDS = 4;
const root = process.cwd();
const target = join(root, 'tests/support/durations.json');

/** Vitest `--reporter=json` report → pairs [relative path, seconds with 1 decimal place]. */
function durationsFromReport(file) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  return report.testResults.map((result) => [
    relative(root, result.name).split('\\').join('/'),
    Math.round(((result.endTime - result.startTime) / 1000) * 10) / 10,
  ]);
}

function runShards(dir) {
  return Array.from({ length: SHARDS }, (_, i) => {
    const file = join(dir, `shard-${i + 1}.json`);
    execFileSync(
      'npx',
      [
        'vitest',
        'run',
        '--coverage',
        `--shard=${i + 1}/${SHARDS}`,
        '--reporter=json',
        `--outputFile=${file}`,
      ],
      { stdio: 'inherit', env: { ...process.env, COVERAGE_REPORT: 'off' } },
    );
    return file;
  });
}

const given = process.argv.slice(2);
const dir = given.length ? undefined : mkdtempSync(join(tmpdir(), 'durations-'));
try {
  const files = given.length ? given : runShards(dir);
  const entries = files.flatMap(durationsFromReport);
  const sorted = entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  writeFileSync(target, JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n');
  process.stdout.write(`${sorted.length} files in ${relative(root, target)}\n`);
} finally {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
