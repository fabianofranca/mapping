import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTES_LIBRARY } from '../../libraries/notas';
import {
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  deserialize,
  serialize,
  type Project,
} from '../../src/model';
import type { DirectoryHandleLike } from '../../src/storage/folder';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// ME3: the bundled notes library is applied by default. A new project (local and in a folder)
// is born with it; a project with a schema earlier than 13 gets it on opening (in memory, no
// undo, and the first save writes `specs/notas/`); a project already on v14 stays as it is.
// pt-BR kept: ids, names and paths of the bundled library `libraries/notas` (`notas`, `Notas`, `nota`), asserted verbatim

const pickDirectory = vi.fn<() => Promise<DirectoryHandleLike | null>>();

vi.mock('../../src/storage/folder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/folder')>();
  return { ...actual, pickDirectory: () => pickDirectory() };
});

type Controller = typeof import('../../src/app/controller');
type Local = typeof import('../../src/storage/local');

/** The controller keeps state in the module: each test loads a fresh copy. */
async function load(): Promise<{ app: Controller; local: Local }> {
  vi.resetModules();
  const app = await import('../../src/app/controller');
  const local = await import('../../src/storage/local');
  await app.initApp();
  return { app, local };
}

let app: Controller;
let local: Local;

beforeEach(async () => {
  clearReportedErrors();
  pickDirectory.mockReset();
  ({ app, local } = await load());
  const library = await local.openLocalLibrary();
  for (const p of (await library?.list()) ?? []) await library?.remove(p.id);
  library?.close();
  await app.refreshLocalProjects();
});

afterEach(async () => {
  await app.closeProject().catch(() => undefined);
  clearReportedErrors();
});

const SPEC_DIR = 'specs/notas';
const SPEC_FILE = `${SPEC_DIR}/notas.spec.json`;
const PACKAGE_PATHS = [
  SPEC_FILE,
  `${SPEC_DIR}/components/nota.json`,
  `${SPEC_DIR}/docs/nota.md`,
];

async function openedSession(): Promise<NonNullable<typeof app.openProject.value>> {
  const current = app.openProject.value;
  if (!current) throw new Error('no project open');
  return current;
}

function projectOf(opened: NonNullable<typeof app.openProject.value>): Project {
  const p = opened.session.store.project.value;
  if (!p) throw new Error('project closed');
  return p;
}

const notesLayers = (p: Project) => p.layers.filter((l) => l.spec?.specId === 'notas');

/** The mapping.json of a schema 12 project: today's with the old version (the migration is the real one). */
function v12Text(p: Project): string {
  const data = JSON.parse(serialize(p)) as Record<string, unknown>;
  return `${JSON.stringify({ ...data, schemaVersion: 12 }, null, 2)}\n`;
}

/** An in-memory project folder: mapping.json and, optionally, the files of `specs/`. */
function folderOf(mapping: string, extra: ReadonlyMap<string, string> = new Map()) {
  const root = new MemoryDirectory('folder');
  root.put('mapping.json', mapping);
  for (const [path, text] of extra) root.put(path, text);
  return root;
}

/** A project with the notes applied by the person and the files as they would be on disk. */
function withNotes() {
  const project = applyBundledLibrary(sampleProject(), NOTES_LIBRARY).project;
  return { project, files: bundledLibraryDiskFiles(project, NOTES_LIBRARY) };
}

describe('new project', () => {
  it('local: is born with the notas specialization, the Notas layer and specs/notas/ in storage', async () => {
    expect((await app.createLocalProject('New')).ok).toBe(true);
    const opened = await openedSession();
    const project = projectOf(opened);
    expect(project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    // The first layer takes the name in the interface language; the notes one comes from the library.
    expect(project.layers).toHaveLength(2);
    expect(project.layers.at(-1)?.name).toBe('Notas');
    expect(notesLayers(project)).toHaveLength(1);
    expect(project.layers.at(-1)?.spec).toEqual({ specId: 'notas', layerId: 'notas' });
    expect(opened.session.store.canUndo.value).toBe(false);

    for (const path of PACKAGE_PATHS) {
      const blob = await opened.session.storage.readSpecFile(path);
      expect(blob, path).not.toBeNull();
    }
    expect(await (await opened.session.storage.readSpecFile(SPEC_FILE))?.text()).toBe(
      bundledLibraryDiskFiles(project, NOTES_LIBRARY).get(SPEC_FILE),
    );
    expect(
      await (
        await opened.session.storage.readSpecFile(`${SPEC_DIR}/docs/nota.md`)
      )?.text(),
    ).toBe(NOTES_LIBRARY.files.get('docs/nota.md'));

    // Reopening from storage keeps everything and the component catalog reads the package.
    const id = opened.localId ?? '';
    await app.closeProject();
    expect((await app.openLocalProject(id)).ok).toBe(true);
    const reopened = await openedSession();
    expect(projectOf(reopened).specializations).toHaveLength(1);
    await reopened.session.components.whenIdle();
    expect(
      reopened.session.components.catalog.value.get('notas')?.byType.has('nota'),
    ).toBe(true);
  });

  it('in a folder: writes specs/notas/ before mapping.json, which cites the specialization', async () => {
    const root = new MemoryDirectory('my-folder');
    expect((await app.createFolderProject(root, 'P', [])).ok).toBe(true);

    for (const path of PACKAGE_PATHS) {
      expect(await root.read(path), path).not.toBeNull();
    }
    const notesDir = root.dirs.get('specs')?.dirs.get('notas');
    const mappingTick = root.modified.get('mapping.json') ?? 0;
    expect(mappingTick).toBeGreaterThan(0);
    for (const [name, tick] of notesDir?.modified ?? []) {
      expect(tick, name).toBeLessThan(mappingTick);
    }
    for (const [name, tick] of notesDir?.dirs.get('components')?.modified ?? []) {
      expect(tick, name).toBeLessThan(mappingTick);
    }
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('invalid mapping');
    expect(saved.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(saved.project.layers).toHaveLength(2);
    expect(saved.project.layers.at(-1)?.name).toBe('Notas');

    const opened = await openedSession();
    expect(opened.kind).toBe('folder');
    expect(notesLayers(projectOf(opened))).toHaveLength(1);
    expect(opened.session.store.canUndo.value).toBe(false);
  });
});

describe('open existing project', () => {
  it('v12 without notes: opens with the library in memory, no undo; the first save writes specs/notas/, the backup and a v16 mapping', async () => {
    const original = v12Text(sampleProject());
    const root = folderOf(original);
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });

    const opened = await openedSession();
    const project = projectOf(opened);
    expect(project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(notesLayers(project)).toHaveLength(1);
    // In memory: no undo and nothing on disk yet.
    expect(opened.session.store.canUndo.value).toBe(false);
    expect(await root.read('mapping.json')).toBe(original);
    expect(root.dirs.has('specs')).toBe(false);
    expect(root.dirs.has('backups')).toBe(false);
    // The catalog already sees the note type.
    await opened.session.components.whenIdle();
    expect(opened.session.components.catalog.value.get('notas')?.byType.has('nota')).toBe(
      true,
    );

    // The first change writes everything together.
    opened.session.actions.renameProject('Renamed');
    expect((await opened.session.flush()).ok).toBe(true);
    for (const path of PACKAGE_PATHS) {
      expect(await root.read(path), path).not.toBeNull();
    }
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('invalid mapping');
    expect(saved.project.schemaVersion).toBe(20);
    expect(saved.project.project.name).toBe('Renamed');
    expect(saved.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(notesLayers(saved.project)).toHaveLength(1);
    const backups = [...(root.dirs.get('backups')?.files.keys() ?? [])];
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^mapping\.v12\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backups[0] ?? '')
        ?.text(),
    ).toBe(original);
    // Only the rename enters the history.
    expect(opened.session.store.canUndo.value).toBe(true);
    opened.session.store.undo();
    expect(opened.session.store.canUndo.value).toBe(false);
  });

  it('v12 local: storage receives specs/notas/ on the first save', async () => {
    const library = await local.openLocalLibrary();
    await library?.create('v12', {
      mapping: v12Text(sampleProject()),
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect((await app.openLocalProject('v12')).ok).toBe(true);
    const opened = await openedSession();
    expect(projectOf(opened).specializations).toHaveLength(1);
    expect(opened.session.store.canUndo.value).toBe(false);
    expect(await opened.session.storage.readSpecFile(SPEC_FILE)).toBeNull();

    opened.session.actions.renameProject('Renamed');
    await opened.session.flush();
    for (const path of PACKAGE_PATHS) {
      expect(await opened.session.storage.readSpecFile(path), path).not.toBeNull();
    }
    expect(await library?.listBackups('v12')).toHaveLength(1);
    library?.close();
  });

  it('already on v14 without the notas specialization: does not add it', async () => {
    const root = folderOf(serialize(sampleProject()));
    pickDirectory.mockResolvedValue(root);
    expect((await app.openFolder()).ok).toBe(true);
    const opened = await openedSession();
    const project = projectOf(opened);
    expect(project.specializations).toEqual([]);
    expect(notesLayers(project)).toEqual([]);
    expect(opened.session.store.canUndo.value).toBe(false);
    opened.session.actions.renameProject('Renamed');
    await opened.session.flush();
    expect(root.dirs.has('specs')).toBe(false);
  });

  it('v12 that already has the notas specialization (applied by the person): does not duplicate', async () => {
    const { project, files } = withNotes();
    const root = folderOf(v12Text(project), files);
    pickDirectory.mockResolvedValue(root);
    expect((await app.openFolder()).ok).toBe(true);
    const opened = await openedSession();
    const opened12 = projectOf(opened);
    expect(opened12.specializations).toHaveLength(1);
    expect(notesLayers(opened12)).toHaveLength(1);
    expect(opened12.layers).toHaveLength(project.layers.length);
    // It did not even try to apply again (the "already applied" error would go to Diagnostics).
    const report = await import('../../src/utils/report');
    expect(report.reportedErrors.value.map((e) => e.context)).not.toContain('open.notes');
    expect(opened.session.store.canUndo.value).toBe(false);

    // The person's copy remains the one on disk, without rewriting the package over it.
    const before = root.dirs
      .get('specs')
      ?.dirs.get('notas')
      ?.modified.get('notas.spec.json');
    opened.session.actions.renameProject('Renamed');
    await opened.session.flush();
    expect(
      root.dirs.get('specs')?.dirs.get('notas')?.modified.get('notas.spec.json'),
    ).toBe(before);
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('invalid mapping');
    expect(saved.project.specializations).toHaveLength(1);
    expect(notesLayers(saved.project)).toHaveLength(1);
  });
});
