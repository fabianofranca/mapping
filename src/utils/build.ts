// Build identification (phase 5.4): short commit SHA plus the build date, so
// a problem report says which version it came from. The standalone `index.html` circulates without
// the repository, hence the date. The value is injected by `define` in vite.config.ts.

/** Injected by the build (`define` in vite.config.ts); absent outside it. */
declare const __BUILD_ID__: string | undefined;

/** `abc1234 · 2026-10-10`. */
export function formatBuildId(sha: string, date: Date): string {
  return `${sha.slice(0, 7)} · ${date.toISOString().slice(0, 10)}`;
}

/**
 * Build id at build time: the git commit (`deploy.yml` makes its own checkouts
 * of `main` and of the preview, whose commit is not the run's `GITHUB_SHA`); without git, the
 * CI's `GITHUB_SHA`; without both, `dev`.
 */
export function resolveBuildId(source: {
  readonly githubSha: string | undefined;
  readonly gitSha: () => string;
  readonly now: Date;
}): string {
  let sha = '';
  try {
    sha = source.gitSha().trim();
  } catch {
    // Without git (e.g. code downloaded as a zip).
  }
  sha ||= source.githubSha?.trim() ?? '';
  return formatBuildId(sha || 'dev', source.now);
}

/** Build id deste build. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
