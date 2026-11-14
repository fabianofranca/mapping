import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { addImage, createProject, watchViolations } from './helpers';
import { solidPng } from './png';

// Stage 2.4: the CSP with the service worker (installation, cache, new version notice),
// on the main version (/) and on the preview (/preview/), like on GitHub Pages.

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
 * Serves build folders over `https://` (the service worker only exists on https), like
 * GitHub Pages: `/` comes from the main build and `/preview/` from the preview build. The
 * certificate is self-signed (openssl) and the test context ignores its error.
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
      // Like GitHub Pages: a directory (`guia/`) serves its `index.html`.
      const file = normalize(
        join(
          dir,
          relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative,
        ),
      );
      if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404).end('not found');
        return;
      }
      let body = readFileSync(file);
      if (file.endsWith('sw.js') && state.swVersionSuffix) {
        // Simulates a new build: sw.js changes, and that is what the browser detects.
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
        // The browser keeps keep-alive connections open: without closing them, close() does not finish.
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

// Local https server with a self-signed certificate: the service worker only registers
// with the certificate accepted by the whole browser (`ignoreHTTPSErrors` is not enough).
test.use({
  ignoreHTTPSErrors: true,
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--ignore-certificate-errors'],
  },
});

test('GitHub Pages and preview: service worker installs, caches and announces the new version', async ({
  page,
  context,
}) => {
  // Includes the preview build (VITE_CHANNEL=preview) in a temporary folder.
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

  // Main version: installs the service worker and the full precache.
  await page.goto(`${origin}/`);
  await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
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
  // The manifest (manifest-src 'self') was linked by the app.
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute(
    'href',
    './manifest.webmanifest',
  );

  // The app stays usable with the service worker in control (offline included).
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await createProject(page, 'SW project', `${origin}/`);
  await addImage(page);
  // New version: sw.js changes → notice → Update → reloads with the new cache.
  state.swVersionSuffix = '-new';
  await page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((r) => r?.update()),
  );
  await expect(page.getByText('New version available.')).toBeVisible();
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByText('New version available.')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual([expect.stringMatching(/-new$/)]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
  // The interactive guide (guia/) also comes from the cache, without network.
  await page.goto(`${origin}/guia/`);
  // pt-BR kept: the interactive guide is pt-BR (its <title>)
  await expect(page).toHaveTitle('Guia do Mapping');
  await expect(page.locator('#steps button')).toHaveCount(14);
  await context.setOffline(false);

  // Preview at /preview/: another build, another service worker, same policy.
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

  // The preview guide is the one from the preview build, also from the cache.
  await context.setOffline(true);
  await page.goto(`${origin}/preview/guia/`);
  // pt-BR kept: the interactive guide is pt-BR (its <title>)
  await expect(page).toHaveTitle('Guia do Mapping');
  await expect(page.locator('#steps button')).toHaveCount(14);
  await context.setOffline(false);

  expect(violations()).toEqual([]);
});

test('Trusted Types on: the service worker registers and controls the page; an image from another origin does not go through it', async ({
  page,
  context,
}) => {
  const site = await serveSite({ main: DIST, preview: DIST }, { swVersionSuffix: '' });
  openSite = site;
  const violations = await watchViolations(page);
  // Fictitious host answered by Playwright: never a real network.
  const IMAGE = 'https://images.mapping.test/x.png';
  const served: string[] = [];
  await context.route('https://images.mapping.test/**', (route) => {
    served.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: solidPng(4, 4),
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await page.goto(`${site.origin}/`);
  await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
  // Proof of the `./sw.js` exception in the policy: the registration went through `createScriptURL`.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  const responsePromise = page.waitForResponse(IMAGE);
  const loaded = await page.evaluate(
    (src) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      }),
    IMAGE,
  );
  const response = await responsePromise;
  expect(loaded).toBe(true);
  expect(response.fromServiceWorker()).toBe(false);
  expect(served).toEqual([IMAGE]);
  // The service worker only serves its own origin: no request to another origin was its.
  expect(
    context
      .serviceWorkers()
      .flatMap((worker) => worker.url())
      .every((url) => url.startsWith(site.origin)),
  ).toBe(true);
  expect(violations()).toEqual([]);
});
