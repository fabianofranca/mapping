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

// Etapa 2.4: a CSP do index.html é uma garantia de privacidade imposta pelo navegador.
// Estes testes rodam contra o `dist/index.html` final (ver playwright.config.ts).

const DIST = join(process.cwd(), 'dist');

/** Fluxo principal da app: criar projeto, imagem, marcação, anotação e exportar. */
async function mainFlow(page: Page, url = '/') {
  await createProject(page, 'Projeto CSP', url);
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await page
    .getByRole('button', { name: /Adicionar anotação na camada/ })
    .first()
    .click();
  await page.getByLabel('Nome da anotação').fill('Botão Entrar');
  await page.getByLabel('Nome da anotação').press('Enter');
  await page.getByRole('button', { name: '+ Par' }).click();
  await page.getByLabel('Chave').fill('acao');
  await page.getByLabel('Chave').press('Tab');
  await page.getByLabel('Valor').fill('login');
  await page.getByLabel('Valor').press('Enter');

  const { mapping, files } = await exportMapping(page);
  expect(files).toContain('images/tela.webp');
  expect(mapping.markings).toHaveLength(1);
  expect(mapping.annotations[0]).toMatchObject({ name: 'Botão Entrar' });
  expect(mapping.annotations[0]?.entries.map((e) => [e.key, e.value])).toEqual([
    ['acao', 'login'],
  ]);
}

test.describe('CSP do index.html', () => {
  test('a política vem em <meta> antes de qualquer recurso, sem unsafe-*', async ({
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
    // Sem Referer para as imagens remotas.
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    );
    // A <meta> precisa preceder o primeiro <script> e o primeiro <style>.
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

  test('bloqueia fetch, XHR, WebSocket, EventSource, script e estilo inline (rede fora do img-src)', async ({
    page,
    context,
  }) => {
    const violations = await watchViolations(page);
    // Se algo escapasse da CSP, o pedido pararia aqui: o teste registra e falha.
    const escaped: string[] = [];
    await context.route(/^https?:\/\/(?!localhost)/, async (route) => {
      escaped.push(route.request().url());
      await route.abort();
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();

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
      out.fetchExternal = await fetch('https://example.com/dados', {
        method: 'POST',
        body: 'segredo',
      }).then(
        () => 'permitido',
        () => 'bloqueado',
      );
      out.fetchMesmaOrigem = await fetch('/').then(
        () => 'permitido',
        () => 'bloqueado',
      );
      out.xhr = await settle((done) => {
        const xhr = new XMLHttpRequest();
        xhr.onerror = () => done('bloqueado');
        xhr.onload = () => done('permitido');
        try {
          xhr.open('GET', 'https://example.com/xhr');
          xhr.send();
        } catch {
          done('bloqueado');
        }
      });
      out.webSocket = await settle((done) => {
        try {
          const ws = new WebSocket('wss://example.com/socket');
          ws.onopen = () => done('permitido');
          ws.onerror = () => done('bloqueado');
          ws.onclose = () => done('bloqueado');
        } catch {
          done('bloqueado');
        }
      });
      out.eventSource = await settle((done) => {
        const es = new EventSource('https://example.com/eventos');
        es.onopen = () => done('permitido');
        es.onerror = () => {
          es.close();
          done('bloqueado');
        };
      });
      out.eval = (() => {
        try {
          (0, eval)('1 + 1');
          return 'permitido';
        } catch {
          return 'bloqueado';
        }
      })();
      out.scriptInline = await settle((done) => {
        const script = document.createElement('script');
        try {
          // Com Trusted Types a própria atribuição lança (TypeError), antes da CSP de script.
          script.textContent = 'window.__injetado = true';
        } catch {
          done('bloqueado');
          return;
        }
        document.head.append(script);
        setTimeout(
          () =>
            done(
              (window as unknown as Record<string, unknown>).__injetado
                ? 'permitido'
                : 'bloqueado',
            ),
          200,
        );
      });
      // Estilo por JS (CSSOM, o que o Preact usa) continua valendo; atributo style, não.
      const box = document.createElement('div');
      document.body.append(box);
      box.style.setProperty('--x', '1');
      box.style.width = '7px';
      out.estiloPorJs = getComputedStyle(box).width === '7px' ? 'permitido' : 'bloqueado';
      const other = document.createElement('div');
      document.body.append(other);
      other.setAttribute('style', 'width: 9px');
      out.atributoStyle =
        getComputedStyle(other).width === '9px' ? 'permitido' : 'bloqueado';
      return out;
    });

    expect(results).toEqual({
      fetchExternal: 'bloqueado',
      fetchMesmaOrigem: 'bloqueado',
      xhr: 'bloqueado',
      webSocket: 'bloqueado',
      eventSource: 'bloqueado',
      eval: 'bloqueado',
      scriptInline: 'bloqueado',
      estiloPorJs: 'permitido',
      atributoStyle: 'bloqueado',
    });
    // Os eventos de violação chegam de forma assíncrona.
    await expect
      .poll(() => violations().map((v) => v.directive))
      .toEqual(expect.arrayContaining(['connect-src', 'require-trusted-types-for']));
    expect(escaped).toEqual([]);
  });

  test('imagem https: não é barrada pela CSP (img-src), mas fetch continua bloqueado', async ({
    page,
    context,
  }) => {
    const violations = await watchViolations(page);
    await context.route('https://imagens.mapping.test/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: solidPng(4, 4),
        headers: { 'access-control-allow-origin': '*' },
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
    const results = await page.evaluate(async () => {
      const image = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => resolve('carregou');
        img.onerror = () => resolve('falhou');
        img.src = 'https://imagens.mapping.test/x.png';
      });
      const fetched = await fetch('https://imagens.mapping.test/x.png').then(
        () => 'permitido',
        () => 'bloqueado',
      );
      return { image, fetched };
    });
    expect(results).toEqual({ image: 'carregou', fetched: 'bloqueado' });
    await expect
      .poll(() => violations().map((v) => v.directive))
      .toEqual(['connect-src']);
  });

  test('Trusted Types: a app abre, desenha e abre um diálogo sem violação', async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await createProject(page, 'Projeto TT');
    await addImage(page);
    await drawMarking(page, await canvasPoint(page));
    await projectAction(page, 'Configurações');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(violations()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Trusted Types: innerHTML só aceita a string vazia e outras políticas são recusadas', async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
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
          return 'permitido';
        } catch (e) {
          return e instanceof TypeError ? 'TypeError' : String(e);
        }
      };
      const out: Record<string, string> = {};
      out.vazio = attempt(() => {
        div.innerHTML = '';
      });
      out.vazioLimpou = String(div.childElementCount);
      out.html = attempt(() => {
        div.innerHTML = '<b>x</b>';
      });
      out.imagem = attempt(() => {
        div.innerHTML = '<img src="https://imagens.mapping.test/x.png">';
      });
      out.outraPolitica = attempt(() => {
        trustedTypesOf(window)?.createPolicy('outra', { createHTML: (s: string) => s });
      });
      out.semPolitica = String(typeof trustedTypesOf(window)?.createPolicy);
      return out;
    });
    expect(results).toEqual({
      vazio: 'permitido',
      vazioLimpou: '0',
      html: 'TypeError',
      imagem: 'TypeError',
      outraPolitica: 'TypeError',
      semPolitica: 'function',
    });
    // Os eventos de violação chegam de forma assíncrona.
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

  test('o guia (perfil static) abre sem violação', async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto('/guia/');
    await expect(page).toHaveTitle('Guia do Mapping');
    await expect(page.locator('#steps button')).toHaveCount(12);
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy).not.toContain('trusted-types');
    expect(policy).toContain("img-src 'self' data: blob:;");
    expect(violations()).toEqual([]);
  });

  test('fluxo principal sem nenhuma violação (inclui copiar ID, colar e arrastar imagens)', async ({
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

    // Copiar ID (área de transferência).
    const copyId = page.getByRole('button', { name: /^Copiar ID/ }).first();
    if (await copyId.isVisible()) {
      await copyId.click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toMatch(/\S/);
    }

    // Arrastar e soltar duas imagens, e colar uma (eventos com arquivos reais).
    const png = (w: number, h: number) => solidPng(w, h).toString('base64');
    await page.evaluate(
      ({ a, b, point }) => {
        const file = (name: string, base64: string) =>
          new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, {
            type: 'image/png',
          });
        const drop = new DataTransfer();
        drop.items.add(file('arrastada-1.png', a));
        drop.items.add(file('arrastada-2.png', b));
        const target = document.querySelector('main[aria-label="Canvas do projeto"]');
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
        paste.items.add(file('colada.png', a));
        window.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: paste, bubbles: true }),
        );
      },
      { a: png(300, 300), b: png(200, 400), point: await canvasPoint(page, 0.9) },
    );
    // Espera a importação terminar (uma linha por imagem na Árvore) antes de exportar:
    // exportar no meio dela disputa o progresso e a mensagem do editor com a importação e o
    // diálogo pode não abrir.
    await expect(page.getByRole('button', { name: /^Trancar images\// })).toHaveCount(4, {
      timeout: 15_000,
    });
    expect((await exportMapping(page)).mapping.containers).toHaveLength(4);

    expect(violations()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('compartilhar o zip (Web Share) funciona sob a CSP', async ({ page }) => {
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
    await createProject(page, 'Projeto CSP');
    await addImage(page);
    await drawMarking(page, await canvasPoint(page));
    await openExport(page);
    await page.getByRole('button', { name: 'Compartilhar' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __shared: string[] }).__shared),
      )
      .toEqual([expect.stringMatching(/\.zip:\d+$/)]);
    expect(violations()).toEqual([]);
  });

  test('aberto por file://: o fluxo principal funciona e a política vale igual', async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    const url = pathToFileURL(join(DIST, 'index.html')).href;
    await mainFlow(page, url);
    expect(violations()).toEqual([]);
    // O mesmo bloqueio de rede vale em file://.
    const blocked = await page.evaluate(() =>
      fetch('https://example.com/').then(
        () => 'permitido',
        () => 'bloqueado',
      ),
    );
    expect(blocked).toBe('bloqueado');
  });
});
