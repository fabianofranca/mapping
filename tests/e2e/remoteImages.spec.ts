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

// Etapa Imagens remotas (RI3): o consentimento por origem, os interruptores de Privacidade, a
// política de URL e o carregador, de ponta a ponta. O Playwright responde as origens fictícias
// (`*.mapping.test`, `localhost`, `192.168.0.10`) por `page.route`; nenhuma requisição sai da
// máquina e não há variável de build. O canvas publica `data-component-images` (quantas imagens
// de componente estão desenhadas de fato; o reservado não conta), `data-components` e as
// requisições são contadas por rota.

const LIBRARY_DIR = 'examples/libraries/pessoas';
const NOW = '2026-10-31T12:00:00.000Z';

const ORIGIN = 'https://imagens.mapping.test';
const IMG = `${ORIGIN}/foto.png`;
const OTHER_ORIGIN = 'https://outra.mapping.test';
const OTHER_IMG = `${OTHER_ORIGIN}/foto.png`;
const HTTP_ORIGIN = 'http://imagens.mapping.test';
const HTTP_IMG = `${HTTP_ORIGIN}/foto.png`;
const LAN_ORIGIN = 'https://192.168.0.10';
const LAN_IMG = `${LAN_ORIGIN}/foto.png`;

// Chaves de `src/storage/imagePermissions.ts` (o consentimento é do navegador, no localStorage).
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

/** Deixa o consentimento e os interruptores como o teste pede, antes de a app carregar. */
async function seed(page: Page, config: Seed): Promise<void> {
  await page.addInitScript(
    ({ keys, config: c }) => {
      // Só na primeira carga da aba: o que a pessoa mudar na tela vale depois.
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
// Servidores de imagem fictícios

type Behavior = 'cors' | 'no-cors' | 'fail' | 'hang';

interface Hits {
  count: number;
  /** `true` quando o pedido veio com o cabeçalho `Origin` (a tentativa com `crossOrigin`). */
  readonly withOrigin: boolean[];
}

/** Responde as URLs de `pattern` com o PNG (com ou sem CORS), com erro ou nunca. */
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
    if (behavior === 'hang') return; // nunca responde: o tempo limite do carregador age
    if (behavior === 'fail') {
      await route.fulfill({ status: 404, body: 'não há' });
      return;
    }
    // O Playwright acrescenta sozinho o `Access-Control-Allow-Origin` a um pedido com `Origin`
    // quando a resposta não o traz; "sem CORS" é por isso um cabeçalho que não autoriza a app.
    // O pedido sem `crossOrigin` (a nova tentativa) não leva `Origin` e é atendido normalmente.
    const cors =
      behavior === 'cors' || !origin ? '*' : 'https://nao-autorizado.mapping.test';
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
// Projeto com o Avatar da biblioteca de exemplo `pessoas` (um avatar por URL)

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

/** A especialização `pessoas`; `exampleUrl` põe a foto no exemplo (para a galeria do Catálogo). */
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

/** Tela em branco 360 × 800, sem especialização. */
function blankProject(): Project {
  return addBackgroundContainer(
    createProject({
      name: 'Pessoas',
      now: NOW,
      firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
    }),
    {
      id: 'B1',
      name: 'Tela',
      width: 360,
      height: 800,
      background: '#FFFFFF',
      center: { x: 180, y: 400 },
    },
  );
}

/** Põe um Avatar por URL na tela (a partir de `project`, que já tem a especialização). */
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
        values: { nome: `Pessoa ${i}`, foto: url },
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

/** O zip de um projeto com a biblioteca `pessoas` aplicada e um Avatar por URL. */
async function projectZip(urls: readonly string[]): Promise<Buffer> {
  const project = withPeople(urls);
  const files = new Map<string, string>([['mapping.json', serialize(project)]]);
  for (const [path, text] of specFiles(project)) files.set(path, text);
  for (const [path, text] of packageFiles('specs/pessoas/')) {
    if (!files.has(path)) files.set(path, text);
  }
  return zipOf(files);
}

const PROPOSAL_ID = 'pessoas-novas';

/** Projeto em branco e uma proposta que cria um Avatar com um pacote que só a proposta traz. */
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
    title: 'Pessoas novas',
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
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

/** Abre um projeto com um Avatar por URL e espera os componentes serem desenhados. */
async function openPeople(page: Page, urls: readonly string[]): Promise<void> {
  await importZip(page, await projectZip(urls));
  await expect(host(page)).toHaveAttribute('data-components', String(urls.length));
}

// ---------------------------------------------------------------------------------------
// Leituras

const host = (page: Page): Locator => page.locator('.canvas-host');
const banner = (page: Page): Locator => page.getByText(/Este projeto tem imagens de/);
const allowButton = (page: Page): Locator =>
  page.getByRole('button', { name: 'Permitir estas', exact: true });

/** Quantas imagens remotas estão desenhadas (o reservado não conta). */
async function drawnImages(page: Page): Promise<number> {
  return Number((await host(page).getAttribute('data-component-images')) ?? 0);
}

/** Espera o desenho (a carga e o redesenho) chegar a `count` imagens. */
async function expectDrawn(page: Page, count: number): Promise<void> {
  await expect(host(page)).toHaveAttribute('data-component-images', String(count));
}

/** Dá tempo de uma requisição (indevida) acontecer e confere que nada foi desenhado. */
async function expectNothingHappens(page: Page, ...servers: Hits[]): Promise<void> {
  await page.waitForTimeout(600);
  for (const server of servers) expect(server.count).toBe(0);
  expect(await drawnImages(page)).toBe(0);
}

async function openPrivacy(page: Page): Promise<Locator> {
  await projectAction(page, 'Configurações');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Privacidade' })).toBeVisible();
  return dialog;
}

// O fixture automático confere, ao fim de cada teste, que a CSP e os Trusted Types não
// recusaram nada (violações do documento e erros do console).
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

test.describe('imagens remotas: carga e CORS', () => {
  test('com CORS e consentimento a imagem aparece, com um pedido anônimo', async ({
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

  test('sem CORS e com o interruptor desligado fica no reservado, com um só pedido', async ({
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

  test('sem CORS e com o interruptor ligado aparece, em duas tentativas', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`, 'no-cors');
    await seed(page, { origins: [ORIGIN], noCors: true });
    await openPeople(page, [IMG]);
    await expectDrawn(page, 1);
    // Primeiro com `crossOrigin` (falha por falta do cabeçalho), depois uma só vez sem ele.
    expect(server.count).toBe(2);
    expect(server.withOrigin).toEqual([true, false]);
  });

  test('imagem grande demais (cabeçalho acima de 8192 px) fica no reservado', async ({
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

  test('tempo limite: a imagem que nunca chega vira reservado, sem nova tentativa', async ({
    page,
  }) => {
    // O relógio é do Playwright: avançar 20 s não custa 20 s de teste.
    await page.clock.install();
    const server = await serve(page, `${ORIGIN}/**`, 'hang');
    // Com o interruptor de CORS ligado: o tempo limite não é falta de CORS, não repete.
    await seed(page, { origins: [ORIGIN], noCors: true });
    await openPeople(page, [IMG]);
    await expect.poll(() => server.count).toBe(1);
    await page.clock.fastForward(21_000);
    await page.waitForTimeout(600);
    expect(server.count).toBe(1);
    expect(await drawnImages(page)).toBe(0);
  });
});

test.describe('imagens remotas: Catálogo', () => {
  /** Abre a biblioteca `pessoas` (exemplo com foto) no Catálogo e devolve o desenho do exemplo. */
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
    const screen = page.getByRole('main', { name: 'Catálogo da biblioteca' });
    await expect(screen).toBeVisible();
    await screen
      .getByRole('navigation', { name: 'Componentes' })
      .locator('button[data-type-id="avatar"]')
      .click();
    const article = screen.getByRole('article', { name: 'Avatar' });
    await expect(article).toBeVisible();
    await hits(server);
    // A galeria redesenha quando a imagem termina de carregar (a época entra na chave).
    await page.waitForTimeout(800);
    return article.getByRole('img', { name: 'Ana Souza', exact: true });
  }

  test('sem CORS com o interruptor ligado aparece no canvas, mas não entra na galeria', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      locale: 'pt-BR',
      viewport: { width: 1280, height: 800 },
    });
    try {
      const wait = (n: number) => async (s: Hits) => {
        await expect.poll(() => s.count).toBeGreaterThanOrEqual(n);
      };
      // A referência do reservado: o servidor responde erro, a foto não existe.
      const failing = await context.newPage();
      const placeholder = await (
        await galleryImage(failing, 'fail', wait(2))
      ).getAttribute('src');
      // Com CORS a foto entra na galeria (o desenho muda).
      const good = await context.newPage();
      const withPhoto = await (
        await galleryImage(good, 'cors', wait(1))
      ).getAttribute('src');
      expect(withPhoto).not.toBe(placeholder);
      // Sem CORS a imagem carrega (duas tentativas) mas a galeria desenha o reservado.
      const opaque = await context.newPage();
      const image = await galleryImage(opaque, 'no-cors', wait(2));
      expect(await image.getAttribute('src')).toBe(placeholder);
    } finally {
      await context.close();
    }
  });
});

test.describe('imagens remotas: consentimento por origem', () => {
  test('origem sem consentimento: a faixa aparece e nenhuma requisição é feita', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await expect(banner(page)).toContainText(ORIGIN);
    await expectNothingHappens(page, server);
  });

  test('Permitir estas libera a origem, grava no navegador e a imagem aparece', async ({
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

  test('Agora não esconde a faixa sem permitir nada', async ({ page }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await page.getByRole('button', { name: 'Agora não', exact: true }).click();
    await expect(banner(page)).toHaveCount(0);
    await expectNothingHappens(page, server);
    const stored = await page.evaluate((key) => localStorage.getItem(key), KEYS.origins);
    expect(stored).toBeNull();
  });

  test('origem nova depois de permitir: a faixa volta só com ela', async ({ page }) => {
    const first = await serve(page, `${ORIGIN}/**`);
    const second = await serve(page, `${OTHER_ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await allowButton(page).click();
    await expectDrawn(page, 1);
    await expect(banner(page)).toHaveCount(0);

    // Edita a foto da pessoa para uma origem que ainda não foi permitida.
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

  test('duas origens novas e uma já permitida: a faixa lista só as novas', async ({
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

  test('Revogar (Configurações › Privacidade) tira a origem e a imagem volta ao reservado', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await seed(page, { origins: [ORIGIN] });
    await openPeople(page, [IMG]);
    await expectDrawn(page, 1);

    const dialog = await openPrivacy(page);
    await expect(dialog.getByText(ORIGIN, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: `Revogar ${ORIGIN}` }).click();
    await expect(
      dialog.getByText('Nenhuma origem permitida neste navegador.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();

    await expectDrawn(page, 0);
    await expect(banner(page)).toContainText(ORIGIN);
    const stored = await page.evaluate((key) => localStorage.getItem(key), KEYS.origins);
    expect(JSON.parse(stored ?? '[]')).toEqual([]);
    expect(server.count).toBe(1);
  });

  test('"qualquer origem" ligado: sem faixa e a imagem carrega', async ({ page }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await seed(page, { anyOrigin: true });
    await openPeople(page, [IMG]);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
    await expect(banner(page)).toHaveCount(0);
  });

  test('o interruptor "qualquer origem" liga pela Privacidade e libera sem faixa', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await openPeople(page, [IMG]);
    await expect(banner(page)).toBeVisible();
    const dialog = await openPrivacy(page);
    await dialog.getByLabel('Permitir imagens de qualquer origem').check();
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expectDrawn(page, 1);
    await expect(banner(page)).toHaveCount(0);
    expect(server.count).toBe(1);
  });
});

test.describe('imagens remotas: rede local', () => {
  test('rede local recusada, sem pedido, com o interruptor desligado', async ({
    page,
  }) => {
    const server = await serve(page, `${LAN_ORIGIN}/**`);
    // Nem consentimento nem "qualquer origem" abrem a rede local.
    await seed(page, { origins: [LAN_ORIGIN], anyOrigin: true });
    await openPeople(page, [LAN_IMG]);
    await expectNothingHappens(page, server);
    await expect(banner(page)).toHaveCount(0);
  });

  test('rede local aceita com o interruptor ligado e o consentimento', async ({
    page,
  }) => {
    const server = await serve(page, `${LAN_ORIGIN}/**`);
    await seed(page, { origins: [LAN_ORIGIN], localNetwork: true });
    await openPeople(page, [LAN_IMG]);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
  });

  test('rede local pede consentimento próprio mesmo com "qualquer origem" ligado', async ({
    page,
  }) => {
    const server = await serve(page, `${LAN_ORIGIN}/**`);
    await seed(page, { anyOrigin: true, localNetwork: true });
    await openPeople(page, [LAN_IMG]);
    await expect(banner(page)).toContainText(LAN_ORIGIN);
    await expect(banner(page)).toContainText('rede local');
    await expectNothingHappens(page, server);
    await allowButton(page).click();
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
  });

  test('private-host: IP, localhost, nome sem ponto e .local não geram requisição', async ({
    page,
  }) => {
    const urls = [
      'https://10.0.0.5/foto.png',
      'https://localhost:8443/foto.png',
      'https://intranet/foto.png',
      'https://impressora.local/foto.png',
    ];
    const servers = [
      await serve(page, 'https://10.0.0.5/**'),
      await serve(page, 'https://localhost:8443/**'),
      await serve(page, 'https://intranet/**'),
      await serve(page, 'https://impressora.local/**'),
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

test.describe('imagens remotas: http', () => {
  test('http: recusado com o interruptor desligado, sem requisição', async ({ page }) => {
    const server = await serve(page, `${HTTP_ORIGIN}/**`);
    await seed(page, { origins: [HTTP_ORIGIN], anyOrigin: true });
    await openPeople(page, [HTTP_IMG]);
    await expectNothingHappens(page, server);
    await expect(banner(page)).toHaveCount(0);
  });

  test('http: aceito com o interruptor ligado e o consentimento', async ({ page }) => {
    const server = await serve(page, `${HTTP_ORIGIN}/**`);
    await seed(page, { origins: [HTTP_ORIGIN], http: true });
    await openPeople(page, [HTTP_IMG]);
    await expectDrawn(page, 1);
    expect(server.count).toBe(1);
  });

  test('http e https do mesmo host têm consentimentos separados', async ({ page }) => {
    const secure = await serve(page, `${ORIGIN}/**`);
    const plain = await serve(page, `${HTTP_ORIGIN}/**`);
    await seed(page, { origins: [ORIGIN], http: true });
    await openPeople(page, [IMG, HTTP_IMG]);
    await expectDrawn(page, 1);
    expect(secure.count).toBe(1);
    expect(plain.count).toBe(0);
    await expect(banner(page)).toContainText(`${HTTP_ORIGIN} (sem criptografia)`);
    await allowButton(page).click();
    await expectDrawn(page, 2);
    expect(plain.count).toBe(1);
    expect(secure.count).toBe(1);
  });
});

test.describe('imagens remotas: pacote que chega por proposta', () => {
  test('a visão Proposto mostra a faixa da origem do pacote e só carrega depois de permitir', async ({
    page,
  }) => {
    const server = await serve(page, `${ORIGIN}/**`);
    await importZip(page, await proposalZip(IMG));

    await page.keyboard.press('Control+Shift+7');
    await expect(page.getByText('Pessoas novas').first()).toBeVisible();
    await page
      .getByRole('button', { name: /^Revisar/ })
      .first()
      .click();
    await expect(page.getByText('Somente leitura').first()).toBeVisible();

    const view = page.getByRole('group', { name: 'Visão do canvas' });
    await expect(
      view.getByRole('button', { name: 'Proposto', exact: true }),
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

/** Seleciona o primeiro Avatar pela Árvore de marcações e espera o campo Foto no painel. */
async function selectFirstMarking(page: Page): Promise<void> {
  await page.getByText('Avatar', { exact: true }).first().click();
  await expect(page.getByLabel('Foto', { exact: true })).toBeVisible();
}
