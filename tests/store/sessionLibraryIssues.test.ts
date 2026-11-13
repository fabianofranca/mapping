// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { NOTES_LIBRARY } from '../../libraries/notas';
import {
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  serialize,
  type Project,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadLibraryIssues } from '../../src/storage/specPackage';
import type { ProjectStorage } from '../../src/storage/types';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';
import { material3Package, material3Spec } from '../storage/packageFixture';

// FA2, decisão 11: depois de gravar um pacote, só as especializações gravadas nesta gravação são
// validadas de novo (pelos arquivos em memória); as outras ficam com o resultado anterior, sem
// nenhuma leitura do disco. O resultado é o mesmo de `loadLibraryIssues` sobre o disco inteiro.

let current: ProjectSession | null = null;
afterEach(async () => {
  await current?.close();
  current = null;
});

async function setup() {
  const root = new MemoryDirectory('p');
  let n = 0;
  const applied = applyBundledLibrary(sampleProject(), NOTES_LIBRARY, {
    newId: () => `note-${++n}`,
  });
  const project: Project = { ...applied.project, revision: 1 };
  const text = serialize(project);
  root.put('mapping.json', text);
  for (const [path, body] of bundledLibraryDiskFiles(project, NOTES_LIBRARY))
    root.put(path, body);
  const reads: string[] = [];
  const inner = createFolderStorage(root);
  const storage: ProjectStorage = {
    ...inner,
    readSpecFile(path) {
      reads.push(`read:${path}`);
      return inner.readSpecFile(path);
    },
    listSpecDir(dir) {
      reads.push(`list:${dir}`);
      return inner.listSpecDir(dir);
    },
  };
  const session = openSession({
    storage,
    project,
    loadedText: text,
    libraryIssues: await loadLibraryIssues(storage, project),
    prepareImage: () => Promise.reject(new Error('sem imagens')),
    now: () => NOW,
    autosaveDelay: 1,
  });
  current = session;
  return { session, storage, reads, notesDir: `specs/${applied.spec.id}` };
}

describe('biblioteca sem reler o que não mudou', () => {
  it('atualizar uma especialização de pacote não lê nenhum arquivo da outra e o resultado é o completo', async () => {
    const { session, storage, reads, notesDir } = await setup();
    const spec = { ...material3Spec(), version: 1 };
    expect(session.actions.applySpecialization(spec, material3Package()).ok).toBe(true);
    await session.flush();
    reads.length = 0;
    const next = material3Package();
    next.set('docs/novo.md', '# novo');
    expect(
      session.actions.updateSpecialization({ ...spec, version: 2 }, undefined, next).ok,
    ).toBe(true);
    await session.flush();
    expect(reads.filter((r) => r.includes(`${notesDir}`))).toEqual([]);
    const project = session.store.committed.peek();
    if (!project) throw new Error('sem projeto');
    const full = await loadLibraryIssues(storage, project);
    expect(full.size).toBe(2);
    expect(session.libraryIssues.value).toEqual(full);
  });

  it('remover a especialização tira a entrada; desfazer a traz de volta, igual ao completo', async () => {
    const { session, storage } = await setup();
    const spec = { ...material3Spec(), version: 1 };
    session.actions.applySpecialization(spec, material3Package());
    await session.flush();
    expect(session.libraryIssues.value.has(spec.id)).toBe(true);
    session.actions.removeSpecialization(spec.id, 'delete');
    await session.flush();
    expect(session.libraryIssues.value.has(spec.id)).toBe(false);
    expect(session.libraryIssues.value.size).toBe(1);
    session.store.undo();
    await session.flush();
    const project = session.store.committed.peek();
    if (!project) throw new Error('sem projeto');
    expect(session.libraryIssues.value).toEqual(
      await loadLibraryIssues(storage, project),
    );
    expect(session.libraryIssues.value.has(spec.id)).toBe(true);
  });
});
