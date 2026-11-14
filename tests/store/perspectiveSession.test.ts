import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  removeContainer,
  serialize,
  type Perspective,
  type Project,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import {
  openLocalPerspectives,
  type LocalPerspectiveStore,
} from '../../src/storage/localPerspectives';
import { openSession, type ProjectSession } from '../../src/store/session';
import { clearReportedErrors } from '../../src/utils/report';
import { NOW, PROJECT_ID, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Stage #659, PE2: the session with perspectives. The open one stays in this browser by `project.id`; the
// "For everyone" ones go in `mapping.json`; the "Only me" ones stay in IndexedDB (never in the file).

let store: LocalPerspectiveStore | null = null;
let session: ProjectSession | null = null;
let counter = 0;

beforeEach(async () => {
  localStorage.clear();
  store = await openLocalPerspectives();
  if (!store) throw new Error('IndexedDB unavailable');
  await store.save(PROJECT_ID, []);
});

afterEach(async () => {
  await session?.close();
  session = null;
  store?.close();
  store = null;
  clearReportedErrors();
});

/** Folder with the project already saved (revision 0), as the app finds it on open. */
function folder(project: Project = sampleProject()): MemoryDirectory {
  const root = new MemoryDirectory('mapping');
  root.put('mapping.json', serialize({ ...project, revision: 0 }));
  return root;
}

async function diskText(root: MemoryDirectory): Promise<string> {
  return (await root.read('mapping.json')) ?? '';
}

async function diskProject(root: MemoryDirectory): Promise<Project> {
  const parsed = deserialize(await diskText(root));
  if (!parsed.ok) throw new Error('mapping.json invalid');
  return parsed.project;
}

/** Opens the session like the app: with the project from the file and the "Only me" ones read from IndexedDB. */
async function open(
  root: MemoryDirectory,
  options: { readonly localStore?: LocalPerspectiveStore | null } = {},
): Promise<ProjectSession> {
  const text = await diskText(root);
  const parsed = deserialize(text);
  if (!parsed.ok) throw new Error('mapping.json invalid');
  const localStore = options.localStore === undefined ? store : options.localStore;
  const initial = localStore ? await localStore.load(parsed.project.project.id) : [];
  session = openSession({
    storage: createFolderStorage(root),
    project: parsed.project,
    loadedText: text,
    localPerspectives: { store: localStore, initial },
    prepareImage: () => Promise.reject(new Error('no images here')),
    now: () => NOW,
    newId: () => `PS-${++counter}`,
    autosaveDelay: 1,
  });
  return session;
}

/** Reopens the session over the same folder (closes the current one first). */
async function reopen(root: MemoryDirectory): Promise<ProjectSession> {
  await session?.flush();
  await session?.close();
  return open(root);
}

function created(result: { readonly ok: boolean; readonly value?: string }): string {
  if (!result.ok || result.value === undefined)
    throw new Error('perspective not created');
  return result.value;
}

async function savedLocals(): Promise<readonly Perspective[]> {
  return (await store?.load(PROJECT_ID)) ?? [];
}

describe('arrival notices', () => {
  it('creating a second root keeps the notice of the first', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    const args = { name: null, width: 100, height: 100, background: '#FFFFFF' };
    const first = s.actions.addBackgroundContainer(args);
    const second = s.actions.addBackgroundContainer(args);
    expect(first.ok && second.ok).toBe(true);
    expect(s.perspective.arrivals.value.map((a) => a.root).sort()).toEqual(
      [first.ok && first.value, second.ok && second.value].sort(),
    );
  });
});

describe('open perspective', () => {
  it('opening a perspective switches session.perspective.id; null goes back to the Main one', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.open(id)).toBe(true);
    expect(s.perspective.id.value).toBe(id);
    expect(s.perspective.openId()).toBe(id);
    expect(s.perspective.open(null)).toBe(true);
    expect(s.perspective.id.value).toBeNull();
  });

  it('refuses an id that the project does not have', async () => {
    const s = await open(folder());
    expect(s.perspective.open('does-not-exist')).toBe(false);
    expect(s.perspective.id.value).toBeNull();
  });

  it('switching perspective does not enter the undo', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    s.perspective.open(null);
    s.store.undo();
    expect(s.store.project.value?.perspectives).toEqual([]);
    expect(s.store.canUndo.value).toBe(false);
  });

  it('the stored choice comes back when the session is reopened (same project.id)', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);

    const again = await reopen(root);
    expect(again.perspective.id.value).toBe(id);
    expect(again.perspective.notice.value).toBeNull();
  });

  it('the stored one that disappeared falls to the Main one, with the notice and the name', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    await s.flush();
    const saved = await diskText(root);
    await s.close();

    // Another file (the perspective was deleted elsewhere): the same project, without it.
    root.put('mapping.json', serialize({ ...sampleProject(), revision: 5 }));
    expect(saved).not.toBe(await diskText(root));
    const again = await open(root);
    expect(again.perspective.id.value).toBeNull();
    expect(again.perspective.notice.value).toEqual({ kind: 'removed', name: 'Mobile' });
  });

  it('deleting the open one goes back to the Main one with the notice; undo brings it back', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    expect(s.perspectiveActions.removePerspective(id).ok).toBe(true);
    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.notice.value).toEqual({ kind: 'removed', name: 'Mobile' });
    expect(s.store.project.value?.perspectives).toEqual([]);

    expect(s.store.undo()).toBe(true);
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
  });

  it('locking the switch opens the Main one (review notice) and refuses to open', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    s.perspective.setLocked(true);
    expect(s.perspective.locked.value).toBe(true);
    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.notice.value).toEqual({ kind: 'review' });
    expect(s.perspective.open(id)).toBe(false);
    s.perspective.setLocked(false);
    expect(s.perspective.open(id)).toBe(true);
  });
});

describe('Only me (IndexedDB)', () => {
  it('creating writes to IndexedDB and NOT to mapping.json', async () => {
    const root = folder();
    const before = await diskText(root);
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Draft',
        startFrom: null,
        local: true,
      }),
    );
    await s.flush();

    expect(s.perspective.localIds.value.has(id)).toBe(true);
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
    await vi.waitFor(async () => {
      expect((await savedLocals()).map((x) => x.id)).toEqual([id]);
    });
    // The file stays the same (not even the revision changed), and does not mention the perspective.
    expect(await diskText(root)).toBe(before);
    expect((await diskProject(root)).perspectives).toEqual([]);
  });

  it('when reopening, the Only me ones come back from IndexedDB', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Draft',
        startFrom: null,
        local: true,
      }),
    );
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(1));

    const again = await reopen(root);
    expect(again.store.project.value?.perspectives.map((x) => x.name)).toEqual(['Draft']);
    expect(again.perspective.localIds.value.has(id)).toBe(true);
    again.perspective.open(id);
    expect(again.perspective.id.value).toBe(id);
  });

  it('the Only me ones use the For everyone names for uniqueness', async () => {
    const s = await open(folder());
    s.perspectiveActions.createPerspective({
      name: 'Mobile',
      startFrom: null,
      local: false,
    });
    const result = s.perspectiveActions.createPerspective({
      name: 'mobile',
      startFrom: null,
      local: true,
    });
    expect(result).toEqual({ ok: false, error: 'perspective-name-taken' });
    expect(s.perspective.localIds.value.size).toBe(0);
  });

  it('setPerspectiveLocal(id, false) takes it to the file and removes it from the browser', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Draft',
        startFrom: null,
        local: true,
      }),
    );
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(1));

    const result = await s.perspectiveActions.setPerspectiveLocal(id, false);
    expect(result.ok).toBe(true);

    expect(s.perspective.localIds.value.has(id)).toBe(false);
    expect((await diskProject(root)).perspectives.map((x) => x.id)).toEqual([id]);
    await vi.waitFor(async () => expect(await savedLocals()).toEqual([]));
  });

  it('setPerspectiveLocal(id, true) brings it to the browser and the file stops mentioning it', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'For everyone',
        startFrom: null,
        local: false,
      }),
    );
    await s.flush();
    expect((await diskProject(root)).perspectives.map((x) => x.id)).toEqual([id]);

    const result = await s.perspectiveActions.setPerspectiveLocal(id, true);
    expect(result.ok).toBe(true);
    await s.flush();

    expect((await savedLocals()).map((x) => x.id)).toEqual([id]);
    expect((await diskProject(root)).perspectives).toEqual([]);
    expect(s.perspective.localIds.value.has(id)).toBe(true);
    // The perspective stays in the in-memory project.
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
  });

  it('setPerspectiveLocal does not enter the undo', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'For everyone',
        startFrom: null,
        local: false,
      }),
    );
    await s.perspectiveActions.setPerspectiveLocal(id, true);
    s.store.undo();
    // Undid only the creation.
    expect(s.store.project.value?.perspectives).toEqual([]);
    expect(s.store.canUndo.value).toBe(false);
  });

  it('without IndexedDB, creating Only me fails with local-unavailable', async () => {
    const s = await open(folder(), { localStore: null });
    expect(s.perspective.localAvailable).toBe(false);
    const result = s.perspectiveActions.createPerspective({
      name: 'Draft',
      startFrom: null,
      local: true,
    });
    expect(result).toEqual({ ok: false, error: 'local-unavailable' });
    expect(s.store.project.value?.perspectives).toEqual([]);
    // The For everyone ones keep working, but do not become Only me.
    const shared = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    expect(await s.perspectiveActions.setPerspectiveLocal(shared, true)).toEqual({
      ok: false,
      error: 'local-unavailable',
    });
    expect(s.perspective.localIds.value.size).toBe(0);
  });

  it('duplicating an Only me gives another Only me', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Draft',
        startFrom: null,
        local: true,
      }),
    );
    const copy = created(s.perspectiveActions.duplicatePerspective(id, 'Rascunho 2'));
    expect(s.perspective.localIds.value.has(copy)).toBe(true);
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(2));
  });
});

describe('writing mapping.json', () => {
  it('each write bumps the revision by 1 and changing only an Only me does not write the file', async () => {
    const root = folder();
    const s = await open(root);
    s.perspectiveActions.createPerspective({
      name: 'Mobile',
      startFrom: null,
      local: false,
    });
    await s.flush();
    expect((await diskProject(root)).revision).toBe(1);

    const local = created(
      s.perspectiveActions.createPerspective({
        name: 'Draft',
        startFrom: null,
        local: true,
      }),
    );
    await s.flush();
    expect((await diskProject(root)).revision).toBe(1);

    s.perspectiveActions.renamePerspective(local, 'Rascunho novo');
    s.perspectiveActions.setPerspectiveHiddenLayers(local, ['L1']);
    await s.flush();
    expect((await diskProject(root)).revision).toBe(1);
    expect(s.saveStatus.value).toBe('saved');

    s.perspectiveActions.createPerspective({
      name: 'Tablet',
      startFrom: 'empty',
      local: false,
    });
    await s.flush();
    const onDisk = await diskProject(root);
    expect(onDisk.revision).toBe(2);
    expect(onDisk.perspectives.map((x) => x.name)).toEqual(['Mobile', 'Tablet']);
  });

  it('the exported zip also does not carry the Only me ones', async () => {
    const s = await open(folder());
    s.perspectiveActions.createPerspective({
      name: 'Mobile',
      startFrom: null,
      local: false,
    });
    s.perspectiveActions.createPerspective({
      name: 'Draft',
      startFrom: null,
      local: true,
    });
    const files = await s.collectFiles();
    const parsed = deserialize(files.mapping);
    if (!parsed.ok) throw new Error('mapping invalid');
    expect(parsed.project.perspectives.map((x) => x.name)).toEqual(['Mobile']);
  });
});

describe('external reload', () => {
  it('the root that disappeared leaves the For everyone and the Only me perspectives', async () => {
    const root = folder();
    const s = await open(root);
    const shared = created(
      s.perspectiveActions.createPerspective({
        name: 'Everyone',
        startFrom: null,
        local: false,
      }),
    );
    const mine = created(
      s.perspectiveActions.createPerspective({
        name: 'Me',
        startFrom: null,
        local: true,
      }),
    );
    await s.flush();
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(1));

    // Another process deletes container I2 and writes the file.
    const current = await diskProject(root);
    const external = {
      ...removeContainer(current, 'I2'),
      revision: current.revision + 1,
    };
    root.put('mapping.json', serialize(external));

    expect(await s.sync()).toBe('reloaded');

    const project = s.store.project.value as Project;
    const rootsOf = (id: string) =>
      project.perspectives.find((x) => x.id === id)?.items.map((i) => i.root);
    expect(rootsOf(shared)).toEqual(['I1']);
    expect(rootsOf(mine)).toEqual(['I1']);
    // The Only me ones stay Only me and the reconciled one goes to IndexedDB.
    expect(s.perspective.localIds.value.has(mine)).toBe(true);
    await vi.waitFor(async () => {
      expect((await savedLocals())[0]?.items.map((i) => i.root)).toEqual(['I1']);
    });
    // Reloading does not rewrite the file.
    await s.flush();
    expect((await diskProject(root)).revision).toBe(external.revision);
  });

  it('the open perspective that disappeared goes back to the Main one with the notice and the name', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    await s.flush();
    s.perspective.open(id);

    const current = await diskProject(root);
    root.put('mapping.json', serialize({ ...current, perspectives: [], revision: 9 }));
    expect(await s.sync()).toBe('reloaded');

    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.notice.value).toEqual({ kind: 'removed', name: 'Mobile' });
  });

  it('the open Only me stays open after the reload', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Me',
        startFrom: null,
        local: true,
      }),
    );
    s.perspective.open(id);
    await s.flush();
    const current = await diskProject(root);
    root.put('mapping.json', serialize({ ...current, revision: 3 }));

    expect(await s.sync()).toBe('reloaded');
    expect(s.perspective.id.value).toBe(id);
    expect(s.perspective.notice.value).toBeNull();
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
  });
});

describe('perspective actions', () => {
  it('rename, duplicate, delete and choose hidden layers enter the undo', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    expect(s.perspectiveActions.renamePerspective(id, 'Phone').ok).toBe(true);
    const copy = created(s.perspectiveActions.duplicatePerspective(id, 'Phone 2'));
    expect(s.perspectiveActions.setPerspectiveHiddenLayers(copy, ['L2']).ok).toBe(true);
    const names = () => s.store.project.value?.perspectives.map((x) => x.name);
    expect(names()).toEqual(['Phone', 'Phone 2']);
    expect(s.store.project.value?.perspectives[1]?.hiddenLayers).toEqual(['L2']);

    s.store.undo();
    expect(s.store.project.value?.perspectives[1]?.hiddenLayers).toEqual([]);
    s.store.undo();
    expect(names()).toEqual(['Phone']);
    s.store.undo();
    expect(names()).toEqual(['Mobile']);
  });

  it('sending and removing roots use the open perspective as the source', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Empty',
        startFrom: 'empty',
        local: false,
      }),
    );
    expect(s.perspectiveActions.sendRootsToPerspective(id, ['I1', 'I2']).ok).toBe(true);
    const roots = () =>
      s.store.project.value?.perspectives
        .find((x) => x.id === id)
        ?.items.map((i) => i.root);
    expect(roots()).toEqual(['I1', 'I2']);
    expect(s.perspectiveActions.removeRootsFromPerspective(id, ['I1']).ok).toBe(true);
    expect(roots()).toEqual(['I2']);
    // A marking that is not a root is refused.
    expect(s.perspectiveActions.sendRootsToPerspective(id, ['M1'])).toEqual({
      ok: false,
      error: 'not-root',
    });
  });

  it('dismissArrival removes the "Came from…" mark', async () => {
    const s = await open(folder());
    s.store.apply((p) => ({
      ...p,
      arrivals: [{ root: 'I1', from: 'PX', fromName: 'Old' }],
    }));
    expect(s.perspectiveActions.dismissArrival('I1').ok).toBe(true);
    expect(s.store.project.value?.arrivals).toEqual([]);
  });
});
