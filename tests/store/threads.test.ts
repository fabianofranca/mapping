// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendMessage,
  openThread,
  parseThreadText,
  reopenThread,
  resolveThread,
  serializeThread,
  threadFilePath,
  type Thread,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadThreads } from '../../src/storage/loadThreads';
import type { ProjectStorage } from '../../src/storage/types';
import { createThreadStore } from '../../src/store/threads';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { MemoryDirectory } from '../storage/memoryFs';
import {
  AGENT,
  HUMAN,
  T0,
  T1,
  T2,
  T3,
  message,
  sampleThread,
} from '../model/threadFixtures';

afterEach(() => clearReportedErrors());

const ME = { name: 'Marina Alves', email: 'marina@example.com' };

function onDisk(root: MemoryDirectory, t: Thread, resolved = t.resolved !== null) {
  root.put(threadFilePath(t.id, resolved), serializeThread(t));
}

async function diskThread(root: MemoryDirectory, id: string, resolved = false) {
  const text = await root.read(threadFilePath(id, resolved));
  if (text === null) return null;
  const parsed = parseThreadText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.thread;
}

async function setup(
  threads: readonly Thread[] = [],
  options: { resolved?: boolean } = {},
) {
  const root = new MemoryDirectory('p');
  for (const t of threads) onDisk(root, t);
  const storage = createFolderStorage(root);
  const onChanged = vi.fn();
  const store = createThreadStore({
    storage,
    initial: await loadThreads(storage, options),
    resolvedLoaded: options.resolved !== false,
    onChanged,
  });
  return { root, storage, store, onChanged };
}

const append =
  (id: string, at: string, text = 'hi') =>
  (t: Thread) =>
    appendMessage(t, message(id, at, HUMAN, text));

describe('threads: initial list', () => {
  it('brings the open ones and the resolved ones read on opening, newest first', async () => {
    const a = sampleThread({ id: 'A', createdAt: T0 });
    const b = sampleThread({ id: 'B', createdAt: T2 });
    const r = sampleThread({
      id: 'R',
      createdAt: T1,
      resolved: { by: ME, at: T3 },
    });
    const { store } = await setup([a, b, r]);
    expect(store.list.value.map((t) => t.id)).toEqual(['B', 'R', 'A']);
    expect(store.get('R')?.resolved?.by.email).toBe('marina@example.com');
  });

  it('the invalid file becomes a problem in Diagnostics and does not take down the others', async () => {
    const root = new MemoryDirectory('p');
    onDisk(root, sampleThread({ id: 'A' }));
    root.put(threadFilePath('broken', false), '{ not json');
    const storage = createFolderStorage(root);
    const store = createThreadStore({ storage, initial: await loadThreads(storage) });
    expect(store.list.value.map((t) => t.id)).toEqual(['A']);
    expect(store.problems.value.map((p) => p.id)).toEqual(['broken']);
    const entries = reportedErrors.value.filter((e) => e.context === 'threads.invalid');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain('comments/broken.json');
  });
});

describe('threads: write with reread and revision + 1', () => {
  it('changes the thread, writes revision + 1 and notifies onChanged', async () => {
    const t = sampleThread({ id: 'A', revision: 3 });
    const { root, store, onChanged } = await setup([t]);
    const out = await store.mutate('A', append('m9', T3));
    expect(out.ok).toBe(true);
    const disk = await diskThread(root, 'A');
    expect(disk?.revision).toBe(4);
    expect(disk?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm9']);
    expect(store.get('A')?.revision).toBe(4);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('adopts the disk version and redoes the operation: the MCP message in the middle is not lost', async () => {
    const t = sampleThread({ id: 'A', revision: 3 });
    const { root, store } = await setup([t]);
    // The MCP server appends an agent message from outside.
    const fromAgent = appendMessage(t, message('mx', T3, AGENT, 'from the agent'));
    onDisk(root, fromAgent);
    const out = await store.mutate('A', append('m9', '2026-11-06T14:00:00.000Z'));
    expect(out.ok).toBe(true);
    const disk = await diskThread(root, 'A');
    expect(disk?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'mx', 'm9']);
    // disk revision (4) + 1.
    expect(disk?.revision).toBe(5);
  });

  it('a file that became unreadable from outside is not overwritten', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    root.put(threadFilePath('A', false), '{ half written');
    const out = await store.mutate('A', append('m9', T3));
    expect(out).toEqual({ ok: false, error: 'unreadable' });
    expect(await root.read(threadFilePath('A', false))).toBe('{ half written');
    expect(store.get('A')).not.toBeNull();
  });

  it('the file that vanished from outside removes the thread from the list', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    await root.dirs.get('comments')?.removeEntry('A.json');
    expect(await store.mutate('A', append('m9', T3))).toEqual({
      ok: false,
      error: 'gone',
    });
    expect(store.get('A')).toBeNull();
  });

  it('unknown id, repeated message id and a write that fails', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    expect(await store.mutate('Z', append('m9', T3))).toEqual({
      ok: false,
      error: 'unknown-thread',
    });
    expect(await store.mutate('A', append('m1', T3))).toEqual({
      ok: false,
      error: 'duplicate-message',
    });
    root.failWrites = new Error('disk full');
    root.dirs.get('comments')!.failWrites = new Error('disk full');
    expect(await store.mutate('A', append('m9', T3))).toEqual({
      ok: false,
      error: 'write-failed',
    });
    expect(store.get('A')?.messages).toHaveLength(3);
    expect(reportedErrors.value.some((e) => e.context === 'threads.write')).toBe(true);
  });

  it('an operation that changes nothing (resolving a resolved one) does not write', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { root, store, onChanged } = await setup([r]);
    const before = await root.read(threadFilePath('R', true));
    const out = await store.mutate('R', (t) => resolveThread(t, ME, T3));
    expect(out.ok).toBe(true);
    expect(await root.read(threadFilePath('R', true))).toBe(before);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('the calls run in a queue, one at a time', async () => {
    const { store, root } = await setup([sampleThread({ id: 'A', revision: 0 })]);
    const results = await Promise.all([
      store.mutate('A', append('n1', T3)),
      store.mutate('A', append('n2', '2026-11-06T14:00:00.000Z')),
      store.mutate('A', append('n3', '2026-11-06T15:00:00.000Z')),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const disk = await diskThread(root, 'A');
    expect(disk?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'n1', 'n2', 'n3']);
    expect(disk?.revision).toBe(3);
  });
});

describe('threads: moving on resolve and reopen', () => {
  it('resolving writes to resolved/ and deletes from comments/, leaving no two copies', async () => {
    const { root, store, storage } = await setup([sampleThread({ id: 'A' })]);
    const out = await store.mutate('A', (t) => resolveThread(t, ME, T3));
    expect(out.ok).toBe(true);
    expect(await storage.listThreads(false)).toEqual([]);
    expect(await storage.listThreads(true)).toEqual(['A']);
    expect((await diskThread(root, 'A', true))?.resolved?.by.email).toBe(ME.email);
    expect(store.get('A')?.resolved).not.toBeNull();
  });

  it('reopening takes the way back', async () => {
    const r = sampleThread({ id: 'A', resolved: { by: ME, at: T3 } });
    const { store, storage } = await setup([r]);
    const out = await store.mutate('A', reopenThread);
    expect(out.ok).toBe(true);
    expect(await storage.listThreads(true)).toEqual([]);
    expect(await storage.listThreads(false)).toEqual(['A']);
    expect(store.get('A')?.resolved).toBeNull();
  });

  it('if the write at the destination fails, the source stays intact', async () => {
    const { root, store, storage } = await setup([sampleThread({ id: 'A' })]);
    root.put('comments/resolved/empty.json', '{}');
    root.dirs.get('comments')!.dirs.get('resolved')!.failWrites = new Error('no space');
    const out = await store.mutate('A', (t) => resolveThread(t, ME, T3));
    expect(out).toEqual({ ok: false, error: 'write-failed' });
    expect(await storage.listThreads(false)).toEqual(['A']);
    expect(store.get('A')?.resolved).toBeNull();
  });

  it('the two copies (git merge) are joined and the write leaves just one', async () => {
    const open = sampleThread({ id: 'A', revision: 4 });
    const resolvedCopy = sampleThread({
      id: 'A',
      revision: 6,
      resolved: { by: ME, at: T3 },
      messages: [message('m1', T0), message('mz', T1, AGENT, 'only in this one')],
    });
    const root = new MemoryDirectory('p');
    onDisk(root, open, false);
    onDisk(root, resolvedCopy, true);
    const storage = createFolderStorage(root);
    const store = createThreadStore({ storage, initial: await loadThreads(storage) });
    // The read joins them: union of the messages, higher revision; the resolution is later than the last one.
    const merged = store.get('A');
    expect(merged?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'mz', 'm3']);
    expect(merged?.revision).toBe(6);
    await store.mutate('A', append('m9', '2026-11-06T14:00:00.000Z'));
    // Resolved (the resolution is later than the last message): stays in resolved/, the open one leaves.
    expect(await storage.listThreads(false)).toEqual([]);
    expect(await storage.listThreads(true)).toEqual(['A']);
    const disk = await diskThread(root, 'A', true);
    expect(disk?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'mz', 'm3', 'm9']);
    expect(disk?.revision).toBe(7);
  });
});

describe('threads: create and delete', () => {
  const fresh = (id = 'N1') =>
    openThread({
      id,
      anchor: { kind: 'marking', id: 'M1' },
      author: HUMAN,
      text: 'hello',
      at: T0,
      messageId: 'm1',
    });

  it('create writes comments/<id>.json and never overwrites a thread that exists', async () => {
    const { root, store, onChanged } = await setup([sampleThread({ id: 'A' })]);
    expect((await store.create(fresh())).ok).toBe(true);
    expect((await diskThread(root, 'N1'))?.messages).toHaveLength(1);
    expect(store.get('N1')).not.toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
    const before = await root.read(threadFilePath('A', false));
    expect(await store.create(fresh('A'))).toEqual({ ok: false, error: 'exists' });
    expect(await root.read(threadFilePath('A', false))).toBe(before);
  });

  it('remove deletes both copies and removes from the list; removeMany counts what went', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { store, storage } = await setup([sampleThread({ id: 'A' }), r]);
    expect(await store.remove('A')).toEqual({ ok: true });
    expect(await storage.listThreads(false)).toEqual([]);
    expect(store.get('A')).toBeNull();
    expect(await store.remove('A')).toEqual({ ok: false, error: 'unknown-thread' });
    const many = await store.removeMany(['R', 'does-not-exist']);
    expect(many).toEqual({ removed: ['R'], failed: ['does-not-exist'] });
    expect(await storage.listThreads(true)).toEqual([]);
    expect(store.list.value).toEqual([]);
  });
});

describe('threads: folder scan (the ~3 s check)', () => {
  it('finds the new thread, the changed one and the one deleted from outside', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    onDisk(root, sampleThread({ id: 'B' }));
    expect(await store.scan()).toEqual({ added: ['B'], changed: [], removed: [] });
    expect(store.list.value.map((t) => t.id).sort()).toEqual(['A', 'B']);

    const changed = appendMessage(sampleThread({ id: 'A' }), message('mx', T3, AGENT));
    onDisk(root, changed);
    expect(await store.scan()).toEqual({ added: [], changed: ['A'], removed: [] });
    expect(store.get('A')?.messages).toHaveLength(4);

    await root.dirs.get('comments')?.removeEntry('B.json');
    expect(await store.scan()).toEqual({ added: [], changed: [], removed: ['B'] });
    expect(store.get('B')).toBeNull();
  });

  it('reads only the file that changed and lists only comments/ (not resolved/)', async () => {
    const root = new MemoryDirectory('p');
    for (const id of ['A', 'B', 'C']) onDisk(root, sampleThread({ id }));
    onDisk(root, sampleThread({ id: 'R', resolved: { by: ME, at: T3 } }));
    const base = createFolderStorage(root);
    const calls = { list: [] as boolean[], stamp: [] as boolean[], read: [] as string[] };
    const storage: ProjectStorage = {
      ...base,
      listThreads: (resolved) => {
        calls.list.push(resolved);
        return base.listThreads(resolved);
      },
      // Today scan stamps `comments/` in a single step (decision 9, stage #1777).
      stampThreads: (resolved) => {
        calls.stamp.push(resolved);
        return base.stampThreads!(resolved);
      },
      readThread: (id, resolved) => {
        calls.read.push(`${resolved ? 'r' : 'o'}:${id}`);
        return base.readThread(id, resolved);
      },
    };
    const store = createThreadStore({ storage, initial: await loadThreads(storage) });
    calls.list.length = 0;
    calls.read.length = 0;

    expect(await store.scan()).toEqual({ added: [], changed: [], removed: [] });
    expect(calls.stamp).toEqual([false]);
    expect(calls.list).toEqual([]);
    expect(calls.read).toEqual([]);

    onDisk(root, appendMessage(sampleThread({ id: 'B' }), message('mx', T3, AGENT)));
    await store.scan();
    expect(calls.read).toEqual(['o:B']);
  });

  it('without `stampThreads` (storage that only lists and stamps), the scan gives the same result', async () => {
    const root = new MemoryDirectory('p');
    onDisk(root, sampleThread({ id: 'A' }));
    const storage: ProjectStorage = {
      ...createFolderStorage(root),
      stampThreads: undefined,
    };
    const store = createThreadStore({ storage, initial: await loadThreads(storage) });
    onDisk(root, sampleThread({ id: 'B' }));
    expect(await store.scan()).toEqual({ added: ['B'], changed: [], removed: [] });
    onDisk(root, appendMessage(sampleThread({ id: 'A' }), message('mx', T3, AGENT)));
    expect(await store.scan()).toEqual({ added: [], changed: ['A'], removed: [] });
    await root.dirs.get('comments')?.removeEntry('B.json');
    expect(await store.scan()).toEqual({ added: [], changed: [], removed: ['B'] });
  });

  it('a scan with no change does not republish the list or the problems', async () => {
    const { store } = await setup([sampleThread({ id: 'A' })]);
    const list = store.list.value;
    const problems = store.problems.value;
    await store.scan();
    await store.scan();
    expect(store.list.value).toBe(list);
    expect(store.problems.value).toBe(problems);
  });

  it('an unknown unreadable file becomes a problem (once); the known one, still being written, stays as it is', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    root.put(threadFilePath('X', false), '{ half');
    await store.scan();
    await store.scan();
    expect(store.problems.value.map((p) => p.id)).toEqual(['X']);
    expect(
      reportedErrors.value.filter((e) => e.context === 'threads.invalid'),
    ).toHaveLength(1);

    root.put(threadFilePath('A', false), '{ half');
    expect(await store.scan()).toEqual({ added: [], changed: [], removed: [] });
    expect(store.get('A')?.messages).toHaveLength(3);
  });

  it('a thread resolved from outside (file moved to resolved/) stays in the list', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })], { resolved: false });
    await root.dirs.get('comments')?.removeEntry('A.json');
    onDisk(root, sampleThread({ id: 'A', resolved: { by: ME, at: T3 } }));
    const scan = await store.scan();
    expect(scan.removed).toEqual([]);
    expect(scan.changed).toEqual(['A']);
    expect(store.get('A')?.resolved).not.toBeNull();
  });
});

describe('threads: resolved on demand', () => {
  it('without reading resolved/ on opening, loadResolved brings them', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { store } = await setup([sampleThread({ id: 'A' }), r], { resolved: false });
    expect(store.list.value.map((t) => t.id)).toEqual(['A']);
    expect(store.resolvedLoaded.value).toBe(false);
    await store.loadResolved();
    expect(store.resolvedLoaded.value).toBe(true);
    expect(store.list.value.map((t) => t.id).sort()).toEqual(['A', 'R']);
  });

  it('collect carries everything: the resolved ones not yet read and the exact text of the invalid ones', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { root, store } = await setup([sampleThread({ id: 'A' }), r], {
      resolved: false,
    });
    root.put(threadFilePath('broken', false), '{ not json');
    await store.scan();
    const files = await store.collect();
    expect([...files.keys()].sort()).toEqual([
      'comments/A.json',
      'comments/broken.json',
      'comments/resolved/R.json',
    ]);
    expect(files.get('comments/broken.json')).toBe('{ not json');
    expect(files.get('comments/A.json')).toBe(await root.read('comments/A.json'));
  });
});
