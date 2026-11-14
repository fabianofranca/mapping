import { expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { solidPng } from './png';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What the tests read from the exported `mapping.json`. */
export interface MappingJson {
  readonly schemaVersion: number;
  readonly specializations: readonly { readonly id: string; readonly version: number }[];
  readonly layers: readonly {
    readonly id: string;
    readonly name: string;
    readonly spec: { readonly specId: string } | null;
  }[];
  readonly containers: readonly {
    readonly id: string;
    readonly file: string | null;
    readonly width: number;
    readonly height: number;
    readonly locked: boolean;
    /** Image pixels per component unit (v19); absent means 1. */
    readonly density?: number;
    /** The canvas marking that contains the container (v13); `null` = none. */
    readonly parentId: string | null;
    readonly placement: {
      readonly x: number;
      readonly y: number;
      readonly scale: number;
    };
  }[];
  readonly markings: readonly {
    readonly id: string;
    /** `null` = canvas marking (v13): `rect` in canvas units. */
    readonly containerId: string | null;
    /** What contains the marking in the same space (derived from the geometry by the app); `null` = nothing. */
    readonly parentId: string | null;
    readonly floating: boolean;
    readonly name: string;
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

/** Opens the app and creates a local project (stored in the test browser's IndexedDB). */
export async function createProject(page: Page, name: string, url = '/'): Promise<void> {
  await page.goto(url);
  await page.getByRole('button', { name: /New project/ }).click();
  await page.getByRole('textbox').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  // The open editor is recognized by the canvas.
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

/** Adds a solid image (generated on the fly) through the editor's file picker. */
export async function addImage(page: Page, width = 400, height = 800): Promise<void> {
  // The canvas publishes on the container what it has already drawn: fits and ready images.
  const host = page.locator('.canvas-host');
  const drawn = async () => ({
    fits: Number((await host.getAttribute('data-fits')) ?? 0),
    images: Number((await host.getAttribute('data-images')) ?? 0),
  });
  const before = await drawn();
  await page.locator('input[type=file][accept="image/*"][multiple]').setInputFiles({
    // pt-BR kept: shared fixture data (file name 'tela.png') asserted by tests/e2e specs outside this batch
    name: 'tela.png',
    mimeType: 'image/png',
    buffer: solidPng(width, height),
  });
  await expect(page.getByText('images/tela.webp').first()).toBeVisible();
  // Waits for the frame with the new image drawn and fitted.
  await expect
    .poll(async () => {
      const now = await drawn();
      return now.fits > before.fits && now.images > before.images;
    })
    .toBe(true);
}

export async function canvasBox(page: Page): Promise<Rect> {
  const box = await page.getByRole('main', { name: 'Project canvas' }).boundingBox();
  if (!box) throw new Error('canvas has no size');
  return box;
}

/** A point inside the image, at height `fy` (0 to 1) of the canvas. */
export async function canvasPoint(page: Page, fy = 1 / 3): Promise<Point> {
  const box = await canvasBox(page);
  return { x: box.x + box.width / 2, y: box.y + box.height * fy };
}

/** Drags the mouse from `from` to `to`, in a few steps. */
export async function drag(page: Page, from: Point, to: Point): Promise<void> {
  const steps = 8;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
  }
  await page.mouse.up();
}

export async function setMode(page: Page, mode: 'Draw' | 'Navigate'): Promise<void> {
  await page.getByRole('button', { name: mode, exact: true }).click();
}

/** Draws a marking of `width` × `height` screen px centered on `center`. */
export async function drawMarking(
  page: Page,
  center: Point,
  size = { width: 120, height: 80 },
): Promise<void> {
  await setMode(page, 'Draw');
  await drag(
    page,
    { x: center.x - size.width / 2, y: center.y - size.height / 2 },
    { x: center.x + size.width / 2, y: center.y + size.height / 2 },
  );
  await setMode(page, 'Navigate');
}

/** Position and size of the selected marking, read from the panel (image pixels). */
export async function selectedRect(page: Page): Promise<Rect> {
  const read = async (label: string) =>
    Number(await page.getByLabel(label, { exact: true }).inputValue());
  const rect = {
    x: await read('X'),
    y: await read('Y'),
    width: await read('Width'),
    height: await read('Height'),
  };
  return rect;
}

/** Triggers a project action on the main bar (R4). */
export async function projectAction(page: Page, name: string): Promise<void> {
  await page.locator('.main-bar').getByRole('button', { name, exact: true }).click();
}

/** Opens the Export dialog (the zip is already ready in it). */
export async function openExport(page: Page): Promise<void> {
  await projectAction(page, 'Export');
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
}

/**
 * Export → Download: returns the downloaded zip. Removes `showSaveFilePicker` (the test
 * Chromium has it) before opening the dialog, so the app uses the `<a download>`, which
 * Playwright captures; the picker path has its own tests in `flows.spec.ts`.
 */
export async function exportZip(page: Page): Promise<JSZip> {
  await page.evaluate(() => Reflect.set(window, 'showSaveFilePicker', undefined));
  await openExport(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const path = await (await download).path();
  return JSZip.loadAsync(await readFile(path));
}

/** Export → Download: returns the content of the zip's `mapping.json` and its files. */
export async function exportMapping(
  page: Page,
): Promise<{ readonly mapping: MappingJson; readonly files: readonly string[] }> {
  const zip = await exportZip(page);
  const text = await zip.file('mapping.json')?.async('string');
  if (text === undefined) throw new Error('the zip has no mapping.json');
  return { mapping: JSON.parse(text) as MappingJson, files: Object.keys(zip.files) };
}

/** Specializations → Apply: picks the file and closes the dialog. */
export async function applySpecialization(page: Page, file: string): Promise<void> {
  await projectAction(page, 'Specializations');
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles(file);
  await expect(page.getByRole('status').filter({ hasText: 'applied' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
}

export interface Violation {
  readonly directive: string;
  readonly blocked: string;
}

/**
 * Records the `securitypolicyviolation` events of all documents on the page (including after
 * navigating or reloading). Playwright's init script is not subject to the CSP.
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
