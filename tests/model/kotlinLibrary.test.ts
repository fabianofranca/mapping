// Biblioteca Kotlin (`libraries/kotlin/`, pronta para uso e aplicada pela pessoa): onze tipos de declaração (classe,
// objeto e interface), cada um com componente e documento; as propriedades são alvos de referência.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';

const ROOT = join(__dirname, '../../libraries/kotlin');
const SPEC_FILE = 'kotlin.spec.json';

const CLASS_TYPES = [
  'class',
  'data-class',
  'sealed-class',
  'enum-class',
  'value-class',
  'annotation-class',
  'object',
  'data-object',
];
const INTERFACE_TYPES = ['interface', 'sealed-interface', 'fun-interface'];
const ALL_TYPES = [...CLASS_TYPES, ...INTERFACE_TYPES];
const KOTLIN_SUGGESTIONS = [
  ...['String', 'Int', 'Long', 'Boolean', 'Double', 'Float', 'Short', 'Byte', 'Char'],
  ...['UInt', 'ULong', 'UShort', 'UByte', 'Any', 'Unit', 'Nothing', 'List'],
  ...['MutableList', 'Set', 'MutableSet', 'Map', 'MutableMap', 'Array', 'Pair'],
];

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

describe('biblioteca Kotlin', () => {
  it('tem a especialização, um componente e um documento por tipo', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        ...ALL_TYPES.map((id) => `components/${id}.json`),
        ...ALL_TYPES.map((id) => `docs/${id}.md`),
      ].sort(),
    );
  });

  it('valida sem erro nos três níveis e sem aviso', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      level: 3,
      types: 11,
      components: 11,
      docs: 11,
    });
  });

  it('a especialização é a formatVersion 8 com duas camadas e as propriedades como alvos', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec).toMatchObject({ formatVersion: 8, id: 'kotlin', version: 2 });
    expect(parsed.spec.layers.map((l) => l.id)).toEqual([
      'kotlin-classes',
      'kotlin-interfaces',
    ]);
    expect(parsed.spec.layers[0]?.annotationTypes.map((t) => t.id)).toEqual(CLASS_TYPES);
    expect(parsed.spec.layers[1]?.annotationTypes.map((t) => t.id)).toEqual(
      INTERFACE_TYPES,
    );
    for (const layer of parsed.spec.layers) {
      for (const type of layer.annotationTypes) {
        const props = type.fields.find((f) => f.key === 'properties');
        expect(props?.type).toBe('table');
        expect(props).toMatchObject({ rowLabel: 'name' });
        expect(props?.tags).toContain('data-field');
        const name = type.fields.find((f) => f.key === 'name');
        expect(name?.tags).toContain('kotlin-type');
        expect(type.labelField).toBe('name');
        const outer = type.fields.find((f) => f.key === 'outer');
        expect(outer?.type).toBe('ref');
        expect(outer?.type === 'ref' && outer.accepts?.tags).toEqual(['kotlin-type']);
      }
    }
  });

  it.each(ALL_TYPES)(
    '%s desenha o preview sem aviso, com o nome entre os textos',
    (id) => {
      const catalog = buildCatalog(files);
      expect(catalog.report.errors).toEqual([]);
      const entry = findEntry(catalog, id);
      expect(entry?.component?.formatVersion).toBe(2);
      const values = entry?.previewValues ?? {};
      const drawing = drawEntry(entry!, values, approximateMeasurer);
      expect(drawing?.warnings).toEqual([]);
      const texts: string[] = [];
      const visit = (node: SceneNode): void => {
        if (node.type === 'text') texts.push(node.text);
        if (node.type === 'frame') node.children.forEach(visit);
      };
      if (drawing) visit(drawing.root);
      expect(texts.some((t) => t.startsWith(String(values.name)))).toBe(true);
    },
  );

  it('class inner e open tem o estereótipo «inner open class»', () => {
    const catalog = buildCatalog(files);
    const entry = findEntry(catalog, 'class');
    const values = { ...entry?.previewValues, inner: 'sim', modality: 'open' };
    const drawing = drawEntry(entry!, values, approximateMeasurer);
    const texts: string[] = [];
    const visit = (node: SceneNode): void => {
      if (node.type === 'text') texts.push(node.text);
      if (node.type === 'frame') node.children.forEach(visit);
    };
    if (drawing) visit(drawing.root);
    expect(texts.some((t) => t.includes('«inner open class»'))).toBe(true);
  });

  it('Propriedades › Tipo e Funções › Retorno têm a lista fixa de sugestões; Supertipos › Tipo não', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const suggestionsOf = (
      fields: readonly { key: string; columns?: readonly unknown[] }[],
      table: string,
      column: string,
    ): unknown => {
      const f = fields.find((x) => x.key === table);
      const cols = (f?.columns ?? []) as { key: string; suggestions?: string[] }[];
      return cols.find((c) => c.key === column)?.suggestions;
    };
    let checked = 0;
    for (const layer of parsed.spec.layers) {
      for (const type of layer.annotationTypes) {
        expect(suggestionsOf(type.fields, 'properties', 'type'), type.id).toEqual(
          KOTLIN_SUGGESTIONS,
        );
        if (type.fields.some((f) => f.key === 'functions')) {
          expect(suggestionsOf(type.fields, 'functions', 'returnType'), type.id).toEqual(
            KOTLIN_SUGGESTIONS,
          );
        }
        expect(suggestionsOf(type.fields, 'supertypes', 'type'), type.id).toBeUndefined();
        checked += 1;
      }
    }
    expect(checked).toBe(ALL_TYPES.length);
  });

  it('Propriedades › Tipo e Supertipos › Tipo têm linkedRef typeRef; Funções › Retorno não', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const linkedOf = (
      fields: readonly { key: string; columns?: readonly unknown[] }[],
      table: string,
      column: string,
    ): string | undefined => {
      const f = fields.find((x) => x.key === table);
      const cols = (f?.columns ?? []) as { key: string; linkedRef?: string }[];
      return cols.find((c) => c.key === column)?.linkedRef;
    };
    for (const layer of parsed.spec.layers) {
      for (const type of layer.annotationTypes) {
        expect(linkedOf(type.fields, 'properties', 'type'), type.id).toBe('typeRef');
        if (type.fields.some((f) => f.key === 'supertypes')) {
          expect(linkedOf(type.fields, 'supertypes', 'type'), type.id).toBe('typeRef');
        }
        if (type.fields.some((f) => f.key === 'functions')) {
          expect(
            linkedOf(type.fields, 'functions', 'returnType'),
            type.id,
          ).toBeUndefined();
        }
      }
    }
  });
});
