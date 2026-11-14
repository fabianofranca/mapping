// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTES_LIBRARY } from '../../libraries/notas';
import { applyBundledLibrary, deserialize, serialize } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// `openSession` with `stagedPackages` (ME3): the notes library applied in memory to a migrated
// project. The project already cites it, the disk does not yet: the first write writes `specs/notas/`.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DIR = 'specs/notas';
const SPEC_FILE = `${DIR}/notas.spec.json`;

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

/** The folder as v12 left it (only `mapping.json`) and the session with the notes in memory. */
function openMigrated(root: MemoryDirectory, calls: string[] = []) {
  const old = serialize(sampleProject());
  root.files.set('mapping.json', new Blob([old]));
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
  let n = 0;
  const applied = applyBundledLibrary(sampleProject(), NOTES_LIBRARY, {
    newId: () => `note-${++n}`,
  });
  const session = openSession({
    storage,
    project: applied.project,
    loadedText: old,
    migratedFrom: { version: 12, text: old },
    stagedPackages: [{ spec: applied.spec, files: applied.packageFiles }],
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  return { session, old, storage: inner };
}

describe('session with packages applied in memory (stagedPackages)', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('the component catalog sees the package before it exists on disk', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    expect(await opened.storage.listSpecDir(DIR)).toEqual([]);
    await session.components.whenIdle();
    const notes = session.components.catalog.value.get('notas');
    expect(notes?.problems).toEqual([]);
    expect(notes?.byType.has('nota')).toBe(true);
  });

  it('opening and waiting writes nothing; the first write writes the package before mapping.json and the backup', async () => {
    const root = new MemoryDirectory('p');
    const calls: string[] = [];
    const opened = openMigrated(root, calls);
    session = opened.session;
    await vi.advanceTimersByTimeAsync(5_000);
    await settle();
    expect(calls).toEqual([]);
    expect(await root.read('mapping.json')).toBe(opened.old);
    expect(root.dirs.has('specs')).toBe(false);
    expect(root.dirs.has('backups')).toBe(false);
    expect(session.store.canUndo.value).toBe(false);

    // The person's first change writes the project (opening alone never writes).
    session.actions.renameProject('Renamed');
    expect((await session.flush()).ok).toBe(true);

    const onDisk = await opened.storage.listSpecDir(DIR);
    expect(onDisk.sort()).toEqual(
      [
        SPEC_FILE,
        `${DIR}/components/nota.json`,
        `${DIR}/components/tabela.json`,
        `${DIR}/docs/nota.md`,
        `${DIR}/docs/tabela.md`,
      ].sort(),
    );
    // The package files go in before the mapping.json that cites them.
    const mappingAt = calls.indexOf('mapping');
    expect(mappingAt).toBeGreaterThan(0);
    expect(calls.slice(0, mappingAt)).toEqual(
      expect.arrayContaining([
        `write ${DIR}/components/nota.json`,
        `write ${DIR}/docs/nota.md`,
      ]),
    );
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('invalid mapping');
    expect(saved.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(saved.project.layers.some((l) => l.spec?.specId === 'notas')).toBe(true);
    // The migration backup keeps the original.
    const [backup, ...rest] = [...(root.dirs.get('backups')?.files.keys() ?? [])];
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^mapping\.v12\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backup ?? '')
        ?.text(),
    ).toBe(opened.old);
    // Only the rename enters the history; the notes library does not.
    expect(session.store.canUndo.value).toBe(true);
    session.store.undo();
    expect(session.store.canUndo.value).toBe(false);
  });

  it('the written content is that of the embedded package', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    session.actions.renameProject('Renamed');
    await session.flush();
    expect(await root.read(`${DIR}/components/nota.json`)).toBe(
      NOTES_LIBRARY.files.get('components/nota.json'),
    );
    expect(await root.read(`${DIR}/docs/nota.md`)).toBe(
      NOTES_LIBRARY.files.get('docs/nota.md'),
    );
    const spec = JSON.parse((await root.read(SPEC_FILE)) ?? '{}') as { id: string };
    expect(spec.id).toBe('notas');
  });

  it('removing the specialization after the first write deletes the folder, as in any library', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    session.actions.renameProject('Renamed');
    await session.flush();
    expect((await opened.storage.listSpecDir(DIR)).length).toBe(5);

    expect(session.actions.removeSpecialization('notas', 'convert').ok).toBe(true);
    await settle();
    expect(await opened.storage.listSpecDir(DIR)).toEqual([]);
    expect(root.dirs.get('specs')?.dirs.has('notas') ?? false).toBe(false);
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('invalid mapping');
    expect(saved.project.specializations).toEqual([]);

    // Undoing brings the package back (it is in the session cache).
    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect((await opened.storage.listSpecDir(DIR)).length).toBe(5);
  });

  it('removing before the first write leaves neither folder nor specialization on disk', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    expect(session.actions.removeSpecialization('notas', 'convert').ok).toBe(true);
    await settle();
    await session.flush();
    expect(await opened.storage.listSpecDir(DIR)).toEqual([]);
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('invalid mapping');
    expect(saved.project.specializations).toEqual([]);
  });
});
