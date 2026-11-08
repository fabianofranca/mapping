// Plugins do Vite que fecham o `index.html` (usados por vite.config.ts e por tests/app/pluginOrder.test.ts).
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { channelManifest, stampServiceWorker, type BuildChannel } from './build';
import { applyCsp } from './csp';

/** FNV-1a de 32 bits em hexadecimal: basta para distinguir um build do outro. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Content Security Policy do `index.html` (etapa 2.4). Precisa ver o HTML já com o JS e o
 * CSS embutidos, então roda depois do vite-plugin-singlefile e antes do `serviceWorker()`,
 * cujo hash do build precisa enxergar o HTML já com a CSP. Se a política não bater com
 * os blocos embutidos, o build falha.
 *
 * A ordem não depende da versão do singlefile (a 2.3.3 embute na fase normal; a 2.3.4, em
 * `order: 'post'`): os nossos plugins têm `enforce: 'post'` (rodam depois dos plugins comuns
 * e do singlefile na lista) e `generateBundle` com `order: 'post'`; entre eles vale a ordem
 * da lista do `vite.config.ts` (singlefile, CSP, sw). Travado por `tests/app/pluginOrder.test.ts`.
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
        if (html?.type !== 'asset')
          throw new Error('index.html não encontrado no bundle');
        html.source = applyCsp(String(html.source), 'app');
      },
    },
  };
}

/**
 * Publica o service worker (`pwa/sw.js`) carimbado com um hash do index.html:
 * cada build novo muda o sw.js, e é isso que faz o navegador detectar a
 * "nova versão". Publica também o manifest do canal (o do preview tem outro
 * nome). Ficam fora de `public/` para poderem ser transformados.
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
        if (html?.type !== 'asset')
          throw new Error('index.html não encontrado no bundle');
        // O guia (public/guia/, gerado antes do build) também está no cache: mudou, o sw.js muda.
        const guide = readFileSync('public/guia/index.html', 'utf8');
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
