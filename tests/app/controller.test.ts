import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  parseProposalText,
  serialize,
  serializeProposal,
  serializeThread,
  specFiles,
} from '../../src/model';
import { createFolderStorage, type DirectoryHandleLike } from '../../src/storage/folder';
import { openSession } from '../../src/store/session';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { writeProjectZip } from '../../src/storage/zip';
import { clearReportedErrors } from '../../src/utils/report';
import { cadastroProject } from '../model/specFixtures';
import { emptyProject, sampleProject } from '../model/fixtures';
import { T3, sampleThread } from '../model/threadFixtures';
import { readInvalidFixture } from '../model/invalidFixtures';
import { legacyJson } from '../model/legacyShape';
import {
  keepDirectoriesInClone,
  MemoryDirectory,
  PermissionDirectory,
} from '../storage/memoryFs';
import { richScenario } from '../store/proposalHarness';

const pickDirectory = vi.fn<() => Promise<DirectoryHandleLike | null>>();
/** Controllable `isOriginPrivate`; without an implementation (`undefined`), the original applies. */
const originPrivate =
  vi.fn<(handle: DirectoryHandleLike) => Promise<boolean> | undefined>();

vi.mock('../../src/storage/folder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/folder')>();
  return {
    ...actual,
    pickDirectory: () => pickDirectory(),
    isOriginPrivate: (handle: DirectoryHandleLike) =>
      originPrivate(handle) ?? actual.isOriginPrivate(handle),
  };
});

const v1 = readFileSync('tests/fixtures/mapping-v1.json', 'utf8');

type Controller = typeof import('../../src/app/controller');
type Local = typeof import('../../src/storage/local');

/** The controller keeps state in the module: each test loads a fresh copy and clears IndexedDB. */
async function load(): Promise<{ app: Controller; local: Local }> {
  vi.resetModules();
  const app = await import('../../src/app/controller');
  const local = await import('../../src/storage/local');
  await app.initApp();
  return { app, local };
}

async function openedOf(app: Controller) {
  const current = app.openProject.value;
  if (!current) throw new Error('no project open');
  return current;
}

function folderWith(files: Record<string, string>): MemoryDirectory {
  const root = new MemoryDirectory('folder');
  for (const [name, text] of Object.entries(files))
    root.files.set(name, new Blob([text]));
  return root;
}

async function backupsOf(root: MemoryDirectory): Promise<string[]> {
  return [...(root.dirs.get('backups')?.files.keys() ?? [])];
}

let app: Controller;
let local: Local;

beforeEach(async () => {
  clearReportedErrors();
  pickDirectory.mockReset();
  originPrivate.mockReset();
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

describe('feature detection', () => {
  it('IndexedDB available enables local mode; jsdom has no showDirectoryPicker', () => {
    expect(app.features.value).toEqual({
      folder: false,
      local: true,
      fileProtocol: false,
    });
  });
});

describe('local project', () => {
  it('creates, lists, opens and deletes', async () => {
    expect((await app.createLocalProject('  My project ')).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.kind).toBe('local');
    expect(current.session.store.project.value?.project.name).toBe('My project');
    const id = current.localId ?? '';
    await app.closeProject();
    expect(app.openProject.value).toBeNull();
    expect(app.localProjects.value.map((p) => p.id)).toEqual([id]);

    expect((await app.openLocalProject(id)).ok).toBe(true);
    await app.closeProject();
    expect((await app.deleteLocalProject(id)).ok).toBe(true);
    expect(app.localProjects.value).toEqual([]);
  });

  // Stage 8 (8.4): the copy of the local project is its id (key of the review resume, 8.2).
  it('copyId of the local project is the id: create, open and import zip', async () => {
    await app.createLocalProject('Copy');
    const created = await openedOf(app);
    expect(created.session.storage.copyId).toBe(created.localId);
    const id = created.localId ?? '';
    await app.closeProject();
    await app.openLocalProject(id);
    expect((await openedOf(app)).session.storage.copyId).toBe(id);
    await app.closeProject();
    const zip = await writeProjectZip({
      mapping: serialize(emptyProject()),
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect((await app.importZip(zip)).ok).toBe(true);
    const imported = await openedOf(app);
    expect(imported.localId).not.toBe(id);
    expect(imported.session.storage.copyId).toBe(imported.localId);
  });

  it('an empty name uses the default name', async () => {
    await app.createLocalProject('   ');
    const name = (await openedOf(app)).session.store.project.value?.project.name;
    expect(name).toBeTruthy();
  });

  it('opening an id that does not exist returns not-found', async () => {
    expect(await app.openLocalProject('does-not-exist')).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(app.openProject.value).toBeNull();
  });

  it('reopening a folder with a library package: Diagnostics receives the package problems (R3.11)', async () => {
    // Builds the folder as the app writes it: applies the Material 3 package in a session and closes.
    const root = new MemoryDirectory('folder');
    const writer = openSession({
      storage: createFolderStorage(root),
      project: sampleProject(),
      prepareImage: () => Promise.reject(new Error('no images')),
    });
    expect(
      writer.actions.applySpecialization(material3Spec(), material3Package()).ok,
    ).toBe(true);
    await writer.flush();
    await writer.close();

    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    const { session } = await openedOf(app);
    const issues = session.libraryIssues.value.get('material3');
    expect(issues).toBeDefined();
    expect(issues?.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('v1 project: writes the backup before the first save', async () => {
    const library = await local.openLocalLibrary();
    await library?.create('v1', {
      mapping: v1,
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect(await library?.listBackups('v1')).toEqual([]);

    expect((await app.openLocalProject('v1')).ok).toBe(true);
    const { session } = await openedOf(app);
    // Opening writes nothing: the original stays intact until the first change.
    expect(await library?.listBackups('v1')).toEqual([]);
    expect(await library?.open('v1').loadMapping()).toBe(v1);

    session.actions.renameProject('Renamed');
    await session.flush();

    const backups = (await library?.listBackups('v1')) ?? [];
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^mapping\.v1\.\d{8}-\d{6}\.json$/);
    expect(await library?.open('v1').loadMapping()).not.toBe(v1);
    expect(session.backupSaved.value).toBe(1);
    library?.close();
  });
});

describe('folder project', () => {
  it('cancelling the picker does nothing', async () => {
    pickDirectory.mockResolvedValue(null);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'cancelled' } });
    expect(app.openProject.value).toBeNull();
  });

  it('a folder without mapping.json asks for setup and lists the existing images', async () => {
    const root = folderWith({ 'photo.jpg': 'x', 'note.txt': 'y' });
    pickDirectory.mockResolvedValue(root);
    const result = await app.openFolder();
    expect(result.ok && result.value.kind).toBe('needs-setup');
    if (result.ok && result.value.kind === 'needs-setup') {
      expect(result.value.images.map((i) => i.name)).toEqual(['photo.jpg']);
    }
    expect(app.openProject.value).toBeNull();
  });

  it('the folder call counter measures opening and saving; outside a folder there is no counter', async () => {
    const root = folderWith({ 'mapping.json': v1 });
    pickDirectory.mockResolvedValue(root);
    expect((await app.openFolder()).ok).toBe(true);
    const { session } = await openedOf(app);
    const calls = session.folderCalls;
    expect(calls).not.toBeNull();
    const opened = calls?.snapshot().find((m) => m.op === 'open');
    expect(opened?.calls).toBeGreaterThan(0);
    expect(calls?.snapshot().some((m) => m.op === 'save' || m.op === 'library')).toBe(
      false,
    );

    session.actions.renameProject('Measured');
    await session.flush();
    // The migrated v1 gets the notes library: the first save carries a package (`library`).
    const saved = calls?.snapshot().find((m) => m.op === 'library');
    expect(saved?.calls).toBeGreaterThan(0);
    // The counter does not change what was written.
    expect(await root.files.get('mapping.json')?.text()).toContain('Measured');
    await app.closeProject();

    expect((await app.createLocalProject('Local')).ok).toBe(true);
    expect((await openedOf(app)).session.folderCalls).toBeNull();
  });

  it('v1 project: writes the backup before the first save', async () => {
    const root = folderWith({ 'mapping.json': v1 });
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    const { session, kind } = await openedOf(app);
    expect(kind).toBe('folder');
    expect(await backupsOf(root)).toEqual([]);

    session.actions.renameProject('Renamed');
    await session.flush();

    const [backup, ...rest] = await backupsOf(root);
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^mapping\.v1\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backup ?? '')
        ?.text(),
    ).toBe(v1);
    expect(await root.files.get('mapping.json')?.text()).toContain('Renamed');
  });

  it('v10 project with urlTemplate: opens migrated, records the discarded one in Diagnostics and writes the backup', async () => {
    const project = emptyProject();
    const data = legacyJson(project);
    data.platformRepos = {
      android: { urlTemplate: 'https://git.example/{path}', localPath: '../..' },
      ios: { urlTemplate: 'https://git.example/ios/{path}', localPath: null },
    };
    const v10 = `${JSON.stringify({ ...data, schemaVersion: 10 }, null, 2)}\n`;
    const root = folderWith({ 'mapping.json': v10 });
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    const { session } = await openedOf(app);
    expect(session.store.project.value?.platformRepos).toEqual({
      android: { localPath: '../..' },
    });

    // One entry in Diagnostics, with the guidance (the record is the one of the loaded copy).
    const report = await import('../../src/utils/report');
    const entries = report.reportedErrors.value.filter(
      (e) => e.context === 'open.migration',
    );
    expect(entries).toHaveLength(1);
    // Interface language aside: the text carries the platforms, the templates and the guidance.
    const message = entries[0]?.message ?? '';
    expect(message).toContain('Schema 11');
    expect(message).toContain('android, ios');
    expect(message).toContain(
      'https://git.example/{path}, https://git.example/ios/{path}',
    );
    expect(message).toContain('repo (formatVersion 5)');

    // The original goes to backups/ on the first save, as in every migration.
    expect(await backupsOf(root)).toEqual([]);
    session.actions.renameProject('Migrated');
    await session.flush();
    const [backup, ...rest] = await backupsOf(root);
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^mapping\.v10\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backup ?? '')
        ?.text(),
    ).toBe(v10);
  });

  it('v10 project with only localPath migrates without recording anything in Diagnostics', async () => {
    const data = legacyJson(emptyProject());
    data.platformRepos = { android: { urlTemplate: null, localPath: '..' } };
    pickDirectory.mockResolvedValue(
      folderWith({ 'mapping.json': JSON.stringify({ ...data, schemaVersion: 10 }) }),
    );
    expect((await app.openFolder()).ok).toBe(true);
    const report = await import('../../src/utils/report');
    expect(report.reportedErrors.value.map((e) => e.context)).not.toContain(
      'open.migration',
    );
  });

  it('an invalid mapping.json returns the model error', async () => {
    pickDirectory.mockResolvedValue(folderWith({ 'mapping.json': '{ not json' }));
    const result = await app.openFolder();
    expect(result.ok).toBe(false);
    expect(app.openProject.value).toBeNull();
  });

  it('a picker error becomes storage-failed', async () => {
    pickDirectory.mockRejectedValue(new Error('boom'));
    expect(await app.openFolder()).toEqual({ ok: false, error: 'storage-failed' });
  });

  it('when creating the project in the folder, writes a .gitignore with backups/', async () => {
    const root = new MemoryDirectory('my-folder');
    await app.createFolderProject(root, 'P', []);
    expect(await root.files.get('.gitignore')?.text()).toBe('backups/\n');
  });

  it('the .gitignore that already exists in the folder is preserved, it only gets the line', async () => {
    const root = new MemoryDirectory('my-folder');
    root.files.set('.gitignore', new Blob(['dist/\n']));
    await app.createFolderProject(root, 'P', []);
    expect(await root.files.get('.gitignore')?.text()).toBe('dist/\nbackups/\n');
  });

  it('failing to write the .gitignore does not prevent creating the project', async () => {
    const root = new MemoryDirectory('my-folder');
    // The folder accepts mapping.json, but not .gitignore.
    const getFileHandle = root.getFileHandle.bind(root);
    vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
      if (name === '.gitignore' && options?.create) throw new Error('no permission');
      return getFileHandle(name, options);
    });
    const result = await app.createFolderProject(root, 'P', []);
    expect(result.ok).toBe(true);
    expect(await root.files.get('mapping.json')?.text()).toContain('"P"');
    expect((await openedOf(app)).kind).toBe('folder');
  });

  it('opening a folder that already has a project does not create .gitignore', async () => {
    const root = new MemoryDirectory('my-folder');
    await app.createFolderProject(root, 'P', []);
    root.files.delete('.gitignore');
    await app.closeProject();
    pickDirectory.mockResolvedValue(root);
    expect((await app.openFolder()).ok).toBe(true);
    expect(root.files.has('.gitignore')).toBe(false);
  });

  it('a folder that got a mapping.json after the dialog: does not write and opens the existing one', async () => {
    const existing = serialize(emptyProject());
    const root = folderWith({ 'mapping.json': existing, 'photo.jpg': 'x' });
    const result = await app.createFolderProject(root, 'New', [
      { path: 'photo.jpg', name: 'photo.jpg' },
    ]);
    expect(result).toEqual({ ok: true, value: { skipped: [], existing: true } });
    expect(await root.files.get('mapping.json')?.text()).toBe(existing);
    expect(root.files.has('photo.jpg')).toBe(true);
    expect(root.files.has('.gitignore')).toBe(false);
    const opened = await openedOf(app);
    expect(opened.kind).toBe('folder');
    // pt-BR kept: shared fixture data (emptyProject name `Teste`) asserted by tests/model, tests/mcp, tests/examples
    expect(opened.session.store.project.value?.project.name).toBe('Teste');
  });

  it('a mapping.json that appears between the import and the save is not overwritten', async () => {
    const existing = serialize(emptyProject());
    const root = new MemoryDirectory('my-folder');
    const getFileHandle = root.getFileHandle.bind(root);
    let reads = 0;
    vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
      if (name === 'mapping.json' && !options?.create && ++reads === 2) {
        root.files.set('mapping.json', new Blob([existing]));
      }
      return getFileHandle(name, options);
    });
    const result = await app.createFolderProject(root, 'New', []);
    expect(result).toEqual({ ok: true, value: { skipped: [], existing: true } });
    expect(await root.files.get('mapping.json')?.text()).toBe(existing);
    // pt-BR kept: shared fixture data (emptyProject name `Teste`) asserted by tests/model, tests/mcp, tests/examples
    expect((await openedOf(app)).session.store.project.value?.project.name).toBe('Teste');
  });

  it('creates the project in the folder using the folder name when the name comes empty', async () => {
    const root = new MemoryDirectory('my-folder');
    const result = await app.createFolderProject(root, ' ', []);
    expect(result).toEqual({ ok: true, value: { skipped: [] } });
    const text = await root.files.get('mapping.json')?.text();
    expect(text).toContain('my-folder');
    expect((await openedOf(app)).kind).toBe('folder');
  });
});

describe('import zip', () => {
  const zipOf = async (entries: Record<string, string>) => {
    const zip = new JSZip();
    for (const [name, text] of Object.entries(entries)) zip.file(name, text);
    return new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
  };

  it('an invalid zip returns invalid-zip', async () => {
    const result = await app.importZip(new Blob(['this is not a zip']));
    expect(result).toEqual({ ok: false, error: 'invalid-zip' });
    expect(app.openProject.value).toBeNull();
    expect(app.localProjects.value).toEqual([]);
  });

  it('a zip without mapping.json returns missing-mapping', async () => {
    const result = await app.importZip(await zipOf({ 'images/a.jpg': 'x' }));
    expect(result).toEqual({ ok: false, error: 'missing-mapping' });
    expect(app.openProject.value).toBeNull();
  });

  it('an invalid mapping.json inside the zip does not create a local project', async () => {
    const result = await app.importZip(await zipOf({ 'mapping.json': '{}' }));
    expect(result.ok).toBe(false);
    expect(app.localProjects.value).toEqual([]);
  });

  it('a valid zip becomes an open local project, already exported', async () => {
    const blob = await writeProjectZip({
      mapping: serialize(emptyProject()),
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect((await app.importZip(blob)).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.kind).toBe('local');
    expect(current.unexported.value).toBe(false);
  });

  it('importing counts as use: the project goes to the top of the recents with the current date (G2)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-10T10:00:00.000Z'));
      await app.createLocalProject('Local');
      await app.closeProject();
      // The zip carries the last change date, earlier than the local project.
      const p = emptyProject();
      const old = {
        ...p,
        project: { ...p.project, updatedAt: '2026-10-09T09:00:00.000Z' },
      };
      const blob = await writeProjectZip({
        mapping: serialize(old),
        images: new Map(),
        specs: new Map(),
        proposals: new Map(),
        proposalImages: new Map(),
      });
      vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
      expect((await app.importZip(blob)).ok).toBe(true);
      const importedId = (await openedOf(app)).localId;
      await app.closeProject();
      const [first] = app.recentProjects.value;
      expect(first?.id).toBe(importedId);
      expect(first?.usedAt).toBe('2026-10-12T10:00:00.000Z');
      // The last change is still the one inside the zip.
      const meta = app.localProjects.value.find((m) => m.id === importedId);
      expect(meta?.updatedAt).toBe('2026-10-09T09:00:00.000Z');
      expect(meta?.openedAt).toBe('2026-10-12T10:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a v1 project zip opens migrating and makes a backup on save', async () => {
    expect((await app.importZip(await zipOf({ 'mapping.json': v1 }))).ok).toBe(true);
    const { session, localId } = await openedOf(app);
    session.actions.renameProject('Other');
    await session.flush();
    const library = await local.openLocalLibrary();
    expect(await library?.listBackups(localId ?? '')).toHaveLength(1);
    library?.close();
  });

  it('the example project (repository zip) opens through importZip, only as a local project', async () => {
    const zip = new Blob([readFileSync('examples/exemplo-completo.zip')]);
    expect((await app.importZip(zip)).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.kind).toBe('local');
    expect(current.unexported.value).toBe(false);
    const project = current.session.store.project.value;
    expect(project?.containers).toHaveLength(4);
    expect(project?.markings).toHaveLength(32);
    expect(project?.annotations).toHaveLength(42);
    expect(current.session.proposals.list.value).toHaveLength(1);
    // No trace beyond what "Open zip" leaves: one local project, no remembered folder.
    await app.closeProject();
    expect(app.recentProjects.value.map((r) => r.kind)).toEqual(['local']);
  });
});

describe('export', () => {
  async function openCadastro() {
    const project = cadastroProject();
    const library = await local.openLocalLibrary();
    await library?.create(
      'cad',
      {
        mapping: serialize(project),
        // pt-BR kept: shared fixture data (image path `nova.webp` of richScenario / `cadastro.png` of cadastroProject) asserted by tests/store, tests/mcp
        images: new Map([['images/cadastro.png', new Blob(['png'])]]),
        specs: specFiles(project),
        proposals: new Map(),
        proposalImages: new Map(),
      },
      { unexported: false },
    );
    // An existing backup in storage must not go into the zip.
    await library?.open('cad').writeBackup('mapping.v1.20260101-000000.json', v1);
    library?.close();
    await app.openLocalProject('cad');
  }

  it('the zip has mapping.json, images/ and specs/, and does not have backups/', async () => {
    await openCadastro();
    const result = await app.buildExport();
    if (!result.ok) throw new Error(result.error);
    expect(result.value.missingImages).toEqual([]);
    expect(result.value.saved).toBe(true);
    expect(result.value.file.name).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(await result.value.file.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain('mapping.json');
    // pt-BR kept: shared fixture data (image path `nova.webp` of richScenario / `cadastro.png` of cadastroProject) asserted by tests/store, tests/mcp
    expect(names).toContain('images/cadastro.png');
    expect(names.some((n) => n.startsWith('specs/'))).toBe(true);
    expect(names.some((n) => n.startsWith('backups'))).toBe(false);
  });

  // Stage 8 (8.7), residue 1 (S8): `collectFiles().saved` reaches the Export dialog.
  it('with the save in error, the zip comes out with saved: false', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'P', []);
    const { session } = await openedOf(app);
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Q');
    await session.flush();
    expect(session.saveStatus.value).toBe('error');
    const result = await app.buildExport();
    if (!result.ok) throw new Error(result.error);
    expect(result.value.saved).toBe(false);
    root.failWrites = null;
  });

  it('without an open project returns not-found', async () => {
    expect(await app.buildExport()).toEqual({ ok: false, error: 'not-found' });
  });

  it('markExported clears the not-exported indicator and persists', async () => {
    await app.createLocalProject('P');
    const { session, unexported, localId } = await openedOf(app);
    session.actions.renameProject('Q');
    await session.flush();
    expect(unexported.value).toBe(true);
    await app.markExported();
    expect(unexported.value).toBe(false);
    const library = await local.openLocalLibrary();
    expect((await library?.get(localId ?? ''))?.unexported).toBe(false);
    library?.close();
  });

  it('markExported in a folder (without localId) does nothing', async () => {
    await app.createFolderProject(new MemoryDirectory('p'), 'P', []);
    await expect(app.markExported()).resolves.toBeUndefined();
  });
});

describe('close', () => {
  it('writes what was pending before releasing the project', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session, display } = await openedOf(app);
    const order: string[] = [];
    const close = session.close.bind(session);
    vi.spyOn(session, 'close').mockImplementation(async () => {
      order.push('close');
      await close();
      order.push(
        `saved:${(await root.files.get('mapping.json')?.text())?.includes('Edited')}`,
      );
    });
    vi.spyOn(display, 'dispose').mockImplementation(() => order.push('dispose'));

    session.actions.renameProject('Edited');
    await app.closeProject();

    expect(app.openProject.value).toBeNull();
    expect(order).toEqual(['dispose', 'close', 'saved:true']);
    expect(await root.files.get('mapping.json')?.text()).toContain('Edited');
  });

  it('closing without an open project does nothing', async () => {
    await expect(app.closeProject()).resolves.toBeUndefined();
  });

  it('updates the list of local projects on close', async () => {
    await app.createLocalProject('List');
    const { session } = await openedOf(app);
    session.actions.renameProject('List 2');
    await app.closeProject();
    expect(app.localProjects.value.map((p) => p.name)).toEqual(['List 2']);
  });
});

describe('leaving the page (phase 5.5)', () => {
  /**
   * The immediate save is proven by the `flush()` called in the event itself (the debounce
   * does not call `flush` before the timer); afterwards, it only checks that it reached the disk.
   */
  const soon = { timeout: 1000, interval: 10 };

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  afterEach(() => setVisibility('visible'));

  it('pagehide saves right away, without waiting for the debounce', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session } = await openedOf(app);
    const flush = vi.spyOn(session, 'flush');
    session.actions.renameProject('Leaving');
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      expect(await root.files.get('mapping.json')?.text()).toContain('Leaving');
    }, soon);
  });

  it('visibilitychange to hidden saves right away', async () => {
    await app.createLocalProject('Local');
    const { session, localId } = await openedOf(app);
    const flush = vi.spyOn(session, 'flush');
    session.actions.renameProject('Hidden');
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      await app.refreshLocalProjects();
      expect(app.localProjects.value.find((p) => p.id === localId)?.name).toBe('Hidden');
    }, soon);
  });

  it('beforeunload with pending changes asks for confirmation; without, it does not', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session } = await openedOf(app);
    await session.flush();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    session.actions.renameProject('Pending');
    const pending = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(true);
  });

  it('beforeunload with pending changes schedules the save and asks for confirmation', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session } = await openedOf(app);
    const flush = vi.spyOn(session, 'flush');
    session.actions.renameProject('Closing');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      expect(await root.files.get('mapping.json')?.text()).toContain('Closing');
    }, soon);
  });
});

describe('change proposals (stage 4)', () => {
  const proposalZip = async () => {
    const { proposal } = richScenario();
    const zip = new JSZip();
    zip.file('mapping.json', serialize(sampleProject()));
    zip.file('proposals/P1/proposal.json', serializeProposal(proposal));
    // pt-BR kept: shared fixture data (image path `nova.webp` of richScenario / `cadastro.png` of cadastroProject) asserted by tests/store, tests/mcp
    zip.file('proposals/P1/images/nova.webp', 'WEBP');
    return {
      proposal,
      blob: new Blob([await zip.generateAsync({ type: 'arraybuffer' })]),
    };
  };

  it('deciding on a proposal marks "not exported" in the indicator without reopening the project (S4, phase 8.1)', async () => {
    const { proposal, blob } = await proposalZip();
    expect((await app.importZip(blob)).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.unexported.value).toBe(false);
    const decided = await current.session.proposalActions.decide(
      'P1',
      { level: 'change', id: proposal.changes[1]?.id ?? '' },
      'accepted',
    );
    expect(decided.ok).toBe(true);
    expect(current.unexported.value).toBe(true);
  });

  it('an imported zip shows the proposals; deciding, exporting and reimporting preserves the review', async () => {
    const { proposal, blob } = await proposalZip();
    expect((await app.importZip(blob)).ok).toBe(true);
    const first = await openedOf(app);
    expect(first.session.proposals.list.value.map((p) => p.id)).toEqual(['P1']);

    const accepted = proposal.changes[1]?.id ?? '';
    const decided = await first.session.proposalActions.decide(
      'P1',
      { level: 'change', id: accepted },
      'accepted',
    );
    expect(decided.ok).toBe(true);
    await app.closeProject();
    // Deciding is work to export, like editing the project.
    const library = await local.openLocalLibrary();
    expect((await library?.get(first.localId ?? ''))?.unexported).toBe(true);
    library?.close();

    // Reopens the local project: the decision came from IndexedDB.
    await app.openLocalProject(first.localId ?? '');
    const second = await openedOf(app);
    expect(second.session.proposals.get('P1')?.decisions[accepted]?.state).toBe(
      'accepted',
    );

    const exported = await app.buildExport();
    if (!exported.ok) throw new Error(exported.error);
    const zip = await JSZip.loadAsync(await exported.value.file.arrayBuffer());
    // pt-BR kept: shared fixture data (image path `nova.webp` of richScenario / `cadastro.png` of cadastroProject) asserted by tests/store, tests/mcp
    expect(await zip.file('proposals/P1/images/nova.webp')?.async('string')).toBe('WEBP');
    const text = (await zip.file('proposals/P1/proposal.json')?.async('string')) ?? '';
    expect(parseProposalText(text)).toMatchObject({
      ok: true,
      proposal: { revision: 1, decisions: { [accepted]: { state: 'accepted' } } },
    });

    const reviewed = second.session.proposals.get('P1');
    await app.closeProject();
    expect((await app.importZip(exported.value.file)).ok).toBe(true);
    const third = await openedOf(app);
    expect(third.session.proposals.get('P1')).toEqual(reviewed);
  });

  it('a folder project opens with the folder proposals and applies one of them', async () => {
    const { proposal } = richScenario();
    const root = folderWith({ 'mapping.json': serialize(sampleProject()) });
    root.put('proposals/P1/proposal.json', serializeProposal(proposal));
    // pt-BR kept: shared fixture data (image path `nova.webp` of richScenario / `cadastro.png` of cadastroProject) asserted by tests/store, tests/mcp
    root.put('proposals/P1/images/nova.webp', 'WEBP');
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    const { session } = await openedOf(app);
    // pt-BR kept: shared fixture data (richScenario proposal title `Teste`) asserted by tests/store, tests/mcp
    expect(session.proposals.list.value.map((p) => p.title)).toEqual(['Teste']);

    await session.proposalActions.decide(
      'P1',
      { level: 'proposal', id: null },
      'accepted',
    );
    expect(await session.proposalActions.applyAccepted('P1')).toMatchObject({
      ok: true,
      applied: 5,
    });
    // pt-BR kept: shared fixture data (image path `nova.webp` of richScenario / `cadastro.png` of cadastroProject) asserted by tests/store, tests/mcp
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(session.store.project.value?.containers.some((i) => i.id === 'I3')).toBe(true);
  });
});

describe('anchored conversations (stage Comments)', () => {
  const ME = { name: 'Mary Allen', email: 'mary@example.com' };
  const open = sampleThread({ id: 'T1' });
  const resolved = sampleThread({ id: 'T2', resolved: { by: ME, at: T3 } });
  const threadZip = async (extra: Record<string, string> = {}) => {
    const zip = new JSZip();
    zip.file('mapping.json', serialize(sampleProject()));
    zip.file('comments/T1.json', serializeThread(open));
    zip.file('comments/resolved/T2.json', serializeThread(resolved));
    for (const [path, text] of Object.entries(extra)) zip.file(path, text);
    return new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
  };
  const withIdentity = async () => {
    const identity = await import('../../src/store/identity');
    expect(identity.setIdentity(ME.name, ME.email)).toBe('ok');
  };

  it('the imported zip goes to IndexedDB and the session shows the open and the resolved ones', async () => {
    expect((await app.importZip(await threadZip())).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.session.threads.list.value.map((t) => t.id).sort()).toEqual([
      'T1',
      'T2',
    ]);
    const library = await local.openLocalLibrary();
    const storage = library?.open(current.localId ?? '');
    expect(await storage?.listThreads(false)).toEqual(['T1']);
    expect(await storage?.listThreads(true)).toEqual(['T2']);
    library?.close();
  });

  it('conversing marks not exported; exporting and reimporting carries comments/ there and back (identical invalid text)', async () => {
    await withIdentity();
    expect(
      (await app.importZip(await threadZip({ 'comments/broken.json': '{ not json' }))).ok,
    ).toBe(true);
    const first = await openedOf(app);
    expect(first.unexported.value).toBe(false);
    const posted = await first.session.threadActions.post('T1', 'a reply');
    expect(posted.ok).toBe(true);
    expect(first.unexported.value).toBe(true);
    const resolvedNow = await first.session.threadActions.resolve('T1');
    expect(resolvedNow.ok).toBe(true);

    const exported = await app.buildExport();
    if (!exported.ok) throw new Error(exported.error);
    const zip = await JSZip.loadAsync(await exported.value.file.arrayBuffer());
    const paths = Object.keys(zip.files).filter(
      (p) => p.startsWith('comments/') && !zip.files[p]?.dir,
    );
    expect(paths.sort()).toEqual([
      'comments/broken.json',
      'comments/resolved/T1.json',
      'comments/resolved/T2.json',
    ]);
    expect(await zip.file('comments/broken.json')?.async('string')).toBe('{ not json');

    await app.closeProject();
    expect((await app.importZip(exported.value.file)).ok).toBe(true);
    const second = await openedOf(app);
    expect(second.session.threads.get('T1')?.messages.at(-1)?.text).toBe('a reply');
    expect(second.session.threads.get('T1')?.resolved?.by.email).toBe(ME.email);
    expect(second.session.threads.problems.value.map((p) => p.id)).toEqual(['broken']);
  });

  it('a folder project opens with the folder conversations and writes where the file is', async () => {
    await withIdentity();
    const root = folderWith({ 'mapping.json': serialize(sampleProject()) });
    root.put('comments/T1.json', serializeThread(open));
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    const { session } = await openedOf(app);
    expect(session.threads.list.value.map((t) => t.id)).toEqual(['T1']);
    expect((await session.threadActions.resolve('T1')).ok).toBe(true);
    expect(await root.read('comments/resolved/T1.json')).not.toBeNull();
    expect(await root.read('comments/T1.json')).toBeNull();
  });

  it('a new project exports without comments/', async () => {
    await app.createLocalProject('New');
    const exported = await app.buildExport();
    if (!exported.ok) throw new Error(exported.error);
    const zip = await JSZip.loadAsync(await exported.value.file.arrayBuffer());
    expect(Object.keys(zip.files).some((p) => p.startsWith('comments'))).toBe(false);
  });
});

describe('project with inconsistent data', () => {
  const repairable = readInvalidFixture('missing-parent');
  const unrepairable = readInvalidFixture('duplicate-id');

  it('folder: refuses with the list and offers to repair; the backup goes out on the first save', async () => {
    const root = folderWith({ 'mapping.json': repairable });
    pickDirectory.mockResolvedValue(root);
    const result = await app.openFolder();
    if (result.ok) throw new Error('should ask for the repair');
    expect(result.error).toBe('invariant-violation');
    expect(app.openProject.value).toBeNull();
    const inconsistent = result.inconsistent;
    if (!inconsistent?.repair) throw new Error('should offer the repair');
    // pt-BR kept: shared fixture data (invalid fixture `missing-parent`, marking name `Nome`) asserted by tests/model
    expect(inconsistent.issues).toContainEqual({
      code: 'missing-parent',
      entity: 'marking',
      id: 'MN',
      name: 'Nome',
      otherId: 'M9',
    });
    expect(inconsistent.unrepaired).toEqual([]);
    // pt-BR kept: shared fixture data (invalid fixture `missing-parent`, marking name `Nome`) asserted by tests/model
    expect(inconsistent.repaired).toEqual([
      {
        action: 'made-root',
        code: 'missing-parent',
        entity: 'marking',
        id: 'MN',
        name: 'Nome',
      },
    ]);

    expect(await inconsistent.repair()).toEqual({ ok: true, value: undefined });
    const { session, repaired } = await openedOf(app);
    expect(repaired).toEqual(inconsistent.repaired);
    expect(
      session.store.project.value?.markings.find((m) => m.id === 'MN')?.parentId,
    ).toBeNull();
    // Reading never writes: nothing changes in the folder until the first save.
    expect(await backupsOf(root)).toEqual([]);
    expect(await root.files.get('mapping.json')?.text()).toBe(repairable);
    // The repair summary goes to Diagnostics.
    // (the controller was loaded again in `load()`: the record is the one of its copy)
    const report = await import('../../src/utils/report');
    expect(report.reportedErrors.value.map((e) => e.context)).toContain('open.repair');

    session.actions.renameProject('Repaired');
    await session.flush();

    const [backup, ...rest] = await backupsOf(root);
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^mapping\.v20\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backup ?? '')
        ?.text(),
    ).toBe(repairable);
    const saved = (await root.files.get('mapping.json')?.text()) ?? '';
    expect(deserialize(saved).ok).toBe(true);
  });

  it('folder: with a problem without repair, only the list', async () => {
    pickDirectory.mockResolvedValue(folderWith({ 'mapping.json': unrepairable }));
    const result = await app.openFolder();
    if (result.ok) throw new Error('should refuse');
    expect(result.inconsistent?.repair).toBeNull();
    expect(result.inconsistent?.unrepaired.map((i) => `${i.code}:${i.id}`)).toEqual([
      'duplicate-id:MT',
    ]);
    expect(app.openProject.value).toBeNull();
  });

  it('local project: repairing and opening writes the backup in IndexedDB', async () => {
    const library = await local.openLocalLibrary();
    await library?.create('inc', {
      mapping: repairable,
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    const result = await app.openLocalProject('inc');
    if (result.ok || !result.inconsistent?.repair)
      throw new Error('should ask for the repair');
    expect((await result.inconsistent.repair()).ok).toBe(true);
    const { session } = await openedOf(app);
    session.actions.renameProject('Repaired');
    await session.flush();
    expect(await library?.listBackups('inc')).toHaveLength(1);
    library?.close();
  });

  // Stage 8 (8.4), R4: the repaired one goes through the same binding as a normal opening.
  it('local project: repairing and opening counts as use (openedAt) and has copyId', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
      const library = await local.openLocalLibrary();
      await library?.create('inc', {
        mapping: repairable,
        images: new Map(),
        specs: new Map(),
        proposals: new Map(),
        proposalImages: new Map(),
      });
      vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'));
      const result = await app.openLocalProject('inc');
      if (result.ok || !result.inconsistent?.repair)
        throw new Error('should ask for the repair');
      expect((await result.inconsistent.repair()).ok).toBe(true);
      expect((await openedOf(app)).session.storage.copyId).toBe('inc');
      expect((await library?.get('inc'))?.openedAt).toBe('2026-10-05T10:00:00.000Z');
      library?.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zip: only becomes a local project after accepting the repair', async () => {
    const zip = new JSZip();
    zip.file('mapping.json', repairable);
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
    const result = await app.importZip(blob);
    if (result.ok || !result.inconsistent?.repair)
      throw new Error('should ask for the repair');
    const before = await local.openLocalLibrary();
    expect(await before?.list()).toEqual([]);
    before?.close();
    expect((await result.inconsistent.repair()).ok).toBe(true);
    expect((await openedOf(app)).kind).toBe('local');
    const library = await local.openLocalLibrary();
    expect(await library?.list()).toHaveLength(1);
    library?.close();
  });

  it('the intact project of script 13.9 opens directly', async () => {
    pickDirectory.mockResolvedValue(
      folderWith({ 'mapping.json': serialize(cadastroProject()) }),
    );
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    expect((await openedOf(app)).repaired).toEqual([]);
  });
});

describe('folder recents (phase 6.6)', () => {
  /** Folder with a project: `mapping.json` with the given name. */
  const projectFolder = (folder = 'folder', name = 'Folder project') => {
    const root = new PermissionDirectory(folder);
    const project = emptyProject();
    root.put(
      'mapping.json',
      serialize({ ...project, project: { ...project.project, name } }),
    );
    return root;
  };
  const folders = () => app.recentProjects.value.filter((p) => p.kind === 'folder');
  const idOf = (folderName: string) =>
    folders().find((p) => p.kind === 'folder' && p.folderName === folderName)?.id ?? '';
  const openViaPicker = async (root: MemoryDirectory) => {
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    await app.closeProject();
  };

  beforeEach(async () => {
    // The real handle is serializable; the in-memory folder stays by reference.
    vi.stubGlobal('structuredClone', keepDirectoriesInClone());
    // Folder mode depends on `showDirectoryPicker` (the picker itself is `pickDirectory`).
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    const library = await local.openFolderLibrary();
    for (const f of (await library?.list()) ?? []) await library?.remove(f.id);
    library?.close();
    ({ app, local } = await load());
  });

  afterEach(async () => {
    await app.closeProject().catch(() => undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opening a folder and closing the project: the home screen list brings the folder', async () => {
    await openViaPicker(projectFolder());
    expect(folders()).toEqual([
      expect.objectContaining({
        kind: 'folder',
        name: 'Folder project',
        folderName: 'folder',
      }),
    ]);
    // It stays in IndexedDB: the next visit brings it too.
    ({ app, local } = await load());
    expect(folders().map((p) => p.name)).toEqual(['Folder project']);
  });

  it('creating the project in a folder also stores it; opening again does not duplicate', async () => {
    const root = new PermissionDirectory('fresh');
    expect((await app.createFolderProject(root, 'New', [])).ok).toBe(true);
    await app.closeProject();
    expect(folders().map((p) => p.name)).toEqual(['New']);
    await openViaPicker(root);
    expect(folders()).toHaveLength(1);
    // Another folder with the same name is another entry (`isSameEntry`, not the name).
    await openViaPicker(projectFolder('fresh', 'Other'));
    expect(folders()).toHaveLength(2);
  });

  it('the list name follows the renamed project', async () => {
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const { session } = await openedOf(app);
    session.actions.renameProject('Renamed');
    await app.closeProject();
    expect(folders().map((p) => p.name)).toEqual(['Renamed']);
  });

  it('single list with folders and projects of this device, by last use', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
    await app.createLocalProject('Local');
    const localId = (await openedOf(app)).localId ?? '';
    await app.closeProject();
    vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'));
    await openViaPicker(projectFolder());
    expect(app.recentProjects.value.map((p) => [p.kind, p.name])).toEqual([
      ['folder', 'Folder project'],
      ['local', 'Local'],
    ]);
    // Opening (without changing) the local project counts as use.
    vi.setSystemTime(new Date('2026-10-03T10:00:00.000Z'));
    expect((await app.openLocalProject(localId)).ok).toBe(true);
    await app.closeProject();
    expect(app.recentProjects.value.map((p) => p.kind)).toEqual(['local', 'folder']);
    expect(app.recentProjects.value[0]?.usedAt).toBe('2026-10-03T10:00:00.000Z');
  });

  // Stage 8 (8.4), R1: closing while the folder is being stored does not leave the entry id
  // for the next project (which, on closing, would give its name to the folder row).
  it('closing while the folder is being stored does not leak the entry to the next project', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    originPrivate.mockImplementationOnce(async () => {
      await gate;
      return false;
    });
    pickDirectory.mockResolvedValue(projectFolder());
    const opening = app.openFolder();
    await vi.waitFor(() => expect(originPrivate).toHaveBeenCalled());
    // The editor only shows with the folder already stored: there is no project to close in the middle.
    expect(app.openProject.value).toBeNull();
    await app.closeProject();
    release();
    expect(await opening).toEqual({ ok: true, value: { kind: 'opened' } });
    await app.closeProject();
    await app.createLocalProject('Local');
    await app.closeProject();
    expect(folders().map((p) => p.name)).toEqual(['Folder project']);
  });

  // Stage 8 (8.4), R2: as in the local project, the name follows on every save.
  it('renaming the folder project shows in the recents without Close', async () => {
    pickDirectory.mockResolvedValue(projectFolder());
    await app.openFolder();
    const { session } = await openedOf(app);
    session.actions.renameProject('Renamed');
    expect((await session.flush()).ok).toBe(true);
    // The touch on the entry comes after the save (outside the session queue).
    const library = await local.openFolderLibrary();
    await vi.waitFor(async () =>
      expect((await library?.list())?.map((f) => f.name)).toEqual(['Renamed']),
    );
    library?.close();
  });

  // Stage 8 (8.7), owner decision: generating the zip is not exporting. With the save in
  // error, the person generates the zip and cancels the "Save as" (without `markExported`);
  // when the save comes back with exactly that content, it is a change to export: `unexported`
  // goes up and the recents entry moves (`touchFolder`), as in any save.
  it('zip generated and download cancelled: the next save counts as a change', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const { session, unexported } = await openedOf(app);
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Cancelled');
    await session.flush();
    expect(session.saveStatus.value).toBe('error');
    expect(unexported.value).toBe(false);

    const built = await app.buildExport();
    expect(built.ok && built.value.saved).toBe(false);
    // Without markExported: the person cancelled the "Save as".
    vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'));
    root.failWrites = null;
    expect(await session.flush()).toEqual({ ok: true });
    expect(unexported.value).toBe(true);
    const library = await local.openFolderLibrary();
    await vi.waitFor(async () =>
      expect((await library?.list())?.map((f) => [f.name, f.usedAt])).toEqual([
        ['Cancelled', '2026-10-02T10:00:00.000Z'],
      ]),
    );
    library?.close();
  });

  it('zip downloaded (markExported): saving the same content is not a change', async () => {
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const { session, unexported } = await openedOf(app);
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Downloaded');
    await session.flush();
    expect((await app.buildExport()).ok).toBe(true);
    await app.markExported();
    root.failWrites = null;
    expect(await session.flush()).toEqual({ ok: true });
    expect(unexported.value).toBe(false);
  });

  // Stage 8 (8.4), R5: a permission failure (expired activation, unmounted volume) gives the
  // notice with Locate/Remove, not just "Could not access the files".
  it('SecurityError in requestPermission: permission notice, with the error in Diagnostics', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.permission = 'prompt';
    vi.spyOn(root, 'requestPermission').mockRejectedValue(
      new DOMException('activation expired', 'SecurityError'),
    );
    expect(await app.openRecentFolder(idOf('folder'))).toEqual({
      ok: true,
      value: { kind: 'unavailable', reason: 'denied' },
    });
    expect(app.openProject.value).toBeNull();
    const report = await import('../../src/utils/report');
    expect(report.reportedErrors.value.map((e) => e.context)).toContain(
      'folders.permission',
    );
  });

  // Stage 8 (8.4), R6: the handles database also requests persistent storage.
  it('storing the folder requests persistent storage', async () => {
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist },
    });
    try {
      await openViaPicker(projectFolder());
      expect(folders()).toHaveLength(1);
      expect(persist).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'storage');
    }
  });

  // Stage 8 (8.4): the folder copy is the id of the recents entry (resume key, 8.2).
  it('folder copyId is the entry id: through the picker, through the recent and after Locate', async () => {
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const first = (await openedOf(app)).session.storage.copyId;
    await app.closeProject();
    const id = idOf('folder');
    expect(first).toBe(id);
    await app.openRecentFolder(id);
    expect((await openedOf(app)).session.storage.copyId).toBe(id);
    await app.closeProject();
    root.gone = true;
    pickDirectory.mockResolvedValue(projectFolder('moved-folder'));
    expect(await app.relocateFolder(id)).toEqual({ ok: true, value: { kind: 'opened' } });
    expect((await openedOf(app)).session.storage.copyId).toBe(id);
  });

  it('repaired folder copyId is the entry id', async () => {
    const root = new PermissionDirectory('repair');
    root.put('mapping.json', readInvalidFixture('missing-parent'));
    pickDirectory.mockResolvedValue(root);
    const result = await app.openFolder();
    if (result.ok || !result.inconsistent?.repair)
      throw new Error('should ask for the repair');
    expect((await result.inconsistent.repair()).ok).toBe(true);
    const copyId = (await openedOf(app)).session.storage.copyId;
    await app.closeProject();
    expect(copyId).toBe(idOf('repair'));
  });

  it('copyId of a folder without recents: one id per tab, the same when reopening the same folder', async () => {
    const plain = (name: string) => {
      const dir = new MemoryDirectory(name);
      dir.put('mapping.json', serialize(emptyProject()));
      return dir;
    };
    const copyOf = async (dir: MemoryDirectory) => {
      pickDirectory.mockResolvedValue(dir);
      await app.openFolder();
      const copyId = (await openedOf(app)).session.storage.copyId;
      await app.closeProject();
      return copyId;
    };
    const first = await copyOf(plain('plain'));
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe('');
    expect(await copyOf(plain('plain'))).toBe(first);
    expect(await copyOf(plain('other'))).not.toBe(first);
    expect(folders()).toEqual([]);
  });

  // Stage 8 (8.4), R7: two equal rows in the list become distinguishable by the folder name.
  it('repeated names in the list show the folder name', async () => {
    await openViaPicker(projectFolder('a', 'Shop'));
    await openViaPicker(projectFolder('b', 'Shop'));
    await openViaPicker(projectFolder('c', 'c'));
    const show = Object.fromEntries(
      folders().map((p) =>
        p.kind === 'folder' ? [p.folderName, p.showFolderName] : ['', false],
      ),
    );
    expect(show).toEqual({ a: true, b: true, c: false });
  });

  it('permission already granted: one click opens and updates the date, without changing mapping.json', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
    const root = projectFolder();
    const before = await root.read('mapping.json');
    await openViaPicker(root);
    vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'));
    expect(await app.openRecentFolder(idOf('folder'))).toEqual({
      ok: true,
      value: { kind: 'opened' },
    });
    expect((await openedOf(app)).kind).toBe('folder');
    expect(root.requests).toBe(0);
    await app.closeProject();
    expect(folders()[0]?.usedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(await root.read('mapping.json')).toBe(before);
  });

  it('permission to ask: asks within the click and opens', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.permission = 'prompt';
    const query = vi.spyOn(root, 'queryPermission');
    const opening = app.openRecentFolder(idOf('folder'));
    // The query starts in the click itself, before any other wait.
    expect(query).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(await opening).toEqual({ ok: true, value: { kind: 'opened' } });
    expect(root.requests).toBe(1);
  });

  it('permission denied: notice, nothing opened', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.permission = 'prompt';
    root.answer = 'denied';
    expect(await app.openRecentFolder(idOf('folder'))).toEqual({
      ok: true,
      value: { kind: 'unavailable', reason: 'denied' },
    });
    expect(app.openProject.value).toBeNull();
    expect(folders()).toHaveLength(1);
  });

  it('folder moved or deleted (NotFoundError): notice, nothing opened', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.gone = true;
    expect(await app.openRecentFolder(idOf('folder'))).toEqual({
      ok: true,
      value: { kind: 'unavailable', reason: 'missing' },
    });
    expect(app.openProject.value).toBeNull();
  });

  it('Locate folder: replaces the handle, checking mapping.json', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    const id = idOf('folder');
    root.gone = true;

    // Folder without mapping.json: it is not the project; the entry stays as it was.
    pickDirectory.mockResolvedValue(new PermissionDirectory('empty'));
    expect(await app.relocateFolder(id)).toEqual({
      ok: true,
      value: { kind: 'no-project' },
    });
    expect(app.openProject.value).toBeNull();
    expect(folders().map((p) => p.folderName)).toEqual(['folder']);

    pickDirectory.mockResolvedValue(null);
    expect(await app.relocateFolder(id)).toEqual({
      ok: true,
      value: { kind: 'cancelled' },
    });

    const moved = projectFolder('moved-folder');
    pickDirectory.mockResolvedValue(moved);
    expect(await app.relocateFolder(id)).toEqual({ ok: true, value: { kind: 'opened' } });
    await app.closeProject();
    expect(folders().map((p) => [p.id, p.folderName])).toEqual([[id, 'moved-folder']]);
    expect(await app.openRecentFolder(id)).toEqual({
      ok: true,
      value: { kind: 'opened' },
    });
  });

  it('Locating a folder that is already in the list merges the two entries', async () => {
    const a = projectFolder('a', 'A');
    const b = projectFolder('b', 'B');
    await openViaPicker(a);
    await openViaPicker(b);
    a.gone = true;
    pickDirectory.mockResolvedValue(b);
    expect((await app.relocateFolder(idOf('a'))).ok).toBe(true);
    await app.closeProject();
    expect(folders().map((p) => p.folderName)).toEqual(['b']);
  });

  it('Removing from the list does not delete anything from disk', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    const before = await root.read('mapping.json');
    expect((await app.forgetFolder(idOf('folder'))).ok).toBe(true);
    expect(folders()).toEqual([]);
    expect(await root.read('mapping.json')).toBe(before);
    ({ app, local } = await load());
    expect(folders()).toEqual([]);
  });

  // Stage 8 (8.4), R8: on a new visit, reading the handle in IndexedDB (`handleOf`) comes
  // BEFORE `queryPermission`. `requestPermission` only opens the request within the gesture
  // activation (a few seconds): that read must stay short and be the only wait before the
  // query. Do not put another wait (network, another read, `remember`) on that path.
  it('on a new visit, the handle comes from IndexedDB and the permission is requested', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    ({ app, local } = await load());
    root.permission = 'prompt';
    expect(await app.openRecentFolder(idOf('folder'))).toEqual({
      ok: true,
      value: { kind: 'opened' },
    });
    expect(root.requests).toBe(1);
  });

  it('a folder in the origin private storage (OPFS) does not enter the list', async () => {
    const root = projectFolder('opfs');
    // The OPFS root recognizes the folder as its own (`resolve` returns the path).
    const opfs = {
      isSameEntry: async () => false,
      resolve: async (h: unknown) => (h === root ? ['opfs'] : null),
    };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: async () => opfs },
    });
    try {
      await openViaPicker(root);
      expect(folders()).toEqual([]);
      await openViaPicker(projectFolder('outside'));
      expect(folders().map((p) => p.folderName)).toEqual(['outside']);
    } finally {
      Reflect.deleteProperty(navigator, 'storage');
    }
  });

  it('browser without queryPermission/isSameEntry: the list keeps only the local ones', async () => {
    const plain = new MemoryDirectory('plain');
    plain.put('mapping.json', serialize(emptyProject()));
    await openViaPicker(plain);
    expect(folders()).toEqual([]);
  });

  it('without folder mode, the stored folders do not show', async () => {
    await openViaPicker(projectFolder());
    vi.stubGlobal('showDirectoryPicker', undefined);
    ({ app, local } = await load());
    expect(app.features.value?.folder).toBe(false);
    expect(folders()).toEqual([]);
  });

  // Return from the 8.4 gate (finding 1): Open records in the trace the path it took, for
  // Diagnostics (`folders.reopen`). The trace here is a plain object with `step`.
  describe('Open trace', () => {
    const recorder = () => {
      const steps: string[] = [];
      return { steps, step: (label: string) => void steps.push(label) };
    };

    it('the reported case: request granted and the folder renamed', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      ({ app, local } = await load());
      root.permission = 'prompt';
      root.gone = true;
      const trace = recorder();
      expect(await app.openRecentFolder(idOf('folder'), trace)).toEqual({
        ok: true,
        value: { kind: 'unavailable', reason: 'missing' },
      });
      expect(trace.steps).toEqual([
        'handle=idb',
        'query=prompt',
        'request=granted',
        'branch=no-mapping',
      ]);
    });

    it('permission already valid and project opened', async () => {
      await openViaPicker(projectFolder());
      const trace = recorder();
      await app.openRecentFolder(idOf('folder'), trace);
      expect(trace.steps).toEqual(['handle=memory', 'query=granted', 'branch=opened']);
    });

    it('permission denied', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      root.permission = 'prompt';
      root.answer = 'denied';
      const trace = recorder();
      await app.openRecentFolder(idOf('folder'), trace);
      expect(trace.steps).toEqual([
        'handle=memory',
        'query=prompt',
        'request=denied',
        'branch=denied',
      ]);
    });

    it('exception in the request: SecurityError and NotFoundError', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      root.permission = 'prompt';
      const request = vi
        .spyOn(root, 'requestPermission')
        .mockRejectedValue(new DOMException('activation expired', 'SecurityError'));
      const trace = recorder();
      await app.openRecentFolder(idOf('folder'), trace);
      expect(trace.steps.at(-1)).toBe('branch=permission-error:SecurityError');
      request.mockRejectedValue(new DOMException('gone', 'NotFoundError'));
      const again = recorder();
      await app.openRecentFolder(idOf('folder'), again);
      expect(again.steps.at(-1)).toBe('branch=permission-missing');
    });

    it('without a usable handle on a new visit', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      ({ app, local } = await load());
      Object.defineProperty(root, 'requestPermission', { value: undefined });
      const trace = recorder();
      expect(await app.openRecentFolder(idOf('folder'), trace)).toEqual({
        ok: true,
        value: { kind: 'unavailable', reason: 'missing' },
      });
      expect(trace.steps).toEqual(['handle=idb', 'branch=no-handle']);
    });

    it('entry that left the list', async () => {
      const trace = recorder();
      expect((await app.openRecentFolder('does-not-exist', trace)).ok).toBe(false);
      expect(trace.steps).toEqual(['branch=no-entry']);
    });

    it('the project does not open: the error code', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      root.put('mapping.json', '{');
      const trace = recorder();
      const result = await app.openRecentFolder(idOf('folder'), trace);
      expect(result.ok).toBe(false);
      expect(trace.steps.at(-1)).toBe(
        `branch=open-failed:${result.ok ? '' : result.error}`,
      );
    });

    it('exception outside the permission: its name', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      vi.spyOn(root, 'getFileHandle').mockRejectedValue(
        new DOMException('locked', 'InvalidStateError'),
      );
      const trace = recorder();
      expect(await app.openRecentFolder(idOf('folder'), trace)).toEqual({
        ok: false,
        error: 'storage-failed',
      });
      expect(trace.steps.at(-1)).toBe('branch=exception:InvalidStateError');
    });
  });
});
