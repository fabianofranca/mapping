// @vitest-environment node
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serialize, serializeThread, threadFilePath } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadThreads, readThread } from '../../src/storage/loadThreads';
import { openLocalLibrary, type LocalLibrary } from '../../src/storage/local';
import { isThreadFilePath, threadLocationOfPath } from '../../src/storage/types';
import {
  readProjectZip,
  writeProjectZip,
  type ProjectFiles,
} from '../../src/storage/zip';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';
import type { DirectoryHandleLike, FileHandleLike } from '../../src/storage/folder';
import { MemoryDirectory } from './memoryFs';

afterEach(() => clearReportedErrors());

describe('thread paths', () => {
  it('recognizes only comments/<id>.json and comments/resolved/<id>.json', () => {
    expect(isThreadFilePath('comments/T1.json')).toBe(true);
    expect(isThreadFilePath('comments/resolved/T1.json')).toBe(true);
    expect(isThreadFilePath('comments/.hidden.json')).toBe(false);
    expect(isThreadFilePath('comments/T1.txt')).toBe(false);
    expect(isThreadFilePath('comments/resolved/sub/T1.json')).toBe(false);
    expect(isThreadFilePath('comments/other/T1.json')).toBe(false);
    expect(isThreadFilePath('comments/../T1.json')).toBe(false);
    expect(isThreadFilePath('T1.json')).toBe(false);
    expect(threadLocationOfPath('comments/T1.json')).toEqual({
      id: 'T1',
      resolved: false,
    });
    expect(threadLocationOfPath('comments/resolved/T1.json')).toEqual({
      id: 'T1',
      resolved: true,
    });
    expect(threadLocationOfPath('proposals/T1/proposal.json')).toBeNull();
  });
});

/** The `<failing>.json` file of `comments/` fails with an error that is not "does not exist". */
function failingThreadFile(root: MemoryDirectory, failing: string): DirectoryHandleLike {
  const wrapFile = (handle: FileHandleLike): FileHandleLike =>
    handle.name === failing
      ? { ...handle, getFile: () => Promise.reject(new Error('arquivo em uso')) }
      : handle;
  const wrapDir = (dir: DirectoryHandleLike): DirectoryHandleLike => ({
    ...dir,
    getDirectoryHandle: async (name, options) =>
      wrapDir(await dir.getDirectoryHandle(name, options)),
    getFileHandle: async (name, options) =>
      wrapFile(await dir.getFileHandle(name, options)),
    values: async function* () {
      for await (const entry of dir.values()) {
        yield entry.kind === 'directory' ? wrapDir(entry) : wrapFile(entry);
      }
    },
  });
  return wrapDir(root);
}

describe('folder: comments/', () => {
  it('lists only the valid files of each folder, reads, writes, stamps and deletes', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.listThreads(false)).toEqual([]);
    expect(await storage.listThreads(true)).toEqual([]);

    root.put(threadFilePath('B', false), 'b');
    root.put(threadFilePath('A', false), 'a');
    root.put(threadFilePath('R', true), 'r');
    root.put('comments/.hidden.json', 'x');
    root.put('comments/notas.txt', 'x');
    root.put('comments/resolved/sub/X.json', 'x');
    expect(await storage.listThreads(false)).toEqual(['A', 'B']);
    expect(await storage.listThreads(true)).toEqual(['R']);

    expect(await storage.readThread('A', false)).toBe('a');
    expect(await storage.readThread('A', true)).toBeNull();
    expect(await storage.readThread('R', true)).toBe('r');
    const stamp = await storage.statThread?.('A', false);
    expect(stamp).toMatch(/^1:\d+$/);
    expect(await storage.statThread?.('Z', false)).toBeNull();

    // `stampThreads` (decision 9, stage #1777): the same check as `listThreads` + `statThread`,
    // in a single step, in alphabetical order.
    expect([...((await storage.stampThreads?.(false)) ?? [])]).toEqual([
      ['A', stamp],
      ['B', await storage.statThread?.('B', false)],
    ]);
    expect([...((await storage.stampThreads?.(true)) ?? [])]).toEqual([
      ['R', await storage.statThread?.('R', true)],
    ]);

    // An unreadable file (an error that is not "does not exist") does not break the scan nor make the
    // thread look deleted: it comes back present, with the stamp unknown.
    const flaky = createFolderStorage(failingThreadFile(root, 'A.json'));
    expect([...((await flaky.stampThreads?.(false)) ?? [])]).toEqual([
      ['A', null],
      ['B', await storage.statThread?.('B', false)],
    ]);

    await storage.writeThread('A', false, 'new');
    expect(await root.read(threadFilePath('A', false))).toBe('new');
    expect(await storage.statThread?.('A', false)).not.toBe(stamp);
    await storage.writeThread('C', true, 'c');
    expect(await root.read(threadFilePath('C', true))).toBe('c');

    await storage.removeThread('A', false);
    expect(await storage.listThreads(false)).toEqual(['B']);
    await expect(storage.removeThread('A', false)).resolves.toBeUndefined();
  });

  it('moving on resolve and on reopen: writes to the destination and deletes the origin, leaving no two copies', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    await storage.writeThread('T1', false, 'open');
    // Resolve: writes to resolved/ and only then deletes from comments/.
    await storage.writeThread('T1', true, 'resolved');
    await storage.removeThread('T1', false);
    expect(await storage.listThreads(false)).toEqual([]);
    expect(await storage.listThreads(true)).toEqual(['T1']);
    // Reopen: the way back.
    await storage.writeThread('T1', false, 'reopened');
    await storage.removeThread('T1', true);
    expect(await storage.listThreads(false)).toEqual(['T1']);
    expect(await storage.listThreads(true)).toEqual([]);
  });

  it('refuses an id outside THREAD_ID_RE', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    for (const bad of ['', '..', '.git', 'a/b', 'a\\b']) {
      await expect(storage.readThread(bad, false)).rejects.toThrow('invalid thread id');
      await expect(storage.writeThread(bad, false, 'x')).rejects.toThrow(
        'invalid thread id',
      );
      await expect(storage.removeThread(bad, true)).rejects.toThrow('invalid thread id');
      await expect(storage.statThread?.(bad, false)).rejects.toThrow('invalid thread id');
    }
  });
});

describe('loadThreads', () => {
  it('reads the valid ones (open and resolved), keeps the exact text and separates the invalid ones', async () => {
    const root = new MemoryDirectory('p');
    const open = sampleThread({ id: 'T1' });
    const text = serializeThread(open);
    root.put(threadFilePath('T1', false), text);
    root.put(threadFilePath('broken', false), '{ not json');
    root.put(threadFilePath('T2', false), serializeThread(sampleThread({ id: 'OUTRA' })));
    const resolved = sampleThread({ id: 'T3' });
    root.put(threadFilePath('T3', true), serializeThread(resolved));
    const loaded = await loadThreads(createFolderStorage(root));

    expect(loaded.threads.map((t) => t.thread.id).sort()).toEqual(['T1', 'T3']);
    expect(loaded.threads.find((t) => t.thread.id === 'T1')?.text).toBe(text);
    expect(loaded.threads.find((t) => t.thread.id === 'T1')?.resolvedDir).toBe(false);
    expect(loaded.threads.find((t) => t.thread.id === 'T3')?.resolvedDir).toBe(true);
    expect(loaded.problems.map((p) => p.id).sort()).toEqual(['T2', 'broken']);
    expect(loaded.problems.find((p) => p.id === 'T2')?.errors[0]).toContain(
      'the file name',
    );
    expect(loaded.problemTexts?.get(threadFilePath('broken', false))).toBe('{ not json');
  });

  it('without resolved ones reads only comments/ (the cheap read of the check)', async () => {
    const root = new MemoryDirectory('p');
    root.put(threadFilePath('T1', false), serializeThread(sampleThread({ id: 'T1' })));
    root.put(threadFilePath('T3', true), serializeThread(sampleThread({ id: 'T3' })));
    const loaded = await loadThreads(createFolderStorage(root), { resolved: false });
    expect(loaded.threads.map((t) => t.thread.id)).toEqual(['T1']);
  });

  it('readThread tells a missing file from an invalid file', async () => {
    const root = new MemoryDirectory('p');
    root.put(threadFilePath('X', false), '[]');
    const storage = createFolderStorage(root);
    expect(await readThread(storage, 'nothing', false)).toMatchObject({
      ok: false,
      missing: true,
    });
    expect(await readThread(storage, 'X', false)).toMatchObject({
      ok: false,
      missing: false,
    });
  });
});

describe('local project (IndexedDB)', () => {
  let library: LocalLibrary;
  beforeEach(async () => {
    const opened = await openLocalLibrary();
    if (!opened) throw new Error('IndexedDB unavailable');
    library = opened;
    for (const p of await library.list()) await library.remove(p.id);
  });
  afterEach(() => library.close());

  const files = (extra: Partial<ProjectFiles> = {}): ProjectFiles => ({
    mapping: serialize(sampleProject()),
    images: new Map(),
    specs: new Map(),
    proposals: new Map(),
    proposalImages: new Map(),
    ...extra,
  });

  it('uses the comments/… keys and carries the threads from create', async () => {
    await library.create(
      'a',
      files({
        threads: new Map([
          [threadFilePath('T1', false), 'one'],
          [threadFilePath('T2', true), 'dois'],
        ]),
      }),
      { unexported: false },
    );
    const storage = library.open('a');
    expect(await storage.listThreads(false)).toEqual(['T1']);
    expect(await storage.listThreads(true)).toEqual(['T2']);
    expect(await storage.readThread('T1', false)).toBe('one');
    expect(await storage.readThread('T1', true)).toBeNull();
    expect(await storage.statThread).toBeUndefined();
    expect(storage.stampThreads).toBeUndefined();
    await library.remove('a');
    await library.create('a', files());
    expect(await library.open('a').listThreads(false)).toEqual([]);
  });

  it('writing and deleting mark the project as not exported', async () => {
    await library.create('a', files(), { unexported: false });
    const storage = library.open('a');
    await storage.writeThread('T1', false, 'texto');
    expect((await library.get('a'))?.unexported).toBe(true);
    expect(await storage.readThread('T1', false)).toBe('texto');

    await library.setUnexported('a', false);
    await storage.removeThread('T1', false);
    expect((await library.get('a'))?.unexported).toBe(true);
    expect(await storage.readThread('T1', false)).toBeNull();
    // Deleting what does not exist neither fails nor marks again.
    await library.setUnexported('a', false);
    await expect(storage.removeThread('T1', false)).resolves.toBeUndefined();
    expect((await library.get('a'))?.unexported).toBe(false);
  });

  it('refuses an id outside THREAD_ID_RE', async () => {
    await library.create('a', files());
    const storage = library.open('a');
    await expect(storage.writeThread('../x', false, 'x')).rejects.toThrow(
      'invalid thread id',
    );
    await expect(storage.readThread('', true)).rejects.toThrow('invalid thread id');
  });
});

describe('zip with threads', () => {
  const base = (threads: Map<string, string>): ProjectFiles => ({
    mapping: serialize(sampleProject()),
    images: new Map(),
    specs: new Map(),
    proposals: new Map(),
    proposalImages: new Map(),
    threads,
  });

  it('round trip with open and resolved ones; the text of an invalid file comes back identical', async () => {
    const open = serializeThread(sampleThread({ id: 'T1' }));
    const threads = new Map([
      [threadFilePath('T1', false), open],
      [threadFilePath('T2', true), serializeThread(sampleThread({ id: 'T2' }))],
      [threadFilePath('broken', false), '{ not json'],
    ]);
    const blob = await writeProjectZip(base(threads));
    const read = await readProjectZip(blob);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.files.threads).toEqual(threads);
    expect(read.files.threads?.get('comments/T1.json')).toBe(open);
  });

  it('only comments/<id>.json and comments/resolved/<id>.json come in', async () => {
    const zip = new JSZip();
    zip.file('mapping.json', serialize(sampleProject()));
    zip.file('comments/T1.json', 'a');
    zip.file('comments/resolved/T2.json', 'b');
    zip.file('comments/notas.txt', 'x');
    zip.file('comments/.hidden.json', 'x');
    zip.file('comments/resolved/sub/T3.json', 'x');
    zip.file('comments/other/T4.json', 'x');
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const read = await readProjectZip(new Blob([bytes]));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect([...(read.files.threads?.keys() ?? [])].sort()).toEqual([
      'comments/T1.json',
      'comments/resolved/T2.json',
    ]);
  });

  it('a zip in a folder (my-project/) also carries the threads, and without them the map comes back empty', async () => {
    const zip = new JSZip();
    zip.file('my/mapping.json', serialize(sampleProject()));
    zip.file('my/comments/T1.json', 'a');
    const read = await readProjectZip(
      new Blob([await zip.generateAsync({ type: 'arraybuffer' })]),
    );
    expect(read.ok && [...(read.files.threads?.keys() ?? [])]).toEqual([
      'comments/T1.json',
    ]);
    const empty = await readProjectZip(await writeProjectZip(base(new Map())));
    expect(empty.ok && empty.files.threads?.size).toBe(0);
  });
});
