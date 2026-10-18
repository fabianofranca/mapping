// @vitest-environment node
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySpecialization, type Project, type Spec } from '../../src/model';
import { createFontRegistry } from '../../src/storage/fonts';
import { createComponentLibrary } from '../../src/store/componentLibrary';
import { reportedErrors } from '../../src/utils/report';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { emptyProject } from '../model/fixtures';

const DIR = 'specs/material3';

/** Texto e bytes dos arquivos do pacote, pelo caminho da raiz do projeto. */
function diskFiles(extra: Record<string, Uint8Array> = {}): Map<string, string | Blob> {
  const files = new Map<string, string | Blob>();
  for (const [rel, data] of material3Package()) files.set(`${DIR}/${rel}`, data);
  for (const [rel, bytes] of Object.entries(extra)) {
    files.set(`${DIR}/${rel}`, new Blob([bytes as BlobPart]));
  }
  return files;
}

function withSpec(spec: Spec = material3Spec()): Project {
  return applySpecialization(emptyProject(), spec, {
    newId: (() => {
      let n = 0;
      return () => `LS${++n}`;
    })(),
    packageSpecName: 'material3.spec.json',
  });
}

/** A mesma especialização com outra versão (como a atualização da biblioteca faz). */
function withVersion(version: number): Project {
  return withSpec({ ...material3Spec(), version });
}

class FakeFace {
  constructor(
    readonly family: string,
    readonly source: ArrayBuffer,
  ) {}
  load = vi.fn(async () => this);
}

function fakeHost() {
  const added: unknown[] = [];
  const deleted: unknown[] = [];
  return {
    added,
    deleted,
    host: {
      FontFace: FakeFace,
      fonts: {
        add: (face: unknown) => added.push(face),
        delete: (face: unknown) => deleted.push(face) > 0,
      },
    },
  };
}

function setup(
  initial: Project | null,
  options: {
    files?: Map<string, string | Blob>;
    cached?: (
      id: string,
      version: number,
    ) => ReadonlyMap<string, string | Blob> | undefined;
  } = {},
) {
  const project = signal<Project | null>(initial);
  const files = options.files ?? diskFiles();
  const reads: string[] = [];
  const font = fakeHost();
  const library = createComponentLibrary({
    project,
    readText: async (path) => {
      reads.push(path);
      const file = files.get(path);
      if (file === undefined) return null;
      return typeof file === 'string' ? file : file.text();
    },
    readBytes: async (path) => {
      const file = files.get(path);
      if (file === undefined) return null;
      return typeof file === 'string'
        ? new TextEncoder().encode(file).buffer
        : file.arrayBuffer();
    },
    cached: options.cached,
    fonts: createFontRegistry(font.host),
  });
  return { project, files, reads, library, font };
}

describe('biblioteca de componentes da sessão', () => {
  const libraries: { dispose(): void }[] = [];
  afterEach(() => {
    for (const library of libraries.splice(0)) library.dispose();
  });
  const start = (...args: Parameters<typeof setup>) => {
    const made = setup(...args);
    libraries.push(made.library);
    return made;
  };

  it('sem projeto ou sem pacote, o catálogo é vazio', async () => {
    const { library, project } = start(null);
    await library.whenIdle();
    expect(library.catalog.value.size).toBe(0);
    project.value = emptyProject();
    await library.whenIdle();
    expect(library.catalog.value.size).toBe(0);
  });

  it('carrega os componentes do pacote aplicado, uma vez', async () => {
    const { library, project, reads } = start(withSpec());
    await library.whenIdle();
    const components = library.catalog.value.get('material3');
    expect(components?.version).toBe(1);
    expect(components?.problems).toEqual([]);
    expect(components?.byType.size).toBeGreaterThan(5);
    const firstReads = reads.length;
    expect(firstReads).toBeGreaterThan(0);

    // Outra edição do projeto (mesma especialização): nada é lido de novo e o catálogo é o mesmo.
    const catalog = library.catalog.value;
    project.value = { ...(project.value as Project), revision: 7 };
    await library.whenIdle();
    expect(reads.length).toBe(firstReads);
    expect(library.catalog.value).toBe(catalog);
  });

  it('o projeto aparece antes dos arquivos: o catálogo chega depois', async () => {
    const { library } = start(withSpec());
    expect(library.catalog.value.size).toBe(0);
    await library.whenIdle();
    expect(library.catalog.value.size).toBe(1);
  });

  it('usa o pacote em memória da sessão antes do armazenamento', async () => {
    const cached = new Map<string, string | Blob>();
    for (const [rel, data] of material3Package()) cached.set(rel, data);
    const { library, reads, project } = start(null, {
      files: new Map(),
      cached: (id, version) => (id === 'material3' && version === 1 ? cached : undefined),
    });
    // A action muda o projeto e só depois a sessão guarda o pacote: a leitura espera.
    project.value = withSpec();
    await library.whenIdle();
    expect(library.catalog.value.get('material3')?.byType.size).toBeGreaterThan(5);
    expect(reads).toEqual([]);
  });

  it('guarda por id@versão: atualizar e desfazer não lê de novo', async () => {
    const { library, project, reads } = start(withSpec());
    await library.whenIdle();
    const first = library.catalog.value.get('material3');
    project.value = withVersion(2);
    await library.whenIdle();
    const second = library.catalog.value.get('material3');
    expect(second?.version).toBe(2);
    expect(second).not.toBe(first);

    const before = reads.length;
    project.value = withSpec();
    await library.whenIdle();
    expect(library.catalog.value.get('material3')).toBe(first);
    expect(reads.length).toBe(before);
  });

  it('o resultado de uma leitura velha não aparece sob o projeto novo', async () => {
    const gate: { release: () => void } = { release: () => {} };
    const blocked = new Promise<void>((resolve) => (gate.release = resolve));
    const files = diskFiles();
    const project = signal<Project | null>(withSpec());
    const library = createComponentLibrary({
      project,
      readText: async (path) => {
        if (path.endsWith('m3-button.json')) await blocked;
        const file = files.get(path);
        return typeof file === 'string' ? file : null;
      },
      readBytes: async () => null,
      fonts: createFontRegistry(fakeHost().host),
    });
    libraries.push(library);
    await Promise.resolve();
    // O projeto muda para a versão 2 enquanto a 1 ainda carrega.
    project.value = withVersion(2);
    expect(library.catalog.value.size).toBe(0);
    gate.release();
    await library.whenIdle();
    expect(library.catalog.value.get('material3')?.version).toBe(2);
  });

  it('falha de leitura vai para o Diagnóstico e não derruba', async () => {
    const before = reportedErrors.value.length;
    const project = signal<Project | null>(withSpec());
    const library = createComponentLibrary({
      project,
      readText: () => Promise.reject(new Error('disco sumiu')),
      readBytes: async () => null,
      fonts: createFontRegistry(fakeHost().host),
    });
    libraries.push(library);
    await library.whenIdle();
    expect(reportedErrors.value.length).toBeGreaterThan(before);
    const components = library.catalog.value.get('material3');
    expect(components?.byType.size).toBe(0);
    expect(components?.problems[0]).toContain('disco sumiu');
  });

  it('um componente ausente vira problema, os outros carregam', async () => {
    const files = diskFiles();
    files.delete(`${DIR}/components/m3-button.json`);
    const { library } = start(withSpec(), { files });
    await library.whenIdle();
    const components = library.catalog.value.get('material3');
    expect(components?.problems.length).toBe(1);
    expect(components?.byType.has('m3-button')).toBe(false);
    expect(components?.byType.size).toBeGreaterThan(5);
  });

  it('invalidate lê o pacote de novo e mantém o catálogo até o novo chegar', async () => {
    const { library, reads, files } = start(withSpec());
    await library.whenIdle();
    const first = library.catalog.value.get('material3');
    expect(first?.byType.has('m3-button')).toBe(true);
    const before = reads.length;

    files.delete(`${DIR}/components/m3-button.json`);
    library.invalidate();
    expect(library.catalog.value.get('material3')).toBe(first);
    await library.whenIdle();
    expect(reads.length).toBeGreaterThan(before);
    expect(library.catalog.value.get('material3')?.byType.has('m3-button')).toBe(false);
  });

  describe('fontes', () => {
    it('registra as fontes declaradas, com status por fonte, e sobe a época', async () => {
      const files = diskFiles({
        'fonts/Roboto-Regular.ttf': new Uint8Array([0, 1, 2, 3]),
      });
      const { library, font } = start(withSpec(), { files });
      expect(library.fontsEpoch.value).toBe(0);
      await library.whenIdle();
      const status = library.fonts.value;
      expect(status.length).toBe(material3Spec().fonts?.length);
      const regular = status.find(
        (s) => s.font.path === `${DIR}/fonts/Roboto-Regular.ttf`,
      );
      expect(regular?.status).toBe('loaded');
      expect(status.filter((s) => s.status === 'missing').length).toBe(status.length - 1);
      expect(font.added).toHaveLength(1);
      expect(library.fontsEpoch.value).toBe(1);
    });

    it('não registra de novo enquanto o conjunto de fontes não muda', async () => {
      const { library, project } = start(withSpec());
      await library.whenIdle();
      const epoch = library.fontsEpoch.value;
      project.value = { ...(project.value as Project), revision: 7 };
      await library.whenIdle();
      expect(library.fontsEpoch.value).toBe(epoch);
    });

    it('sem especialização com fontes, não há época nem status', async () => {
      const { library } = start(emptyProject());
      await library.whenIdle();
      expect(library.fontsEpoch.value).toBe(0);
      expect(library.fonts.value).toEqual([]);
    });

    it('tirar a especialização tira as faces do documento', async () => {
      const files = diskFiles({
        'fonts/Roboto-Regular.ttf': new Uint8Array([0, 1, 2, 3]),
      });
      const { library, project, font } = start(withSpec(), { files });
      await library.whenIdle();
      project.value = emptyProject();
      await library.whenIdle();
      expect(font.deleted).toHaveLength(1);
      expect(library.fonts.value).toEqual([]);
    });

    it('dispose tira as faces do documento', async () => {
      const files = diskFiles({
        'fonts/Roboto-Regular.ttf': new Uint8Array([0, 1, 2, 3]),
      });
      const { library, font } = start(withSpec(), { files });
      await library.whenIdle();
      library.dispose();
      expect(font.deleted).toHaveLength(1);
    });
  });
});
