// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { MemoryDirectory } from '../storage/memoryFs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DIR = 'specs/material3';
const SPEC_FILE = `${DIR}/material3.spec.json`;

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

/** In-memory folder with the trace of the write order. */
function start(root: MemoryDirectory, calls: string[] = []) {
  const inner = createFolderStorage(root);
  const storage = {
    ...inner,
    saveMapping: (text: string) => {
      calls.push('mapping');
      return inner.saveMapping(text);
    },
    writeSpecFile: (path: string, data: Blob | string) => {
      calls.push(`write ${path}`);
      return inner.writeSpecFile(path, data);
    },
    removeSpecDir: (dir: string) => {
      calls.push(`remove ${dir}`);
      return inner.removeSpecDir(dir);
    },
  };
  return openSession({
    storage,
    project: sampleProject(),
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => NOW,
    newId: ids(),
  });
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

describe('session with a library package', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('applying writes the specs/<id>/ folder before mapping.json, with the bytes preserved', async () => {
    const root = new MemoryDirectory('p');
    const calls: string[] = [];
    session = start(root, calls);
    const files = material3Package();
    const font = new Uint8Array([0, 1, 2, 254, 255]);
    files.set('fonts/Roboto.ttf', new Blob([font]));
    expect(session.actions.applySpecialization(material3Spec(), files).ok).toBe(true);
    await settle();

    const project = deserialize((await root.read('mapping.json')) ?? '');
    if (!project.ok) throw new Error('invalid mapping');
    expect(project.project.specializations[0]?.file).toBe(SPEC_FILE);
    const onDisk = await createFolderStorage(root).listSpecDir(DIR);
    expect(onDisk).toHaveLength(files.size);
    expect(onDisk).toContain(SPEC_FILE);
    const ttf = await createFolderStorage(root).readSpecFile(`${DIR}/fonts/Roboto.ttf`);
    expect([...new Uint8Array((await ttf?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual(
      [...font],
    );
    // The package files go in before mapping.json.
    const mappingAt = calls.indexOf('mapping');
    expect(mappingAt).toBeGreaterThan(0);
    expect(calls.slice(0, mappingAt)).toContain(`write ${DIR}/fonts/Roboto.ttf`);
    expect(calls.slice(mappingAt).some((c) => c.startsWith('write specs/'))).toBe(false);
    expect(
      session.libraryIssues.value.get('material3')?.filter((i) => i.severity === 'error'),
    ).toEqual([]);
  });

  it('reopening reads the package: no issues on the intact package; level 1 error if a file is missing', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    await session.close();
    session = null;

    const storage = createFolderStorage(root);
    const ok = await loadProject(storage);
    if (!ok.ok) throw new Error('did not open');
    expect(
      ok.libraryIssues.get('material3')?.filter((i) => i.severity === 'error'),
    ).toEqual([]);

    await storage.removeSpecDir(`${DIR}/components`);
    const broken = await loadProject(storage);
    if (!broken.ok) throw new Error('did not open');
    const errors = broken.libraryIssues
      .get('material3')
      ?.filter((i) => i.severity === 'error');
    expect(errors?.length).toBeGreaterThan(0);
    expect(errors?.every((e) => e.file !== '' || e.message !== '')).toBe(true);
    // Opening neither blocks nor changes the project.
    expect(broken.project.specializations[0]?.file).toBe(SPEC_FILE);
  });

  it('updating the version rewrites the whole folder (without the files the new one lacks)', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const v1 = { ...material3Spec(), version: 1 };
    const files = material3Package();
    files.set('docs/old.md', '# old');
    session.actions.applySpecialization(v1, files);
    await settle();
    const storage = createFolderStorage(root);
    expect(await storage.listSpecDir(DIR)).toContain(`${DIR}/docs/old.md`);

    const next = material3Package();
    next.set('docs/new.md', '# new');
    expect(
      session.actions.updateSpecialization({ ...v1, version: 2 }, undefined, next).ok,
    ).toBe(true);
    await settle();
    const after = await storage.listSpecDir(DIR);
    expect(after).toContain(`${DIR}/docs/new.md`);
    expect(after).not.toContain(`${DIR}/docs/old.md`);
    expect(after).toContain(SPEC_FILE);

    // Undoing the update brings the version 1 package back.
    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    const undone = await storage.listSpecDir(DIR);
    expect(undone).toContain(`${DIR}/docs/old.md`);
    expect(undone).not.toContain(`${DIR}/docs/new.md`);
    const spec = JSON.parse((await root.read(SPEC_FILE)) ?? '{}') as { version: number };
    expect(spec.version).toBe(1);
  });

  it('removing deletes the folder; undoing rewrites it and redoing deletes again', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    const storage = createFolderStorage(root);
    const before = await storage.listSpecDir(DIR);
    expect(before.length).toBeGreaterThan(5);

    expect(session.actions.removeSpecialization('material3', 'convert').ok).toBe(true);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual([]);
    expect(root.dirs.get('specs')?.dirs.has('material3')).toBe(false);

    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual(before);

    session.store.redo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual([]);
    expect(session.libraryIssues.value.size).toBe(0);
  });

  it('desfazer o aplicar remove a pasta e refazer a regrava', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    const storage = createFolderStorage(root);
    const before = await storage.listSpecDir(DIR);
    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual([]);
    session.store.redo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual(before);
  });

  it('collectFiles carries the package (specs with the specialization file, specAssets with the rest)', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const files = material3Package();
    files.set('fonts/Roboto.ttf', new Blob([new Uint8Array([5, 6, 7])]));
    session.actions.applySpecialization(material3Spec(), files);
    await settle();
    const collected = await session.collectFiles();
    expect([...collected.specs.keys()]).toEqual([SPEC_FILE]);
    const assets = [...(collected.specAssets?.keys() ?? [])];
    expect(assets).toContain(`${DIR}/fonts/Roboto.ttf`);
    expect(assets).toContain(`${DIR}/components/m3-button.json`);
    expect(assets).not.toContain(SPEC_FILE);
  });
});
