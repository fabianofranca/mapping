// Biblioteca de exemplo Kotlin (`examples/libraries/kotlin/`): onze tipos de declaração (classe,
// objeto e interface), cada um com componente e documento; as propriedades são alvos de referência.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';

const ROOT = join(__dirname, '../../examples/libraries/kotlin');
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

describe('biblioteca de exemplo Kotlin', () => {
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

  it('a especialização é a formatVersion 7 com duas camadas e as propriedades como alvos', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec).toMatchObject({ formatVersion: 7, id: 'kotlin', version: 1 });
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
});
