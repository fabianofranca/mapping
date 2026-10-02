// Transformações dos arquivos do PWA na hora do build (usadas por vite.config.ts).

export type BuildChannel = 'main' | 'preview';

/** Nome da app instalada a partir do preview (PLAN.md 14.3). */
export const PREVIEW_APP_NAME = 'Mapeador (preview)';

/** Carimba o sw.js com o id do build e o canal. */
export function stampServiceWorker(
  source: string,
  buildId: string,
  channel: BuildChannel,
): string {
  return source.replaceAll('__BUILD_ID__', buildId).replaceAll('__CHANNEL__', channel);
}

/**
 * Manifest do canal. O do preview muda só o nome: `start_url` e `scope` são
 * relativos (`./`) e já apontam para /preview/, o que também o torna outra app.
 */
export function channelManifest(source: string, channel: BuildChannel): string {
  if (channel === 'main') return source;
  const manifest: unknown = JSON.parse(source);
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('manifest.webmanifest inválido');
  }
  const preview = { ...manifest, name: PREVIEW_APP_NAME, short_name: PREVIEW_APP_NAME };
  return `${JSON.stringify(preview, null, 2)}\n`;
}
