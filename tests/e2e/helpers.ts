import { expect, type Page, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { solidPng } from './png';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** O que os testes leem do `mapping.json` exportado. */
export interface MappingJson {
  readonly schemaVersion: number;
  readonly specializations: readonly { readonly id: string; readonly version: number }[];
  readonly layers: readonly {
    readonly id: string;
    readonly name: string;
    readonly spec: { readonly specId: string } | null;
  }[];
  readonly images: readonly {
    readonly id: string;
    readonly file: string;
    readonly width: number;
    readonly height: number;
    readonly locked: boolean;
  }[];
  readonly markings: readonly {
    readonly id: string;
    readonly imageId: string;
    readonly rect: Rect;
    readonly locked: boolean;
  }[];
  readonly annotations: readonly {
    readonly id: string;
    readonly markingId: string;
    readonly layerId: string;
    readonly name: string | null;
    readonly type: { readonly specId: string; readonly typeId: string } | null;
    readonly values: Record<string, unknown> | null;
    readonly entries: readonly {
      readonly id: string;
      readonly key: string;
      readonly value: string;
    }[];
  }[];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const isMobile = (info: TestInfo): boolean => info.project.name === 'mobile';

/** Abre a app e cria um projeto local (guardado no IndexedDB do navegador de teste). */
export async function createProject(page: Page, name: string, url = '/'): Promise<void> {
  await page.goto(url);
  await page.getByRole('button', { name: /Novo projeto/ }).click();
  await page.getByRole('textbox').fill(name);
  await page.getByRole('button', { name: 'Criar' }).click();
  // O título some em telas estreitas: o editor aberto é reconhecido pelo canvas.
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

/** Adiciona uma imagem sólida (gerada na hora) pelo seletor de arquivos do editor. */
export async function addImage(page: Page, width = 400, height = 800): Promise<void> {
  await page.locator('input[type=file][accept="image/*"][multiple]').setInputFiles({
    name: 'tela.png',
    mimeType: 'image/png',
    buffer: solidPng(width, height),
  });
  await expect(page.getByText('images/tela.webp').first()).toBeVisible();
  // Dá tempo de o canvas enquadrar a imagem.
  await page.waitForTimeout(500);
}

export async function canvasBox(page: Page): Promise<Rect> {
  const box = await page.getByRole('main', { name: 'Canvas do projeto' }).boundingBox();
  if (!box) throw new Error('canvas sem tamanho');
  return box;
}

/** Ponto dentro da imagem, na altura `fy` (0 a 1) do canvas. */
export async function canvasPoint(page: Page, fy = 1 / 3): Promise<Point> {
  const box = await canvasBox(page);
  return { x: box.x + box.width / 2, y: box.y + box.height * fy };
}

/**
 * Arrasta com o mouse (desktop) ou com toque real (celular emulado, via CDP:
 * gera `pointerType: 'touch'`, que é o que a máquina de gestos distingue).
 */
export async function drag(
  page: Page,
  info: TestInfo,
  from: Point,
  to: Point,
  options: { readonly holdMs?: number } = {},
): Promise<void> {
  const steps = 8;
  const at = (i: number): Point => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y + ((to.y - from.y) * i) / steps,
  });
  if (!isMobile(info)) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    if (options.holdMs) await page.waitForTimeout(options.holdMs);
    for (let i = 1; i <= steps; i++) {
      const p = at(i);
      await page.mouse.move(p.x, p.y);
    }
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Point) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y }] : [],
    });
  await touch('touchStart', from);
  if (options.holdMs) await page.waitForTimeout(options.holdMs);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', at(i));
    await page.waitForTimeout(16);
  }
  await touch('touchEnd');
  await cdp.detach();
}

export async function setMode(page: Page, mode: 'Desenhar' | 'Navegar'): Promise<void> {
  await page.getByRole('button', { name: mode, exact: true }).click();
}

/** Desenha uma marcação de `width` × `height` px de tela centrada em `center`. */
export async function drawMarking(
  page: Page,
  info: TestInfo,
  center: Point,
  size = { width: 120, height: 80 },
): Promise<void> {
  await setMode(page, 'Desenhar');
  await drag(
    page,
    info,
    { x: center.x - size.width / 2, y: center.y - size.height / 2 },
    { x: center.x + size.width / 2, y: center.y + size.height / 2 },
  );
  await setMode(page, 'Navegar');
}

/** No celular Detalhes fica numa gaveta recolhida (B7): abre para editar. */
export async function openDetails(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Mostrar detalhes', exact: true });
  if (await expand.isVisible()) await expand.click();
}

export async function closeDetails(page: Page): Promise<void> {
  const collapse = page.getByRole('button', { name: 'Esconder detalhes', exact: true });
  if (await collapse.isVisible()) await collapse.click();
}

/** Posição e tamanho da marcação selecionada, lidos do painel (pixels da imagem). */
export async function selectedRect(page: Page): Promise<Rect> {
  await openDetails(page);
  const read = async (label: string) =>
    Number(await page.getByLabel(label, { exact: true }).inputValue());
  const rect = {
    x: await read('X'),
    y: await read('Y'),
    width: await read('Largura'),
    height: await read('Altura'),
  };
  await closeDetails(page);
  return rect;
}

/**
 * Aciona uma ação do projeto: no desktop ela está na barra principal (R4); no celular,
 * no menu Painéis (R8), aberto pelo botão da barra de baixo.
 */
async function projectAction(page: Page, name: string): Promise<void> {
  const inBar = page.locator('.main-bar').getByRole('button', { name, exact: true });
  if (await inBar.count()) {
    await inBar.click();
    return;
  }
  await page.getByRole('button', { name: /^Painéis/ }).click();
  await page
    .getByRole('dialog', { name: 'Painéis e ações' })
    .getByRole('button', { name, exact: true })
    .click();
}

/** Abre o diálogo Exportar (o zip já está pronto nele). */
export async function openExport(page: Page): Promise<void> {
  await projectAction(page, 'Exportar');
  await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible();
}

/** Exportar → Baixar: devolve o conteúdo do `mapping.json` do zip e os arquivos dele. */
export async function exportMapping(
  page: Page,
): Promise<{ readonly mapping: MappingJson; readonly files: readonly string[] }> {
  await openExport(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar' }).click();
  const path = await (await download).path();
  const zip = await JSZip.loadAsync(await readFile(path));
  const text = await zip.file('mapping.json')?.async('string');
  if (text === undefined) throw new Error('o zip não tem mapping.json');
  return { mapping: JSON.parse(text) as MappingJson, files: Object.keys(zip.files) };
}

/** Especializações → Aplicar: escolhe o arquivo e fecha o diálogo. */
export async function applySpecialization(page: Page, file: string): Promise<void> {
  await projectAction(page, 'Especializações');
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles(file);
  await expect(page.getByRole('status').filter({ hasText: 'aplicada' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();
}

export interface Violation {
  readonly directive: string;
  readonly blocked: string;
}

/**
 * Registra os `securitypolicyviolation` de todos os documentos da página (inclusive depois
 * de navegar ou recarregar). O script de inicialização do Playwright não sofre a CSP.
 */
export async function watchViolations(page: Page): Promise<() => readonly Violation[]> {
  const found: Violation[] = [];
  await page.exposeFunction('__reportCsp', (directive: string, blocked: string) => {
    found.push({ directive, blocked });
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as Record<string, unknown>).__reportCsp;
      if (typeof report === 'function') report(e.effectiveDirective, e.blockedURI);
    });
  });
  return () => found;
}
