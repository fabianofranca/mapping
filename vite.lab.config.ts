/// <reference types="vitest/config" />
// Build do laboratório (`lab/`): páginas autocontidas à parte da app, publicadas em
// `dist/lab/<página>/index.html` depois do build da app (`npm run build`). Uma página por
// build (`--mode components`, `--mode react`): o vite-plugin-singlefile embute tudo numa
// entrada só. A página `react` usa React de verdade (sem o plugin `preact()`, que apelida
// react para preact/compat): é a prova de que o visualizador embutível roda num hospedeiro React.
// Experimentos fora do produto: sem service worker nem manifest; a CSP é a mesma da app
// (nenhuma requisição de rede, nada embutido sem hash). Os tokens da app (`tokensCss()`) entram
// só na página `components`; a `react` tem variáveis próprias (`--demo-*`) em `react.css`.
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { applyCsp } from './pwa/csp';
import { tokensCss } from './pwa/tokensCss';

export const LAB_PAGES = ['components', 'react'] as const;
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
  const isReact = page === 'react';
  return {
    root: `lab/${page}`,
    base: './',
    publicDir: false,
    plugins: [
      ...(isReact ? [] : [tokensCss()]),
      ...(isReact ? [] : [preact()]),
      viteSingleFile(),
      contentSecurityPolicy(),
    ],
    esbuild: isReact ? { jsx: 'automatic', jsxImportSource: 'react' } : undefined,
    build: {
      outDir: `../../dist/lab/${page}`,
      emptyOutDir: true,
    },
  };
});
