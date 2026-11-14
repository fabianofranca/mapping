// Build channel: `main` (production) or `preview` (a branch published at /preview/
// by `workflow_dispatch`). The preview uses separate storage so it never migrates
// nor deletes the projects of the main version (docs/ARCHITECTURE.md, "Isolated preview").

export type Channel = 'main' | 'preview';

export function parseChannel(value: unknown): Channel {
  return value === 'preview' ? 'preview' : 'main';
}

/** Channel of this build, defined by `VITE_CHANNEL` at build time. */
export const CHANNEL: Channel = parseChannel(import.meta.env.VITE_CHANNEL);

export const isPreview = CHANNEL === 'preview';

/** `localStorage` key in the channel: the preview gets the `preview:` prefix. */
export function channelStorageKey(key: string, channel: Channel = CHANNEL): string {
  return channel === 'preview' ? `preview:${key}` : key;
}

/** IndexedDB database name in the channel: the preview gets the `-preview` suffix. */
export function channelDbName(name: string, channel: Channel = CHANNEL): string {
  return channel === 'preview' ? `${name}-preview` : name;
}
