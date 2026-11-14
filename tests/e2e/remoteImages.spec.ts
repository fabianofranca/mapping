import { expect, test as base, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  buildProposal,
  createProject,
  loadSpecComponents,
  parseSpec,
  proposalFilePath,
  serialize,
  serializeProposal,
  specFiles,
  type ComponentCatalog,
  type Project,
  type Spec,
} from '../../src/model';
import { projectAction, watchViolations } from './helpers';
import { solidPng } from './png';

// Remote images stage (RI3): consent per origin, the Privacy switches, the
// URL policy and the loader, end to end. Playwright answers the fictitious origins
// (`*.mapping.test`, `localhost`, `192.168.0.10`) through `page.route`; no request leaves the
// machine and there is no build variable. The canvas publishes `data-component-images` (how many component
// images are actually drawn; the placeholder does not count), `data-components` and the
// requests are counted per route.
// pt-BR kept: shared fixture data (tests/fixtures/pessoas library: spec id 'pessoas', type 'avatar', fields 'nome'/'foto', label 'Foto', example 'Ana Souza') asserted by tests/model, tests/store and tests/examples

const LIBRARY_DIR = 'tests/fixtures/pessoas';
const NOW = '2026-10-31T12:00:00.000Z';

const ORIGIN = 'https://images.mapping.test';
const IMG = `${ORIGIN}/photo.png`;
const OTHER_ORIGIN = 'https://other.mapping.test';
const OTHER_IMG = `${OTHER_ORIGIN}/photo.png`;
const HTTP_ORIGIN = 'http://images.mapping.test';
const HTTP_IMG = `${HTTP_ORIGIN}/photo.png`;
const LAN_ORIGIN = 'https://192.168.0.10';
const LAN_IMG = `${LAN_ORIGIN}/photo.png`;

// Keys of `src/storage/imagePermissions.ts` (consent belongs to the browser, in localStorage).
const KEYS = {
  origins: 'mapping.imageOrigins',
  anyOrigin: 'mapping.imageAllowAnyOrigin',
  http: 'mapping.imageAllowHttp',
  localNetwork: 'mapping.imageAllowLocalNetwork',
  noCors: 'mapping.imageAllowNoCors',
} as const;

interface Seed {
  readonly origins?: readonly string[];
  readonly anyOrigin?: boolean;
  readonly http?: boolean;
  readonly localNetwork?: boolean;
  readonly noCors?: boolean;
}

/** Leaves the consent and the switches as the test asks, before the app loads. */
async function seed(page: Page, config: Seed): Promise<void> {
  await page.addInitScript(
    ({ keys, config: c }) => {
      // Only on the first load of the tab: what the person changes on screen applies afterwards.
      if (sessionStorage.getItem('seeded') !== null) return;
      sessionStorage.setItem('seeded', '1');
      if (c.origins) localStorage.setItem(keys.origins, JSON.stringify(c.origins));
      const flag = (key: string, value: boolean | undefined) => {
        if (value !== undefined) localStorage.setItem(key, value ? 'on' : 'off');
      };
      flag(keys.anyOrigin, c.anyOrigin);
      flag(keys.http, c.http);
      flag(keys.localNetwork, c.localNetwork);
      flag(keys.noCors, c.noCors);
    },
    { keys: KEYS, config },
  );
}

// ---------------------------------------------------------------------------------------
// Fictitious image servers

type Behavior = 'cors' | 'no-cors' | 'fail' | 'hang';

interface Hits {
  count: number;
  /** `true` when the request came with the `Origin` header (the attempt with `crossOrigin`). */
  readonly withOrigin: boolean[];
}

/** Answers the `pattern` URLs with the PNG (with or without CORS), with an error or never. */
async function serve(
  page: Page,
  pattern: string,
  behavior: Behavior = 'cors',
  png: Buffer = solidPng(64, 64, [220, 40, 40]),
): Promise<Hits> {
  const hits: Hits = { count: 0, withOrigin: [] };
  await page.route(pattern, async (route) => {
    hits.count += 1;
    const origin = 'origin' in route.request().headers();
    hits.withOrigin.push(origin);
    if (behavior === 'hang') return; // never answers: the loader timeout acts
    if (behavior === 'fail') {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }
    // Playwright adds `Access-Control-Allow-Origin` on its own to a request with `Origin`
    // when the response does not carry it; "no CORS" is therefore a header that does not authorize the app.
    // The request without `crossOrigin` (the retry) carries no `Origin` and is served normally.
    const cors =
      behavior === 'cors' || !origin ? '*' : 'https://not-authorized.mapping.test';
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: png,
      headers: { 'cache-control': 'no-store', 'access-control-allow-origin': cors },
    });
  });
  return hits;
}

// ---------------------------------------------------------------------------------------
// Project with the Avatar of the example library `pessoas` (one avatar per URL)

function libraryTexts(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.set(
          relative(LIBRARY_DIR, full).split('\\').join('/'),
          readFileSync(full, 'utf8'),
        );
    }
  };
  walk(LIBRARY_DIR);
  return out;
}

/** The `pessoas` specialization; `exampleUrl` puts the photo in the example (for the Catalog gallery). */
function peopleSpec(exampleUrl?: string): Spec {
  const raw = JSON.parse(
    readFileSync(join(LIBRARY_DIR, 'pessoas.spec.json'), 'utf8'),
  ) as Record<string, unknown>;
  const parsed = parseSpec(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  if (exampleUrl === undefined) return parsed.spec;
  const text = JSON.stringify(raw).replace(
    '"values":{"nome":"Ana Souza"}',
    `"values":{"nome":"Ana Souza","foto":"${exampleUrl}"}`,
  );
  const again = parseSpec(JSON.parse(text));
  if (!again.ok) throw new Error(again.errors.join('\n'));
  return again.spec;
}

function catalogOf(spec: Spec): ComponentCatalog {
  const texts = libraryTexts();
  const file = `specs/${spec.id}/${spec.id}.spec.json`;
  return new Map([
    [
      spec.id,
      loadSpecComponents(spec, file, spec.version, (path) =>
        texts.get(path.replace(`specs/${spec.id}/`, '')),
      ),
    ],
  ]);
}

/** Blank screen 360 × 800, without a specialization. */
function blankProject(): Project {
  return addBackgroundContainer(
    createProject({
      name: 'People',
      now: NOW,
      firstLayer: { id: 'L1', name: 'Components', color: '#1e88e5' },
    }),
    {
      id: 'B1',
      name: 'Screen',
      width: 360,
      height: 800,
      background: '#FFFFFF',
      center: { x: 180, y: 400 },
    },
  );
}

/** Puts one Avatar per URL on the screen (from `project`, which already has the specialization). */
function withAvatars(project: Project, urls: readonly string[]): Project {
  const catalog = catalogOf(peopleSpec());
  let out = project;
  urls.forEach((url, i) => {
    out = addComponentMarking(
      out,
      catalog,
      {
        markingId: `N${i}`,
        annotationId: `A_N${i}`,
        containerId: 'B1',
        parentId: null,
        specId: 'pessoas',
        typeId: 'avatar',
        center: { x: 180, y: 60 + i * 80 },
        values: { nome: `Person ${i}`, foto: url },
      },
      approximateMeasurer,
    );
  });
  return out;
}

function withPeople(urls: readonly string[]): Project {
  const applied = applySpecialization(blankProject(), peopleSpec(), {
    newId: () => 'LS1',
    packageSpecName: 'pessoas.spec.json',
  });
  return withAvatars(applied, urls);
}

function packageFiles(prefix: string): Map<string, string> {
  return new Map([...libraryTexts()].map(([path, text]) => [`${prefix}${path}`, text]));
}

async function zipOf(files: Map<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const path of [...files.keys()].sort()) zip.file(path, files.get(path) ?? '');
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

/** The zip of a project with the `pessoas` library applied and one Avatar per URL. */
async function projectZip(urls: readonly string[]): Promise<Buffer> {
  const project = withPeople(urls);
  const files = new Map<string, string>([['mapping.json', serialize(project)]]);
  for (const [path, text] of specFiles(project)) files.set(path, text);
  for (const [path, text] of packageFiles('specs/pessoas/')) {
    if (!files.has(path)) files.set(path, text);
  }
  return zipOf(files);
}

const PROPOSAL_ID = 'new-people';

/** Blank project and a proposal that creates an Avatar with a package that only the proposal brings. */
async function proposalZip(url: string): Promise<Buffer> {
  const base = blankProject();
  const spec = peopleSpec();
  const after = withAvatars(
    applySpecialization(base, spec, {
      newId: () => 'LS1',
      packageSpecName: 'pessoas.spec.json',
    }),
    [url],
  );
  const proposal = buildProposal(base, after, {
    id: PROPOSAL_ID,
    title: 'New people',
    createdAt: NOW,
  });
  const files = new Map<string, string>([['mapping.json', serialize(base)]]);
  files.set(proposalFilePath(PROPOSAL_ID), serializeProposal(proposal));
  for (const [path, text] of packageFiles(`proposals/${PROPOSAL_ID}/specs/pessoas/`)) {
    files.set(path, text);
  }
  return zipOf(files);
}

async function importZip(page: Page, buffer: Buffer): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({ name: 'pessoas.zip', mimeType: 'application/zip', buffer });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

/** Opens a project with one Avatar per URL and waits for the components to be drawn. */
async function openPeople(page: Page, urls: readonly string[]): Promise<void> {
  await importZip(page, await projectZip(urls));
  await expect(host(page)).toHaveAttribute('data-components', String(urls.length));
}

// ---------------------------------------------------------------------------------------
// Readings

const host = (page: Page): Locator => page.locator('.canvas-host');
const banner = (page: Page): Locator => page.getByText(/This project has images from/);
const allowButton = (page: Page): Locator =>
  page.getByRole('button', { name: 'Allow these', exact: true });

/** How many remote images are drawn (the placeholder does not count). */
async function drawnImages(page: Page): Promise<number> {
  return Number((await host(page).getAttribute('data-component-images')) ?? 0);
}

/** Waits for the drawing (the load and the redraw) to reach `count` images. */
async function expectDrawn(page: Page, count: number): Promise<void> {
  await expect(host(page)).toHaveAttribute('data-component-images', String(count));
}

/** Gives an (undue) request time to happen and checks that nothing was drawn. */
async function expectNothingHappens(page: Page, ...servers: Hits[]): Promise<void> {
  await page.waitForTimeout(600);
  for (const server of servers) expect(server.count).toBe(0);
  expect(await drawnImages(page)).toBe(0);
}

async function openPrivacy(page: Page): Promise<Locator> {
  await projectAction(page, 'Settings');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  return dialog;
}

// The automatic fixture checks, at the end of each test, that the CSP and Trusted Types
// refused nothing (document violations and console errors).
const test = base.extend<{ cleanConsole: void }>({
  cleanConsole: [
    async ({ page }, use) => {
      const violations = await watchViolations(page);
      const errors: string[] = [];
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          /Content Security Policy|Trusted ?Type|TrustedHTML/i.test(message.text())
        ) {
          errors.push(message.text());
        }
      });
      await use();
      expect(violations()).toEqual([]);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

test.describe('remote images: loading and CORS', () => {
  test('with CORS and consent the image shows, with a single anonymous request', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`, 'cors');
    await seed(page, { origins: [ORIGIN] });
    await openPeople(page, [IMG]);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
    expect(server.withOrigin).toEqual([true]);
    await expect(banner(page)).toHaveCount(0);
  });

  test('without CORS and with the switch off it stays on the placeholder, with a single request', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`, 'no-cors');
    await seed(page, { origins: [ORIGIN] });
    await openPeople(page, [IMG]);
    await expect.poll(() => server.count).toBe(1);
    await page.waitForTimeout(600);
    expect(server.count).toBe(1);
    expect(await drawnImages(page)).toBe(0);
  });

  test('without CORS and with the switch on it shows, in two attempts', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`, 'no-cors');
    await seed(page, { origins: [ORIGIN], noCors: true });
    await openPeople(page, [IMG]);
    await expectDrawn(page, 1);
    // First with `crossOrigin` (fails for lack of the header), then once without it.
    expect(server.count).toBe(2);
    expect(server.withOrigin).toEqual([true, false]);
  });

  test('image too large (header above 8192 px) stays on the placeholder', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`, 'cors', solidPng(9000, 1));
    await seed(page, { origins: [ORIGIN] });
    await openPeople(page, [IMG]);
    await expect.poll(() => server.count).toBe(1);
    await page.waitForTimeout(600);
    expect(server.count).toBe(1);
    expect(await drawnImages(page)).toBe(0);
  });

  test('timeout: the image that never arrives becomes the placeholder, without a retry', async ({
    page,
  }) => {
    // The clock is Playwright's: advancing 20 s does not cost 20 s of test.
    await page.clock.install();
    const server = await serve(page, `${ORIGIN}/**`, 'hang');
    // With the CORS switch on: the timeout is not a lack of CORS, it does not retry.
    await seed(page, { origins: [ORIGIN], noCors: true });
    await openPeople(page, [IMG]);
    await expect.poll(() => server.count).toBe(1);
    await page.clock.fastForward(21_000);
    await page.waitForTimeout(600);
    expect(server.count).toBe(1);
    expect(await drawnImages(page)).toBe(0);
  });
});

test.describe('remote images: Catalog', () => {
  /** Opens the `pessoas` library (example with a photo) in the Catalog and returns the example drawing. */
  async function galleryImage(
    page: Page,
    behavior: Behavior,
    hits: (server: Hits) => Promise<void>,
  ): Promise<Locator> {
    const server = await serve(page, `${ORIGIN}/**`, behavior);
    await seed(page, { origins: [ORIGIN], noCors: true });
    await page.goto('/');
    const zip = await zipOf(
      new Map([
        ...packageFiles(''),
        [
          'pessoas.spec.json',
          JSON.stringify(
            JSON.parse(readFileSync(join(LIBRARY_DIR, 'pessoas.spec.json'), 'utf8')),
          ).replace(
            '"values":{"nome":"Ana Souza"}',
            `"values":{"nome":"Ana Souza","foto":"${IMG}"}`,
          ),
        ],
      ]),
    );
    await page.locator('input[data-library-zip]').setInputFiles({
      name: 'pessoas.zip',
      mimeType: 'application/zip',
      buffer: zip,
    });
    const screen = page.getByRole('main', { name: 'Library catalog' });
    await expect(screen).toBeVisible();
    await screen
      .getByRole('navigation', { name: 'Components' })
      .locator('button[data-type-id="avatar"]')
      .click();
    const article = screen.getByRole('article', { name: 'Avatar' });
    await expect(article).toBeVisible();
    await hits(server);
    // The gallery redraws when the image finishes loading (the epoch is part of the key).
    await page.waitForTimeout(800);
    return article.getByRole('img', { name: 'Ana Souza', exact: true });
  }

  test('without CORS with the switch on it shows on the canvas, but does not enter the gallery', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      locale: 'en-US',
      viewport: { width: 1280, height: 860 },
    });
    try {
      const wait = (n: number) => async (s: Hits) => {
        await expect.poll(() => s.count).toBeGreaterThanOrEqual(n);
      };
      // The placeholder reference: the server answers an error, the photo does not exist.
      const failing = await context.newPage();
      const placeholder = await (
        await galleryImage(failing, 'fail', wait(2))
      ).getAttribute('src');
      // With CORS the photo enters the gallery (the drawing changes).
      const good = await context.newPage();
      const withPhoto = await (
        await galleryImage(good, 'cors', wait(1))
      ).getAttribute('src');
      expect(withPhoto).not.toBe(placeholder);
      // Without CORS the image loads (two attempts) but the gallery draws the placeholder.
      const opaque = await context.newPage();
      const image = await galleryImage(opaque, 'no-cors', wait(2));
      expect(await image.getAttribute('src')).toBe(placeholder);
    } finally {
      await context.close();
    }
  });
});

test.describe('remote images: consent per origin', () => {
  test('origin without consent: the banner shows and no request is made', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await expect(banner(page)).toContainText(ORIGIN);
    await expectNothingHappens(page, server);
  });

  test('Allow these frees the origin, saves it in the browser and the image shows', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await expect(banner(page)).toBeVisible();
    await allowButton(page).click();
    await expect(banner(page)).toHaveCount(0);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
    const stored = await page.evaluate((key) => localStorage.getItem(key), KEYS.origins);
    expect(JSON.parse(stored ?? '[]')).toEqual([ORIGIN]);
  });

  test('Not now hides the banner without allowing anything', async ({ page }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(banner(page)).toHaveCount(0);
    await expectNothingHappens(page, server);
    const stored = await page.evaluate((key) => localStorage.getItem(key), KEYS.origins);
    expect(stored).toBeNull();
  });

  test('new origin after allowing: the banner comes back only with it', async ({
    page,
  }) => {
    const first = await serve(page, `${ORIGIN}/**`);
    const second = await serve(page, `${OTHER_ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await allowButton(page).click();
    await expectDrawn(page, 1);
    await expect(banner(page)).toHaveCount(0);

    // Edits the person's photo to an origin that has not been allowed yet.
    await selectFirstMarking(page);
    const field = page.getByLabel('Foto', { exact: true });
    await field.fill(OTHER_IMG);
    await field.press('Enter');

    await expect(banner(page)).toContainText(OTHER_ORIGIN);
    await expect(banner(page)).not.toContainText(ORIGIN + ',');
    await expect(banner(page)).not.toContainText(`${ORIGIN} `);
    expect(second.count).toBe(0);
    await allowButton(page).click();
    await expectDrawn(page, 1);
    expect(second.count).toBe(1);
    expect(first.count).toBe(1);
  });

  test('two new origins and one already allowed: the banner lists only the new ones', async ({
    page,
  }) => {
    const known = await serve(page, `${ORIGIN}/**`);
    const fresh = await serve(page, `${OTHER_ORIGIN}/**`);
    await seed(page, { origins: [ORIGIN] });
    await openPeople(page, [IMG, OTHER_IMG]);
    await expectDrawn(page, 1);
    await expect(banner(page)).toContainText(OTHER_ORIGIN);
    await expect(banner(page)).not.toContainText(`${ORIGIN} `);
    expect(known.count).toBe(1);
    expect(fresh.count).toBe(0);
  });

  test('Revoke (Settings › Privacy) removes the origin and the image goes back to the placeholder', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await seed(page, { origins: [ORIGIN] });
    await openPeople(page, [IMG]);
    await expectDrawn(page, 1);

    const dialog = await openPrivacy(page);
    await expect(dialog.getByText(ORIGIN, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: `Revoke ${ORIGIN}` }).click();
    await expect(dialog.getByText('No origins allowed in this browser.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    await expectDrawn(page, 0);
    await expect(banner(page)).toContainText(ORIGIN);
    const stored = await page.evaluate((key) => localStorage.getItem(key), KEYS.origins);
    expect(JSON.parse(stored ?? '[]')).toEqual([]);
    expect(server.count).toBe(1);
  });

  test('"any origin" on: no banner and the image loads', async ({ page }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await seed(page, { anyOrigin: true });
    await openPeople(page, [IMG]);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
    await expect(banner(page)).toHaveCount(0);
  });

  test('the "any origin" switch turns on through Privacy and frees without a banner', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await expect(banner(page)).toBeVisible();
    const dialog = await openPrivacy(page);
    await dialog.getByLabel('Allow images from any origin').check();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expectDrawn(page, 1);
    await expect(banner(page)).toHaveCount(0);
    expect(server.count).toBe(1);
  });
});

test.describe('remote images: local network', () => {
  test('local network refused, no request, with the switch off', async ({ page }) => {
    const server = await serve(page, `${LAN_ORIGIN}/**`);
    // Neither consent nor "any origin" opens the local network.
    await seed(page, { origins: [LAN_ORIGIN], anyOrigin: true });
    await openPeople(page, [LAN_IMG]);
    await expectNothingHappens(page, server);
    await expect(banner(page)).toHaveCount(0);
  });

  test('local network accepted with the switch on and the consent', async ({ page }) => {
    const server = await serve(page, `${LAN_ORIGIN}/**`);
    await seed(page, { origins: [LAN_ORIGIN], localNetwork: true });
    await openPeople(page, [LAN_IMG]);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
  });

  test('local network asks for its own consent even with "any origin" on', async ({
    page,
  }) => {
    const server = await serve(page, `${LAN_ORIGIN}/**`);
    await seed(page, { anyOrigin: true, localNetwork: true });
    await openPeople(page, [LAN_IMG]);
    await expect(banner(page)).toContainText(LAN_ORIGIN);
    await expect(banner(page)).toContainText('local network');
    await expectNothingHappens(page, server);
    await allowButton(page).click();
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
  });

  test('private-host: IP, localhost, dotless name and .local generate no request', async ({
    page,
  }) => {
    const urls = [
      'https://10.0.0.5/photo.png',
      'https://localhost:8443/photo.png',
      'https://intranet/photo.png',
      'https://printer.local/photo.png',
    ];
    const servers = [
      await serve(page, 'https://10.0.0.5/**'),
      await serve(page, 'https://localhost:8443/**'),
      await serve(page, 'https://intranet/**'),
      await serve(page, 'https://printer.local/**'),
    ];
    await seed(page, {
      origins: urls.map((u) => new URL(u).origin),
      anyOrigin: true,
    });
    await openPeople(page, urls);
    await expectNothingHappens(page, ...servers);
    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe('remote images: http', () => {
  test('http: refused with the switch off, no request', async ({ page }) => {
    const server = await serve(page, `${HTTP_ORIGIN}/**`);
    await seed(page, { origins: [HTTP_ORIGIN], anyOrigin: true });
    await openPeople(page, [HTTP_IMG]);
    await expectNothingHappens(page, server);
    await expect(banner(page)).toHaveCount(0);
  });

  test('http: accepted with the switch on and the consent', async ({ page }) => {
    const server = await serve(page, `${HTTP_ORIGIN}/**`);
    await seed(page, { origins: [HTTP_ORIGIN], http: true });
    await openPeople(page, [HTTP_IMG]);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
  });

  test('http and https of the same host have separate consents', async ({ page }) => {
    const secure = await serve(page, `${ORIGIN}/**`);
    const plain = await serve(page, `${HTTP_ORIGIN}/**`);
    await seed(page, { origins: [ORIGIN], http: true });
    await openPeople(page, [IMG, HTTP_IMG]);
    await expectDrawn(page, 1);
    expect(secure.count).toBe(1);
    expect(plain.count).toBe(0);
    await expect(banner(page)).toContainText(`${HTTP_ORIGIN} (unencrypted)`);
    await allowButton(page).click();
    await expectDrawn(page, 2);
    expect(plain.count).toBe(1);
    expect(secure.count).toBe(1);
  });
});

test.describe('remote images: package that arrives through a proposal', () => {
  test('the Proposed view shows the banner of the package origin and only loads after allowing', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await importZip(page, await proposalZip(IMG));

    await page.keyboard.press('Control+Shift+7');
    await expect(page.getByText('New people').first()).toBeVisible();
    await page
      .getByRole('button', { name: /^Review/ })
      .first()
      .click();
    await expect(page.getByText('Read-only').first()).toBeVisible();

    const view = page.getByRole('group', { name: 'Canvas view' });
    await expect(
      view.getByRole('button', { name: 'Proposed', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(host(page)).toHaveAttribute('data-components', '1');
    await expect(banner(page)).toContainText(ORIGIN);
    await expectNothingHappens(page, server);

    await allowButton(page).click();
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
    await expect(banner(page)).toHaveCount(0);
  });
});

/** Selects the first Avatar through the marking Tree and waits for the Foto field in the panel. */
async function selectFirstMarking(page: Page): Promise<void> {
  await page.getByText('Avatar', { exact: true }).first().click();
  await expect(page.getByLabel('Foto', { exact: true })).toBeVisible();
}
