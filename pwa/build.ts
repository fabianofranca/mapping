// Transformations of the PWA files at build time (used by vite.config.ts).

export type BuildChannel = 'main' | 'preview';

/** Name of the app installed from the preview (docs/ARCHITECTURE.md, "Isolated preview"). */
export const PREVIEW_APP_NAME = 'Mapping (preview)';

/** Stamps sw.js with the build id and the channel. */
export function stampServiceWorker(
  source: string,
  buildId: string,
  channel: BuildChannel,
): string {
  return source.replaceAll('__BUILD_ID__', buildId).replaceAll('__CHANNEL__', channel);
}

/**
 * The channel's manifest. The preview one changes only the name: `start_url` and `scope` are
 * relative (`./`) and already point to /preview/, which also makes it a different app.
 */
export function channelManifest(source: string, channel: BuildChannel): string {
  if (channel === 'main') return source;
  const manifest: unknown = JSON.parse(source);
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('invalid manifest.webmanifest');
  }
  const preview = { ...manifest, name: PREVIEW_APP_NAME, short_name: PREVIEW_APP_NAME };
  return `${JSON.stringify(preview, null, 2)}\n`;
}
