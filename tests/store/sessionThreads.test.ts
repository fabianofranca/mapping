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
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => clearReportedErrors());

const put = (root: { put(path: string, text: string): void }, t: Thread) =>
  root.put(threadFilePath(t.id, t.resolved !== null), serializeThread(t));

describe('sessão e conversas', () => {
  it('abre com as conversas do armazenamento e a conferência acha as mudanças por fora', async () => {
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

  it('duas gravações da mesma conversa, a da app e a do MCP no meio, não perdem mensagem', async () => {
    const t = sampleThread({ id: 'A', revision: 3 });
    const { root, session } = await openHarness({
      files: { [threadFilePath('A', false)]: serializeThread(t) },
    });
    // O MCP grava entre a leitura da app e a gravação dela.
    put(root, appendMessage(t, message('do-mcp', T3, AGENT, 'resposta do agente')));
    const out = await session.threadActions.post('A', 'minha pergunta');
    expect(out.ok).toBe(true);
    const disk = parseThreadText((await root.read(threadFilePath('A', false))) ?? '');
    // O relógio da bancada é anterior às mensagens de exemplo: a ordem é por `at`, não por chegada.
    const texts = disk.ok ? disk.thread.messages.map((m) => m.text).sort() : [];
    expect(texts).toEqual(
      ['texto m1', 'resposta', 'texto m3', 'resposta do agente', 'minha pergunta'].sort(),
    );
    expect(disk.ok && disk.thread.revision).toBe(5);
    await session.close();
  });

  it('collectFiles leva as conversas, abertas e resolvidas, e o texto exato dos inválidos', async () => {
    const open = sampleThread({ id: 'A' });
    const resolved = sampleThread({
      id: 'R',
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T3 },
    });
    const { session } = await openHarness({
      files: {
        [threadFilePath('A', false)]: serializeThread(open),
        [threadFilePath('R', true)]: serializeThread(resolved),
        [threadFilePath('quebrada', false)]: '{ não é json',
      },
    });
    const files = await session.collectFiles();
    expect([...(files.threads?.keys() ?? [])].sort()).toEqual([
      'comments/A.json',
      'comments/quebrada.json',
      'comments/resolved/R.json',
    ]);
    expect(files.threads?.get('comments/quebrada.json')).toBe('{ não é json');
    await session.close();
  });

  it('gravar uma mensagem não muda o mapping.json, o histórico nem a revisão do projeto', async () => {
    const { root, session } = await openHarness({
      files: { [threadFilePath('A', false)]: serializeThread(sampleThread({ id: 'A' })) },
    });
    const mappingBefore = await root.read('mapping.json');
    const projectBefore = session.store.project.value;
    const undoBefore = session.store.canUndo.value;
    await session.threadActions.post('A', 'oi');
    await session.threadActions.resolve('A');
    await session.flush();
    expect(await root.read('mapping.json')).toBe(mappingBefore);
    expect(session.store.project.value).toBe(projectBefore);
    expect(session.store.canUndo.value).toBe(undoBefore);
    await session.close();
  });

  it('o onChanged avisa a gravação de uma conversa (alterações não exportadas)', async () => {
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
      prepareImage: () => Promise.reject(new Error('sem imagens')),
      onChanged,
    });
    await session.threadActions.post('A', 'oi');
    expect(onChanged).toHaveBeenCalledTimes(1);
    await session.close();
  });
});
