// @vitest-environment node
import { signal } from '@preact/signals';
import { describe, expect, it, vi } from 'vitest';
import {
  THREAD_MESSAGE_MAX,
  serializeThread,
  threadFilePath,
  type ThreadAnchor,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadThreads } from '../../src/storage/loadThreads';
import { createProjectStore } from '../../src/store/history';
import type { Identity } from '../../src/store/identity';
import { createThreadActions } from '../../src/store/threadActions';
import { createThreadStore } from '../../src/store/threads';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

const ME: Identity = { name: 'Marina Alves', email: 'marina@example.com' };
const NOW = '2026-11-07T10:00:00.000Z';
const ANCHOR: ThreadAnchor = { kind: 'marking', id: 'M1' };

async function setup(
  options: {
    identity?: Identity | null;
    readOnly?: boolean;
    reviewing?: boolean;
    threads?: readonly ReturnType<typeof sampleThread>[];
    copyId?: string;
  } = {},
) {
  const root = new MemoryDirectory('p');
  for (const t of options.threads ?? [])
    root.put(threadFilePath(t.id, t.resolved !== null), serializeThread(t));
  const storage = createFolderStorage(root);
  const onChanged = vi.fn();
  const threads = createThreadStore({
    storage,
    initial: await loadThreads(storage),
    onChanged,
  });
  const projectStore = createProjectStore({ now: () => NOW });
  projectStore.load(sampleProject(), { readOnly: options.readOnly === true });
  if (options.reviewing) projectStore.setReviewing('R');
  const me = signal<Identity | null>(
    options.identity === undefined ? ME : options.identity,
  );
  let n = 0;
  const actions = createThreadActions({
    store: projectStore,
    threads,
    identity: me,
    now: () => NOW,
    newId: () => `id-${++n}`,
    ...(options.copyId === undefined ? {} : { copyId: options.copyId }),
  });
  return { root, threads, actions, projectStore, me, onChanged };
}

describe('thread actions: refusals', () => {
  it('without identity, all refuse (the person only reads)', async () => {
    const { actions, root } = await setup({
      identity: null,
      threads: [sampleThread({ id: 'A' })],
    });
    const before = await root.read(threadFilePath('A', false));
    const denied = { ok: false, error: 'no-identity' };
    expect(await actions.open(ANCHOR, 'hi')).toEqual(denied);
    expect(await actions.post('A', 'hi')).toEqual(denied);
    expect(await actions.resolve('A')).toEqual(denied);
    expect(await actions.reopen('A')).toEqual(denied);
    expect(await actions.remove('A')).toEqual(denied);
    expect(await actions.removeMany(['A'])).toEqual(denied);
    expect(await root.read(threadFilePath('A', false))).toBe(before);
  });

  it('with a read-only project the threads are read-only too', async () => {
    const { actions, root } = await setup({
      readOnly: true,
      threads: [sampleThread({ id: 'A' })],
    });
    const before = await root.read(threadFilePath('A', false));
    const denied = { ok: false, error: 'read-only' };
    expect(await actions.open(ANCHOR, 'hi')).toEqual(denied);
    expect(await actions.post('A', 'hi')).toEqual(denied);
    expect(await actions.resolve('A')).toEqual(denied);
    expect(await actions.reopen('A')).toEqual(denied);
    expect(await actions.remove('A')).toEqual(denied);
    expect(await root.read(threadFilePath('A', false))).toBe(before);
  });

  it('with the proposal review open they refuse (decision 26)', async () => {
    const { actions } = await setup({ reviewing: true });
    expect(await actions.open(ANCHOR, 'hi')).toEqual({ ok: false, error: 'reviewing' });
  });

  it('they refuse an empty message and one above the limit without writing anything', async () => {
    const { actions, root } = await setup({ threads: [sampleThread({ id: 'A' })] });
    expect(await actions.open(ANCHOR, '   \n ')).toEqual({
      ok: false,
      error: 'empty-message',
    });
    expect(await actions.post('A', '')).toEqual({ ok: false, error: 'empty-message' });
    const long = 'x'.repeat(THREAD_MESSAGE_MAX + 1);
    expect(await actions.post('A', long)).toEqual({
      ok: false,
      error: 'message-too-long',
    });
    expect([...root.dirs.get('comments')!.files.keys()]).toEqual(['A.json']);
  });

  it('a thread that does not exist', async () => {
    const { actions } = await setup();
    expect(await actions.post('Z', 'hi')).toEqual({ ok: false, error: 'unknown-thread' });
    expect(await actions.resolve('Z')).toEqual({ ok: false, error: 'unknown-thread' });
  });
});

describe('thread actions: writing', () => {
  it('opening writes the human author with the identity name and email', async () => {
    const { actions, threads, root, onChanged } = await setup();
    const out = await actions.open(ANCHOR, '  Is the **variant** right?  ');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const t = out.thread;
    expect(t.id).toBe('id-1');
    expect(t.anchor).toEqual(ANCHOR);
    expect(t.revision).toBe(0);
    expect(t.resolved).toBeNull();
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toEqual({
      id: 'id-2',
      author: { kind: 'human', name: 'Marina Alves', email: 'marina@example.com' },
      at: NOW,
      text: 'Is the **variant** right?',
      proposal: null,
    });
    expect(await root.read(threadFilePath('id-1', false))).toContain('"kind": "human"');
    expect(threads.get('id-1')).not.toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it('appending writes human with the identity and bumps the revision', async () => {
    const { actions } = await setup({
      threads: [sampleThread({ id: 'A', revision: 3 })],
    });
    const out = await actions.post('A', 'reply');
    expect(out.ok && out.thread.revision).toBe(4);
    const last = out.ok ? out.thread.messages.at(-1) : undefined;
    expect(last?.author).toEqual({
      kind: 'human',
      name: 'Marina Alves',
      email: 'marina@example.com',
    });
    expect(last?.text).toBe('reply');
  });

  it('resolving and reopening move the file and record who resolved', async () => {
    const { actions, root } = await setup({ threads: [sampleThread({ id: 'A' })] });
    const resolved = await actions.resolve('A');
    expect(resolved.ok && resolved.thread.resolved).toEqual({ by: ME, at: NOW });
    expect(await root.read(threadFilePath('A', true))).not.toBeNull();
    expect(await root.read(threadFilePath('A', false))).toBeNull();
    const reopened = await actions.reopen('A');
    expect(reopened.ok && reopened.thread.resolved).toBeNull();
    expect(await root.read(threadFilePath('A', false))).not.toBeNull();
    expect(await root.read(threadFilePath('A', true))).toBeNull();
  });

  it('deleting one and in batch', async () => {
    const { actions, threads, root } = await setup({
      threads: [
        sampleThread({ id: 'A' }),
        sampleThread({ id: 'B' }),
        sampleThread({ id: 'C' }),
      ],
    });
    expect(await actions.remove('A')).toEqual({ ok: true });
    expect(threads.get('A')).toBeNull();
    expect(await root.read(threadFilePath('A', false))).toBeNull();
    const many = await actions.removeMany(['B', 'C', 'Z']);
    expect(many).toEqual({ ok: true, removed: ['B', 'C'], failed: ['Z'] });
    expect(threads.list.value).toEqual([]);
  });

  it('deleting forgets the "read" mark of the thread', async () => {
    // The read blob is per device: the deleted thread leaves no entry in it.
    const { markThreadRead, lastReadAt } = await import('../../src/store/threadReads');
    const { actions } = await setup({
      threads: [sampleThread({ id: 'A' })],
      copyId: 'copy',
    });
    markThreadRead('copy', 'A', NOW);
    expect(lastReadAt('copy', 'A')).toBe(NOW);
    await actions.remove('A');
    expect(lastReadAt('copy', 'A')).toBeNull();
  });
});

describe('mapping.json and undo do not change with the threads', () => {
  it('writing a message leaves the project and the history the same', async () => {
    const { actions, projectStore, root } = await setup({
      threads: [sampleThread({ id: 'A' })],
    });
    root.put('mapping.json', '{"untouched":true}');
    const projectBefore = projectStore.project.value;
    const canUndoBefore = projectStore.canUndo.value;
    const canRedoBefore = projectStore.canRedo.value;
    await actions.post('A', 'hi');
    await actions.open(ANCHOR, 'new');
    await actions.resolve('A');
    expect(projectStore.project.value).toBe(projectBefore);
    expect(projectStore.canUndo.value).toBe(canUndoBefore);
    expect(projectStore.canRedo.value).toBe(canRedoBefore);
    expect(await root.read('mapping.json')).toBe('{"untouched":true}');
  });
});
