// Catálogo da biblioteca: o pacote Material 3 lido de examples/libraries/material3/.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  clampPlaygroundSize,
  drawEntry,
  exampleDrawing,
  findEntry,
  playgroundSizeRange,
} from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { isFontPath } from '../../src/model/components/library';
import type { LibraryFile } from '../../src/model/library';

const ROOT = join(__dirname, '../../examples/libraries/material3');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files: LibraryFile[] = listDisk(ROOT).map((path) =>
  isFontPath(path)
    ? { path, binary: true }
    : { path, text: readFileSync(join(ROOT, path), 'utf8') },
);

const catalog = buildCatalog(files);
const entries = catalog.layers.flatMap((l) => l.entries);

describe('catálogo do Material 3', () => {
  it('lê a especialização, o relatório e os quinze tipos', () => {
    expect(catalog.spec?.id).toBe('material3');
    expect(catalog.report.errors).toEqual([]);
    expect(catalog.layers.length).toBeGreaterThan(0);
    expect(entries).toHaveLength(15);
    expect(catalog.layers[0]?.entries[0]?.layerId).toBe(catalog.layers[0]?.id);
  });

  it('todo tipo tem componente, documento e exemplos', () => {
    for (const entry of entries) {
      expect(entry.component, entry.type.id).not.toBeNull();
      expect(entry.docText, entry.type.id).toMatch(/\S/);
      expect(entry.examples.length, entry.type.id).toBeGreaterThan(0);
      expect(entry.previewValues).not.toBeNull();
    }
  });

  it('marca como container os tipos com slot', () => {
    const containers = entries.filter((e) => e.container).map((e) => e.type.id);
    const plain = entries.filter((e) => !e.container).map((e) => e.type.id);
    expect(containers.length).toBeGreaterThan(0);
    for (const id of ['m3-box', 'm3-row', 'm3-column']) expect(containers).toContain(id);
    expect(plain).toContain('m3-button');
  });

  it('monta a tabela de propriedades de um tipo conhecido', () => {
    const button = findEntry(catalog, 'm3-button');
    expect(button?.fields.map((f) => f.key)).toContain('variant');
    const variant = button?.fields.find((f) => f.key === 'variant');
    expect(variant?.type).toBe('enum');
    expect(variant?.options?.length).toBeGreaterThan(1);
    expect(variant?.label).toMatch(/\S/);
    expect(findEntry(catalog, 'não-existe')).toBeUndefined();
  });

  it('desenha o preview e cada exemplo sem erro', () => {
    for (const entry of entries) {
      expect(
        exampleDrawing(catalog, entry, undefined, approximateMeasurer),
        entry.type.id,
      ).not.toBeNull();
      for (const example of entry.examples) {
        const drawing = exampleDrawing(catalog, entry, example, approximateMeasurer);
        expect(drawing, `${entry.type.id}/${example.name}`).not.toBeNull();
        expect(drawing?.root.type).toBe('frame');
      }
    }
  });

  it('o tamanho passado ao desenho vale na raiz', () => {
    const button = findEntry(catalog, 'm3-button');
    if (button === undefined) throw new Error('sem botão');
    const drawing = drawEntry(button, {}, approximateMeasurer, {
      width: 200,
      height: 60,
    });
    expect(drawing?.root.width).toBe(200);
    expect(drawing?.root.height).toBe(60);
  });

  it('intervalo do playground: do minSize ao dobro do size', () => {
    const button = findEntry(catalog, 'm3-button')?.component;
    if (!button) throw new Error('sem componente');
    const { min, max } = playgroundSizeRange(button);
    expect(min).toEqual({
      width: button.minSize?.width ?? 1,
      height: button.minSize?.height ?? 1,
    });
    expect(max).toEqual({ width: button.size.width * 2, height: button.size.height * 2 });
    expect(clampPlaygroundSize(button, { width: 1e6, height: -5 })).toEqual({
      width: max.width,
      height: min.height,
    });
    expect(clampPlaygroundSize(button, button.size)).toEqual(button.size);
  });

  it('expõe o código por plataforma e as fontes agrupadas', () => {
    const withCode = entries.filter((e) => e.code.length > 0);
    for (const entry of withCode) {
      for (const code of entry.code) {
        expect(code.symbol).toMatch(/\S/);
        expect(code.platform.name).toMatch(/\S/);
      }
    }
    for (const entry of entries) {
      expect(new Set(entry.sources.map((g) => g.system)).size).toBe(entry.sources.length);
    }
  });
});

describe('pacote quebrado de propósito', () => {
  it('componente ausente: não lança, mantém o relatório e a entrada sem componente', () => {
    const broken = buildCatalog(
      files.filter((f) => f.path !== 'components/m3-button.json'),
    );
    expect(broken.report.ok).toBe(false);
    const button = findEntry(broken, 'm3-button');
    expect(button?.component).toBeNull();
    expect(button?.componentProblem).toMatch(/ausente/);
    expect(button?.container).toBe(false);
    expect(exampleDrawing(broken, button!, undefined, approximateMeasurer)).toBeNull();
    expect(findEntry(broken, 'm3-card')?.component).not.toBeNull();
  });

  it('documento ausente: docText nulo', () => {
    const broken = buildCatalog(files.filter((f) => f.path !== 'docs/m3-button.md'));
    expect(broken.report.ok).toBe(false);
    expect(findEntry(broken, 'm3-button')?.docText).toBeNull();
    expect(findEntry(broken, 'm3-card')?.docText).not.toBeNull();
  });

  it('sem especialização legível: catálogo vazio com o relatório', () => {
    const broken = buildCatalog(files.filter((f) => f.path !== 'material3.spec.json'));
    expect(broken.spec).toBeNull();
    expect(broken.layers).toEqual([]);
    expect(broken.report.ok).toBe(false);
    expect(buildCatalog([]).report.ok).toBe(false);
    expect(buildCatalog([{ path: 'a.spec.json', text: '{' }]).spec).toBeNull();
  });
});
