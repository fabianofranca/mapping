// MC6 (#1034, etapa #898): os números do R17.32 e do R17.33 (`docs/TESTING.md`) saem do raster do MCP com a
// Roboto embutida: o snackbar de 1, 2 e 3 linhas mede 48, 68 e 81 e o texto ocupa uma, duas e três linhas; os
// botões do alert-dialog em duas linhas ficam com o confirmar acima, os dois à direita.
import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { instantiate } from '../../src/model/components/instantiate';
import { fitComponentSize } from '../../src/model/components/sizing';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files } from '../support/material3Library';

const book = createFontBook();
const measure = measurerFor(book);
const catalog = buildCatalog(files);

type Mode = 'light' | 'dark';

/** Instancia o componente no tamanho ajustado, com a fonte do MCP, e pinta sobre branco a zoom 1. */
function render(id: string, values: Record<string, string>, mode: Mode) {
  const entry = findEntry(catalog, id);
  const library = catalog.library;
  if (entry?.component == null || library === null) throw new Error(`sem ${id}`);
  const options = {
    measure,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
  const all = { ...defaultValues(entry.type), ...values } as never;
  const fit = fitComponentSize(entry.component, all, options);
  const size = {
    width: fit?.width ?? entry.component.size.width,
    height: fit?.height ?? entry.component.size.height,
  };
  const drawing = instantiate(entry.component, all, { x: 0, y: 0, ...size }, options);
  const raster = createRaster(size.width, size.height);
  raster.data.fill(255);
  paintScene(raster, [{ root: drawing.root }], measure, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, ...size },
    fonts: book,
  });
  return { raster, size, warnings: drawing.warnings };
}

/** O retângulo envolvente dos pixels a até 25 por canal de `color`, dentro de `band` (ou do raster inteiro). */
function inkBox(
  raster: Raster,
  color: string,
  band: { y: number; height: number } = { y: 0, height: raster.height },
) {
  const want = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = band.y; y < Math.min(band.y + band.height, raster.height); y++)
    for (let x = 0; x < raster.width; x++) {
      const i = (y * raster.width + x) * 4;
      if (raster.data[i + 3] === 0) continue;
      if (want.every((c, k) => Math.abs((raster.data[i + k] as number) - c) <= 25)) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
  return { x: x0, y: y0 - band.y, width: x1 - x0, height: y1 - y0 };
}

const near = (actual: number, expected: number, tolerance: number): void => {
  expect(
    Math.abs(actual - expected),
    `${actual} ≈ ${expected} ±${tolerance}`,
  ).toBeLessThanOrEqual(tolerance);
};

describe('R17.32: snackbar de 1, 2 e 3 linhas no raster do MCP', () => {
  const MESSAGES: [string, number, number][] = [
    ['Arquivo salvo.', 48, 12],
    ['O arquivo foi salvo e a cópia ficou guardada na pasta Documentos.', 68, 33],
    [
      'O arquivo foi salvo e a cópia ficou guardada na pasta Documentos; você pode abrir de novo pelo menu Recentes.',
      81,
      53,
    ],
  ];

  it.each(MESSAGES)(
    '%#: a altura %s é %s e a tinta tem ≈ %s de altura',
    (message, height, ink) => {
      for (const mode of ['light', 'dark'] as const) {
        const { size, warnings } = render('snackbar', { message }, mode);
        expect([size.width, size.height], mode).toEqual([344, height]);
        expect(warnings, mode).toEqual([]);
      }
      const dark = render('snackbar', { message }, 'dark');
      const box = inkBox(dark.raster, '#322F35', { y: 6, height: dark.size.height - 12 });
      near(box.x, 17, 1);
      near(box.height, ink, 2);
    },
  );
});

describe('R17.33: os botões do alert-dialog em duas linhas no raster do MCP', () => {
  const values = {
    style: 'standard',
    title: 'Descartar rascunho?',
    text: 'O rascunho será apagado.',
    confirmButton: 'Descartar o rascunho agora',
    dismissButton: 'Cancelar',
  };

  it.each([
    ['light', '#6750A4', 174],
    ['dark', '#D0BCFF', 171],
  ] as const)(
    'o confirmar fica acima do dispensar, os dois à direita (%s)',
    (mode, primary, confirmWidth) => {
      const { raster, size, warnings } = render('alert-dialog', values, mode);
      expect([size.width, size.height]).toEqual([312, 248]);
      expect(warnings).toEqual([]);
      const confirm = inkBox(raster, primary, { y: 116, height: 60 });
      const dismiss = inkBox(raster, primary, { y: 176, height: 60 });
      near(confirm.width, confirmWidth, 3);
      near(confirm.x, 101, 3);
      near(confirm.y, 19, 3);
      near(dismiss.width, 50, 3);
      near(dismiss.x, 220, 3);
      near(dismiss.y, 19, 3);
      for (const box of [confirm, dismiss])
        expect(box.x + box.width).toBeGreaterThanOrEqual(268);
      for (const box of [confirm, dismiss])
        expect(box.x + box.width).toBeLessThanOrEqual(277);
    },
  );
});
