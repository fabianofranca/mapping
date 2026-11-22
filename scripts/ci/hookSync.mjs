// Does `main` hold a hook change the epic does not have yet? (stage #2635, phase CT2). Node only, no dependencies.
// A child session is born on `epic/<name>` and Claude Code loads the hooks of that checkout when the session
// starts, so a hook change on `main` only reaches an epic in progress if `main` is merged into it BEFORE the
// session is created. The coordinator runs this before each phase, fix, retest or tester session.
//   node scripts/ci/hookSync.mjs <epic-ref> [--main <ref>]
//     Compares local refs only (`--main` defaults to `origin/main`): the caller fetches first with
//     `git fetch -q --depth=500 origin main epic/<name>` and passes `origin/epic/<name>`.
//     Merge base of the two refs, then `git diff --name-only <base> <main> -- <HOOK_FILES>`.
//     `hook in sync` (exit 0); `bring main: <files, comma separated>` (exit 1);
//     `bring main: no base (<reason>)` (exit 1: a shallow history or a git error is the safe side, the sync
//     then ends with `Already up to date` at worst); a usage error writes to stderr (exit 2).
// Whoever adds a hook adds its files to `HOOK_FILES` in the same PR (`tests/tooling/hookSync.test.ts` checks it).
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * The hook's files: `.claude/settings.json`, every file its hooks run (`$CLAUDE_PROJECT_DIR/<path>` in each
 * hook `command`) and the local modules those scripts import.
 */
export const HOOK_FILES = [
  '.claude/settings.json',
  '.claude/hooks/session-start.sh',
  'scripts/ci/contextGuard.mjs',
  'scripts/ci/contextUsage.mjs',
];

const USAGE = 'Uso: node scripts/ci/hookSync.mjs <epic-ref> [--main <ref>]';

/** `{ epic, main }` from the arguments, or `null` on a usage error. */
function parseArgs(argv) {
  let main = 'origin/main';
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--main') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) return null;
      main = value;
    } else if (argv[i].startsWith('--')) {
      return null;
    } else {
      positional.push(argv[i]);
    }
  }
  return positional.length === 1 ? { epic: positional[0], main } : null;
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.error) return { ok: false, reason: r.error.message };
  if (r.status !== 0) {
    const reason = (r.stderr || r.stdout || `git exited ${r.status}`)
      .trim()
      .split('\n')[0];
    return { ok: false, reason };
  }
  return { ok: true, out: r.stdout.trim() };
}

/** The hook files `main` changed since the merge base, or a reason when the base cannot be found. */
export function hookChanges(epic, main) {
  const base = git(['merge-base', main, epic]);
  if (!base.ok || base.out === '')
    return { reason: base.ok ? 'empty merge base' : base.reason };
  const diff = git(['diff', '--name-only', base.out, main, '--', ...HOOK_FILES]);
  if (!diff.ok) return { reason: diff.reason };
  return { files: diff.out === '' ? [] : diff.out.split('\n') };
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const result = hookChanges(args.epic, args.main);
  if (result.reason !== undefined) {
    process.stdout.write(`bring main: no base (${result.reason})\n`);
    return 1;
  }
  if (result.files.length === 0) {
    process.stdout.write('hook in sync\n');
    return 0;
  }
  process.stdout.write(`bring main: ${result.files.join(', ')}\n`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
