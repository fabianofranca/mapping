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

const ME: Identity = { name: 'Marina Alves', email: 'marina@exemplo.com' };
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
  if (options.reviewing) projectStore.setReviewing(true);
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

describe('ações das conversas: recusas', () => {
  it('sem identidade, todas recusam (a pessoa só lê)', async () => {
    const { actions, root } = await setup({
      identity: null,
      threads: [sampleThread({ id: 'A' })],
    });
    const before = await root.read(threadFilePath('A', false));
    const denied = { ok: false, error: 'no-identity' };
    expect(await actions.open(ANCHOR, 'oi')).toEqual(denied);
    expect(await actions.post('A', 'oi')).toEqual(denied);
    expect(await actions.resolve('A')).toEqual(denied);
    expect(await actions.reopen('A')).toEqual(denied);
    expect(await actions.remove('A')).toEqual(denied);
    expect(await actions.removeMany(['A'])).toEqual(denied);
    expect(await root.read(threadFilePath('A', false))).toBe(before);
  });

  it('com o projeto somente leitura as conversas também são só de leitura', async () => {
    const { actions, root } = await setup({
      readOnly: true,
      threads: [sampleThread({ id: 'A' })],
    });
    const before = await root.read(threadFilePath('A', false));
    const denied = { ok: false, error: 'read-only' };
    expect(await actions.open(ANCHOR, 'oi')).toEqual(denied);
    expect(await actions.post('A', 'oi')).toEqual(denied);
    expect(await actions.resolve('A')).toEqual(denied);
    expect(await actions.reopen('A')).toEqual(denied);
    expect(await actions.remove('A')).toEqual(denied);
    expect(await root.read(threadFilePath('A', false))).toBe(before);
  });

  it('com a revisão de proposta aberta recusam (decisão 26)', async () => {
    const { actions } = await setup({ reviewing: true });
    expect(await actions.open(ANCHOR, 'oi')).toEqual({ ok: false, error: 'reviewing' });
  });

  it('recusam mensagem vazia e acima do limite sem gravar nada', async () => {
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

  it('conversa que não existe', async () => {
    const { actions } = await setup();
    expect(await actions.post('Z', 'oi')).toEqual({ ok: false, error: 'unknown-thread' });
    expect(await actions.resolve('Z')).toEqual({ ok: false, error: 'unknown-thread' });
  });
});

describe('ações das conversas: escrever', () => {
  it('abrir grava o autor human com o nome e o e-mail da identidade', async () => {
    const { actions, threads, root, onChanged } = await setup();
    const out = await actions.open(ANCHOR, '  A **variante** está certa?  ');
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
      author: { kind: 'human', name: 'Marina Alves', email: 'marina@exemplo.com' },
      at: NOW,
      text: 'A **variante** está certa?',
      proposal: null,
    });
    expect(await root.read(threadFilePath('id-1', false))).toContain('"kind": "human"');
    expect(threads.get('id-1')).not.toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it('acrescentar grava human com a identidade e sobe a revision', async () => {
    const { actions } = await setup({
      threads: [sampleThread({ id: 'A', revision: 3 })],
    });
    const out = await actions.post('A', 'resposta');
    expect(out.ok && out.thread.revision).toBe(4);
    const last = out.ok ? out.thread.messages.at(-1) : undefined;
    expect(last?.author).toEqual({
      kind: 'human',
      name: 'Marina Alves',
      email: 'marina@exemplo.com',
    });
    expect(last?.text).toBe('resposta');
  });

  it('resolver e reabrir movem o arquivo e gravam quem resolveu', async () => {
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

  it('apagar uma e em lote', async () => {
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

  it('apagar esquece o "lida" da conversa', async () => {
    // O blob de leitura é por dispositivo: a conversa apagada não deixa entrada nele.
    const { markThreadRead, lastReadAt } = await import('../../src/store/threadReads');
    const { actions } = await setup({
      threads: [sampleThread({ id: 'A' })],
      copyId: 'copia',
    });
    markThreadRead('copia', 'A', NOW);
    expect(lastReadAt('copia', 'A')).toBe(NOW);
    await actions.remove('A');
    expect(lastReadAt('copia', 'A')).toBeNull();
  });
});

describe('o mapping.json e o desfazer não mudam com as conversas', () => {
  it('gravar uma mensagem deixa o projeto e o histórico iguais', async () => {
    const { actions, projectStore, root } = await setup({
      threads: [sampleThread({ id: 'A' })],
    });
    root.put('mapping.json', '{"intocado":true}');
    const projectBefore = projectStore.project.value;
    const canUndoBefore = projectStore.canUndo.value;
    const canRedoBefore = projectStore.canRedo.value;
    await actions.post('A', 'oi');
    await actions.open(ANCHOR, 'nova');
    await actions.resolve('A');
    expect(projectStore.project.value).toBe(projectBefore);
    expect(projectStore.canUndo.value).toBe(canUndoBefore);
    expect(projectStore.canRedo.value).toBe(canRedoBefore);
    expect(await root.read('mapping.json')).toBe('{"intocado":true}');
  });
});
