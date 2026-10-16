/// <reference types="vitest/config" />
// Build do laboratório (`lab/`): páginas autocontidas à parte da app, publicadas em
// `dist/lab/<página>/index.html` depois do build da app (`npm run build`). Uma página por
// build (`--mode figma`, `--mode components`): o vite-plugin-singlefile embute tudo numa
// entrada só. Experimentos fora do produto: sem service worker nem manifest; a CSP é a mesma
// da app (nenhuma requisição de rede, nada embutido sem hash).
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { applyCsp } from './pwa/csp';
import { tokensCss } from './pwa/tokensCss';

export const LAB_PAGES = ['figma', 'components'] as const;
type LabPage = (typeof LAB_PAGES)[number];

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset')
          throw new Error('index.html não encontrado no bundle');
        html.source = applyCsp(String(html.source));
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const page = (LAB_PAGES as readonly string[]).includes(mode)
    ? (mode as LabPage)
    : undefined;
  if (!page) {
    throw new Error(
      `vite.lab.config.ts: use --mode com uma página do laboratório (${LAB_PAGES.join(', ')})`,
    );
  }
  return {
    root: `lab/${page}`,
    base: './',
    publicDir: false,
    plugins: [tokensCss(), preact(), viteSingleFile(), contentSecurityPolicy()],
    build: {
      outDir: `../../dist/lab/${page}`,
      emptyOutDir: true,
    },
  };
});
