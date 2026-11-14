// The bundled notes library (`libraries/notas/`, Spatial markings stage, ME3): the package
// is valid, `index.ts` lists every file in the folder and applying it by default uses the
// common path of any library (`applySpecialization`).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NOTES_FILES,
  NOTES_ID,
  NOTES_LIBRARY,
  NOTES_SPEC_FILE,
} from '../../libraries/notas';
import {
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  hasBundledLibrary,
} from '../../src/model/bundledLibrary';
import { validateLibrary } from '../../src/model/library';
import { createProject } from '../../src/model/project';
import { parseSpecText } from '../../src/model/spec';
import { ModelError } from '../../src/model/errors';
import {
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  checkSpecApply,
  createMarking,
  drawingValues,
  getAnnotationIssues,
  setFieldValue,
  setTableCell,
  specializationUpdateImpact,
  updateSpecialization,
  type Project,
  type Spec,
} from '../../src/model';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import type { FrameNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { notesCatalog, notesProject } from './notesFixtures';

const ROOT = join(__dirname, '../../libraries/notas');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return listDisk(full);
    return [relative(ROOT, full).split('\\').join('/')];
  });
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ModelError);
    expect((e as ModelError).code).toBe(code);
    return;
  }
  throw new Error(`expected error ${code}`);
}

const project = () =>
  createProject({
    name: 'P',
    now: '2026-10-22T00:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Layer 1', color: '#336699' },
  });

describe('pacote libraries/notas', () => {
  it('index.ts lists every file in the folder except index.ts itself', () => {
    const onDisk = listDisk(ROOT)
      .filter((p) => p !== 'index.ts')
      .sort();
    expect([...NOTES_FILES.keys()].sort()).toEqual(onDisk);
  });

  it("the bundled text is the file's text", () => {
    for (const [path, text] of NOTES_FILES) {
      expect(text, path).toBe(readFileSync(join(ROOT, path), 'utf8'));
    }
  });

  it('validates with no error and no warning at the three levels (a bundled library does not open with a warning)', () => {
    const files = [...NOTES_FILES].map(([path, text]) => ({ path, text }));
    const report = validateLibrary({ files, specPath: NOTES_SPEC_FILE });
    expect(report.errors).toEqual([]);
    // The `minSize` (160 × 96) fits the `preview` and the example with short text.
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 2, docs: 2 });
  });

  it('the specialization is formatVersion 7, version 3, with the floating note and table and with a component', () => {
    const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.formatVersion).toBe(7);
    expect(parsed.spec.id).toBe('notas');
    expect(parsed.spec.version).toBe(3);
    const [layer] = parsed.spec.layers;
    expect(layer?.name).toBe('Notas');
    const [type, table] = layer?.annotationTypes ?? [];
    expect(type).toMatchObject({
      id: 'nota',
      floating: true,
      labelField: 'titulo',
      component: 'components/nota.json',
    });
    const text = type?.fields.find((f) => f.key === 'texto');
    expect(text).toMatchObject({ type: 'string', required: true });
    expect(table).toMatchObject({
      id: 'tabela',
      floating: true,
      labelField: 'titulo',
      component: 'components/tabela.json',
      doc: 'docs/tabela.md',
    });
    const rows = table?.fields.find((f) => f.key === 'linhas');
    expect(rows?.type === 'table' && rows.columns).toMatchObject([
      { key: 'chave', type: 'string', required: true },
      { key: 'valor', type: 'string' },
    ]);
  });

  it('the table component is formatVersion 2, uses repeat and has 2 to 3 rows in the preview', () => {
    const component = JSON.parse(NOTES_FILES.get('components/tabela.json') ?? '{}') as {
      formatVersion: number;
      preview: { linhas: unknown[] };
      template: { children: { type: string; field?: string }[] };
    };
    expect(component.formatVersion).toBe(2);
    expect(component.preview.linhas.length).toBeGreaterThanOrEqual(2);
    expect(component.preview.linhas.length).toBeLessThanOrEqual(3);
    expect(component.template.children.map((c) => c.type)).toEqual(['text', 'repeat']);
    expect(component.template.children[1]?.field).toBe('linhas');
  });

  it('the table document says the link to the target is an arrow', () => {
    expect(NOTES_FILES.get('docs/tabela.md')).toMatch(/seta/);
  });
});

describe('applyBundledLibrary', () => {
  it('applies like any library: copy in specs/notas/, Notas layer and package without the specialization', () => {
    const base = project();
    expect(hasBundledLibrary(base, NOTES_LIBRARY)).toBe(false);
    const applied = applyBundledLibrary(base, NOTES_LIBRARY, { newId: () => 'LN' });
    expect(hasBundledLibrary(applied.project, NOTES_LIBRARY)).toBe(true);
    expect(applied.project.specializations).toEqual([
      expect.objectContaining({
        id: 'notas',
        version: 3,
        file: 'specs/notas/notas.spec.json',
      }),
    ]);
    expect(applied.project.layers.map((l) => l.name)).toEqual(['Layer 1', 'Notas']);
    expect(applied.project.layers[1]?.spec).toEqual({
      specId: 'notas',
      layerId: 'notas',
    });
    expect([...applied.packageFiles.keys()].sort()).toEqual([
      'components/nota.json',
      'components/tabela.json',
      'docs/nota.md',
      'docs/tabela.md',
    ]);
  });

  it('applying twice fails like any library', () => {
    const { project: once } = applyBundledLibrary(project(), NOTES_LIBRARY);
    expectCode(() => applyBundledLibrary(once, NOTES_LIBRARY), 'spec-already-applied');
  });

  it('bundledLibraryDiskFiles gives every file with the project path', () => {
    const { project: applied } = applyBundledLibrary(project(), NOTES_LIBRARY);
    const files = bundledLibraryDiskFiles(applied, NOTES_LIBRARY);
    expect([...files.keys()].sort()).toEqual([
      'specs/notas/components/nota.json',
      'specs/notas/components/tabela.json',
      'specs/notas/docs/nota.md',
      'specs/notas/docs/tabela.md',
      'specs/notas/notas.spec.json',
    ]);
    expect(JSON.parse(files.get('specs/notas/notas.spec.json') ?? '{}')).toMatchObject({
      id: 'notas',
      formatVersion: 7,
    });
  });

  it('bundledLibraryDiskFiles without the library applied fails', () => {
    expectCode(() => bundledLibraryDiskFiles(project(), NOTES_LIBRARY), 'not-found');
  });
});

// ---------------------------------------------------------------------------------------------
// The B4 update takes a project from version 1 to 2 (additive: one new type, no migration).

/** The version 1 specialization: the current one without the Tabela (and `version: 1`). */
function notesV1(): Spec {
  const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const layers = parsed.spec.layers.map((layer) => ({
    ...layer,
    annotationTypes: layer.annotationTypes.filter((t) => t.id !== 'tabela'),
  }));
  return { ...parsed.spec, version: 1, layers };
}

function notesV2(): Spec {
  const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

describe('update of the notes library from version 1 to 2', () => {
  function withV1(): Project {
    let p = applySpecialization(project(), notesV1(), { newId: () => 'LN' });
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: 0, y: 0, width: 240, height: 120 },
      floating: true,
    });
    p = addTypedAnnotation(p, {
      id: 'AN1',
      markingId: 'N1',
      layerId: 'LN',
      type: { specId: NOTES_ID, typeId: 'nota' },
    });
    return setFieldValue(p, 'AN1', 'texto', 'A version 1 note');
  }

  it('v2 is an additive update: no break, no loss, no new layer, no new pending item', () => {
    const p = withV1();
    expect(checkSpecApply(p, notesV2())).toBe('update');
    const impact = specializationUpdateImpact(p, notesV2());
    expect(impact).toMatchObject({
      additive: true,
      refused: false,
      comparable: true,
      brokenRefs: 0,
      converted: 0,
      deleted: 0,
    });
    expect(impact.breaking).toEqual([]);
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.addedLayers).toEqual([]);
    expect(impact.freedLayers).toEqual([]);
    expect(impact.losses).toEqual([]);
    expect(impact.pending).toEqual([]);
    expect(impact.changes.map((c) => c.code)).toContain('added-type');
  });

  it('updates: the version goes up, the note stays as it was and the Tabela starts to exist', () => {
    const p = withV1();
    const next = updateSpecialization(p, notesV2(), { newId: () => 'X' });
    expect(next.specializations[0]).toMatchObject({ id: NOTES_ID, version: 3 });
    expect(next.layers.map((l) => l.id)).toEqual(p.layers.map((l) => l.id));
    expect(next.annotations.find((a) => a.id === 'AN1')).toEqual(
      p.annotations.find((a) => a.id === 'AN1'),
    );
    // The Tabela can now be created in the Notas layer that v1 had created.
    let q = createMarking(next, {
      id: 'T1',
      containerId: null,
      rect: { x: 300, y: 0, width: 240, height: 120 },
      floating: true,
    });
    q = addTypedAnnotation(q, {
      id: 'AT1',
      markingId: 'T1',
      layerId: 'LN',
      type: { specId: NOTES_ID, typeId: 'tabela' },
    });
    expect(getAnnotationIssues(q, 'AT1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The Tabela: the annotation and the drawing (the component's `repeat`).

describe('Tabela type', () => {
  const catalog = notesCatalog();
  const component = catalog.get(NOTES_ID)?.byType.get('tabela');
  const type = notesV2().layers[0]!.annotationTypes.find((t) => t.id === 'tabela')!;

  function tableProject(): Project {
    let p = notesProject();
    p = createMarking(p, {
      id: 'T1',
      containerId: null,
      rect: { x: 0, y: 0, width: 240, height: 140 },
      floating: true,
    });
    const layer = p.layers.find((l) => l.spec?.specId === NOTES_ID)!.id;
    p = addTypedAnnotation(p, {
      id: 'AT1',
      markingId: 'T1',
      layerId: layer,
      type: { specId: NOTES_ID, typeId: 'tabela' },
    });
    p = setFieldValue(p, 'AT1', 'titulo', 'checkout_started');
    for (const [id, key, value] of [
      ['R1', 'source', 'cart'],
      ['R2', 'total', '149.90'],
    ] as const) {
      p = addTableRow(p, 'AT1', 'linhas', id);
      p = setTableCell(p, 'AT1', 'linhas', id, 'chave', key);
      p = setTableCell(p, 'AT1', 'linhas', id, 'valor', value);
    }
    return p;
  }

  it('the catalog finds the Tabela component', () => {
    expect(component?.formatVersion).toBe(2);
  });

  it('the annotation starts with no rows and the key is required', () => {
    let p = notesProject();
    p = createMarking(p, {
      id: 'T1',
      containerId: null,
      rect: { x: 0, y: 0, width: 240, height: 140 },
      floating: true,
    });
    const layer = p.layers.find((l) => l.spec?.specId === NOTES_ID)!.id;
    p = addTypedAnnotation(p, {
      id: 'AT1',
      markingId: 'T1',
      layerId: layer,
      type: { specId: NOTES_ID, typeId: 'tabela' },
    });
    expect(getAnnotationIssues(p, 'AT1')).toEqual([]);
    p = addTableRow(p, 'AT1', 'linhas', 'R1');
    expect(getAnnotationIssues(p, 'AT1')).toEqual([
      { code: 'required-empty', key: 'linhas', rowId: 'R1', column: 'chave' },
    ]);
  });

  it('draws the title and one row per record, key on the left and value on the right', () => {
    const p = tableProject();
    const annotation = p.annotations.find((a) => a.id === 'AT1')!;
    const { values } = drawingValues(p, annotation, type);
    expect(values.linhas).toEqual([
      { chave: 'source', valor: 'cart' },
      { chave: 'total', valor: '149.90' },
    ]);
    const { root, warnings } = instantiate(
      component!,
      values,
      { x: 0, y: 0, width: 240, height: 140 },
      { measure: approximateMeasurer },
    );
    expect(warnings).toEqual([]);
    const texts = collectTexts(root);
    expect(texts.map((t) => t.text)).toEqual([
      'checkout_started',
      'source',
      'cart',
      'total',
      '149.90',
    ]);
    // Two stacked rows: the second below the first; the key to the left of the value.
    const [, key1, value1, key2] = texts;
    expect(key2!.y).toBeGreaterThan(key1!.y);
    expect(value1!.x).toBeGreaterThan(key1!.x);
    expect(value1!.y).toBe(key1!.y);
    // The value is right-aligned.
    expect(value1!.node.style.align).toBe('right');
  });

  it('with no rows draws only the title', () => {
    const p = tableProject();
    const empty: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AT1' ? { ...a, values: { ...a.values, linhas: [] } } : a,
      ),
    };
    const { values } = drawingValues(
      empty,
      empty.annotations.find((a) => a.id === 'AT1')!,
      type,
    );
    const { root } = instantiate(
      component!,
      values,
      { x: 0, y: 0, width: 240, height: 140 },
      { measure: approximateMeasurer },
    );
    expect(collectTexts(root).map((t) => t.text)).toEqual(['checkout_started']);
  });
});

interface PlacedText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly node: TextNode;
}

/** The scene's texts in drawing order, with the absolute position. */
function collectTexts(root: FrameNode): PlacedText[] {
  const out: PlacedText[] = [];
  const visit = (node: SceneNode, ox: number, oy: number): void => {
    const x = ox + node.transform[4];
    const y = oy + node.transform[5];
    if (node.type === 'text') out.push({ text: node.text, x, y, node });
    if (node.type === 'frame') for (const child of node.children) visit(child, x, y);
  };
  visit(root, 0, 0);
  return out;
}

describe('Catalog with the Tabela', () => {
  const files = [...NOTES_FILES].map(([path, text]) => ({ path, text }));
  const catalog = buildCatalog(files);
  const entry = findEntry(catalog, 'tabela')!;

  it('the preview reaches the Catalog with the rows (each with _id for the playground form)', () => {
    expect(catalog.report.errors).toEqual([]);
    expect(entry.component?.formatVersion).toBe(2);
    // pt-BR kept: bundled library data (libraries/notas preview) asserted verbatim
    expect(entry.previewValues?.linhas).toEqual([
      { _id: 'preview-1', chave: 'origem', valor: 'carrinho' },
      { _id: 'preview-2', chave: 'itens', valor: '3' },
      { _id: 'preview-3', chave: 'total', valor: '149,90' },
    ]);
    expect(entry.fields.find((f) => f.key === 'linhas')).toMatchObject({
      type: 'table',
      columns: [{ key: 'chave' }, { key: 'valor' }],
    });
  });

  it('draws the Tabela preview with one row per record', () => {
    const drawing = drawEntry(entry, entry.previewValues ?? {}, approximateMeasurer);
    expect(drawing?.warnings).toEqual([]);
    const texts: string[] = [];
    const visit = (node: SceneNode): void => {
      if (node.type === 'text') texts.push(node.text);
      if (node.type === 'frame') node.children.forEach(visit);
    };
    if (drawing) visit(drawing.root);
    // pt-BR kept: bundled library data (libraries/notas preview) asserted verbatim
    expect(texts).toEqual([
      'checkout_started',
      'origem',
      'carrinho',
      'itens',
      '3',
      'total',
      '149,90',
    ]);
  });

  it('the Nota still has no rows in the preview', () => {
    // pt-BR kept: bundled library data (libraries/notas preview) asserted verbatim
    expect(findEntry(catalog, 'nota')?.previewValues?.texto).toBe(
      'Escreva aqui o comentário.',
    );
  });
});
