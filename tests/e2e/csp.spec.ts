import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addImage,
  canvasPoint,
  createProject,
  drawMarking,
  exportMapping,
  isMobile,
  openDetails,
  openExport,
  watchViolations,
} from './helpers';
import { solidPng } from './png';

// Etapa 2.4: a CSP do index.html é uma garantia de privacidade imposta pelo navegador.
// Estes testes rodam contra o `dist/index.html` final (ver playwright.config.ts).

const DIST = join(process.cwd(), 'dist');

/** Fluxo principal da app: criar projeto, imagem, marcação, anotação e exportar. */
async function mainFlow(page: Page, info: Parameters<typeof isMobile>[0], url = '/') {
  await createProject(page, 'Projeto CSP', url);
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));

  await openDetails(page);
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
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).not.toMatch(/unsafe-(inline|eval)/);
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

  test('bloqueia fetch, XHR, WebSocket, EventSource e imagem externa (nada sai da página)', async ({
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
      out.imagemExterna = await settle((done) => {
        const img = new Image();
        img.onload = () => done('permitido');
        img.onerror = () => done('bloqueado');
        img.src = 'https://example.com/pixel.png';
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
        script.textContent = 'window.__injetado = true';
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
      imagemExterna: 'bloqueado',
      eval: 'bloqueado',
      scriptInline: 'bloqueado',
      estiloPorJs: 'permitido',
      atributoStyle: 'bloqueado',
    });
    const directives = new Set(violations().map((v) => v.directive));
    expect(directives).toContain('connect-src');
    expect(directives).toContain('img-src');
    expect(directives).toContain('script-src');
    expect(escaped).toEqual([]);
  });

  test('fluxo principal sem nenhuma violação (inclui copiar ID, colar e arrastar imagens)', async ({
    page,
    context,
  }, info) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const violations = await watchViolations(page);
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.text().includes('Content Security Policy')) consoleErrors.push(m.text());
    });

    await mainFlow(page, info);

    // Copiar ID (área de transferência).
    await openDetails(page);
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
    await expect
      .poll(async () => (await exportMapping(page)).mapping.images.length, {
        timeout: 15_000,
      })
      .toBe(4);

    expect(violations()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('compartilhar o zip (Web Share) funciona sob a CSP', async ({ page }, info) => {
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
    await drawMarking(page, info, await canvasPoint(page));
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
  }, info) => {
    const violations = await watchViolations(page);
    const url = pathToFileURL(join(DIST, 'index.html')).href;
    await mainFlow(page, info, url);
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
