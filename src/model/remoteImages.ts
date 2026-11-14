import type { SceneNode } from './components/scene';
// Pure policy for the remote image URL (docs/ARCHITECTURE.md, "Remote images: policy, consent and
// loader"). It is the first of two gates: it decides whether the URL is acceptable; the second is
// the per-origin consent, kept in `src/storage/` (RI3). It only uses `URL`, available in the
// browser and in Node.

export const REMOTE_IMAGE_URL_MAX_LENGTH = 2048;

export type RemoteImageRejection =
  'empty' | 'invalid' | 'insecure' | 'credentials' | 'too-long' | 'private-host';

export interface RemoteImagePolicy {
  /** Accepts `http:` (switch of decision 15). */
  readonly allowHttp: boolean;
  /** Accepts local-network hosts (switch of decision 16). */
  readonly allowLocalNetwork: boolean;
}

export type RemoteImageCheck =
  | {
      readonly ok: true;
      readonly url: string;
      readonly origin: string;
      readonly local: boolean;
    }
  | { readonly ok: false; readonly reason: RemoteImageRejection };

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;
const LOCAL_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.home.arpa',
  '.lan',
  '.intranet',
];

/**
 * Local-network host (decision 16): literal v4/v6 IP, `localhost`, a name with no dot, and the
 * suffixes `.local`, `.localhost`, `.internal`, `.home.arpa`, `.lan`, `.intranet`. Every literal IP
 * counts, public ones included. An empty hostname is treated as local (refused for safety).
 */
export function isLocalNetworkHost(hostname: string): boolean {
  let host = hostname.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host === '') return true;
  // The URL's `hostname` carries IPv6 inside brackets.
  if (host.startsWith('[') || host.includes(':')) return true;
  if (IPV4_LITERAL.test(host)) return true;
  if (host === 'localhost') return true;
  if (!host.includes('.')) return true;
  return LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function checkRemoteImageUrl(
  value: unknown,
  policy: RemoteImagePolicy,
): RemoteImageCheck {
  if (typeof value !== 'string') return { ok: false, reason: 'empty' };
  const text = value.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (text.length > REMOTE_IMAGE_URL_MAX_LENGTH) return { ok: false, reason: 'too-long' };

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol === 'http:' && !policy.allowHttp)
    return { ok: false, reason: 'insecure' };
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'credentials' };
  }
  const local = isLocalNetworkHost(parsed.hostname);
  if (local && !policy.allowLocalNetwork) return { ok: false, reason: 'private-host' };
  return { ok: true, url: parsed.href, origin: parsed.origin, local };
}

/**
 * Remote image URLs used by a scene (`paint.url` of the `image` paints in `fills`), in order of
 * appearance and without repeats. It does not apply the policy: `checkRemoteImageUrl` decides that.

 */
export function sceneRemoteImageUrls(root: SceneNode): readonly string[] {
  const urls = new Set<string>();
  const visit = (node: SceneNode): void => {
    for (const paint of node.fills) {
      if (paint.type === 'image' && paint.url !== undefined && paint.url !== '') {
        urls.add(paint.url);
      }
    }
    if (node.type === 'frame' || node.type === 'group') {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
  return [...urls];
}
