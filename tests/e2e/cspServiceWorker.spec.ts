import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { addImage, createProject, isMobile, watchViolations } from './helpers';

// Etapa 2.4: a CSP com o service worker (instalação, cache, aviso de nova versão),
// na versão principal (/) e no preview (/preview/), como no GitHub Pages.

const DIST = join(process.cwd(), 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Serve pastas de build por `https://` (o service worker só existe em https), como o
 * GitHub Pages: `/` vem do build principal e `/preview/` do build do preview. O
 * certificado é autoassinado (openssl) e o contexto do teste ignora o erro dele.
 */
async function serveSite(
  dirs: { readonly main: string; readonly preview: string },
  state: { swVersionSuffix: string },
): Promise<{ readonly origin: string; readonly close: () => Promise<void> }> {
  const certDir = mkdtempSync(join(tmpdir(), 'mapeador-cert-'));
  const key = join(certDir, 'key.pem');
  const cert = join(certDir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ].concat(['-addext', 'subjectAltName=DNS:localhost', '-keyout', key, '-out', cert]),
    { stdio: 'ignore' },
  );
  const server = createServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      const { pathname } = new URL(request.url ?? '/', 'https://localhost');
      const isPreview = pathname === '/preview' || pathname.startsWith('/preview/');
      const dir = isPreview ? dirs.preview : dirs.main;
      const relative = (isPreview ? pathname.slice('/preview'.length) : pathname).replace(
        /^\/+/,
        '',
      );
      const file = normalize(join(dir, relative === '' ? 'index.html' : relative));
      if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404).end('não encontrado');
        return;
      }
      let body = readFileSync(file);
      if (file.endsWith('sw.js') && state.swVersionSuffix) {
        // Simula um build novo: o sw.js muda, e é isso que o navegador detecta.
        body = Buffer.from(
          body
            .toString('utf8')
            .replace(
              /const VERSION = '([^']*)'/,
              (_m, v: string) => `const VERSION = '${v}${state.swVersionSuffix}'`,
            ),
        );
      }
      response.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      response.end(body);
    },
  );
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `https://localhost:${port}`,
    close: () =>
      new Promise((resolve) => {
        // O navegador mantém conexões keep-alive abertas: sem fechá-las, close() não termina.
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

let openSite: { readonly close: () => Promise<void> } | null = null;
test.afterEach(async () => {
  await openSite?.close();
  openSite = null;
});

// Servidor https local com certificado autoassinado: o service worker só se registra
// com o certificado aceito pelo navegador inteiro (não basta `ignoreHTTPSErrors`).
test.use({
  ignoreHTTPSErrors: true,
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--ignore-certificate-errors'],
  },
});

test('GitHub Pages e preview: service worker instala, faz cache e avisa da versão nova', async ({
  page,
  context,
}, info) => {
  test.skip(isMobile(info), 'o service worker é o mesmo; roda só no desktop');
  // Inclui o build do preview (VITE_CHANNEL=preview) numa pasta temporária.
  test.setTimeout(90_000);
  const previewDir = mkdtempSync(join(tmpdir(), 'mapeador-preview-'));
  execFileSync(
    'npx',
    ['vite', 'build', '--outDir', previewDir, '--emptyOutDir', '--logLevel', 'error'],
    { env: { ...process.env, VITE_CHANNEL: 'preview' }, stdio: 'inherit' },
  );
  const state = { swVersionSuffix: '' };
  const site = await serveSite({ main: DIST, preview: previewDir }, state);
  openSite = site;
  const origin = site.origin;
  const violations = await watchViolations(page);

  // Versão principal: instala o service worker e o precache completo.
  await page.goto(`${origin}/`);
  await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await caches.keys();
        const cache = names.find((n) => n.startsWith('mapeador-'));
        return cache ? (await (await caches.open(cache)).keys()).length : 0;
      }),
    )
    .toBeGreaterThanOrEqual(7);
  // O manifest (manifest-src 'self') foi ligado pela app.
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute(
    'href',
    './manifest.webmanifest',
  );

  // A app continua usável com o service worker no controle (offline inclusive).
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await createProject(page, 'Projeto SW', `${origin}/`);
  await addImage(page);
  // Versão nova: o sw.js muda → aviso → Atualizar → recarrega com o cache novo.
  state.swVersionSuffix = '-nova';
  await page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((r) => r?.update()),
  );
  await expect(page.getByText('Nova versão disponível.')).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByText('Nova versão disponível.')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual([expect.stringMatching(/-nova$/)]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
  await context.setOffline(false);

  // Preview em /preview/: outro build, outro service worker, mesma política.
  await page.goto(`${origin}/preview/`);
  await expect(page.getByText('PREVIEW', { exact: true }).first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.map((r) => new URL(r.scope).pathname).sort();
      }),
    )
    .toEqual(['/', '/preview/']);
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).some((n) => n.startsWith('mapeador-preview-')),
      ),
    )
    .toBe(true);
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("connect-src 'none'");

  expect(violations()).toEqual([]);
});
