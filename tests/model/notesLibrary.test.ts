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
  addComponentMarking,
  createDrawingCache,
  createMarking,
  drawingValues,
  getAnnotationIssues,
  moveContainer,
  moveMarking,
  setContainerDensity,
  setFieldValue,
  setTableCell,
  specializationUpdateImpact,
  updateSpecialization,
  type Project,
  type Spec,
} from '../../src/model';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { fitComponentSize } from '../../src/model/components/sizing';
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

describe('package libraries/notas', () => {
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
    expect(report.summary).toMatchObject({ level: 3, types: 3, components: 3, docs: 3 });
  });

  it('the specialization is formatVersion 7, version 5, with the floating note and table, the plain text and a component each', () => {
    const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.formatVersion).toBe(7);
    expect(parsed.spec.id).toBe('notas');
    expect(parsed.spec.version).toBe(5);
    const [layer] = parsed.spec.layers;
    expect(layer?.name).toBe('Notes');
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
    expect(NOTES_FILES.get('docs/tabela.md')).toMatch(/arrow/);
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
        version: 5,
        file: 'specs/notas/notas.spec.json',
      }),
    ]);
    expect(applied.project.layers.map((l) => l.name)).toEqual(['Layer 1', 'Notes']);
    expect(applied.project.layers[1]?.spec).toEqual({
      specId: 'notas',
      layerId: 'notas',
    });
    expect([...applied.packageFiles.keys()].sort()).toEqual([
      'components/nota.json',
      'components/tabela.json',
      'components/texto.json',
      'docs/nota.md',
      'docs/tabela.md',
      'docs/texto.md',
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
      'specs/notas/components/texto.json',
      'specs/notas/docs/nota.md',
      'specs/notas/docs/tabela.md',
      'specs/notas/docs/texto.md',
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
    annotationTypes: layer.annotationTypes.filter(
      (t) => t.id !== 'tabela' && t.id !== 'texto',
    ),
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
    expect(next.specializations[0]).toMatchObject({ id: NOTES_ID, version: 5 });
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
    expect(entry.previewValues?.linhas).toEqual([
      { _id: 'preview-1', chave: 'source', valor: 'cart' },
      { _id: 'preview-2', chave: 'items', valor: '3' },
      { _id: 'preview-3', chave: 'total', valor: '149.90' },
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
    expect(texts).toEqual([
      'checkout_started',
      'source',
      'cart',
      'items',
      '3',
      'total',
      '149.90',
    ]);
  });

  it('the Nota still has no rows in the preview', () => {
    expect(findEntry(catalog, 'nota')?.previewValues?.texto).toBe(
      'Write your comment here.',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The Text type (version 5): plain text, a non-floating type with a component.

describe('Texto type: the specialization', () => {
  it('the package lists the 7 files of the folder', () => {
    expect([...NOTES_FILES.keys()].sort()).toEqual([
      'components/nota.json',
      'components/tabela.json',
      'components/texto.json',
      'docs/nota.md',
      'docs/tabela.md',
      'docs/texto.md',
      'notas.spec.json',
    ]);
  });

  it('is not floating, its label is the text, and the fields and options are those of the decision', () => {
    const type = notesV2().layers[0]!.annotationTypes.find((t) => t.id === 'texto')!;
    expect(type.floating).toBeUndefined();
    expect(type).toMatchObject({
      id: 'texto',
      name: 'Text',
      labelField: 'texto',
      component: 'components/texto.json',
      doc: 'docs/texto.md',
    });
    expect(type.fields.map((f) => f.key)).toEqual([
      'texto',
      'tamanho',
      'peso',
      'cor',
      'largura',
    ]);
    const field = (key: string) => type.fields.find((f) => f.key === key)!;
    expect(field('texto')).toMatchObject({ type: 'string', required: true });
    expect(field('tamanho')).toMatchObject({ type: 'number' });
    expect(field('cor')).toMatchObject({ type: 'string' });
    for (const key of ['tamanho', 'peso', 'cor', 'largura']) {
      expect(field(key).required, key).toBeUndefined();
      expect('default' in field(key), key).toBe(false);
    }
    const options = (key: string) => (field(key) as { options?: string[] }).options;
    expect(field('peso').type).toBe('enum');
    expect(options('peso')).toEqual(['regular', 'medium', 'semibold', 'bold']);
    expect(field('largura').type).toBe('enum');
    expect(options('largura')).toEqual(['auto', 'fixa']);
    expect(type.examples).toEqual([
      {
        name: 'Column label',
        values: { texto: 'enabled', tamanho: 12, cor: '#49454F' },
      },
    ]);
  });

  it('the component preview has only the text', () => {
    const component = JSON.parse(NOTES_FILES.get('components/texto.json') ?? '{}') as {
      formatVersion: number;
      preview: Record<string, unknown>;
    };
    expect(component.formatVersion).toBe(4);
    expect(component.preview).toEqual({ texto: 'Text' });
  });
});

describe('Texto type: the drawing and the fit', () => {
  const catalog = notesCatalog();
  const component = catalog.get(NOTES_ID)!.byType.get('texto')!;
  const type = notesV2().layers[0]!.annotationTypes.find((t) => t.id === 'texto')!;
  const measure = { measure: approximateMeasurer };

  function textProject(values: Record<string, string | number>): Project {
    const p = addComponentMarking(
      notesProject(),
      catalog,
      {
        markingId: 'X1',
        annotationId: 'AX1',
        containerId: null,
        parentId: null,
        specId: NOTES_ID,
        typeId: 'texto',
        rect: { x: 0, y: 0, width: 200, height: 40 },
        values,
      },
      approximateMeasurer,
    );
    return p;
  }

  function drawnText(values: Record<string, string | number>): TextNode {
    const p = textProject(values);
    const annotation = p.annotations.find((a) => a.id === 'AX1')!;
    const drawn = drawingValues(p, annotation, type).values;
    const { root, warnings } = instantiate(
      component,
      drawn,
      { x: 0, y: 0, width: 200, height: 40 },
      measure,
    );
    expect(warnings).toEqual([]);
    const [node] = collectTexts(root);
    return node!.node;
  }

  const fit = (
    values: Record<string, string | number>,
    base?: { width: number; height: number },
  ) =>
    fitComponentSize(component, values as never, measure, base ? { base } : {}) as {
      width: number;
      height: number;
    };

  it('the component is a bare frame: no fill, border, shadow or padding', () => {
    const { root } = instantiate(
      component,
      { texto: 'Hello' },
      { x: 0, y: 0, width: 120, height: 20 },
      measure,
    );
    expect(root.fills).toEqual([]);
    expect(root.stroke).toBeUndefined();
    expect(root.effects).toEqual([]);
  });

  it('auto: the box fits one line of the text', () => {
    const one = fit({ texto: 'enabled' });
    const measured = approximateMeasurer(
      'enabled',
      {
        family: '',
        size: 14,
        weight: 400,
        lineHeight: undefined,
        letterSpacing: 0,
      } as never,
      undefined,
    );
    expect(one.width).toBe(Math.ceil(measured.width - 1e-6));
    expect(one.height).toBeGreaterThan(0);
  });

  it('auto: two typed lines fit two lines, as wide as the longer one', () => {
    const one = fit({ texto: 'Line 1' });
    const two = fit({ texto: 'Line 1\nLine 2' });
    expect(two.width).toBe(one.width);
    expect(Math.abs(two.height - 2 * one.height)).toBeLessThanOrEqual(1);
    const uneven = fit({ texto: 'Hi\nA longer line' });
    expect(uneven.width).toBe(fit({ texto: 'A longer line' }).width);
  });

  it('auto: a long text does not wrap by itself', () => {
    const long = 'a long text that would wrap at any narrow width of the marking';
    const fitted = fit({ texto: long }, { width: 60, height: 20 });
    expect(fitted.width).toBeGreaterThan(60);
    expect(fitted.height).toBe(fit({ texto: 'x' }).height);
  });

  it('fixa: the width stays and the height follows the wrapped lines', () => {
    const long = 'a long text that wraps at the width of the marking when it is fixed';
    const fitted = fit({ texto: long, largura: 'fixa' }, { width: 100, height: 20 });
    expect(fitted.width).toBe(100);
    expect(fitted.height).toBeGreaterThan(fit({ texto: 'x' }).height * 2);
    const wider = fit({ texto: long, largura: 'fixa' }, { width: 400, height: 20 });
    expect(wider.width).toBe(400);
    expect(wider.height).toBeLessThan(fitted.height);
  });

  it('draws the size and the weight written', () => {
    const node = drawnText({ texto: 'Title', tamanho: 20, peso: 'bold' });
    expect(node.style.fontSize).toBe(20);
    expect(node.style.fontWeight).toBe(700);
  });

  it('the weights are 400, 500, 600 and 700', () => {
    const weights = ['regular', 'medium', 'semibold', 'bold'].map(
      (peso) => drawnText({ texto: 'T', peso }).style.fontWeight,
    );
    expect(weights).toEqual([400, 500, 600, 700]);
  });

  it('empty fields draw 14, 400 and #1F1F1F, with no wrap', () => {
    const node = drawnText({ texto: 'Plain' });
    expect(node.style.fontSize).toBe(14);
    expect(node.style.fontWeight).toBe(400);
    expect(node.fills).toEqual([{ type: 'solid', color: '#1F1F1F' }]);
    expect(node.style.wrap).toBe('none');
  });

  it('the color written is the one drawn, and fixa wraps by word', () => {
    const node = drawnText({ texto: 'Colored', cor: '#49454F', largura: 'fixa' });
    expect(node.fills).toEqual([{ type: 'solid', color: '#49454F' }]);
    expect(node.style.wrap).toBeUndefined();
  });

  it('a value that is not a color: the library does not check it and the drawing gets it as it is', () => {
    const node = drawnText({ texto: 'Odd', cor: 'banana' });
    expect(node.fills).toEqual([{ type: 'solid', color: 'banana' }]);
  });

  it('density 2 doubles the font size, as for any component', () => {
    let p = setContainerDensity(notesProject(), 'I1', 2);
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: 'X1',
        annotationId: 'AX1',
        containerId: 'I1',
        parentId: null,
        specId: NOTES_ID,
        typeId: 'texto',
        rect: { x: 10, y: 10, width: 200, height: 40 },
        values: { texto: 'Dense', tamanho: 20 },
      },
      approximateMeasurer,
    );
    const scene = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('X1')!;
    const [node] = collectTexts(scene.root);
    expect(node!.node.style.fontSize).toBe(20);
    expect(scene.root.transform.slice(0, 4)).toEqual([2, 0, 0, 2]);
    // The drawn size in image pixels: unit size times the scale of the root.
    expect(node!.node.style.fontSize * scene.root.transform[0]).toBe(40);
  });
});

describe('Texto type: the space', () => {
  const catalog = notesCatalog();
  const add = (
    p: Project,
    id: string,
    containerId: string | null,
    rect?: { x: number; y: number; width: number; height: number },
  ): Project =>
    addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A-${id}`,
        containerId,
        parentId: null,
        specId: NOTES_ID,
        typeId: 'texto',
        ...(rect ? { rect } : {}),
        values: { texto: 'Label' },
      },
      approximateMeasurer,
    );
  const get = (p: Project, id: string) => p.markings.find((m) => m.id === id)!;
  const area = (p: Project) => {
    const { placement, width, height } = p.containers.find((c) => c.id === 'I1')!;
    return {
      x: placement.x,
      y: placement.y,
      width: width * placement.scale,
      height: height * placement.scale,
    };
  };

  it('on the canvas it is born not floating', () => {
    const p = add(notesProject(), 'X1', null, {
      x: 5000,
      y: 5000,
      width: 80,
      height: 20,
    });
    expect(get(p, 'X1')).toMatchObject({ containerId: null, floating: false });
  });

  it('in I1 it is born in the container space, not floating', () => {
    const p = add(notesProject(), 'X1', 'I1', { x: 20, y: 30, width: 80, height: 20 });
    expect(get(p, 'X1')).toMatchObject({
      containerId: 'I1',
      floating: false,
      rect: { x: 20, y: 30, width: 80, height: 20 },
    });
  });

  it('a canvas text moved entirely inside I1 settles into I1', () => {
    const base = notesProject();
    const box = area(base);
    const start = { x: box.x + box.width + 400, y: box.y, width: 80, height: 20 };
    let p = add(base, 'X1', null, start);
    expect(get(p, 'X1').containerId).toBeNull();
    p = moveMarking(p, 'X1', box.x + 50 - start.x, 0);
    expect(get(p, 'X1')).toMatchObject({ containerId: 'I1', floating: false });
    expect(get(p, 'X1').rect.width).toBe(80);
  });

  it('a text inside I1 keeps its rect in container pixels when I1 is moved', () => {
    const rect = { x: 40, y: 60, width: 80, height: 20 };
    const p = add(notesProject(), 'X1', 'I1', rect);
    const { placement } = p.containers.find((c) => c.id === 'I1')!;
    const moved = moveContainer(p, 'I1', placement.x + 300, placement.y + 200);
    expect(get(moved, 'X1')).toMatchObject({ containerId: 'I1', rect });
  });
});
