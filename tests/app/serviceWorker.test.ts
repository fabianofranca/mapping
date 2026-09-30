import { describe, expect, it, vi } from 'vitest';
import source from '../../pwa/sw.js?raw';

type Listener = (event: Record<string, unknown>) => void;

/** Executa o sw.js com um `self`/`caches` falsos e devolve o que ele registrou. */
function loadWorker(cacheNames: string[] = []) {
  const listeners = new Map<string, Listener>();
  const skipWaiting = vi.fn();
  const claim = vi.fn();
  const stored = new Map<string, Map<string, string>>();
  const deleted: string[] = [];
  const store = (name: string) => {
    let cache = stored.get(name);
    if (!cache) stored.set(name, (cache = new Map()));
    return cache;
  };
  const caches = {
    keys: async () => cacheNames,
    delete: async (name: string) => void deleted.push(name),
    open: async (name: string) => ({
      addAll: async (urls: string[]) => urls.forEach((u) => store(name).set(u, 'cached')),
      match: async (key: string | { url: string }) =>
        store(name).get(typeof key === 'string' ? key : key.url),
    }),
  };
  const self = {
    registration: { scope: 'https://example.com/app/' },
    location: { origin: 'https://example.com' },
    clients: { claim },
    skipWaiting,
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  new Function('self', 'caches', 'fetch', source)(self, caches, vi.fn());
  const dispatch = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    const responses: Promise<unknown>[] = [];
    listeners.get(type)?.({
      ...event,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<unknown>) => responses.push(p),
    });
    await Promise.all(waits);
    return Promise.all(responses);
  };
  return { dispatch, skipWaiting, claim, stored, deleted };
}

describe('sw.js', () => {
  it('instala o app no cache sem ativar sozinho (espera o usuário)', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    const [cache] = [...worker.stored.values()];
    expect(cache?.has('https://example.com/app/index.html')).toBe(true);
    expect(cache?.has('https://example.com/app/manifest.webmanifest')).toBe(true);
  });

  it('ativa quando o app manda SKIP_WAITING', async () => {
    const worker = loadWorker();
    await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  it('apaga só caches antigos do app ao ativar', async () => {
    const worker = loadWorker(['mapeador-antigo', 'outro-site', 'mapeador-__BUILD_ID__']);
    await worker.dispatch('activate');
    expect(worker.deleted).toContain('mapeador-antigo');
    expect(worker.deleted).not.toContain('outro-site');
    expect(worker.claim).toHaveBeenCalled();
  });

  it('navegação serve o index.html do cache, mesmo com query', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    const [response] = await worker.dispatch('fetch', {
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/app/?utm=1',
      },
    });
    expect(response).toBe('cached');
  });

  it('ignora POST e outras origens', async () => {
    const worker = loadWorker();
    const post = await worker.dispatch('fetch', {
      request: { method: 'POST', mode: 'cors', url: 'https://example.com/app/x' },
    });
    const other = await worker.dispatch('fetch', {
      request: { method: 'GET', mode: 'cors', url: 'https://other.com/x' },
    });
    expect(post).toEqual([]);
    expect(other).toEqual([]);
  });
});
