// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTES_LIBRARY } from '../../libraries/notas';
import { applyBundledLibrary, deserialize, serialize } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// `openSession` com `stagedPackages` (ME3): a biblioteca de notas aplicada em memória a um projeto
// migrado. O projeto já a cita, o disco ainda não: a primeira gravação escreve `specs/notas/`.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DIR = 'specs/notas';
const SPEC_FILE = `${DIR}/notas.spec.json`;

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

/** A pasta como a v12 a deixou (só o `mapping.json`) e a sessão com as notas em memória. */
function openMigrated(root: MemoryDirectory, calls: string[] = []) {
  const old = serialize(sampleProject());
  root.files.set('mapping.json', new Blob([old]));
  const inner = createFolderStorage(root);
  const storage = {
    ...inner,
    saveMapping: (text: string) => {
      calls.push('mapping');
      return inner.saveMapping(text);
    },
    writeSpecFile: (path: string, data: Blob | string) => {
      calls.push(`write ${path}`);
      return inner.writeSpecFile(path, data);
    },
    removeSpecDir: (dir: string) => {
      calls.push(`remove ${dir}`);
      return inner.removeSpecDir(dir);
    },
  };
  let n = 0;
  const applied = applyBundledLibrary(sampleProject(), NOTES_LIBRARY, {
    newId: () => `note-${++n}`,
  });
  const session = openSession({
    storage,
    project: applied.project,
    loadedText: old,
    migratedFrom: { version: 12, text: old },
    stagedPackages: [{ spec: applied.spec, files: applied.packageFiles }],
    prepareImage: () => Promise.reject(new Error('sem imagens')),
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  return { session, old, storage: inner };
}

describe('sessão com pacotes aplicados em memória (stagedPackages)', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('o catálogo de componentes enxerga o pacote antes de ele existir no disco', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    expect(await opened.storage.listSpecDir(DIR)).toEqual([]);
    await session.components.whenIdle();
    const notes = session.components.catalog.value.get('notas');
    expect(notes?.problems).toEqual([]);
    expect(notes?.byType.has('nota')).toBe(true);
  });

  it('abrir e esperar não grava nada; a primeira gravação escreve o pacote antes do mapping.json e o backup', async () => {
    const root = new MemoryDirectory('p');
    const calls: string[] = [];
    const opened = openMigrated(root, calls);
    session = opened.session;
    await vi.advanceTimersByTimeAsync(5_000);
    await settle();
    expect(calls).toEqual([]);
    expect(await root.read('mapping.json')).toBe(opened.old);
    expect(root.dirs.has('specs')).toBe(false);
    expect(root.dirs.has('backups')).toBe(false);
    expect(session.store.canUndo.value).toBe(false);

    // A primeira alteração da pessoa grava o projeto (abrir sozinho nunca grava).
    session.actions.renameProject('Renomeado');
    expect((await session.flush()).ok).toBe(true);

    const onDisk = await opened.storage.listSpecDir(DIR);
    expect(onDisk.sort()).toEqual(
      [SPEC_FILE, `${DIR}/components/nota.json`, `${DIR}/docs/nota.md`].sort(),
    );
    // Os arquivos do pacote entram antes do mapping.json que os cita.
    const mappingAt = calls.indexOf('mapping');
    expect(mappingAt).toBeGreaterThan(0);
    expect(calls.slice(0, mappingAt)).toEqual(
      expect.arrayContaining([
        `write ${DIR}/components/nota.json`,
        `write ${DIR}/docs/nota.md`,
      ]),
    );
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('mapping inválido');
    expect(saved.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(saved.project.layers.some((l) => l.spec?.specId === 'notas')).toBe(true);
    // O backup da migração guarda o original.
    const [backup, ...rest] = [...(root.dirs.get('backups')?.files.keys() ?? [])];
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^mapping\.v12\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backup ?? '')
        ?.text(),
    ).toBe(opened.old);
    // Só a renomeação entra no histórico; a biblioteca de notas não.
    expect(session.store.canUndo.value).toBe(true);
    session.store.undo();
    expect(session.store.canUndo.value).toBe(false);
  });

  it('o conteúdo gravado é o do pacote embutido', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    session.actions.renameProject('Renomeado');
    await session.flush();
    expect(await root.read(`${DIR}/components/nota.json`)).toBe(
      NOTES_LIBRARY.files.get('components/nota.json'),
    );
    expect(await root.read(`${DIR}/docs/nota.md`)).toBe(
      NOTES_LIBRARY.files.get('docs/nota.md'),
    );
    const spec = JSON.parse((await root.read(SPEC_FILE)) ?? '{}') as { id: string };
    expect(spec.id).toBe('notas');
  });

  it('remover a especialização depois da primeira gravação apaga a pasta, como em qualquer biblioteca', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    session.actions.renameProject('Renomeado');
    await session.flush();
    expect((await opened.storage.listSpecDir(DIR)).length).toBe(3);

    expect(session.actions.removeSpecialization('notas', 'convert').ok).toBe(true);
    await settle();
    expect(await opened.storage.listSpecDir(DIR)).toEqual([]);
    expect(root.dirs.get('specs')?.dirs.has('notas') ?? false).toBe(false);
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('mapping inválido');
    expect(saved.project.specializations).toEqual([]);

    // Desfazer traz o pacote de volta (ele está no cache da sessão).
    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect((await opened.storage.listSpecDir(DIR)).length).toBe(3);
  });

  it('remover antes da primeira gravação não deixa pasta nem especialização no disco', async () => {
    const root = new MemoryDirectory('p');
    const opened = openMigrated(root);
    session = opened.session;
    expect(session.actions.removeSpecialization('notas', 'convert').ok).toBe(true);
    await settle();
    await session.flush();
    expect(await opened.storage.listSpecDir(DIR)).toEqual([]);
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('mapping inválido');
    expect(saved.project.specializations).toEqual([]);
  });
});
