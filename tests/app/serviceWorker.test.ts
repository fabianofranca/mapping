import { describe, expect, it, vi } from 'vitest';
import source from '../../pwa/sw.js?raw';

type Listener = (event: Record<string, unknown>) => void;

/** Runs sw.js with a fake `self`/`caches` and returns what it recorded. */
function loadWorker(cacheNames: string[] = [], channel: 'main' | 'preview' = 'main') {
  const fetched: { url: string; cache: string }[] = [];
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
  class FakeRequest {
    readonly url: string;
    readonly cache: string;
    constructor(url: string, init: { cache?: string } = {}) {
      this.url = url;
      this.cache = init.cache ?? 'default';
    }
  }
  const fetchMock = vi.fn(async (request: FakeRequest) => {
    fetched.push({ url: request.url, cache: request.cache });
    return { ok: true, url: request.url };
  });
  const caches = {
    keys: async () => cacheNames,
    delete: async (name: string) => void deleted.push(name),
    open: async (name: string) => ({
      addAll: async (requests: (string | FakeRequest)[]) => {
        for (const r of requests) {
          const request = typeof r === 'string' ? new FakeRequest(r) : r;
          await fetchMock(request);
          store(name).set(request.url, 'cached');
        }
      },
      put: async (request: { url: string }) =>
        void store(name).set(request.url, 'cached'),
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
  const stamped = source.replaceAll('__CHANNEL__', channel);
  new Function('self', 'caches', 'fetch', 'Request', stamped)(
    self,
    caches,
    fetchMock,
    FakeRequest,
  );
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
  return { dispatch, skipWaiting, claim, stored, deleted, fetched };
}

describe('sw.js', () => {
  it('installs the app in the cache without activating by itself (waits for the user)', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    const [cache] = [...worker.stored.values()];
    expect(cache?.has('https://example.com/app/index.html')).toBe(true);
    expect(cache?.has('https://example.com/app/manifest.webmanifest')).toBe(true);
  });

  it('the interactive guide enters the install cache and works offline', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    const [cache] = [...worker.stored.values()];
    expect(cache?.has('https://example.com/app/guia/index.html')).toBe(true);
    // Navigation to the guide (with or without index.html, with a query) comes from the cache, not the network.
    for (const path of ['guia/', 'guia/index.html', 'guia/index.html?x=1']) {
      const [response] = await worker.dispatch('fetch', {
        request: {
          method: 'GET',
          mode: 'navigate',
          url: `https://example.com/app/${path}`,
        },
      });
      expect(response, path).toBe('cached');
    }
  });

  it('the preview guide belongs to the preview: the main version does not answer for it', async () => {
    const main = loadWorker();
    await main.dispatch('install');
    const responses = await main.dispatch('fetch', {
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/app/preview/guia/index.html',
      },
    });
    expect(responses).toEqual([]);
    const preview = loadWorker([], 'preview');
    await preview.dispatch('install');
    const [response] = await preview.dispatch('fetch', {
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/app/guia/',
      },
    });
    expect(response).toBe('cached');
  });

  it('the precache ignores the browser HTTP cache (cache: reload)', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    expect(worker.fetched.length).toBeGreaterThan(0);
    expect(worker.fetched.every((r) => r.cache === 'reload')).toBe(true);
    expect(worker.fetched.map((r) => r.url)).toContain(
      'https://example.com/app/index.html',
    );
  });

  it('activates when the app sends SKIP_WAITING', async () => {
    const worker = loadWorker();
    await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  // pt-BR kept: the cache prefix `mapeador-` is the legacy identifier kept by pwa/sw.js (before the rename to Mapping)
  it('deletes only old app caches on activation', async () => {
    const worker = loadWorker(['mapeador-old', 'other-site', 'mapeador-__BUILD_ID__']);
    await worker.dispatch('activate');
    expect(worker.deleted).toContain('mapeador-old');
    expect(worker.deleted).not.toContain('other-site');
    expect(worker.claim).toHaveBeenCalled();
  });

  it('main version and preview do not delete each other cache', async () => {
    const names = [
      'mapeador-old',
      'mapeador-preview-old',
      'mapeador-__BUILD_ID__',
      'mapeador-preview-__BUILD_ID__',
    ];
    const main = loadWorker(names);
    await main.dispatch('activate');
    expect(main.deleted).toEqual(['mapeador-old']);

    const preview = loadWorker(names, 'preview');
    await preview.dispatch('activate');
    expect(preview.deleted).toEqual(['mapeador-preview-old']);
  });

  it('the preview installs in its own cache', async () => {
    const worker = loadWorker([], 'preview');
    await worker.dispatch('install');
    expect([...worker.stored.keys()]).toEqual(['mapeador-preview-__BUILD_ID__']);
  });

  it('the main version does not answer for the preview pages', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    // Without the trailing slash too: GitHub Pages redirects `/preview` to `/preview/`.
    for (const path of ['preview/', 'preview', 'preview?x=1', 'preview/sw.js']) {
      const responses = await worker.dispatch('fetch', {
        request: {
          method: 'GET',
          mode: 'navigate',
          url: `https://example.com/app/${path}`,
        },
      });
      expect(responses, path).toEqual([]);
    }
  });

  it('the main version answers for paths that merely start with "preview"', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    const responses = await worker.dispatch('fetch', {
      request: {
        method: 'GET',
        mode: 'no-cors',
        url: 'https://example.com/app/previews/icon.png',
      },
    });
    // It is not the preview's: the main version takes the request (cache, then network).
    expect(responses).toHaveLength(1);
  });

  it('navigation to another page of the site (e.g. other/) goes to the network, not to index.html', async () => {
    for (const channel of ['main', 'preview'] as const) {
      const worker = loadWorker([], channel);
      await worker.dispatch('install');
      for (const path of ['other/', 'other/index.html', 'other.html']) {
        const responses = await worker.dispatch('fetch', {
          request: {
            method: 'GET',
            mode: 'navigate',
            url: `https://example.com/app/${path}`,
          },
        });
        expect(responses, `${channel} ${path}`).toEqual([]);
      }
    }
  });

  it('navigation to the page itself serves index.html from the cache', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    for (const path of ['', 'index.html', 'index.html?x=1']) {
      const [response] = await worker.dispatch('fetch', {
        request: {
          method: 'GET',
          mode: 'navigate',
          url: `https://example.com/app/${path}`,
        },
      });
      expect(response, path).toBe('cached');
    }
  });

  it('navigation serves index.html from the cache, even with a query', async () => {
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

  it('ignores POST and other origins', async () => {
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
