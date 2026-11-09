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

const ME = { name: 'Marina Alves', email: 'marina@exemplo.com' };

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
  (id: string, at: string, text = 'oi') =>
  (t: Thread) =>
    appendMessage(t, message(id, at, HUMAN, text));

describe('conversas: lista inicial', () => {
  it('traz as abertas e as resolvidas lidas na abertura, a mais nova primeiro', async () => {
    const a = sampleThread({ id: 'A', createdAt: T0 });
    const b = sampleThread({ id: 'B', createdAt: T2 });
    const r = sampleThread({
      id: 'R',
      createdAt: T1,
      resolved: { by: ME, at: T3 },
    });
    const { store } = await setup([a, b, r]);
    expect(store.list.value.map((t) => t.id)).toEqual(['B', 'R', 'A']);
    expect(store.get('R')?.resolved?.by.email).toBe('marina@exemplo.com');
  });

  it('o arquivo inválido vira problema no Diagnóstico e não derruba as outras', async () => {
    const root = new MemoryDirectory('p');
    onDisk(root, sampleThread({ id: 'A' }));
    root.put(threadFilePath('quebrada', false), '{ não é json');
    const storage = createFolderStorage(root);
    const store = createThreadStore({ storage, initial: await loadThreads(storage) });
    expect(store.list.value.map((t) => t.id)).toEqual(['A']);
    expect(store.problems.value.map((p) => p.id)).toEqual(['quebrada']);
    const entries = reportedErrors.value.filter((e) => e.context === 'threads.invalid');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain('comments/quebrada.json');
  });
});

describe('conversas: gravação com releitura e revision + 1', () => {
  it('muda a conversa, grava revision + 1 e avisa o onChanged', async () => {
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

  it('adota a versão do disco e refaz a operação: a mensagem do MCP no meio não se perde', async () => {
    const t = sampleThread({ id: 'A', revision: 3 });
    const { root, store } = await setup([t]);
    // O servidor MCP acrescenta uma mensagem de agente por fora.
    const fromAgent = appendMessage(t, message('mx', T3, AGENT, 'do agente'));
    onDisk(root, fromAgent);
    const out = await store.mutate('A', append('m9', '2026-11-06T14:00:00.000Z'));
    expect(out.ok).toBe(true);
    const disk = await diskThread(root, 'A');
    expect(disk?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'mx', 'm9']);
    // revision do disco (4) + 1.
    expect(disk?.revision).toBe(5);
  });

  it('um arquivo que ficou ilegível por fora não é sobrescrito', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    root.put(threadFilePath('A', false), '{ meio escrito');
    const out = await store.mutate('A', append('m9', T3));
    expect(out).toEqual({ ok: false, error: 'unreadable' });
    expect(await root.read(threadFilePath('A', false))).toBe('{ meio escrito');
    expect(store.get('A')).not.toBeNull();
  });

  it('o arquivo que sumiu por fora tira a conversa da lista', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    await root.dirs.get('comments')?.removeEntry('A.json');
    expect(await store.mutate('A', append('m9', T3))).toEqual({
      ok: false,
      error: 'gone',
    });
    expect(store.get('A')).toBeNull();
  });

  it('id desconhecido, id de mensagem repetido e gravação que falha', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    expect(await store.mutate('Z', append('m9', T3))).toEqual({
      ok: false,
      error: 'unknown-thread',
    });
    expect(await store.mutate('A', append('m1', T3))).toEqual({
      ok: false,
      error: 'duplicate-message',
    });
    root.failWrites = new Error('disco cheio');
    root.dirs.get('comments')!.failWrites = new Error('disco cheio');
    expect(await store.mutate('A', append('m9', T3))).toEqual({
      ok: false,
      error: 'write-failed',
    });
    expect(store.get('A')?.messages).toHaveLength(3);
    expect(reportedErrors.value.some((e) => e.context === 'threads.write')).toBe(true);
  });

  it('uma operação que não muda nada (resolver uma resolvida) não grava', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { root, store, onChanged } = await setup([r]);
    const before = await root.read(threadFilePath('R', true));
    const out = await store.mutate('R', (t) => resolveThread(t, ME, T3));
    expect(out.ok).toBe(true);
    expect(await root.read(threadFilePath('R', true))).toBe(before);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('as chamadas rodam em fila, uma de cada vez', async () => {
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

describe('conversas: mover ao resolver e ao reabrir', () => {
  it('resolver grava em resolved/ e apaga de comments/, sem deixar duas cópias', async () => {
    const { root, store, storage } = await setup([sampleThread({ id: 'A' })]);
    const out = await store.mutate('A', (t) => resolveThread(t, ME, T3));
    expect(out.ok).toBe(true);
    expect(await storage.listThreads(false)).toEqual([]);
    expect(await storage.listThreads(true)).toEqual(['A']);
    expect((await diskThread(root, 'A', true))?.resolved?.by.email).toBe(ME.email);
    expect(store.get('A')?.resolved).not.toBeNull();
  });

  it('reabrir faz o caminho de volta', async () => {
    const r = sampleThread({ id: 'A', resolved: { by: ME, at: T3 } });
    const { store, storage } = await setup([r]);
    const out = await store.mutate('A', reopenThread);
    expect(out.ok).toBe(true);
    expect(await storage.listThreads(true)).toEqual([]);
    expect(await storage.listThreads(false)).toEqual(['A']);
    expect(store.get('A')?.resolved).toBeNull();
  });

  it('se a gravação no destino falha, a origem fica intacta', async () => {
    const { root, store, storage } = await setup([sampleThread({ id: 'A' })]);
    root.put('comments/resolved/vazia.json', '{}');
    root.dirs.get('comments')!.dirs.get('resolved')!.failWrites = new Error('sem espaço');
    const out = await store.mutate('A', (t) => resolveThread(t, ME, T3));
    expect(out).toEqual({ ok: false, error: 'write-failed' });
    expect(await storage.listThreads(false)).toEqual(['A']);
    expect(store.get('A')?.resolved).toBeNull();
  });

  it('as duas cópias (mesclagem do git) são juntadas e a gravação deixa uma só', async () => {
    const open = sampleThread({ id: 'A', revision: 4 });
    const resolvedCopy = sampleThread({
      id: 'A',
      revision: 6,
      resolved: { by: ME, at: T3 },
      messages: [message('m1', T0), message('mz', T1, AGENT, 'só nesta')],
    });
    const root = new MemoryDirectory('p');
    onDisk(root, open, false);
    onDisk(root, resolvedCopy, true);
    const storage = createFolderStorage(root);
    const store = createThreadStore({ storage, initial: await loadThreads(storage) });
    // A leitura junta: união das mensagens, revision maior; a resolução é posterior à última.
    const merged = store.get('A');
    expect(merged?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'mz', 'm3']);
    expect(merged?.revision).toBe(6);
    await store.mutate('A', append('m9', '2026-11-06T14:00:00.000Z'));
    // Resolvida (a resolução é posterior à última mensagem): fica em resolved/, a aberta sai.
    expect(await storage.listThreads(false)).toEqual([]);
    expect(await storage.listThreads(true)).toEqual(['A']);
    const disk = await diskThread(root, 'A', true);
    expect(disk?.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'mz', 'm3', 'm9']);
    expect(disk?.revision).toBe(7);
  });
});

describe('conversas: criar e apagar', () => {
  const fresh = (id = 'N1') =>
    openThread({
      id,
      anchor: { kind: 'marking', id: 'M1' },
      author: HUMAN,
      text: 'olá',
      at: T0,
      messageId: 'm1',
    });

  it('create grava comments/<id>.json e nunca sobrescreve uma conversa que existe', async () => {
    const { root, store, onChanged } = await setup([sampleThread({ id: 'A' })]);
    expect((await store.create(fresh())).ok).toBe(true);
    expect((await diskThread(root, 'N1'))?.messages).toHaveLength(1);
    expect(store.get('N1')).not.toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
    const before = await root.read(threadFilePath('A', false));
    expect(await store.create(fresh('A'))).toEqual({ ok: false, error: 'exists' });
    expect(await root.read(threadFilePath('A', false))).toBe(before);
  });

  it('remove apaga as duas cópias e tira da lista; removeMany conta o que foi', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { store, storage } = await setup([sampleThread({ id: 'A' }), r]);
    expect(await store.remove('A')).toEqual({ ok: true });
    expect(await storage.listThreads(false)).toEqual([]);
    expect(store.get('A')).toBeNull();
    expect(await store.remove('A')).toEqual({ ok: false, error: 'unknown-thread' });
    const many = await store.removeMany(['R', 'nao-existe']);
    expect(many).toEqual({ removed: ['R'], failed: ['nao-existe'] });
    expect(await storage.listThreads(true)).toEqual([]);
    expect(store.list.value).toEqual([]);
  });
});

describe('conversas: varredura da pasta (a conferência de ~3 s)', () => {
  it('acha a conversa nova, a alterada e a apagada por fora', async () => {
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

  it('só lê o arquivo que mudou e só lista comments/ (sem resolved/)', async () => {
    const root = new MemoryDirectory('p');
    for (const id of ['A', 'B', 'C']) onDisk(root, sampleThread({ id }));
    onDisk(root, sampleThread({ id: 'R', resolved: { by: ME, at: T3 } }));
    const base = createFolderStorage(root);
    const calls = { list: [] as boolean[], read: [] as string[] };
    const storage: ProjectStorage = {
      ...base,
      listThreads: (resolved) => {
        calls.list.push(resolved);
        return base.listThreads(resolved);
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
    expect(calls.list).toEqual([false]);
    expect(calls.read).toEqual([]);

    onDisk(root, appendMessage(sampleThread({ id: 'B' }), message('mx', T3, AGENT)));
    await store.scan();
    expect(calls.read).toEqual(['o:B']);
  });

  it('o scan sem mudança não republica a lista nem os problemas', async () => {
    const { store } = await setup([sampleThread({ id: 'A' })]);
    const list = store.list.value;
    const problems = store.problems.value;
    await store.scan();
    await store.scan();
    expect(store.list.value).toBe(list);
    expect(store.problems.value).toBe(problems);
  });

  it('um arquivo desconhecido e ilegível vira problema (uma vez); o conhecido, ainda sendo escrito, fica como está', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })]);
    root.put(threadFilePath('X', false), '{ meio');
    await store.scan();
    await store.scan();
    expect(store.problems.value.map((p) => p.id)).toEqual(['X']);
    expect(
      reportedErrors.value.filter((e) => e.context === 'threads.invalid'),
    ).toHaveLength(1);

    root.put(threadFilePath('A', false), '{ meio');
    expect(await store.scan()).toEqual({ added: [], changed: [], removed: [] });
    expect(store.get('A')?.messages).toHaveLength(3);
  });

  it('a conversa resolvida por fora (arquivo foi para resolved/) continua na lista', async () => {
    const { root, store } = await setup([sampleThread({ id: 'A' })], { resolved: false });
    await root.dirs.get('comments')?.removeEntry('A.json');
    onDisk(root, sampleThread({ id: 'A', resolved: { by: ME, at: T3 } }));
    const scan = await store.scan();
    expect(scan.removed).toEqual([]);
    expect(scan.changed).toEqual(['A']);
    expect(store.get('A')?.resolved).not.toBeNull();
  });
});

describe('conversas: resolvidas sob pedido', () => {
  it('sem ler resolved/ na abertura, loadResolved as traz', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { store } = await setup([sampleThread({ id: 'A' }), r], { resolved: false });
    expect(store.list.value.map((t) => t.id)).toEqual(['A']);
    expect(store.resolvedLoaded.value).toBe(false);
    await store.loadResolved();
    expect(store.resolvedLoaded.value).toBe(true);
    expect(store.list.value.map((t) => t.id).sort()).toEqual(['A', 'R']);
  });

  it('collect leva tudo: as resolvidas ainda não lidas e o texto exato dos inválidos', async () => {
    const r = sampleThread({ id: 'R', resolved: { by: ME, at: T3 } });
    const { root, store } = await setup([sampleThread({ id: 'A' }), r], {
      resolved: false,
    });
    root.put(threadFilePath('quebrada', false), '{ não é json');
    await store.scan();
    const files = await store.collect();
    expect([...files.keys()].sort()).toEqual([
      'comments/A.json',
      'comments/quebrada.json',
      'comments/resolved/R.json',
    ]);
    expect(files.get('comments/quebrada.json')).toBe('{ não é json');
    expect(files.get('comments/A.json')).toBe(await root.read('comments/A.json'));
  });
});
