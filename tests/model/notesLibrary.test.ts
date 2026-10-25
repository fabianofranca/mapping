// A biblioteca de notas embutida (`libraries/notas/`, etapa Marcações espaciais, ME3): o pacote
// é válido, o `index.ts` lista todo arquivo da pasta e a aplicação por padrão usa o caminho
// comum de qualquer biblioteca (`applySpecialization`).
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
  throw new Error(`esperava o erro ${code}`);
}

const project = () =>
  createProject({
    name: 'P',
    now: '2026-10-22T00:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Camada 1', color: '#336699' },
  });

describe('pacote libraries/notas', () => {
  it('o index.ts lista todo arquivo da pasta, exceto o próprio index.ts', () => {
    const onDisk = listDisk(ROOT)
      .filter((p) => p !== 'index.ts')
      .sort();
    expect([...NOTES_FILES.keys()].sort()).toEqual(onDisk);
  });

  it('o texto embutido é o do arquivo', () => {
    for (const [path, text] of NOTES_FILES) {
      expect(text, path).toBe(readFileSync(join(ROOT, path), 'utf8'));
    }
  });

  it('valida sem erro e sem aviso nos três níveis (uma biblioteca embutida não abre com aviso)', () => {
    const files = [...NOTES_FILES].map(([path, text]) => ({ path, text }));
    const report = validateLibrary({ files, specPath: NOTES_SPEC_FILE });
    expect(report.errors).toEqual([]);
    // O `minSize` (160 × 96) comporta o `preview` e o exemplo com texto curto.
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 2, docs: 2 });
  });

  it('a especialização é a formatVersion 7, versão 3, com a nota e a tabela flutuantes e com componente', () => {
    const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.formatVersion).toBe(7);
    expect(parsed.spec.id).toBe('notas');
    expect(parsed.spec.version).toBe(3);
    const [layer] = parsed.spec.layers;
    expect(layer?.name).toBe('Notas');
    const [type, tabela] = layer?.annotationTypes ?? [];
    expect(type).toMatchObject({
      id: 'nota',
      floating: true,
      labelField: 'titulo',
      component: 'components/nota.json',
    });
    const texto = type?.fields.find((f) => f.key === 'texto');
    expect(texto).toMatchObject({ type: 'string', required: true });
    expect(tabela).toMatchObject({
      id: 'tabela',
      floating: true,
      labelField: 'titulo',
      component: 'components/tabela.json',
      doc: 'docs/tabela.md',
    });
    const linhas = tabela?.fields.find((f) => f.key === 'linhas');
    expect(linhas?.type === 'table' && linhas.columns).toMatchObject([
      { key: 'chave', type: 'string', required: true },
      { key: 'valor', type: 'string' },
    ]);
  });

  it('o componente da tabela é formatVersion 2, usa repeat e tem 2 a 3 linhas no preview', () => {
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

  it('o documento da tabela diz que a ligação ao alvo é uma seta', () => {
    expect(NOTES_FILES.get('docs/tabela.md')).toMatch(/seta/);
  });
});

describe('applyBundledLibrary', () => {
  it('aplica como qualquer biblioteca: cópia em specs/notas/, camada Notas e pacote sem a especialização', () => {
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
    expect(applied.project.layers.map((l) => l.name)).toEqual(['Camada 1', 'Notas']);
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

  it('aplicar duas vezes falha como em qualquer biblioteca', () => {
    const { project: once } = applyBundledLibrary(project(), NOTES_LIBRARY);
    expectCode(() => applyBundledLibrary(once, NOTES_LIBRARY), 'spec-already-applied');
  });

  it('bundledLibraryDiskFiles dá todos os arquivos com o caminho do projeto', () => {
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

  it('bundledLibraryDiskFiles sem a biblioteca aplicada falha', () => {
    expectCode(() => bundledLibraryDiskFiles(project(), NOTES_LIBRARY), 'not-found');
  });
});

// ---------------------------------------------------------------------------------------------
// A atualização da B4 leva um projeto com a versão 1 à 2 (aditiva: um tipo novo, sem migração).

/** A especialização da versão 1: a atual sem a Tabela (e `version: 1`). */
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

describe('atualização da biblioteca de notas da versão 1 para a 2', () => {
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
    return setFieldValue(p, 'AN1', 'texto', 'Uma nota da versão 1');
  }

  it('a v2 é uma atualização aditiva: sem quebra, sem perda, sem camada nova, sem pendência nova', () => {
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

  it('atualiza: a versão sobe, a nota fica como estava e a Tabela passa a existir', () => {
    const p = withV1();
    const next = updateSpecialization(p, notesV2(), { newId: () => 'X' });
    expect(next.specializations[0]).toMatchObject({ id: NOTES_ID, version: 3 });
    expect(next.layers.map((l) => l.id)).toEqual(p.layers.map((l) => l.id));
    expect(next.annotations.find((a) => a.id === 'AN1')).toEqual(
      p.annotations.find((a) => a.id === 'AN1'),
    );
    // A Tabela já pode ser criada na camada Notas que a v1 tinha criado.
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
// A Tabela: a anotação e o desenho (o `repeat` do componente).

describe('tipo Tabela', () => {
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
    for (const [id, chave, valor] of [
      ['R1', 'origem', 'carrinho'],
      ['R2', 'total', '149,90'],
    ] as const) {
      p = addTableRow(p, 'AT1', 'linhas', id);
      p = setTableCell(p, 'AT1', 'linhas', id, 'chave', chave);
      p = setTableCell(p, 'AT1', 'linhas', id, 'valor', valor);
    }
    return p;
  }

  it('a catalogação acha o componente da Tabela', () => {
    expect(component?.formatVersion).toBe(2);
  });

  it('a anotação nasce sem linhas e a chave é obrigatória', () => {
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

  it('desenha o título e uma linha por registro, chave à esquerda e valor à direita', () => {
    const p = tableProject();
    const annotation = p.annotations.find((a) => a.id === 'AT1')!;
    const { values } = drawingValues(p, annotation, type);
    expect(values.linhas).toEqual([
      { chave: 'origem', valor: 'carrinho' },
      { chave: 'total', valor: '149,90' },
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
      'origem',
      'carrinho',
      'total',
      '149,90',
    ]);
    // Duas linhas empilhadas: a segunda abaixo da primeira; a chave à esquerda do valor.
    const [, key1, value1, key2] = texts;
    expect(key2!.y).toBeGreaterThan(key1!.y);
    expect(value1!.x).toBeGreaterThan(key1!.x);
    expect(value1!.y).toBe(key1!.y);
    // O valor fica alinhado à direita.
    expect(value1!.node.style.align).toBe('right');
  });

  it('sem linhas desenha só o título', () => {
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

/** Os textos da cena na ordem de desenho, com a posição absoluta. */
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

describe('Catálogo com a Tabela', () => {
  const files = [...NOTES_FILES].map(([path, text]) => ({ path, text }));
  const catalog = buildCatalog(files);
  const entry = findEntry(catalog, 'tabela')!;

  it('o preview chega ao Catálogo com as linhas (cada uma com _id para o formulário do playground)', () => {
    expect(catalog.report.errors).toEqual([]);
    expect(entry.component?.formatVersion).toBe(2);
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

  it('desenha o preview da Tabela com uma linha por registro', () => {
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
      'origem',
      'carrinho',
      'itens',
      '3',
      'total',
      '149,90',
    ]);
  });

  it('a Nota segue sem linhas no preview', () => {
    expect(findEntry(catalog, 'nota')?.previewValues?.texto).toBe(
      'Escreva aqui o comentário.',
    );
  });
});
