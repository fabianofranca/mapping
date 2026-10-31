import type { SceneNode } from './components/scene';
// Política pura da URL de imagem remota (PLAN.md, etapa Imagens remotas, decisões 3, 15 e 16).
// É a primeira das duas portas: decide se a URL é aceitável; a segunda é o consentimento
// por origem, guardado em `src/storage/` (RI3). Só usa `URL`, disponível no navegador e no Node.

export const REMOTE_IMAGE_URL_MAX_LENGTH = 2048;

export type RemoteImageRejection =
  'empty' | 'invalid' | 'insecure' | 'credentials' | 'too-long' | 'private-host';

export interface RemoteImagePolicy {
  /** Aceita `http:` (interruptor da decisão 15). */
  readonly allowHttp: boolean;
  /** Aceita hosts da rede local (interruptor da decisão 16). */
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
const LOCAL_SUFFIXES = ['.local', '.localhost', '.internal'];

/**
 * Host da rede local (decisão 16): IP literal v4/v6, `localhost`, nome sem ponto
 * e sufixos `.local`, `.localhost`, `.internal`. Todo IP literal conta, inclusive público.
 * Hostname vazio é tratado como local (recusa por segurança).
 */
export function isLocalNetworkHost(hostname: string): boolean {
  let host = hostname.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host === '') return true;
  // O `hostname` do URL traz o IPv6 entre colchetes.
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
 * URLs remotas de imagem usadas por uma cena (`paint.url` dos preenchimentos `image` de `fills`),
 * em ordem de aparição e sem repetir. Não aplica a política: quem decide é `checkRemoteImageUrl`.
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
