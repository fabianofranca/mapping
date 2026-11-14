// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  readRevision,
  serialize,
  serializeProposal,
  type Project,
} from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProposals, type LoadedProposals } from '../../src/storage/loadProposals';
import {
  EMPTY_RETRY_ATTEMPTS,
  EMPTY_RETRY_DELAY_MS,
  ExternalChangeError,
  openSession,
  type ProjectSession,
} from '../../src/store/session';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';
import { richScenario } from './proposalHarness';

// Stage 3a.2: the revision of `mapping.json`, the external changes (the MCP, a text editor)
// and what the session does with them: refuse the write, reload or let the user decide.

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  clearReportedErrors();
});

/** Folder with the project already saved (revision `revision`), as the app finds it on open. */
function projectOnDisk(project: Project, revision = 0) {
  const root = new MemoryDirectory('mapping');
  const text = serialize({ ...project, revision });
  root.put('mapping.json', text);
  return { root, text, project: { ...project, revision } };
}

function open(
  root: MemoryDirectory,
  project: Project,
  text: string,
  onImagesChanged?: (paths: readonly string[]) => void,
) {
  return openSession({
    storage: createFolderStorage(root),
    project,
    loadedText: text,
    onImagesChanged,
    prepareImage: () => Promise.reject(new Error('no images here')),
    now: () => NOW,
  });
}

async function diskProject(root: MemoryDirectory): Promise<Project> {
  const parsed = deserialize((await root.read('mapping.json')) ?? '');
  if (!parsed.ok) throw new Error('mapping.json invalid');
  return parsed.project;
}

/** Another process (the MCP) writes the file: changes the name and bumps the revision. */
function externalWrite(
  root: MemoryDirectory,
  project: Project,
  revision: number,
  name: string,
) {
  const next = { ...project, revision, project: { ...project.project, name } };
  root.put('mapping.json', serialize(next));
  return next;
}

describe('mapping.json revision', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('each write bumps the revision by 1', async () => {
    const { root, text, project } = projectOnDisk(sampleProject(), 4);
    session = open(root, project, text);
    session.actions.renameProject('One');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(5);
    session.actions.renameProject('Two');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(6);
    expect(session.saveStatus.value).toBe('saved');
  });

  it('a v5 file (no revision) is read as 0 and the first write writes 1', async () => {
    const root = new MemoryDirectory('p');
    const project = emptyProject();
    const v5 = JSON.parse(serialize(project)) as Record<string, unknown>;
    delete v5.revision;
    const text = JSON.stringify(v5);
    root.put('mapping.json', text);
    expect(readRevision(text)).toBe(0);
    session = open(root, project, text);
    session.actions.renameProject('New');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(1);
  });

  it('refuses to write if another process changed the file and opens the conflict', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    const external = externalWrite(root, project, 1, 'Done by MCP');

    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(session.saveStatus.value).toBe('error');
    expect(session.conflict.value).toEqual({ reloadFailed: false });
    // The other process file stays intact.
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('also notices the hand edit, which does not touch the revision', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    // pt-BR kept: shared fixture data (the sampleProject name "Teste") asserted by tests/mcp
    root.put('mapping.json', text.replace('"Teste"', '"Edited by hand"'));
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();
  });

  it('"Keep mine" writes over it, with the revision after the file one', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 7, 'Done by MCP');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();

    await session.resolveConflict('keep');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('saved');
    const saved = await diskProject(root);
    expect(saved.project.name).toBe('My name');
    expect(saved.revision).toBe(8);
  });

  it('"Reload" discards the local changes and opens the file as it is', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    const external = externalWrite(root, project, 1, 'Done by MCP');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    await session.resolveConflict('reload');
    await vi.advanceTimersByTimeAsync(2000);

    expect(session.conflict.value).toBeNull();
    expect(session.store.project.value?.project.name).toBe('Done by MCP');
    expect(session.store.canUndo.value).toBe(false);
    expect(session.saveStatus.value).toBe('saved');
    expect(session.reloads.value).toBe(1);
    // Nothing was written over it.
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('"Reload" with the file unreadable keeps the conflict open, warning', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Done by MCP');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    root.put('mapping.json', '{ this is not json');
    await session.resolveConflict('reload');
    expect(session.conflict.value).toEqual({ reloadFailed: true });

    // It is still possible to decide to keep mine.
    await session.resolveConflict('keep');
    expect(session.conflict.value).toBeNull();
    expect((await diskProject(root)).project.name).toBe('My name');
  });

  it('a file deleted from outside is written again, without a conflict', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.files.delete('mapping.json');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).toBeNull();
    expect((await diskProject(root)).project.name).toBe('My name');
  });

  it('the exported zip carries the disk revision', async () => {
    const { root, text, project } = projectOnDisk(sampleProject(), 3);
    session = open(root, project, text);
    session.actions.renameProject('One');
    const files = await session.collectFiles();
    expect(readRevision(files.mapping)).toBe(4);
  });
});

describe('external changes', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('reloads by itself when the file changes and there is nothing pending', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Done by MCP');

    expect(await session.sync()).toBe('reloaded');

    expect(session.store.project.value?.project.name).toBe('Done by MCP');
    expect(session.reloads.value).toBe(1);
    // Reloading writes nothing, nor schedules a write.
    await vi.advanceTimersByTimeAsync(2000);
    expect((await diskProject(root)).revision).toBe(1);
    expect(session.saveStatus.value).toBe('saved');
    // And a following write starts from the new revision.
    session.actions.renameProject('After');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(2);
  });

  it('does not reload again when nothing changed (not even its own write counts)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    expect(await session.sync()).toBe('unchanged');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);
  });

  it('only the file date changed (touch): the content is the same, does not reload', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.touch('mapping.json');
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);
  });

  it('with pending local changes, does not reload: the write decides', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Done by MCP');
    session.actions.renameProject('My name');

    expect(await session.sync()).toBe('busy');
    expect(session.store.project.value?.project.name).toBe('My name');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();
  });

  it('a gesture in progress also holds the reload', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Done by MCP');
    session.store.beginGesture();
    expect(await session.sync()).toBe('busy');
    session.store.cancelGesture();
    expect(await session.sync()).toBe('reloaded');
  });

  it('a half-written (unreadable) file is ignored until it becomes valid', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.put('mapping.json', '{ "schemaVersion": 6, ');
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);

    externalWrite(root, project, 1, 'Ready');
    expect(await session.sync()).toBe('reloaded');
    expect(session.store.project.value?.project.name).toBe('Ready');
  });

  it('with the conflict open, does not reload under the dialog', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Done by MCP');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);
  });

  it('the reload resets the history and starts writing the right specs/ copies', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    session.actions.renameProject('Local');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.store.canUndo.value).toBe(true);
    const current = await diskProject(root);
    externalWrite(root, current, current.revision + 1, 'External');
    expect(await session.sync()).toBe('reloaded');
    expect(session.store.canUndo.value).toBe(false);
  });

  it('a project outside a folder (without statMapping) is not watchable', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    const { statMapping, statImage, ...local } = storage;
    void statMapping;
    void statImage;
    session = openSession({
      storage: { ...local, kind: 'local' },
      project: emptyProject(),
      prepareImage: () => Promise.reject(new Error('x')),
    });
    expect(session.watchable).toBe(false);
    expect(await session.sync()).toBe('unchanged');
  });
});

describe('images swapped from outside', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  function withImages() {
    // pt-BR kept: shared fixture data (image paths of sampleProject: lateral.jpg, frente.jpg) asserted by tests/mcp
    const disk = projectOnDisk(sampleProject());
    disk.root.put('images/lateral.jpg', 'v1-side');
    disk.root.put('images/frente.jpg', 'v1-front');
    return disk;
  }

  it('reports only the swapped file when checking the images (focus back on the window)', async () => {
    const { root, text, project } = withImages();
    const changed: string[][] = [];
    session = open(root, project, text, (paths) => changed.push([...paths]));

    expect(await session.sync({ images: true })).toBe('unchanged');
    expect(changed).toEqual([]);

    root.put('images/frente.jpg', 'v2-front-larger');
    await session.sync({ images: true });
    expect(changed).toEqual([['images/frente.jpg']]);

    // The new stamp becomes the known one: the next check does not repeat the warning.
    await session.sync({ images: true });
    expect(changed).toHaveLength(1);
  });

  it('the check every 3 s (without images) does not look at the image files', async () => {
    const { root, text, project } = withImages();
    const changed: string[][] = [];
    session = open(root, project, text, (paths) => changed.push([...paths]));
    root.put('images/frente.jpg', 'v2-front-larger');
    await session.sync();
    expect(changed).toEqual([]);
  });

  it('after reloading the project, reports the new and the swapped images', async () => {
    const { root, text, project } = withImages();
    const changed: string[][] = [];
    session = open(root, project, text, (paths) => changed.push([...paths]));
    await session.sync({ images: true });

    root.put('images/lateral.jpg', 'v2-side-swapped');
    externalWrite(root, project, 1, 'Swapped the side');
    expect(await session.sync()).toBe('reloaded');
    expect(changed.flat()).toContain('images/lateral.jpg');
    expect(changed.flat()).not.toContain('images/frente.jpg');
  });

  it('an image that was missing and shows up from outside is reloaded', async () => {
    const disk = projectOnDisk(sampleProject());
    disk.root.put('images/frente.jpg', 'v1-front'); // the side one does not exist yet
    const changed: string[][] = [];
    session = open(disk.root, disk.project, disk.text, (paths) =>
      changed.push([...paths]),
    );
    await session.sync({ images: true });
    expect(changed).toEqual([]);

    disk.root.put('images/lateral.jpg', 'arrived');
    await session.sync({ images: true });
    expect(changed).toEqual([['images/lateral.jpg']]);
  });
});

// Stage 6 (6.2), finding 8 of the 2026-10-11 report (R6.10): with the write in error (the file
// locked), the periodic check returned `busy` without looking at the disk, and the change made from
// outside only showed up when clicking "Try again".
describe('external change with the write in error (phase 6.2)', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  /** Locked write (read-only) with a pending local edit: "Error saving". */
  async function failedSave(root: MemoryDirectory, s: ProjectSession) {
    root.failWrites = new Error('NoModificationAllowedError');
    s.actions.renameProject('App title');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(s.saveStatus.value).toBe('error');
    expect(s.conflict.value).toBeNull();
  }

  it('the file changed from outside: the check opens the conflict, without reloading', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    const external = externalWrite(root, project, 1, 'External footer');

    expect(await session.sync()).toBe('conflict');

    expect(session.conflict.value).toEqual({ reloadFailed: false });
    // There is something pending: nothing is reloaded nor written over.
    expect(session.store.project.value?.project.name).toBe('App title');
    expect(session.reloads.value).toBe(0);
    expect(session.saveStatus.value).toBe('error');
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('also notices the hand edit (same revision)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    // pt-BR kept: shared fixture data (the sampleProject name "Teste") asserted by tests/mcp
    root.put('mapping.json', text.replace('"Teste"', '"Edited by hand"'));
    expect(await session.sync()).toBe('conflict');
    expect(session.conflict.value).not.toBeNull();
  });

  it('the file did not change: nothing happens and the error stays', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    expect(await session.sync()).toBe('unchanged');
    root.touch('mapping.json');
    expect(await session.sync()).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('error');
    expect(session.store.project.value?.project.name).toBe('App title');
  });

  it('a gesture in progress holds the check', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    externalWrite(root, project, 1, 'External footer');
    session.store.beginGesture();
    expect(await session.sync()).toBe('busy');
    expect(session.conflict.value).toBeNull();
    session.store.cancelGesture();
    expect(await session.sync()).toBe('conflict');
  });

  it('"Reload" from that state discards the pending edit and reads the file', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    const external = externalWrite(root, project, 1, 'External footer');
    expect(await session.sync()).toBe('conflict');

    await session.resolveConflict('reload');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('saved');
    expect(session.store.project.value?.project.name).toBe('External footer');
    expect(session.reloads.value).toBe(1);
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('"Keep mine" from that state writes over it, with the new revision', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    externalWrite(root, project, 7, 'External footer');
    expect(await session.sync()).toBe('conflict');

    // R6.11: gives the permission back and chooses to keep mine.
    root.failWrites = null;
    await session.resolveConflict('keep');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('saved');
    const saved = await diskProject(root);
    expect(saved.project.name).toBe('App title');
    expect(saved.revision).toBe(8);
  });

  it('"Keep mine" with the file still locked goes back to the error, without a conflict', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    const external = externalWrite(root, project, 1, 'External footer');
    expect(await session.sync()).toBe('conflict');

    await session.resolveConflict('keep');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('error');
    expect(await root.read('mapping.json')).toBe(serialize(external));
    // The outside file became the known one: the next check does not reopen the conflict.
    expect(await session.sync()).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
  });
});

// Phase 6.2 and phase 8.1 (findings S1 to S10): write, check and reload are jobs of a
// single queue and never cross. The `hooked` hooks hold a write or a read
// in the middle to prove the races.
describe('check and write do not cross (phases 6.2 and 8.1)', () => {
  let session: ProjectSession | null = null;
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(async () => {
    await session?.close();
    session = null;
    vi.restoreAllMocks();
  });

  function deferred() {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  interface HookedOptions {
    readonly onImagesChanged?: (paths: readonly string[]) => void;
    readonly proposals?: LoadedProposals;
  }

  /**
   * Session over the folder with hooks on the storage: `holdSave` holds the next write
   * of `mapping.json` (before or after writing), `holdRead` holds the next read of it
   * (returning the text read before the wait), `failReads` makes every read throw (permission
   * revoked), and the counters say how many writes started, how many reads there were and
   * how many date checks (`stat`).
   */
  function hooked(
    root: MemoryDirectory,
    project: Project,
    text: string,
    options: HookedOptions = {},
  ) {
    const storage = createFolderStorage(root);
    const saves: { gate: Promise<void>; afterWrite: boolean }[] = [];
    let readGate: Promise<void> | null = null;
    let failReads: Error | null = null;
    let savesStarted = 0;
    let readsHeld = 0;
    let reads = 0;
    let stats = 0;
    const gatedRead = async <T>(read: () => Promise<T>): Promise<T> => {
      reads++;
      if (failReads) throw failReads;
      const result = await read();
      const gate = readGate;
      readGate = null;
      if (gate) {
        readsHeld++;
        await gate;
      }
      return result;
    };
    const s = openSession({
      storage: {
        ...storage,
        saveMapping: async (data) => {
          savesStarted++;
          const hold = saves.shift();
          if (hold && !hold.afterWrite) await hold.gate;
          await storage.saveMapping(data);
          if (hold?.afterWrite) await hold.gate;
        },
        loadMapping: () => gatedRead(() => storage.loadMapping()),
        // The session reads through here (text and date in a single read): the same hooks apply.
        loadMappingStamped: () =>
          gatedRead(async () => (await storage.loadMappingStamped?.()) ?? null),
        statMapping: async () => {
          stats++;
          return storage.statMapping ? storage.statMapping() : null;
        },
      },
      project,
      loadedText: text,
      prepareImage: () => Promise.reject(new Error('no images here')),
      now: () => NOW,
      onImagesChanged: options.onImagesChanged,
      proposals: options.proposals,
    });
    return {
      session: s,
      holdSave(afterWrite: boolean) {
        const d = deferred();
        saves.push({ gate: d.promise, afterWrite });
        return d;
      },
      holdRead() {
        const d = deferred();
        readGate = d.promise;
        return d;
      },
      failReads(error: Error | null) {
        failReads = error;
      },
      savesStarted: () => savesStarted,
      readsHeld: () => readsHeld,
      reads: () => reads,
      stats: () => stats,
    };
  }

  /** Local edit with the disk locked: "Error saving". */
  async function lockedEdit(
    root: MemoryDirectory,
    s: ProjectSession,
    name = 'App title',
  ) {
    root.failWrites = new Error('NoModificationAllowedError');
    s.actions.renameProject(name);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(s.saveStatus.value).toBe('error');
  }

  /** Local edit with the file empty for good: the attempts run out and the status falls into error. */
  async function emptyForever(root: MemoryDirectory, s: ProjectSession) {
    root.put('mapping.json', '');
    s.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    for (let attempt = 1; attempt < EMPTY_RETRY_ATTEMPTS; attempt++) {
      expect(s.saveStatus.value, `attempt ${attempt}`).toBe('saving');
      await vi.advanceTimersByTimeAsync(EMPTY_RETRY_DELAY_MS);
    }
    expect(s.saveStatus.value).toBe('error');
    expect(await root.read('mapping.json')).toBe('');
  }

  // Rewritten in phase 8.1: the 6.2 version made "Try again" write while the
  // check read the file (two queues) and proved that the old read did not become a
  // conflict. With the single queue, the write waits for the check to finish.
  it('"Try again" during the check waits for the queue: neither a false conflict nor a crossed write', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    await lockedEdit(root, session);

    // The check reads the file (only the date changed) and stays stopped; the permission comes back and
    // the person clicks "Try again": the write enters the queue behind the check.
    root.touch('mapping.json');
    const read = h.holdRead();
    const syncing = session.sync();
    await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
    root.failWrites = null;
    const retrying = session.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.savesStarted()).toBe(1);
    expect(session.saveStatus.value).toBe('saving');
    read.resolve();

    expect(await syncing).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
    expect(await retrying).toEqual({ ok: true });
    expect(session.saveStatus.value).toBe('saved');
    expect((await diskProject(root)).project.name).toBe('App title');
    expect(await session.sync()).toBe('unchanged');
  });

  // Rewritten in phase 8.1 (S2): the 6.2 version pinned `status === 'error'` with a write
  // in progress, which was the symptom (the AutoSaver did not mark `saving` on the queued one).
  it('a write in progress after an error has the "saving" status and the check waits for the queue (S2)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    // The first write stays stopped and then fails; the second, queued behind it,
    // runs next and stops right after writing the file.
    const first = h.holdSave(false);
    session.actions.renameProject('One');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
    session.actions.renameProject('Two');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const second = h.holdSave(true);
    first.reject(new Error('NoModificationAllowedError'));
    await vi.waitFor(() => expect(h.savesStarted()).toBe(2));
    await vi.waitFor(async () =>
      expect((await diskProject(root)).project.name).toBe('Two'),
    );
    // There is a write running: the status is "Saving…", not "Error saving".
    expect(session.saveStatus.value).toBe('saving');

    // The file already has the new write, but the session has not registered it yet: the check
    // waits for the queue (only runs after the write) instead of taking the file for an external change.
    const syncing = session.sync();
    second.resolve();
    expect(await syncing).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
    await vi.waitFor(() => expect(session?.saveStatus.value).toBe('saved'));
    expect(await session.sync()).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
  });

  it('editor truncates the file and then writes: the write waits and the result is a conflict, not a reload (S1)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    session.actions.renameProject('My name');
    // The editor truncated the file; the write arrives and finds it empty.
    root.put('mapping.json', '');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(await root.read('mapping.json')).toBe('');
    expect(session.saveStatus.value).toBe('saving');
    expect(h.savesStarted()).toBe(0);
    // The editor finished writing: the new attempt sees an outside file.
    const external = externalWrite(root, project, 1, 'From the editor');
    await vi.advanceTimersByTimeAsync(EMPTY_RETRY_DELAY_MS);
    expect(session.conflict.value).toEqual({ reloadFailed: false });
    expect(session.saveStatus.value).toBe('error');
    expect(h.savesStarted()).toBe(0);
    expect(await root.read('mapping.json')).toBe(serialize(external));
    // With the conflict open, the check does not reload under the local edit.
    expect(await session.sync()).toBe('unchanged');
    expect(session.store.project.value?.project.name).toBe('My name');
  });

  it('file empty for good: tries EMPTY_RETRY_ATTEMPTS times, does not write, falls into error with the cause in Diagnostics; deleting the file releases the write (S1, B1)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    await emptyForever(root, session);
    expect(h.savesStarted()).toBe(0);
    expect(reportedErrors.value.map((e) => e.context)).toContain('session.emptyMapping');

    // "Try again" repeats the attempts and fails again.
    const retrying = session.flush();
    await vi.advanceTimersByTimeAsync(EMPTY_RETRY_DELAY_MS * EMPTY_RETRY_ATTEMPTS);
    expect(await retrying).toMatchObject({ ok: false });
    expect(session.saveStatus.value).toBe('error');
    expect(h.savesStarted()).toBe(0);

    // Way out 2: the person deletes the file from outside; the next write writes.
    root.files.delete('mapping.json');
    expect(await session.flush()).toEqual({ ok: true });
    expect(session.saveStatus.value).toBe('saved');
    expect((await diskProject(root)).project.name).toBe('My name');
  });

  it('persistent empty after the error: the check opens the conflict; Reload fails; Keep mine writes over it (A1)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    await emptyForever(root, session);

    // Way out 3: the check, with the write in error, treats the empty as an external change.
    expect(await session.sync()).toBe('conflict');
    expect(session.conflict.value).toEqual({ reloadFailed: false });
    await session.resolveConflict('reload');
    expect(session.conflict.value).toEqual({ reloadFailed: true });
    await session.resolveConflict('keep');
    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('saved');
    expect((await diskProject(root)).project.name).toBe('My name');
  });

  it('Reload with a write in progress does not write the old project over the adopted one (S3)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    const external = externalWrite(root, project, 1, 'From outside');
    session.actions.renameProject('One');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();

    // A second write (new edit) is reading the file when the person clicks Reload.
    const read = h.holdRead();
    session.actions.renameProject('Two');
    const flushing = session.flush();
    await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
    const reloading = session.resolveConflict('reload');
    read.resolve();
    await flushing;
    await reloading;

    expect(session.conflict.value).toBeNull();
    expect(session.store.project.value?.project.name).toBe('From outside');
    expect(session.saveStatus.value).toBe('saved');
    expect(await root.read('mapping.json')).toBe(serialize(external));
    expect(h.savesStarted()).toBe(0);
  });

  it('undo after a refused write does not rewrite the base project (S5)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    const external = externalWrite(root, project, 1, 'From outside');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();

    const reads = h.reads();
    session.store.undo();
    await vi.advanceTimersByTimeAsync(2000);
    // No new write: it did not even read the file.
    expect(h.reads()).toBe(reads);
    expect(h.savesStarted()).toBe(0);
    expect(session.saveStatus.value).toBe('saved');
    expect(await root.read('mapping.json')).toBe(serialize(external));
    // The dialog stays until the person decides (D3).
    expect(session.conflict.value).not.toBeNull();
  });

  it('undo after a write that failed on disk goes back to "saved" without writing (S5)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    await lockedEdit(root, session);
    expect(h.savesStarted()).toBe(1);
    session.store.undo();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.savesStarted()).toBe(1);
    expect(session.saveStatus.value).toBe('saved');
    expect(await root.read('mapping.json')).toBe(text);
  });

  it('applying accepted with the write refused: the compensation undo does not rewrite the base project (S5)', async () => {
    const { base, proposal, ids } = richScenario();
    const { root, text, project } = projectOnDisk(base);
    root.put('proposals/P1/proposal.json', serializeProposal(proposal));
    const h = hooked(root, project, text, {
      proposals: await loadProposals(createFolderStorage(root)),
    });
    session = h.session;
    // Only the name change (no image to copy).
    const decided = await session.proposalActions.decide(
      'P1',
      { level: 'change', id: ids.name },
      'accepted',
    );
    expect(decided).toMatchObject({ ok: true });
    const external = externalWrite(root, project, 1, 'From outside');

    const applied = await session.proposalActions.applyAccepted('P1');
    expect(applied).toEqual({ ok: false, error: 'save-failed' });
    expect(session.conflict.value).not.toBeNull();

    const reads = h.reads();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.reads()).toBe(reads);
    expect(h.savesStarted()).toBe(0);
    expect(session.saveStatus.value).toBe('saved');
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('file written by the app: editing and undoing back to the start does not rewrite (A2, normal case)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    session.actions.renameProject('My name');
    session.store.undo();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.savesStarted()).toBe(0);
    expect(session.saveStatus.value).toBe('saved');
    expect(await root.read('mapping.json')).toBe(text);
  });

  it('Reload with the read throwing: warns (reloadFailed), logs to Diagnostics and does not reject (S7)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    externalWrite(root, project, 1, 'From outside');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();

    h.failReads(new Error('permission revoked'));
    await expect(session.resolveConflict('reload')).resolves.toBeUndefined();
    expect(session.conflict.value).toEqual({ reloadFailed: true });
    expect(reportedErrors.value.map((e) => e.context)).toContain('session.reload');

    h.failReads(null);
    await session.resolveConflict('reload');
    expect(session.conflict.value).toBeNull();
    expect(session.store.project.value?.project.name).toBe('From outside');
  });

  it('Keep mine with the read throwing: does not reject; the write falls into error and the conflict comes back when the file is read (S7, D4)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    externalWrite(root, project, 1, 'From outside');
    session.actions.renameProject('My name');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();

    h.failReads(new Error('permission revoked'));
    await expect(session.resolveConflict('keep')).resolves.toBeUndefined();
    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('error');
    expect(reportedErrors.value.map((e) => e.context)).toContain('session.keep');

    // The read comes back: the known revision is not the outside file one, so it is a conflict again,
    // and the person decides with the readable file.
    h.failReads(null);
    expect(await session.flush()).toMatchObject({ ok: false });
    expect(session.conflict.value).not.toBeNull();
    await session.resolveConflict('keep');
    expect(session.saveStatus.value).toBe('saved');
    const saved = await diskProject(root);
    expect(saved.project.name).toBe('My name');
    expect(saved.revision).toBe(2);
  });

  it('sync({ images: true }) during a check in progress is not discarded: the images are checked (S9)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    // pt-BR kept: shared fixture data (image paths of sampleProject: lateral.jpg, frente.jpg) asserted by tests/mcp
    root.put('images/lateral.jpg', 'v1-side');
    root.put('images/frente.jpg', 'v1-front');
    const changed: string[][] = [];
    const h = hooked(root, project, text, {
      onImagesChanged: (paths) => changed.push([...paths]),
    });
    session = h.session;
    expect(await session.sync({ images: true })).toBe('unchanged');
    expect(changed).toEqual([]);

    root.put('images/frente.jpg', 'v2-front-larger');
    root.touch('mapping.json');
    const read = h.holdRead();
    const first = session.sync();
    await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
    const second = session.sync({ images: true });
    read.resolve();
    expect(await first).toBe('unchanged');
    expect(await second).toBe('unchanged');
    expect(changed).toEqual([['images/frente.jpg']]);
  });

  it('concurrent sync calls: the one in progress and at most one more, with the same promise (S9)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    await vi.advanceTimersByTimeAsync(0); // the date known since opening
    root.touch('mapping.json');
    const read = h.holdRead();
    const first = session.sync();
    await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
    const stats = h.stats();
    const a = session.sync();
    const b = session.sync();
    const c = session.sync();
    expect(b).toBe(a);
    expect(c).toBe(a);
    read.resolve();
    expect(await first).toBe('unchanged');
    expect(await a).toBe('unchanged');
    expect(h.stats()).toBe(stats + 1);
  });

  it('the first check with the same file does not read it: the date is known since opening (S10)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    await vi.advanceTimersByTimeAsync(0);
    const reads = h.reads();
    expect(await session.sync()).toBe('unchanged');
    expect(h.reads()).toBe(reads);
    // It really changed: reads and reloads.
    externalWrite(root, project, 1, 'From outside');
    expect(await session.sync()).toBe('reloaded');
  });

  it('close() waits for the check in progress: no project is adopted after closing (S10)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    externalWrite(root, project, 1, 'From outside');
    const read = h.holdRead();
    const syncing = session.sync();
    await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
    const closing = session.close();
    read.resolve();
    await syncing;
    await closing;
    expect(session.store.project.value).toBeNull();
    expect(session.reloads.value).toBe(0);
  });

  it('an edit during the check: it does not adopt the outside file, and the next flush never returns ok with it (B2, P7 chain)', async () => {
    // Variant 1: the outside file is different → the check returns busy and the flush opens the conflict.
    {
      const { root, text, project } = projectOnDisk(sampleProject());
      const h = hooked(root, project, text);
      session = h.session;
      const external = externalWrite(root, project, 1, 'From outside');
      const read = h.holdRead();
      const syncing = session.sync();
      await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
      session.actions.renameProject('Applied'); // the 8.2 `store.apply`
      read.resolve();
      expect(await syncing).toBe('busy');
      expect(session.reloads.value).toBe(0);
      expect(session.store.project.value?.project.name).toBe('Applied');
      const flushed = await session.flush();
      expect(flushed.ok).toBe(false);
      if (!flushed.ok) expect(flushed.error).toBeInstanceOf(ExternalChangeError);
      expect(session.conflict.value).not.toBeNull();
      expect(await root.read('mapping.json')).toBe(serialize(external));
      await session.close();
      session = null;
    }
    // Variant 2: the file is the known one (only the date changed) → the flush writes the applied one.
    {
      const { root, text, project } = projectOnDisk(sampleProject());
      const h = hooked(root, project, text);
      session = h.session;
      await vi.advanceTimersByTimeAsync(0); // the date known since opening
      root.touch('mapping.json');
      const read = h.holdRead();
      const syncing = session.sync();
      await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
      session.actions.renameProject('Applied');
      read.resolve();
      expect(await syncing).not.toBe('reloaded');
      expect(session.reloads.value).toBe(0);
      expect(await session.flush()).toEqual({ ok: true });
      expect((await diskProject(root)).project.name).toBe('Applied');
    }
  });
});

// Stage #1777 (decision 8): `session.busy()` is what `useExternalChanges` reads to postpone the cycle.
describe('session.busy: work in progress that postpones the check (stage #1777)', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('at rest, it is not busy; with a scheduled write, it is; saved, it is not', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    expect(session.busy()).toBe(false);
    session.actions.renameProject('Scheduled');
    expect(session.saveStatus.value).toBe('saving');
    expect(session.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.saveStatus.value).toBe('saved');
    expect(session.busy()).toBe(false);
  });

  it('a gesture in progress leaves it busy', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    session.store.beginGesture();
    expect(session.busy()).toBe(true);
    session.store.cancelGesture();
    expect(session.busy()).toBe(false);
  });

  it('with the write in error it is not busy (the check needs to open the conflict)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Failure');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.saveStatus.value).toBe('error');
    expect(session.busy()).toBe(false);
  });

  it('a proposal decision being written leaves it busy until it finishes', async () => {
    const { base, proposal, ids } = richScenario();
    const { root, text, project } = projectOnDisk(base);
    root.put('proposals/P1/proposal.json', serializeProposal(proposal));
    session = openSession({
      storage: createFolderStorage(root),
      project,
      loadedText: text,
      proposals: await loadProposals(createFolderStorage(root)),
      prepareImage: () => Promise.reject(new Error('no images here')),
      now: () => NOW,
    });
    expect(session.busy()).toBe(false);
    const deciding = session.proposalActions.decide(
      'P1',
      { level: 'change', id: ids.name },
      'accepted',
    );
    expect(session.busy()).toBe(true);
    expect(await deciding).toMatchObject({ ok: true });
    expect(session.busy()).toBe(false);
  });

  it('closed, it is not busy', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    session.actions.renameProject('Pending');
    const closing = session.close();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await closing;
    expect(session.busy()).toBe(false);
    session = null;
  });
});
