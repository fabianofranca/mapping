import { describe, expect, it } from 'vitest';
import {
  countingDirectory,
  createFolderCalls,
  type FolderCallKind,
} from '../../src/storage/folderCalls';
import { MemoryDirectory } from './memoryFs';

/** Everything the counter saw, by call type. */
const kinds = (calls: ReturnType<typeof createFolderCalls>): Record<string, number> =>
  Object.fromEntries(Object.entries(calls.byKind).filter(([, n]) => n > 0));

const emptyKinds = (): Record<FolderCallKind, number> => ({
  getDirectoryHandle: 0,
  getFileHandle: 0,
  getFile: 0,
  values: 0,
  createWritable: 0,
  write: 0,
  close: 0,
  abort: 0,
  removeEntry: 0,
});

describe('countingDirectory', () => {
  it('counts each call type once, also on the returned handles', async () => {
    const root = new MemoryDirectory('root');
    root.put('a/b/c.txt', 'x');
    root.put('a/d.txt', 'y');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);

    const a = await dir.getDirectoryHandle('a');
    expect(kinds(calls)).toEqual({ getDirectoryHandle: 1 });

    const file = await a.getFileHandle('d.txt');
    expect(kinds(calls)).toEqual({ getDirectoryHandle: 1, getFileHandle: 1 });

    await (file as { getFile(): Promise<Blob> }).getFile();
    const writable = await file.createWritable();
    await writable.write('z');
    await writable.close();
    const aborted = await file.createWritable();
    await aborted.abort();
    await a.removeEntry('d.txt');

    const entries: string[] = [];
    for await (const entry of a.values()) entries.push(entry.name);
    expect(entries).toEqual(['b']);

    expect(calls.byKind).toEqual({
      ...emptyKinds(),
      getDirectoryHandle: 1,
      getFileHandle: 1,
      getFile: 1,
      createWritable: 2,
      write: 1,
      close: 1,
      abort: 1,
      removeEntry: 1,
      values: 1,
    });
    expect(calls.total).toBe(10);
  });

  it('the handles that values() returns also count, recursively', async () => {
    const root = new MemoryDirectory('root');
    root.put('a/b/c.txt', 'x');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);
    for await (const entry of dir.values()) {
      if (entry.kind !== 'directory') continue;
      const b = await entry.getDirectoryHandle('b');
      const c = await b.getFileHandle('c.txt');
      await (c as { getFile(): Promise<Blob> }).getFile();
    }
    expect(calls.byKind).toMatchObject({
      values: 1,
      getDirectoryHandle: 1,
      getFileHandle: 1,
      getFile: 1,
    });
  });

  it('the result and the error pass through unchanged', async () => {
    const root = new MemoryDirectory('root');
    root.put('a.txt', 'content');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);

    const handle = await dir.getFileHandle('a.txt');
    const file = await (handle as { getFile(): Promise<Blob> }).getFile();
    expect(await file.text()).toBe('content');
    expect(handle.name).toBe('a.txt');
    expect(handle.kind).toBe('file');
    expect(dir.kind).toBe('directory');
    expect(dir.name).toBe('root');

    const error = await dir.getFileHandle('missing.txt').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('NotFoundError');
    // The call that failed was also made.
    expect(calls.byKind.getFileHandle).toBe(2);

    await expect(dir.removeEntry('missing.txt')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
    expect(calls.byKind.removeEntry).toBe(1);
  });

  it('a write through the wrapped handle reaches the disk', async () => {
    const root = new MemoryDirectory('root');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);
    const handle = await dir.getFileHandle('new.txt', { create: true });
    const writable = await handle.createWritable();
    await writable.write('hello');
    await writable.close();
    expect(await root.read('new.txt')).toBe('hello');
  });
});

describe('measure', () => {
  it('measures calls and milliseconds of the operation and returns the result', async () => {
    const root = new MemoryDirectory('root');
    root.put('a.txt', 'x');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);

    const value = await calls.measure('open', async () => {
      await dir.getFileHandle('a.txt');
      await dir.getDirectoryHandle('x', { create: true });
      return 42;
    });
    expect(value).toBe(42);
    const [measure] = calls.snapshot();
    expect(measure).toMatchObject({ op: 'open', calls: 2 });
    expect(measure?.ms).toBeGreaterThanOrEqual(0);
  });

  it('keeps only the last measurement of each operation', async () => {
    const root = new MemoryDirectory('root');
    root.put('a.txt', 'x');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);

    await calls.measure('save', async () => {
      await dir.getFileHandle('a.txt');
      await dir.getFileHandle('a.txt');
      await dir.getFileHandle('a.txt');
    });
    await calls.measure('save', async () => {
      await dir.getFileHandle('a.txt');
    });
    const snapshot = calls.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ op: 'save', calls: 1 });
  });

  it('the snapshot comes in the order open, save, library, decide, apply, sync', async () => {
    const calls = createFolderCalls();
    for (const op of ['sync', 'apply', 'decide', 'library', 'save', 'open'] as const) {
      await calls.measure(op, async () => undefined);
    }
    expect(calls.snapshot().map((m) => m.op)).toEqual([
      'open',
      'save',
      'library',
      'decide',
      'apply',
      'sync',
    ]);
  });

  it('without a measurement, the snapshot is empty', () => {
    expect(createFolderCalls().snapshot()).toEqual([]);
  });

  it('an fn that throws still records the measurement and rethrows the error', async () => {
    const root = new MemoryDirectory('root');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);
    const boom = new Error('boom');
    await expect(
      calls.measure('decide', async () => {
        await dir.getFileHandle('missing.txt').catch(() => undefined);
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(calls.snapshot()).toEqual([
      expect.objectContaining({ op: 'decide', calls: 1 }),
    ]);
  });

  it('the operation can be decided at the end (save or library)', async () => {
    const calls = createFolderCalls();
    let wrotePackage = false;
    await calls.measure(
      () => (wrotePackage ? 'library' : 'save'),
      async () => {
        wrotePackage = true;
      },
    );
    expect(calls.snapshot().map((m) => m.op)).toEqual(['library']);
  });

  it('operations of different kinds at the same time add up in both measurements', async () => {
    const root = new MemoryDirectory('root');
    root.put('a.txt', 'x');
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);
    await Promise.all([
      calls.measure('save', async () => {
        await dir.getFileHandle('a.txt');
        await Promise.resolve();
        await dir.getFileHandle('a.txt');
      }),
      calls.measure('sync', async () => {
        await Promise.resolve();
        await dir.getFileHandle('a.txt');
      }),
    ]);
    const byOp = Object.fromEntries(calls.snapshot().map((m) => [m.op, m.calls]));
    expect(byOp.save).toBeGreaterThanOrEqual(2);
    expect(byOp.sync).toBeGreaterThanOrEqual(1);
  });
});

describe('MemoryDirectory with latency (slow double)', () => {
  it('without latency, no wait; with latencyMs, each call takes time and applies to the inner folders', async () => {
    const root = new MemoryDirectory('root');
    root.put('a/b.txt', 'x');
    const fast = performance.now();
    const a = await root.getDirectoryHandle('a');
    await a.getFileHandle('b.txt');
    const fastMs = performance.now() - fast;

    root.latencyMs = 20;
    expect(root.latencyMs).toBe(20);
    const slow = performance.now();
    const slowA = await root.getDirectoryHandle('a');
    const file = await slowA.getFileHandle('b.txt');
    await (file as { getFile(): Promise<Blob> }).getFile();
    const slowMs = performance.now() - slow;
    // Three calls, 20 ms each (with slack for the timer clock).
    // Three calls of 20 ms; slack for the timer that fires a bit early.
    expect(slowMs).toBeGreaterThanOrEqual(45);
    expect(fastMs).toBeLessThan(slowMs);
  });

  it('the counter works on top of the slow double', async () => {
    const root = new MemoryDirectory('root');
    root.put('a.txt', 'x');
    root.latencyMs = 5;
    const calls = createFolderCalls();
    const dir = countingDirectory(root, calls);
    await calls.measure('sync', async () => {
      await dir.getFileHandle('a.txt');
    });
    expect(calls.snapshot()[0]?.ms).toBeGreaterThanOrEqual(3);
  });
});
