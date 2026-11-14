import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addImage,
  canvasPoint,
  createProject,
  drawMarking,
  exportMapping,
  openExport,
  projectAction,
  watchViolations,
} from './helpers';
import { solidPng } from './png';

// Stage 2.4: the CSP of index.html is a privacy guarantee enforced by the browser.
// These tests run against the final `dist/index.html` (see playwright.config.ts).

const DIST = join(process.cwd(), 'dist');

/** Main flow of the app: create project, image, marking, annotation and export. */
async function mainFlow(page: Page, url = '/') {
  await createProject(page, 'CSP project', url);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await page
    .getByRole('button', { name: /Add annotation to layer/ })
    .first()
    .click();
  await page.getByLabel('Annotation name').fill('Sign-in button');
  await page.getByLabel('Annotation name').press('Enter');
  await page.getByRole('button', { name: '+ Pair' }).click();
  await page.getByLabel('Key').fill('action');
  await page.getByLabel('Key').press('Tab');
  await page.getByLabel('Value').fill('login');
  await page.getByLabel('Value').press('Enter');

  const { mapping, files } = await exportMapping(page);
  expect(files).toContain('images/tela.webp');
  expect(mapping.markings).toHaveLength(1);
  expect(mapping.annotations[0]).toMatchObject({ name: 'Sign-in button' });
  expect(mapping.annotations[0]?.entries.map((e) => [e.key, e.value])).toEqual([
    ['action', 'login'],
  ]);
}

test.describe('CSP of index.html', () => {
  test('the policy comes in a <meta> before any resource, without unsafe-*', async ({
    page,
  }) => {
    await page.goto('/');
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("img-src 'self' data: blob: https: http:");
    expect(policy).toContain("require-trusted-types-for 'script'");
    expect(policy).toContain('trusted-types default');
    expect(policy).not.toMatch(/unsafe-(inline|eval)/);
    // No Referer for the remote images.
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    );
    // The <meta> must precede the first <script> and the first <style>.
    const order = await page.evaluate(() => {
      const nodes = [...document.head.children].map((el) => {
        const http = el.getAttribute('http-equiv')?.toLowerCase();
        return http === 'content-security-policy' ? 'csp' : el.tagName.toLowerCase();
      });
      return nodes;
    });
    const csp = order.indexOf('csp');
    expect(csp).toBeGreaterThanOrEqual(0);
    for (const tag of ['script', 'style', 'link']) {
      const first = order.indexOf(tag);
      if (first >= 0) expect(csp).toBeLessThan(first);
    }
  });

  test('blocks fetch, XHR, WebSocket, EventSource, inline script and style (network outside img-src)', async ({
    page,
    context,
  }) => {
    const violations = await watchViolations(page);
    // If anything escaped the CSP, the request would stop here: the test records it and fails.
    const escaped: string[] = [];
    await context.route(/^https?:\/\/(?!localhost)/, async (route) => {
      escaped.push(route.request().url());
      await route.abort();
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();

    const results = await page.evaluate(async () => {
      const settle = (setup: (done: (v: string) => void) => void): Promise<string> =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve('timeout'), 4000);
          setup((v) => {
            clearTimeout(timer);
            resolve(v);
          });
        });
      const out: Record<string, string> = {};
      out.fetchExternal = await fetch('https://example.com/data', {
        method: 'POST',
        body: 'secret',
      }).then(
        () => 'allowed',
        () => 'blocked',
      );
      out.fetchSameOrigin = await fetch('/').then(
        () => 'allowed',
        () => 'blocked',
      );
      out.xhr = await settle((done) => {
        const xhr = new XMLHttpRequest();
        xhr.onerror = () => done('blocked');
        xhr.onload = () => done('allowed');
        try {
          xhr.open('GET', 'https://example.com/xhr');
          xhr.send();
        } catch {
          done('blocked');
        }
      });
      out.webSocket = await settle((done) => {
        try {
          const ws = new WebSocket('wss://example.com/socket');
          ws.onopen = () => done('allowed');
          ws.onerror = () => done('blocked');
          ws.onclose = () => done('blocked');
        } catch {
          done('blocked');
        }
      });
      out.eventSource = await settle((done) => {
        const es = new EventSource('https://example.com/events');
        es.onopen = () => done('allowed');
        es.onerror = () => {
          es.close();
          done('blocked');
        };
      });
      out.eval = (() => {
        try {
          (0, eval)('1 + 1');
          return 'allowed';
        } catch {
          return 'blocked';
        }
      })();
      out.scriptInline = await settle((done) => {
        const script = document.createElement('script');
        try {
          // With Trusted Types the assignment itself throws (TypeError), before the script CSP.
          script.textContent = 'window.__injected = true';
        } catch {
          done('blocked');
          return;
        }
        document.head.append(script);
        setTimeout(
          () =>
            done(
              (window as unknown as Record<string, unknown>).__injected
                ? 'allowed'
                : 'blocked',
            ),
          200,
        );
      });
      // Style through JS (CSSOM, what Preact uses) still works; the style attribute does not.
      const box = document.createElement('div');
      document.body.append(box);
      box.style.setProperty('--x', '1');
      box.style.width = '7px';
      out.styleByJs = getComputedStyle(box).width === '7px' ? 'allowed' : 'blocked';
      const other = document.createElement('div');
      document.body.append(other);
      other.setAttribute('style', 'width: 9px');
      out.styleAttribute =
        getComputedStyle(other).width === '9px' ? 'allowed' : 'blocked';
      return out;
    });

    expect(results).toEqual({
      fetchExternal: 'blocked',
      fetchSameOrigin: 'blocked',
      xhr: 'blocked',
      webSocket: 'blocked',
      eventSource: 'blocked',
      eval: 'blocked',
      scriptInline: 'blocked',
      styleByJs: 'allowed',
      styleAttribute: 'blocked',
    });
    // The violation events arrive asynchronously.
    await expect
      .poll(() => violations().map((v) => v.directive))
      .toEqual(expect.arrayContaining(['connect-src', 'require-trusted-types-for']));
    expect(escaped).toEqual([]);
  });

  test('https image: not blocked by the CSP (img-src), but fetch stays blocked', async ({
    page,
    context,
  }) => {
    const violations = await watchViolations(page);
    await context.route('https://images.mapping.test/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: solidPng(4, 4),
        headers: { 'access-control-allow-origin': '*' },
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
    const results = await page.evaluate(async () => {
      const image = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => resolve('loaded');
        img.onerror = () => resolve('failed');
        img.src = 'https://images.mapping.test/x.png';
      });
      const fetched = await fetch('https://images.mapping.test/x.png').then(
        () => 'allowed',
        () => 'blocked',
      );
      return { image, fetched };
    });
    expect(results).toEqual({ image: 'loaded', fetched: 'blocked' });
    await expect
      .poll(() => violations().map((v) => v.directive))
      .toEqual(['connect-src']);
  });

  test('Trusted Types: the app opens, draws and opens a dialog without violation', async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await createProject(page, 'TT project');
    await addImage(page);
    await drawMarking(page, await canvasPoint(page));
    await projectAction(page, 'Settings');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(violations()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Trusted Types: innerHTML only accepts the empty string and other policies are refused', async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
    const results = await page.evaluate(() => {
      const trustedTypesOf = (w: Window) =>
        (
          w as unknown as {
            trustedTypes?: {
              createPolicy: (
                name: string,
                rules: { createHTML: (s: string) => string },
              ) => unknown;
            };
          }
        ).trustedTypes;
      const div = document.createElement('div');
      div.append(document.createElement('span'));
      const attempt = (run: () => void): string => {
        try {
          run();
          return 'allowed';
        } catch (e) {
          return e instanceof TypeError ? 'TypeError' : String(e);
        }
      };
      const out: Record<string, string> = {};
      out.empty = attempt(() => {
        div.innerHTML = '';
      });
      out.emptyCleared = String(div.childElementCount);
      out.html = attempt(() => {
        div.innerHTML = '<b>x</b>';
      });
      out.image = attempt(() => {
        div.innerHTML = '<img src="https://images.mapping.test/x.png">';
      });
      out.otherPolicy = attempt(() => {
        trustedTypesOf(window)?.createPolicy('other', { createHTML: (s: string) => s });
      });
      out.noPolicy = String(typeof trustedTypesOf(window)?.createPolicy);
      return out;
    });
    expect(results).toEqual({
      empty: 'allowed',
      emptyCleared: '0',
      html: 'TypeError',
      image: 'TypeError',
      otherPolicy: 'TypeError',
      noPolicy: 'function',
    });
    // The violation events arrive asynchronously.
    await expect
      .poll(
        () =>
          violations().filter((v) => v.directive === 'require-trusted-types-for').length,
      )
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => violations().some((v) => v.directive === 'trusted-types'))
      .toBe(true);
  });

  test('the guide (static profile) opens without violation', async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto('/guia/');
    // pt-BR kept: the interactive guide is pt-BR (its <title>)
    await expect(page).toHaveTitle('Guia do Mapping');
    await expect(page.locator('#steps button')).toHaveCount(14);
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy).not.toContain('trusted-types');
    expect(policy).toContain("img-src 'self' data: blob:;");
    expect(violations()).toEqual([]);
  });

  test('main flow without any violation (includes copy ID, paste and drag images)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const violations = await watchViolations(page);
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.text().includes('Content Security Policy')) consoleErrors.push(m.text());
    });

    await mainFlow(page);

    // Copy ID (clipboard).
    const copyId = page.getByRole('button', { name: /^Copy ID/ }).first();
    if (await copyId.isVisible()) {
      await copyId.click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toMatch(/\S/);
    }

    // Drag and drop two images, and paste one (events with real files).
    const png = (w: number, h: number) => solidPng(w, h).toString('base64');
    await page.evaluate(
      ({ a, b, point }) => {
        const file = (name: string, base64: string) =>
          new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, {
            type: 'image/png',
          });
        const drop = new DataTransfer();
        drop.items.add(file('dragged-1.png', a));
        drop.items.add(file('dragged-2.png', b));
        const target = document.querySelector('main[aria-label="Project canvas"]');
        for (const type of ['dragover', 'drop']) {
          target?.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              dataTransfer: drop,
              clientX: point.x,
              clientY: point.y,
            }),
          );
        }
        const paste = new DataTransfer();
        paste.items.add(file('pasted.png', a));
        window.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: paste, bubbles: true }),
        );
      },
      { a: png(300, 300), b: png(200, 400), point: await canvasPoint(page, 0.9) },
    );
    // Wait for the import to finish (one row per image in the Tree) before exporting:
    // exporting in the middle of it competes for the progress and the editor message with the import and the
    // dialog may not open.
    await expect(page.getByRole('button', { name: /^Lock images\// })).toHaveCount(4, {
      timeout: 15_000,
    });
    expect((await exportMapping(page)).mapping.containers).toHaveLength(4);

    expect(violations()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('sharing the zip (Web Share) works under the CSP', async ({ page }) => {
    const violations = await watchViolations(page);
    await page.addInitScript(() => {
      const shared: string[] = [];
      (window as unknown as Record<string, unknown>).__shared = shared;
      Object.defineProperty(navigator, 'canShare', { value: () => true });
      Object.defineProperty(navigator, 'share', {
        value: async (data: { files?: File[] }) => {
          for (const f of data.files ?? []) shared.push(`${f.name}:${f.size}`);
        },
      });
    });
    await createProject(page, 'CSP project');
    await addImage(page);
    await drawMarking(page, await canvasPoint(page));
    await openExport(page);
    await page.getByRole('button', { name: 'Share' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __shared: string[] }).__shared),
      )
      .toEqual([expect.stringMatching(/\.zip:\d+$/)]);
    expect(violations()).toEqual([]);
  });

  test('opened through file://: the main flow works and the policy applies the same', async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    const url = pathToFileURL(join(DIST, 'index.html')).href;
    await mainFlow(page, url);
    expect(violations()).toEqual([]);
    // The same network block applies in file://.
    const blocked = await page.evaluate(() =>
      fetch('https://example.com/').then(
        () => 'allowed',
        () => 'blocked',
      ),
    );
    expect(blocked).toBe('blocked');
  });
});
