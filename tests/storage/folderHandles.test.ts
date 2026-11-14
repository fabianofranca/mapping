// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import {
  countingDirectory,
  createFolderCalls,
  type FolderCallKind,
} from '../../src/storage/folderCalls';
import { MemoryDirectory } from './memoryFs';

function setup(latencyMs = 0) {
  const root = new MemoryDirectory('project');
  root.latencyMs = latencyMs;
  const calls = createFolderCalls();
  const storage = createFolderStorage(countingDirectory(root, calls));
  /** How many calls of each type `fn` made (only the requested types). */
  const measure = async (kinds: FolderCallKind[], fn: () => Promise<unknown>) => {
    const before = kinds.map((kind) => calls.byKind[kind]);
    await fn();
    return Object.fromEntries(
      kinds.map((kind, i) => [kind, calls.byKind[kind] - (before[i] ?? 0)]),
    );
  };
  return { root, calls, storage, measure };
}

const DIRS_AND_FILES: FolderCallKind[] = [
  'getDirectoryHandle',
  'getFileHandle',
  'getFile',
];

describe('stored folder handles', () => {
  it('reading proposals/P1/proposal.json twice resolves each folder only once', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'one');
    const first = await measure(DIRS_AND_FILES, () => storage.readProposal('P1'));
    const second = await measure(DIRS_AND_FILES, () => storage.readProposal('P1'));
    expect(first).toEqual({ getDirectoryHandle: 2, getFileHandle: 1, getFile: 1 });
    expect(second).toEqual({ getDirectoryHandle: 0, getFileHandle: 1, getFile: 1 });
  });

  it('also stores the intermediate folders (a/b/c stores a, a/b and a/b/c)', async () => {
    const { root, storage, measure } = setup();
    root.put('specs/p/sub/x.json', 'x');
    root.put('specs/p/sub/y.json', 'y');
    root.put('specs/p/z.json', 'z');
    await storage.readSpecFile('specs/p/sub/x.json');
    expect(
      await measure(['getDirectoryHandle'], () =>
        storage.readSpecFile('specs/p/sub/y.json'),
      ),
    ).toEqual({ getDirectoryHandle: 0 });
    expect(
      await measure(['getDirectoryHandle'], () => storage.readSpecFile('specs/p/z.json')),
    ).toEqual({ getDirectoryHandle: 0 });
  });

  it('folder deleted and recreated from outside: the read repeats from the root and finds the new file', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'old');
    expect(await storage.readProposal('P1')).toBe('old');
    root.removeAt('proposals/P1');
    root.put('proposals/P1/proposal.json', 'new');
    let text: string | null = null;
    const counts = await measure(DIRS_AND_FILES, async () => {
      text = await storage.readProposal('P1');
    });
    expect(text).toBe('new');
    // The stored handle failed (1 getFileHandle) and the root was walked again
    // (2 getDirectoryHandle + 1 getFileHandle): proof that there was a cache.
    expect(counts).toEqual({ getDirectoryHandle: 2, getFileHandle: 2, getFile: 1 });
  });

  it('package folder deleted from outside: writeSpecFile recreates the folder and the write holds', async () => {
    const { root, storage } = setup();
    await storage.writeSpecFile('specs/s1/a.json', 'one');
    root.removeAt('specs/s1');
    await storage.writeSpecFile('specs/s1/a.json', 'two');
    expect(await root.read('specs/s1/a.json')).toBe('two');
    expect(await (await storage.readSpecFile('specs/s1/a.json'))?.text()).toBe('two');
  });

  it('folder removals clear the map first: writing again recreates without failure or repetition', async () => {
    const { root, storage, measure } = setup();
    await storage.writeProposal('P1', 'one');
    await storage.removeProposal('P1');
    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    const counts = await measure(DIRS_AND_FILES, () =>
      storage.writeProposal('P1', 'two'),
    );
    // `proposals` is still stored; only P1 is opened (created), with no failed getFileHandle.
    expect(counts).toEqual({ getDirectoryHandle: 1, getFileHandle: 1, getFile: 0 });
    expect(await root.read('proposals/P1/proposal.json')).toBe('two');

    await storage.writeSpecFile('specs/s1/sub/a.json', 'x');
    await storage.removeSpecDir('specs/s1');
    const specCounts = await measure(DIRS_AND_FILES, () =>
      storage.writeSpecFile('specs/s1/sub/a.json', 'y'),
    );
    expect(specCounts).toEqual({ getDirectoryHandle: 2, getFileHandle: 1, getFile: 0 });
    expect(await root.read('specs/s1/sub/a.json')).toBe('y');
  });

  it('two simultaneous calls to the same folder open it only once', async () => {
    const { root, storage, measure } = setup(2);
    root.put('proposals/P1/proposal.json', 'one');
    const counts = await measure(['getDirectoryHandle'], () =>
      Promise.all([storage.readProposal('P1'), storage.readProposal('P1')]),
    );
    expect(counts).toEqual({ getDirectoryHandle: 2 });
  });

  it('a missing folder returns null and stores nothing', async () => {
    const { root, storage, measure } = setup();
    root.put('specs/other/a.json', 'a');
    expect(await storage.readSpecFile('specs/nothing/x.json')).toBeNull();
    // `specs` was stored and `nothing` was not. The "does not exist" came from a stored parent, so the
    // call double-checks by repeating from the root (specs + nothing = 2 calls, besides the attempt).
    expect(
      await measure(['getDirectoryHandle'], () =>
        storage.readSpecFile('specs/nothing/x.json'),
      ),
    ).toEqual({ getDirectoryHandle: 3 });
    root.put('specs/nothing/x.json', 'exists now');
    expect(await (await storage.readSpecFile('specs/nothing/x.json'))?.text()).toBe(
      'exists now',
    );
  });

  it('a file that never existed in a freshly resolved folder costs the minimum (no repetition)', async () => {
    const { root, storage, measure } = setup();
    root.put('specs/p/a.json', 'a');
    const counts = await measure(DIRS_AND_FILES, () =>
      storage.readSpecFile('specs/p/falta.json'),
    );
    expect(counts).toEqual({ getDirectoryHandle: 2, getFileHandle: 1, getFile: 0 });
  });

  it('an error that is not NotFound/TypeMismatch does not repeat', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'one');
    await storage.readProposal('P1');
    const p1 = root.dirs.get('proposals')?.dirs.get('P1');
    if (!p1) throw new Error('setup');
    const spy = vi.spyOn(p1, 'getFileHandle').mockRejectedValue(new Error('disco'));
    let error: unknown;
    const counts = await measure(['getDirectoryHandle'], async () => {
      error = await storage.readProposal('P1').catch((e: unknown) => e);
    });
    expect((error as Error).message).toBe('disco');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(counts).toEqual({ getDirectoryHandle: 0 });
  });

  it('listProposals and listFiles start from the stored handle', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'one');
    root.put('proposals/P1/img/a.png', 'a');
    await storage.readProposal('P1');
    expect(await measure(['getDirectoryHandle'], () => storage.listProposals())).toEqual({
      getDirectoryHandle: 0,
    });
    let files: string[] = [];
    const counts = await measure(['getDirectoryHandle'], async () => {
      files = await storage.listProposalFiles('P1');
    });
    expect(files).toEqual(['proposals/P1/img/a.png', 'proposals/P1/proposal.json']);
    expect(counts).toEqual({ getDirectoryHandle: 0 });
  });

  it('stored folder deleted from outside: the listing repeats from the root', async () => {
    const { root, storage } = setup();
    root.put('proposals/P1/proposal.json', 'one');
    expect(await storage.listProposals()).toEqual(['P1']);
    root.removeAt('proposals');
    root.put('proposals/P2/proposal.json', 'two');
    expect(await storage.listProposals()).toEqual(['P2']);
  });
});

describe('loadMappingStamped and the stamp after writing', () => {
  it('one call costs 1 getFile and returns text and lastModified of the same File', async () => {
    const { root, storage, measure } = setup();
    root.put('mapping.json', '{"a":1}');
    let stamped: { text: string; lastModified: number } | null = null;
    const counts = await measure(DIRS_AND_FILES, async () => {
      stamped = (await storage.loadMappingStamped?.()) ?? null;
    });
    expect(counts).toEqual({ getDirectoryHandle: 0, getFileHandle: 1, getFile: 1 });
    expect(stamped).toEqual({
      text: '{"a":1}',
      lastModified: root.modified.get('mapping.json'),
    });
  });

  it('returns null when mapping.json does not exist', async () => {
    const { storage } = setup();
    expect(await storage.loadMappingStamped?.()).toBeNull();
  });

  it('saveMapping followed by statMapping does not resolve the path again', async () => {
    const { root, storage, measure } = setup();
    await storage.saveMapping('{"a":1}');
    let stamp: number | null = null;
    const counts = await measure(DIRS_AND_FILES, async () => {
      stamp = (await storage.statMapping?.()) ?? null;
    });
    expect(counts).toEqual({ getDirectoryHandle: 0, getFileHandle: 0, getFile: 1 });
    expect(stamp).toBe(root.modified.get('mapping.json'));
  });

  it('file deleted and recreated from outside: the stamp repeats from the root', async () => {
    const { root, storage } = setup();
    await storage.saveMapping('{"a":1}');
    root.files.delete('mapping.json');
    expect(await storage.statMapping?.()).toBeNull();
    root.put('mapping.json', '{"a":2}');
    expect(await storage.statMapping?.()).toBe(root.modified.get('mapping.json'));
    expect((await storage.loadMappingStamped?.())?.text).toBe('{"a":2}');
  });
});

describe('listProposals', () => {
  it('checks the proposal.json of several folders in limited parallel and keeps the result', async () => {
    const { root, storage } = setup(5);
    const ids = ['P8', 'P3', 'P1', 'P6', 'P2', 'P7', 'P4', 'P5'];
    for (const id of ids) root.put(`proposals/${id}/proposal.json`, id);
    root.put('proposals/SEM/outro.json', 'x');
    let active = 0;
    let peak = 0;
    const original = MemoryDirectory.prototype.getFileHandle;
    const spy = vi
      .spyOn(MemoryDirectory.prototype, 'getFileHandle')
      .mockImplementation(async function (this: MemoryDirectory, name, options) {
        if (name !== 'proposal.json') return original.call(this, name, options);
        active++;
        peak = Math.max(peak, active);
        try {
          return await original.call(this, name, options);
        } finally {
          active--;
        }
      });
    try {
      expect(await storage.listProposals()).toEqual([...ids].sort());
    } finally {
      spy.mockRestore();
    }
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
