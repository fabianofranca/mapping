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
import { parseSpecText, SPEC_FORMAT_VERSION } from '../../src/model/spec';
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
  setContainerDrawingMode,
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
import { projectNamedLookup } from '../../src/model/projectTokens';
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

/** The package files other than the specialization, sorted. */
const PACKAGE_FILES = [
  'components/colchete.json',
  'components/linha.json',
  'components/moldura.json',
  'components/nota.json',
  'components/texto.json',
  'docs/colchete.md',
  'docs/linha.md',
  'docs/moldura.md',
  'docs/nota.md',
  'docs/texto.md',
];

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
    expect(report.summary).toMatchObject({ level: 3, types: 5, components: 5, docs: 5 });
  });

  it('the specialization has the floating note first, a component each', () => {
    const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.id).toBe('notas');
    const [layer] = parsed.spec.layers;
    expect(layer?.name).toBe('Notes');
    expect(layer?.annotationTypes.map((t) => t.id).slice(0, 2)).toEqual([
      'nota',
      'texto',
    ]);
    const [type] = layer?.annotationTypes ?? [];
    expect(type).toMatchObject({
      id: 'nota',
      floating: true,
      labelField: 'titulo',
      component: 'components/nota.json',
      doc: 'docs/nota.md',
    });
  });

  it('the note fields, in order: titulo, texto, linhas, textoDepois, cor; none required', () => {
    const type = notesV2().layers[0]!.annotationTypes.find((t) => t.id === 'nota')!;
    expect(type.fields.map((f) => f.key)).toEqual([
      'titulo',
      'texto',
      'linhas',
      'textoDepois',
      'cor',
    ]);
    for (const field of type.fields) expect(field.required, field.key).toBeUndefined();
    const field = (key: string) => type.fields.find((f) => f.key === key)!;
    expect(field('textoDepois')).toMatchObject({ type: 'string', label: 'Text after' });
    expect(field('cor')).toMatchObject({
      type: 'enum',
      label: 'Color',
      options: ['yellow', 'blue', 'green', 'pink', 'orange', 'gray'],
    });
    expect('default' in field('cor')).toBe(false);
    const rows = field('linhas');
    expect(rows.type === 'table' && rows.columns).toMatchObject([
      { key: 'chave', type: 'string', required: true },
      { key: 'valor', type: 'string' },
    ]);
  });

  it('the note component is formatVersion 2 (repeat) and the table type, component and document are gone', () => {
    const component = JSON.parse(NOTES_FILES.get('components/nota.json') ?? '{}') as {
      formatVersion: number;
    };
    expect(component.formatVersion).toBe(2);
    expect(NOTES_FILES.has('components/tabela.json')).toBe(false);
    expect(NOTES_FILES.has('docs/tabela.md')).toBe(false);
  });

  it('the note document says the table goes beside a screen and is linked by an arrow', () => {
    expect(NOTES_FILES.get('docs/nota.md')).toMatch(/arrow/);
    expect(NOTES_FILES.get('docs/nota.md')).toMatch(/Rows/);
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
        version: 7,
        file: 'specs/notas/notas.spec.json',
      }),
    ]);
    expect(applied.project.layers.map((l) => l.name)).toEqual(['Layer 1', 'Notes']);
    expect(applied.project.layers[1]?.spec).toEqual({
      specId: 'notas',
      layerId: 'notas',
    });
    expect([...applied.packageFiles.keys()].sort()).toEqual(PACKAGE_FILES);
  });

  it('applying twice fails like any library', () => {
    const { project: once } = applyBundledLibrary(project(), NOTES_LIBRARY);
    expectCode(() => applyBundledLibrary(once, NOTES_LIBRARY), 'spec-already-applied');
  });

  it('bundledLibraryDiskFiles gives every file with the project path', () => {
    const { project: applied } = applyBundledLibrary(project(), NOTES_LIBRARY);
    const files = bundledLibraryDiskFiles(applied, NOTES_LIBRARY);
    expect([...files.keys()].sort()).toEqual(
      ['notas.spec.json', ...PACKAGE_FILES].sort().map((f) => `specs/notas/${f}`),
    );
    expect(JSON.parse(files.get('specs/notas/notas.spec.json') ?? '{}')).toMatchObject({
      id: 'notas',
      formatVersion: SPEC_FORMAT_VERSION,
    });
  });

  it('bundledLibraryDiskFiles without the library applied fails', () => {
    expectCode(() => bundledLibraryDiskFiles(project(), NOTES_LIBRARY), 'not-found');
  });
});

// ---------------------------------------------------------------------------------------------
// The update of an old copy (version 1) takes the project to the current version.

const v5Text = readFileSync(join(__dirname, 'fixtures', 'notas-v5.spec.json'), 'utf8');

/** The version 1 specialization: version 5 without the table and the text (and `version: 1`). */
function notesV1(): Spec {
  const parsed = parseSpecText(v5Text);
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

describe('update of the notes library from version 1 to 7', () => {
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

  it('v7 breaks nothing for a v1 project: no missing migration, no loss, no new layer, no pending item', () => {
    const p = withV1();
    expect(checkSpecApply(p, notesV2())).toBe('update');
    const impact = specializationUpdateImpact(p, notesV2());
    expect(impact).toMatchObject({
      refused: false,
      comparable: true,
      brokenRefs: 0,
      converted: 0,
      deleted: 0,
    });
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.addedLayers).toEqual([]);
    expect(impact.freedLayers).toEqual([]);
    expect(impact.losses).toEqual([]);
    expect(impact.pending).toEqual([]);
    expect(impact.changes.map((c) => c.code)).toContain('added-type');
  });

  it('updates: the version goes up and the note stays as it was', () => {
    const p = withV1();
    const next = updateSpecialization(p, notesV2(), { newId: () => 'X' });
    expect(next.specializations[0]).toMatchObject({ id: NOTES_ID, version: 7 });
    expect(next.layers.map((l) => l.id)).toEqual(p.layers.map((l) => l.id));
    expect(next.annotations.find((a) => a.id === 'AN1')).toEqual(
      p.annotations.find((a) => a.id === 'AN1'),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The Note: the annotation and the drawing (colors, rows, the order of the parts).

const NOTE_BOX = { x: 0, y: 0, width: 240, height: 200 };
const NOTE_COLORS = {
  yellow: ['#FFF1A8', '#3B3200'],
  blue: ['#D6E8FF', '#0B2E59'],
  green: ['#D7F5DC', '#0E3B17'],
  pink: ['#FFD9E8', '#5A0F2E'],
  orange: ['#FFE0C2', '#5A2A00'],
  gray: ['#E9EAEC', '#26282B'],
} as const;

describe('Note type', () => {
  const catalog = notesCatalog();
  const component = catalog.get(NOTES_ID)!.byType.get('nota')!;
  const type = notesV2().layers[0]!.annotationTypes.find((t) => t.id === 'nota')!;

  // As the app hands the values: every field present, empty ones null.
  const empty = { titulo: null, texto: null, linhas: null, textoDepois: null, cor: null };
  const draw = (values: Record<string, unknown>) =>
    instantiate(component, { ...empty, ...values } as never, NOTE_BOX, {
      measure: approximateMeasurer,
    });

  function noteProject(): Project {
    let p = notesProject();
    p = createMarking(p, {
      id: 'T1',
      containerId: null,
      rect: { x: 0, y: 0, width: 240, height: 200 },
      floating: true,
    });
    const layer = p.layers.find((l) => l.spec?.specId === NOTES_ID)!.id;
    p = addTypedAnnotation(p, {
      id: 'AT1',
      markingId: 'T1',
      layerId: layer,
      type: { specId: NOTES_ID, typeId: 'nota' },
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

  it('the catalog finds the Note component at formatVersion 2', () => {
    expect(component.formatVersion).toBe(2);
    expect(catalog.get(NOTES_ID)?.byType.has('tabela')).toBe(false);
  });

  it('an empty note is valid; a row with no key is the only issue', () => {
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
      type: { specId: NOTES_ID, typeId: 'nota' },
    });
    expect(getAnnotationIssues(p, 'AT1')).toEqual([]);
    p = addTableRow(p, 'AT1', 'linhas', 'R1');
    expect(getAnnotationIssues(p, 'AT1')).toEqual([
      { code: 'required-empty', key: 'linhas', rowId: 'R1', column: 'chave' },
    ]);
  });

  it('draws the title and one row per record, key on the left and value on the right', () => {
    const p = noteProject();
    const annotation = p.annotations.find((a) => a.id === 'AT1')!;
    const { values } = drawingValues(p, annotation, type);
    expect(values.linhas).toEqual([
      { chave: 'source', valor: 'cart' },
      { chave: 'total', valor: '149.90' },
    ]);
    const { root, warnings } = draw(values);
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

  it('with no rows and no texts draws only the title', () => {
    const { root } = draw({ titulo: 'checkout_started', linhas: [] });
    expect(collectTexts(root).map((t) => t.text)).toEqual(['checkout_started']);
  });

  it('with only rows draws neither the title nor the two texts', () => {
    const { root, warnings } = draw({
      linhas: [
        { chave: 'source', valor: 'cart' },
        { chave: 'items', valor: '3' },
      ],
    });
    expect(warnings).toEqual([]);
    expect(collectTexts(root).map((t) => t.text)).toEqual([
      'source',
      'cart',
      'items',
      '3',
    ]);
  });

  it('the order is title, text, rows, text after', () => {
    const { root } = draw({
      titulo: 'Title',
      texto: 'Before',
      linhas: [{ chave: 'k', valor: 'v' }],
      textoDepois: 'After',
    });
    const texts = collectTexts(root);
    expect(texts.map((t) => t.text)).toEqual(['Title', 'Before', 'k', 'v', 'After']);
    const ys = texts.map((t) => t.y);
    expect(ys[1]).toBeGreaterThan(ys[0]!);
    expect(ys[2]).toBeGreaterThan(ys[1]!);
    expect(ys[4]).toBeGreaterThan(ys[2]!);
  });

  it('text and text after alone: each is drawn when it has a value', () => {
    expect(collectTexts(draw({ texto: 'Only text' }).root).map((t) => t.text)).toEqual([
      'Only text',
    ]);
    expect(
      collectTexts(draw({ textoDepois: 'Only after' }).root).map((t) => t.text),
    ).toEqual(['Only after']);
  });

  it.each(Object.entries(NOTE_COLORS))(
    '%s: the fill and every text use the pair of the decision',
    (cor, [fill, text]) => {
      const { root } = draw({
        cor,
        titulo: 'T',
        texto: 'x',
        linhas: [{ chave: 'k', valor: 'v' }],
        textoDepois: 'y',
      });
      expect(root.fills).toEqual([{ type: 'solid', color: fill }]);
      const texts = collectTexts(root);
      expect(texts).toHaveLength(5);
      for (const t of texts)
        expect(t.node.fills, t.text).toEqual([{ type: 'solid', color: text }]);
    },
  );

  it('an empty color draws yellow, and the field has no default', () => {
    const { root } = draw({ titulo: 'T', texto: 'x' });
    expect(root.fills).toEqual([{ type: 'solid', color: '#FFF1A8' }]);
    expect(collectTexts(root)[0]!.node.fills).toEqual([
      { type: 'solid', color: '#3B3200' },
    ]);
    const field = type.fields.find((f) => f.key === 'cor')!;
    expect('default' in field).toBe(false);
  });

  it('the color is the same in every drawing mode', () => {
    for (const mode of ['light', 'dark']) {
      let p = setContainerDrawingMode(noteProject(), 'I1', { mode });
      p = setFieldValue(p, 'AT1', 'cor', 'blue');
      const { values } = drawingValues(
        p,
        p.annotations.find((a) => a.id === 'AT1')!,
        type,
      );
      expect(draw(values).root.fills).toEqual([{ type: 'solid', color: '#D6E8FF' }]);
    }
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

describe('Catalog with the Note', () => {
  const files = [...NOTES_FILES].map(([path, text]) => ({ path, text }));
  const catalog = buildCatalog(files);
  const entry = findEntry(catalog, 'nota')!;

  it('the preview stays the title and the text', () => {
    expect(catalog.report.errors).toEqual([]);
    expect(entry.previewValues).toMatchObject({
      titulo: 'Title',
      texto: 'Write your comment here.',
      linhas: null,
      textoDepois: null,
      cor: null,
    });
    expect(findEntry(catalog, 'tabela')).toBeUndefined();
  });

  it('the fields reach the Catalog with the rows column', () => {
    expect(entry.fields.find((f) => f.key === 'linhas')).toMatchObject({
      type: 'table',
      columns: [{ key: 'chave' }, { key: 'valor' }],
    });
  });

  it('draws the Note preview with no warning', () => {
    const drawing = drawEntry(entry, entry.previewValues ?? {}, approximateMeasurer);
    expect(drawing?.warnings).toEqual([]);
    const texts: string[] = [];
    const visit = (node: SceneNode): void => {
      if (node.type === 'text') texts.push(node.text);
      if (node.type === 'frame') node.children.forEach(visit);
    };
    if (drawing) visit(drawing.root);
    expect(texts).toEqual(['Title', 'Write your comment here.']);
  });
});

// ---------------------------------------------------------------------------------------------
// The Text type: plain text, a non-floating type with a component.

describe('Texto type: the specialization', () => {
  it('the package lists the 11 files of the folder', () => {
    expect([...NOTES_FILES.keys()].sort()).toEqual(
      ['notas.spec.json', ...PACKAGE_FILES].sort(),
    );
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
      'familia',
      'alinhamento',
    ]);
    const field = (key: string) => type.fields.find((f) => f.key === key)!;
    expect(field('texto')).toMatchObject({ type: 'string', required: true });
    expect(field('tamanho')).toMatchObject({ type: 'number' });
    expect(field('cor')).toMatchObject({ type: 'string' });
    for (const key of ['tamanho', 'peso', 'cor', 'largura', 'familia', 'alinhamento']) {
      expect(field(key).required, key).toBeUndefined();
      expect('default' in field(key), key).toBe(false);
    }
    const options = (key: string) => (field(key) as { options?: string[] }).options;
    expect(field('peso').type).toBe('enum');
    expect(options('peso')).toEqual(['regular', 'medium', 'semibold', 'bold']);
    expect(field('largura').type).toBe('enum');
    expect(options('largura')).toEqual(['auto', 'fixa']);
    expect(field('familia')).toMatchObject({ type: 'string', label: 'Family' });
    expect(field('alinhamento')).toMatchObject({ type: 'enum', label: 'Alignment' });
    expect(options('alinhamento')).toEqual(['start', 'center', 'end']);
    expect(field('cor').description).not.toMatch(/not checked/);
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

  it('with no library token of that name: a literal color is used as is, a name that resolves to nothing draws #1F1F1F', () => {
    expect(drawnText({ texto: 'Odd', cor: '#FF0000' }).fills).toEqual([
      { type: 'solid', color: '#FF0000' },
    ]);
    expect(drawnText({ texto: 'Odd', cor: 'banana' }).fills).toEqual([
      { type: 'solid', color: '#1F1F1F' },
    ]);
  });

  /** The text drawn with the notes project plus a library that declares tokens. */
  function withTokens(values: Record<string, string>): TextNode {
    const base = notesProject();
    const p: Project = {
      ...base,
      specializations: [
        ...base.specializations,
        {
          id: 'theme',
          spec: {
            layers: [],
            types: [],
            tokens: {
              values: {
                'on-surface': '#102030',
                'font-brand': '"Brand Sans", sans-serif',
              },
            },
          },
        } as never,
      ],
    };
    const all = {
      tamanho: null,
      peso: null,
      cor: null,
      largura: null,
      familia: null,
      alinhamento: null,
    };
    const { root, warnings } = instantiate(
      component,
      { ...all, ...values } as never,
      { x: 0, y: 0, width: 200, height: 40 },
      {
        measure: approximateMeasurer,
        tokenNamed: projectNamedLookup(p, component, null),
      },
    );
    expect(warnings).toEqual([]);
    return collectTexts(root)[0]!.node;
  }

  it('cor names a color token of an applied library: on-surface draws its value', () => {
    expect(withTokens({ texto: 'T', cor: 'on-surface' }).fills).toEqual([
      { type: 'solid', color: '#102030' },
    ]);
    expect(withTokens({ texto: 'T', cor: '#FF0000' }).fills).toEqual([
      { type: 'solid', color: '#FF0000' },
    ]);
    expect(withTokens({ texto: 'T', cor: 'banana' }).fills).toEqual([
      { type: 'solid', color: '#1F1F1F' },
    ]);
  });

  it('familia: empty draws font-sans, font-mono the embedded mono, a token of a library its value and a stack as it is', () => {
    expect(withTokens({ texto: 'T' }).style.fontFamily).toBe(
      drawnText({ texto: 'T' }).style.fontFamily,
    );
    expect(withTokens({ texto: 'T', familia: 'font-mono' }).style.fontFamily).toBe(
      '"Mapping Mono", monospace',
    );
    expect(withTokens({ texto: 'T', familia: 'font-brand' }).style.fontFamily).toBe(
      '"Brand Sans", sans-serif',
    );
    expect(withTokens({ texto: 'T', familia: 'Roboto Mono' }).style.fontFamily).toMatch(
      /Roboto Mono/,
    );
    expect(withTokens({ texto: 'T', familia: 'font-sans' }).style.fontFamily).toBe(
      withTokens({ texto: 'T' }).style.fontFamily,
    );
  });

  it('alinhamento: center with a fixed width centers the lines; end goes right and start left', () => {
    const fixed = { texto: 'Centered', largura: 'fixa' };
    expect(drawnText({ ...fixed, alinhamento: 'center' }).style.align).toBe('center');
    expect(drawnText({ ...fixed, alinhamento: 'end' }).style.align).toBe('right');
    expect(drawnText({ ...fixed, alinhamento: 'start' }).style.align).toBe('left');
    expect(drawnText({ ...fixed }).style.align).toBe('left');
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

// ---------------------------------------------------------------------------------------------
// Frame, Bracket and Line: the decorative types (stage #2826, decision 11).

describe('Decorative notes types: the specialization', () => {
  const layerTypes = () => notesV2().layers[0]!.annotationTypes;
  const typeOf = (id: string) => layerTypes().find((t) => t.id === id);

  it('the package lists the 11 files of the folder and validates with no error and no warning', () => {
    const files = [...NOTES_FILES].map(([path, text]) => ({ path, text }));
    const report = validateLibrary({ files, specPath: NOTES_SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.summary).toMatchObject({ level: 3, types: 5, components: 5, docs: 5 });
    for (const id of ['moldura', 'colchete', 'linha']) {
      expect(NOTES_FILES.has(`components/${id}.json`), id).toBe(true);
      expect(NOTES_FILES.has(`docs/${id}.md`), id).toBe(true);
    }
  });

  it('is version 7 at the stage formatVersion, with the three types after the text', () => {
    const spec = notesV2();
    expect(spec.version).toBe(7);
    expect(spec.formatVersion).toBe(SPEC_FORMAT_VERSION);
    expect(layerTypes().map((t) => t.id)).toEqual([
      'nota',
      'texto',
      'moldura',
      'colchete',
      'linha',
    ]);
  });

  it('the three types are decorative, not floating and have no code', () => {
    for (const id of ['moldura', 'colchete', 'linha']) {
      const type = typeOf(id)!;
      expect(type.decorative, id).toBe(true);
      expect(type.floating, id).toBeFalsy();
      expect(type.code, id).toBeUndefined();
      expect(type.component, id).toBe(`components/${id}.json`);
      expect(type.doc, id).toBe(`docs/${id}.md`);
      expect(type.examples?.length, id).toBe(1);
    }
    expect(typeOf('nota')!.decorative).toBeFalsy();
    expect(typeOf('texto')!.decorative).toBeFalsy();
  });

  it('the fields, in order, none required', () => {
    const keys = (id: string) => typeOf(id)!.fields.map((f) => f.key);
    expect(keys('moldura')).toEqual(['cor', 'espessura', 'estilo', 'raio', 'fundo']);
    expect(keys('colchete')).toEqual(['cor', 'espessura', 'estilo', 'aberto']);
    expect(keys('linha')).toEqual(['cor', 'espessura', 'estilo', 'orientacao']);
    for (const id of ['moldura', 'colchete', 'linha']) {
      expect(
        typeOf(id)!.fields.some((f) => f.required),
        id,
      ).toBe(false);
      const estilo = typeOf(id)!.fields.find((f) => f.key === 'estilo')!;
      expect(estilo.options).toEqual(['solido', 'tracejado']);
    }
    expect(typeOf('colchete')!.fields[3]!.options).toEqual([
      'direita',
      'esquerda',
      'baixo',
      'cima',
    ]);
    expect(typeOf('linha')!.fields[3]!.options).toEqual(['horizontal', 'vertical']);
    expect(typeOf('moldura')!.fields[4]!.label).toBe('Fill');
  });

  it('the default sizes are 160 × 120, 16 × 120 and 160 × 8', () => {
    const catalog = notesCatalog();
    const size = (id: string) => catalog.get(NOTES_ID)!.byType.get(id)!.size;
    expect(size('moldura')).toEqual({ width: 160, height: 120 });
    expect(size('colchete')).toEqual({ width: 16, height: 120 });
    expect(size('linha')).toEqual({ width: 160, height: 8 });
  });

  it('the update from version 6 is additive: three added types, nothing else', () => {
    const parsed = parseSpecText(
      readFileSync(join(__dirname, 'fixtures', 'notas-v6.spec.json'), 'utf8'),
    );
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    let p = applySpecialization(project(), parsed.spec, { newId: () => 'LN' });
    p = createMarking(p, {
      id: 'T1',
      containerId: null,
      rect: { x: 0, y: 0, width: 120, height: 20 },
    });
    p = addTypedAnnotation(p, {
      id: 'AT1',
      markingId: 'T1',
      layerId: 'LN',
      type: { specId: NOTES_ID, typeId: 'texto' },
    });
    expect(checkSpecApply(p, notesV2())).toBe('update');
    const impact = specializationUpdateImpact(p, notesV2());
    expect(impact).toMatchObject({
      refused: false,
      comparable: true,
      brokenRefs: 0,
      converted: 0,
      deleted: 0,
    });
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.losses).toEqual([]);
    expect(impact.pending).toEqual([]);
    expect(impact.changes.filter((c) => c.code === 'added-type')).toHaveLength(3);
    const next = updateSpecialization(p, notesV2(), { newId: () => 'X' });
    expect(next.specializations[0]).toMatchObject({ id: NOTES_ID, version: 7 });
    expect(next.annotations).toEqual(p.annotations);
    expect(next.markings).toEqual(p.markings);
  });
});

describe('Decorative notes types: the drawing', () => {
  const catalog = notesCatalog();
  const BOX = { x: 0, y: 0, width: 160, height: 120 };
  const comp = (id: string) => catalog.get(NOTES_ID)!.byType.get(id)!;
  const emptyFields = {
    moldura: { cor: null, espessura: null, estilo: null, raio: null, fundo: null },
    colchete: { cor: null, espessura: null, estilo: null, aberto: null },
    linha: { cor: null, espessura: null, estilo: null, orientacao: null },
  } as const;

  function draw(
    id: keyof typeof emptyFields,
    values: Record<string, unknown> = {},
    box = BOX,
    tokens?: Project,
  ) {
    const component = comp(id);
    const { root, warnings } = instantiate(
      component,
      { ...emptyFields[id], ...values } as never,
      box,
      {
        measure: approximateMeasurer,
        ...(tokens ? { tokenNamed: projectNamedLookup(tokens, component, null) } : {}),
      },
    );
    expect(warnings).toEqual([]);
    return root;
  }

  /** The stroke's color: `none` when there is no stroke or it has no paint. */
  const strokeColor = (node: FrameNode): string => {
    const paint = node.stroke?.paints[0];
    return paint?.type === 'solid' ? paint.color : 'none';
  };

  /** Every frame of the scene, root first. */
  function frames(node: SceneNode): FrameNode[] {
    if (node.type !== 'frame') return [];
    return [node, ...node.children.flatMap(frames)];
  }

  it('the Frame with empty fields: a stroke of 1 on the four sides, #79747E, solid, no fill', () => {
    const root = draw('moldura');
    expect(root.fills).toEqual([]);
    expect(strokeColor(root)).toBe('#79747E');
    expect(root.stroke).toMatchObject({ width: 1, align: 'inside' });
    expect(root.stroke?.sides).toBeUndefined();
    expect(root.stroke?.dash ?? []).toEqual([]);
    expect(root.cornerRadius).toBe(0);
    expect([root.width, root.height]).toEqual([160, 120]);
  });

  it('the Frame draws what the fields say: color, width, dash and corner radius', () => {
    const root = draw('moldura', {
      cor: '#FF0000',
      espessura: 3,
      estilo: 'tracejado',
      raio: 8,
    });
    expect(strokeColor(root)).toBe('#FF0000');
    expect(root.stroke).toMatchObject({ width: 3, dash: [6, 4] });
    expect(root.cornerRadius).toBe(8);
  });

  it('the Frame fill: a #RRGGBB fills the box; with no value or an unknown name there is no fill', () => {
    expect(draw('moldura', { fundo: '#E8F0FE' }).fills).toEqual([
      { type: 'solid', color: '#E8F0FE' },
    ]);
    expect(draw('moldura', { fundo: 'banana' }).fills).toEqual([]);
    expect(draw('moldura', { fundo: '' }).fills).toEqual([]);
  });

  it('the Frame fill and color name a color token of an applied library', () => {
    const base = notesProject();
    const p: Project = {
      ...base,
      specializations: [
        ...base.specializations,
        {
          id: 'theme',
          spec: {
            layers: [],
            types: [],
            tokens: { values: { surface: '#102030', line: '#405060' } },
          },
        } as never,
      ],
    };
    const root = draw('moldura', { fundo: 'surface', cor: 'line' }, BOX, p);
    expect(root.fills).toEqual([{ type: 'solid', color: '#102030' }]);
    expect(strokeColor(root)).toBe('#405060');
  });

  it('espessura 0 draws no outline: the stroke color is none, not a width of 0', () => {
    const root = draw('moldura', { fundo: '#E8F0FE', espessura: 0 });
    expect(root.fills).toEqual([{ type: 'solid', color: '#E8F0FE' }]);
    expect(strokeColor(root)).toBe('none');
  });

  it('the Bracket with empty fields opens to the right: left, top and bottom', () => {
    const box = { x: 0, y: 0, width: 16, height: 120 };
    const root = draw('colchete', {}, box);
    expect(strokeColor(root)).toBe('#79747E');
    expect(root.stroke?.width).toBe(1);
    expect([...(root.stroke?.sides ?? [])].sort()).toEqual(['bottom', 'left', 'top']);
  });

  it.each([
    ['direita', ['bottom', 'left', 'top']],
    ['esquerda', ['bottom', 'right', 'top']],
    ['baixo', ['left', 'right', 'top']],
    ['cima', ['bottom', 'left', 'right']],
  ])('the Bracket aberto %s strokes %j', (aberto, sides) => {
    const root = draw('colchete', { aberto }, { x: 0, y: 0, width: 16, height: 120 });
    expect([...(root.stroke?.sides ?? [])].sort()).toEqual(sides);
  });

  it('the Bracket is dashed with tracejado and has no outline at espessura 0', () => {
    const box = { x: 0, y: 0, width: 16, height: 120 };
    expect(draw('colchete', { estilo: 'tracejado' }, box).stroke?.dash).toEqual([6, 4]);
    expect(strokeColor(draw('colchete', { espessura: 0 }, box))).toBe('none');
  });

  /** The line node: the one frame with a stroke, other than the root. */
  function lineOf(root: FrameNode): FrameNode {
    const withStroke = frames(root).filter(
      (f) => f !== root && strokeColor(f) !== 'none',
    );
    expect(withStroke).toHaveLength(1);
    return withStroke[0]!;
  }

  it('the Line with empty fields is horizontal: along the whole width, through the middle', () => {
    const box = { x: 0, y: 0, width: 160, height: 8 };
    const line = lineOf(draw('linha', {}, box));
    expect(line.width).toBe(160);
    expect(line.height).toBe(1);
    expect(line.transform[5] + line.height / 2).toBeCloseTo(4, 0);
    expect(strokeColor(line)).toBe('#79747E');
    expect(line.stroke?.width).toBe(1);
  });

  it('the Line vertical goes along the whole height, through the middle', () => {
    const box = { x: 0, y: 0, width: 8, height: 120 };
    const line = lineOf(draw('linha', { orientacao: 'vertical' }, box));
    expect(line.height).toBe(120);
    expect(line.width).toBe(1);
    expect(line.transform[4] + line.width / 2).toBeCloseTo(4, 0);
  });

  it('the Line is dashed with tracejado, thicker with espessura and absent at 0', () => {
    const box = { x: 0, y: 0, width: 160, height: 8 };
    const dashed = lineOf(draw('linha', { estilo: 'tracejado', espessura: 2 }, box));
    expect(dashed.stroke).toMatchObject({ width: 2, dash: [6, 4] });
    const none = frames(draw('linha', { espessura: 0 }, box)).filter(
      (f) => strokeColor(f) !== 'none',
    );
    expect(none).toEqual([]);
  });

  it('every decorative type draws with empty fields and no warning in the Catalog', () => {
    const entry = notesCatalog().get(NOTES_ID)!;
    for (const id of ['moldura', 'colchete', 'linha']) {
      expect(entry.byType.has(id), id).toBe(true);
    }
  });
});

describe('Decorative notes types: the markings they create', () => {
  const catalog = notesCatalog();

  it('adding a Frame, a Bracket and a Line creates decorative, non-floating markings at the back', () => {
    let p = notesProject();
    p = createMarking(p, {
      id: 'S1',
      containerId: 'I1',
      rect: { x: 100, y: 100, width: 50, height: 50 },
    });
    for (const [i, id] of ['moldura', 'colchete', 'linha'].entries()) {
      p = addComponentMarking(
        p,
        catalog,
        {
          markingId: `D${i}`,
          annotationId: `AD${i}`,
          containerId: 'I1',
          parentId: null,
          specId: NOTES_ID,
          typeId: id,
          rect: { x: 50, y: 50 + i * 200, width: 300, height: 100 },
          values: {},
        },
        approximateMeasurer,
      );
      const m = p.markings.find((x) => x.id === `D${i}`)!;
      expect(m.decorative, id).toBe(true);
      expect(m.floating ?? false, id).toBe(false);
    }
  });
});
