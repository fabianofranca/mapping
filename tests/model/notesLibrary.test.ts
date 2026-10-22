// A biblioteca de notas embutida (`libraries/notas/`, etapa Marcações espaciais, ME3): o pacote
// é válido, o `index.ts` lista todo arquivo da pasta e a aplicação por padrão usa o caminho
// comum de qualquer biblioteca (`applySpecialization`).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTES_FILES, NOTES_LIBRARY, NOTES_SPEC_FILE } from '../../libraries/notas';
import {
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  hasBundledLibrary,
} from '../../src/model/bundledLibrary';
import { validateLibrary } from '../../src/model/library';
import { createProject } from '../../src/model/project';
import { parseSpecText } from '../../src/model/spec';
import { ModelError } from '../../src/model/errors';

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

  it('valida sem erro nos três níveis; os avisos são só o texto de exemplo no tamanho mínimo', () => {
    const files = [...NOTES_FILES].map(([path, text]) => ({ path, text }));
    const report = validateLibrary({ files, specPath: NOTES_SPEC_FILE });
    expect(report.errors).toEqual([]);
    // O `minSize` (96 × 48) é o piso do redimensionamento, não o tamanho de um texto longo: o
    // `preview` e o exemplo cabem no tamanho inicial (240 × 120), mas não no mínimo.
    expect(
      report.warnings.map((w) => [w.file, w.path, w.message.includes('conteúdo maior')]),
    ).toEqual([
      ['components/nota.json', 'preview', true],
      ['notas.spec.json', 'layers[0].annotationTypes[0].examples[0]', true],
    ]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 1, components: 1, docs: 1 });
  });

  it('a especialização é a formatVersion 7, com o tipo nota flutuante e com componente', () => {
    const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.formatVersion).toBe(7);
    expect(parsed.spec.id).toBe('notas');
    const [layer] = parsed.spec.layers;
    expect(layer?.name).toBe('Notas');
    const [type] = layer?.annotationTypes ?? [];
    expect(type).toMatchObject({
      id: 'nota',
      floating: true,
      labelField: 'titulo',
      component: 'components/nota.json',
    });
    const texto = type?.fields.find((f) => f.key === 'texto');
    expect(texto).toMatchObject({ type: 'string', required: true });
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
        version: 1,
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
      'docs/nota.md',
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
      'specs/notas/docs/nota.md',
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
