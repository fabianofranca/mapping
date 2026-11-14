// Plugins do Vite que fecham o `index.html` (usados por vite.config.ts e por tests/app/pluginOrder.test.ts).
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { channelManifest, stampServiceWorker, type BuildChannel } from './build';
import { applyCsp } from './csp';

/** 32-bit FNV-1a in hexadecimal: enough to tell one build from another. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Content Security Policy of the `index.html` (stage 2.4). It needs to see the HTML with the JS
 * and CSS already embedded, so it runs after vite-plugin-singlefile and before `serviceWorker()`,
 * whose build hash must see the HTML already carrying the CSP. If the policy does not match
 * the embedded blocks, the build fails.
 *
 * The order does not depend on the singlefile version (2.3.3 embeds in the normal phase; 2.3.4,
 * in `order: 'post'`): our plugins have `enforce: 'post'` (they run after the regular plugins
 * and after singlefile in the list) and `generateBundle` with `order: 'post'`; between them the
 * order of the `vite.config.ts` list holds (singlefile, CSP, sw). Locked by `tests/app/pluginOrder.test.ts`.
 */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    enforce: 'post',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset') throw new Error('index.html not found in the bundle');
        html.source = applyCsp(String(html.source), 'app');
      },
    },
  };
}

/**
 * Publishes the service worker (`pwa/sw.js`) stamped with a hash of the index.html:
 * every new build changes the sw.js, and that is what makes the browser detect the
 * "new version". It also publishes the channel's manifest (the preview one has another
 * name). They stay outside `public/` so they can be transformed.
 */
export function serviceWorker(channel: BuildChannel): Plugin {
  return {
    name: 'service-worker',
    enforce: 'post',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset') throw new Error('index.html not found in the bundle');
        // The guide (public/guide/, generated before the build) and the redirect page of its old
        // address (public/guia/) are in the cache too: if they change, the sw.js changes.
        const guide =
          readFileSync('public/guide/index.html', 'utf8') +
          readFileSync('public/guia/index.html', 'utf8');
        const sw = stampServiceWorker(
          readFileSync('pwa/sw.js', 'utf8'),
          hash(String(html.source) + guide),
          channel,
        );
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
        const manifest = channelManifest(
          readFileSync('pwa/manifest.webmanifest', 'utf8'),
          channel,
        );
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.webmanifest',
          source: manifest,
        });
      },
    },
  };
}
