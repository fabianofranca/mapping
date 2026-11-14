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

// FA2, decision 11: after writing a package, only the specializations written in this write are
// validated again (from the in-memory files); the others keep the previous result, with no
// disk read. The result is the same as `loadLibraryIssues` over the whole disk.

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
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => NOW,
    autosaveDelay: 1,
  });
  current = session;
  return { session, storage, reads, notesDir: `specs/${applied.spec.id}` };
}

describe('library without rereading what did not change', () => {
  it('updating a package specialization reads no file of the other and the result is the complete one', async () => {
    const { session, storage, reads, notesDir } = await setup();
    const spec = { ...material3Spec(), version: 1 };
    expect(session.actions.applySpecialization(spec, material3Package()).ok).toBe(true);
    await session.flush();
    reads.length = 0;
    const next = material3Package();
    next.set('docs/new.md', '# new');
    expect(
      session.actions.updateSpecialization({ ...spec, version: 2 }, undefined, next).ok,
    ).toBe(true);
    await session.flush();
    expect(reads.filter((r) => r.includes(`${notesDir}`))).toEqual([]);
    const project = session.store.committed.peek();
    if (!project) throw new Error('no project');
    const full = await loadLibraryIssues(storage, project);
    expect(full.size).toBe(2);
    expect(session.libraryIssues.value).toEqual(full);
  });

  it('removing the specialization drops the entry; undoing brings it back, same as the complete one', async () => {
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
    if (!project) throw new Error('no project');
    expect(session.libraryIssues.value).toEqual(
      await loadLibraryIssues(storage, project),
    );
    expect(session.libraryIssues.value.has(spec.id)).toBe(true);
  });
});
