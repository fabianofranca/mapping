// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { serialize, type Project } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import type { DirectoryHandleLike, FileHandleLike } from '../../src/storage/folder';
import type { ProjectStorage } from '../../src/storage/types';
import {
  ExternalChangeError,
  openSession,
  type ProjectSession,
} from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// FA2, decisão 7: a gravação lê o `mapping.json` uma vez antes de gravar (uma leitura que já
// traz o carimbo), nenhuma pasta é resolvida e a conferência de conflito continua valendo.

type Events = string[];

function logging(inner: DirectoryHandleLike, events: Events): DirectoryHandleLike {
  return {
    kind: 'directory',
    name: inner.name,
    async getDirectoryHandle(name, options) {
      events.push(`getDirectoryHandle:${name}`);
      return logging(await inner.getDirectoryHandle(name, options), events);
    },
    async getFileHandle(name, options) {
      const handle = await inner.getFileHandle(name, options);
      const wrapped: FileHandleLike = {
        kind: 'file',
        name: handle.name,
        getFile() {
          events.push(`getFile:${name}`);
          return handle.getFile();
        },
        createWritable() {
          events.push(`createWritable:${name}`);
          return handle.createWritable();
        },
      };
      return wrapped;
    },
    removeEntry: (name, options) => inner.removeEntry(name, options),
    values: () => inner.values(),
  };
}

interface Harness {
  readonly root: MemoryDirectory;
  readonly session: ProjectSession;
  readonly events: Events;
  readonly project: Project;
  /** Quantas vezes a sessão leu o texto por `loadMapping` e por `loadMappingStamped`. */
  readonly reads: { plain: number; stamped: number };
}

let current: ProjectSession | null = null;
afterEach(async () => {
  await current?.close();
  current = null;
});

async function setup(): Promise<Harness> {
  const root = new MemoryDirectory('p');
  const project: Project = { ...sampleProject(), revision: 2 };
  const text = serialize(project);
  root.put('mapping.json', text);
  const events: Events = [];
  const inner = createFolderStorage(logging(root, events));
  const reads = { plain: 0, stamped: 0 };
  const storage: ProjectStorage = {
    ...inner,
    loadMapping() {
      reads.plain++;
      return inner.loadMapping();
    },
    loadMappingStamped() {
      reads.stamped++;
      return (
        inner.loadMappingStamped?.() ??
        inner
          .loadMapping()
          .then((t) => (t === null ? null : { text: t, lastModified: 0 }))
      );
    },
  };
  const session = openSession({
    storage,
    project,
    loadedText: text,
    prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
    now: () => NOW,
    autosaveDelay: 1,
  });
  current = session;
  // O ciclo inicial (carimbo de abertura) termina antes de medir a gravação.
  await session.sync();
  events.length = 0;
  reads.plain = 0;
  reads.stamped = 0;
  return { root, session, events, project, reads };
}

describe('gravação com menos leituras (FA2)', () => {
  it('uma edição só do mapping.json lê o arquivo uma vez antes de gravar, por loadMappingStamped', async () => {
    const h = await setup();
    expect(h.session.actions.renameMarking('M3', 'Fechadura nova').ok).toBe(true);
    await h.session.flush();
    const write = h.events.indexOf('createWritable:mapping.json');
    expect(write).toBeGreaterThan(0);
    expect(
      h.events.slice(0, write).filter((e) => e === 'getFile:mapping.json'),
    ).toHaveLength(1);
    expect(h.events.filter((e) => e.startsWith('getDirectoryHandle'))).toEqual([]);
    expect(h.reads).toEqual({ plain: 0, stamped: 1 });
    // O carimbo depois da gravação custa um getFile só.
    expect(
      h.events.slice(write).filter((e) => e === 'getFile:mapping.json'),
    ).toHaveLength(1);
  });

  it('o carimbo da abertura custa uma leitura do arquivo (mais o stat da primeira conferência)', async () => {
    const root = new MemoryDirectory('p');
    const project: Project = { ...sampleProject(), revision: 2 };
    const text = serialize(project);
    root.put('mapping.json', text);
    const events: Events = [];
    const session = openSession({
      storage: createFolderStorage(logging(root, events)),
      project,
      loadedText: text,
      prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
      now: () => NOW,
      autosaveDelay: 1,
    });
    current = session;
    await session.sync();
    // Uma leitura (texto + data) do carimbo inicial e o `stat` da própria conferência.
    expect(events.filter((e) => e === 'getFile:mapping.json')).toHaveLength(2);
  });

  it('arquivo alterado por fora entre a abertura e a gravação continua sendo conflito', async () => {
    const h = await setup();
    h.root.put(
      'mapping.json',
      serialize({ ...h.project, revision: 3, specializations: [] }),
    );
    h.session.actions.renameMarking('M3', 'Fechadura nova');
    await expect(h.session.flush()).resolves.toMatchObject({ ok: false });
    expect(h.session.conflict.value).not.toBeNull();
    expect(h.events).not.toContain('createWritable:mapping.json');
    expect(new ExternalChangeError()).toBeInstanceOf(Error);
  });

  it('arquivo vazio e diferente não é gravado por cima', async () => {
    const h = await setup();
    h.root.put('mapping.json', '');
    h.session.actions.renameMarking('M3', 'Fechadura nova');
    await expect(h.session.flush()).resolves.toMatchObject({ ok: false });
    expect(h.events).not.toContain('createWritable:mapping.json');
  });
});
