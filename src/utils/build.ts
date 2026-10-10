// Identificação do build (fase 5.4): SHA curto do commit mais a data do build, para
// um relato de problema dizer de qual versão veio. O `index.html` avulso circula sem
// o repositório, por isso a data. O valor é injetado por `define` no vite.config.ts.

/** Injetado pelo build (`define` no vite.config.ts); ausente fora dele. */
declare const __BUILD_ID__: string | undefined;

/** `abc1234 · 2026-10-10`. */
export function formatBuildId(sha: string, date: Date): string {
  return `${sha.slice(0, 7)} · ${date.toISOString().slice(0, 10)}`;
}

/**
 * Build id no momento do build: o commit do git (o `deploy.yml` faz checkouts próprios
 * da `main` e do preview, cujo commit não é o `GITHUB_SHA` da execução); sem git, o
 * `GITHUB_SHA` do CI; sem os dois, `dev`.
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
    // Sem git (ex.: código baixado como zip).
  }
  sha ||= source.githubSha?.trim() ?? '';
  return formatBuildId(sha || 'dev', source.now);
}

/** Build id deste build. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
