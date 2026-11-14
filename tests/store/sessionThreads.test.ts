import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendMessage,
  parseThreadText,
  serializeThread,
  threadFilePath,
  type Thread,
} from '../../src/model';
import { clearReportedErrors } from '../../src/utils/report';
import { AGENT, T3, message, sampleThread } from '../model/threadFixtures';
import { setIdentity } from '../../src/store/identity';
import { openHarness } from './proposalHarness';

beforeEach(() => {
  localStorage.clear();
  setIdentity('Marina Alves', 'marina@example.com');
});
afterEach(() => clearReportedErrors());

const put = (root: { put(path: string, text: string): void }, t: Thread) =>
  root.put(threadFilePath(t.id, t.resolved !== null), serializeThread(t));

describe('session and threads', () => {
  it('opens with the threads of the storage and the check finds the external changes', async () => {
    const { root, session } = await openHarness();
    expect(session.threads.list.value).toEqual([]);
    put(root, sampleThread({ id: 'A' }));
    await session.sync();
    expect(session.threads.list.value.map((t) => t.id)).toEqual(['A']);

    put(root, appendMessage(sampleThread({ id: 'A' }), message('mx', T3, AGENT)));
    await session.sync();
    expect(session.threads.get('A')?.messages.at(-1)?.id).toBe('mx');
    await session.close();
  });

  it('two writes of the same thread, the app one and the MCP one in the middle, lose no message', async () => {
    const t = sampleThread({ id: 'A', revision: 3 });
    const { root, session } = await openHarness({
      files: { [threadFilePath('A', false)]: serializeThread(t) },
    });
    // The MCP writes between the app read and its write.
    put(root, appendMessage(t, message('from-mcp', T3, AGENT, 'agent reply')));
    const out = await session.threadActions.post('A', 'my question');
    expect(out.ok).toBe(true);
    const disk = parseThreadText((await root.read(threadFilePath('A', false))) ?? '');
    // The bench clock precedes the sample messages: the order is by `at`, not by arrival.
    const texts = disk.ok ? disk.thread.messages.map((m) => m.text).sort() : [];
    expect(texts).toEqual(
      // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures texts)
      ['texto m1', 'resposta', 'texto m3', 'agent reply', 'my question'].sort(),
    );
    expect(disk.ok && disk.thread.revision).toBe(5);
    await session.close();
  });

  it('collectFiles carries the threads, open and resolved, and the exact text of the invalid ones', async () => {
    const open = sampleThread({ id: 'A' });
    const resolved = sampleThread({
      id: 'R',
      resolved: { by: { name: 'Marina Alves', email: 'marina@example.com' }, at: T3 },
    });
    const { session } = await openHarness({
      files: {
        [threadFilePath('A', false)]: serializeThread(open),
        [threadFilePath('R', true)]: serializeThread(resolved),
        [threadFilePath('broken', false)]: '{ not json',
      },
    });
    const files = await session.collectFiles();
    expect([...(files.threads?.keys() ?? [])].sort()).toEqual([
      'comments/A.json',
      'comments/broken.json',
      'comments/resolved/R.json',
    ]);
    expect(files.threads?.get('comments/broken.json')).toBe('{ not json');
    await session.close();
  });

  it('writing a message changes neither mapping.json, the history nor the project revision', async () => {
    const { root, session } = await openHarness({
      files: { [threadFilePath('A', false)]: serializeThread(sampleThread({ id: 'A' })) },
    });
    const mappingBefore = await root.read('mapping.json');
    const projectBefore = session.store.project.value;
    const undoBefore = session.store.canUndo.value;
    await session.threadActions.post('A', 'hi');
    await session.threadActions.resolve('A');
    await session.flush();
    expect(await root.read('mapping.json')).toBe(mappingBefore);
    expect(session.store.project.value).toBe(projectBefore);
    expect(session.store.canUndo.value).toBe(undoBefore);
    await session.close();
  });

  it('onChanged reports the write of a thread (unexported changes)', async () => {
    const onChanged = vi.fn();
    const { openSession } = await import('../../src/store/session');
    const { createFolderStorage } = await import('../../src/storage/folder');
    const { MemoryDirectory } = await import('../storage/memoryFs');
    const { loadProject } = await import('../../src/storage/loadProject');
    const { serialize } = await import('../../src/model');
    const { sampleProject } = await import('../model/fixtures');
    const root = new MemoryDirectory('p');
    root.put('mapping.json', serialize({ ...sampleProject(), revision: 1 }));
    put(root, sampleThread({ id: 'A' }));
    const storage = createFolderStorage(root);
    const loaded = await loadProject(storage);
    if (!loaded.ok) throw new Error(loaded.error);
    const { loadThreads } = await import('../../src/storage/loadThreads');
    const session = openSession({
      storage,
      project: loaded.project,
      loadedText: loaded.text,
      threads: await loadThreads(storage),
      prepareImage: () => Promise.reject(new Error('no images')),
      onChanged,
    });
    await session.threadActions.post('A', 'hi');
    expect(onChanged).toHaveBeenCalledTimes(1);
    await session.close();
  });
});
