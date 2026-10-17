// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { MemoryDirectory } from '../storage/memoryFs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DIR = 'specs/material3';
const SPEC_FILE = `${DIR}/material3.spec.json`;

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

/** Pasta em memória com o rastro da ordem das gravações. */
function start(root: MemoryDirectory, calls: string[] = []) {
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
  return openSession({
    storage,
    project: sampleProject(),
    prepareImage: () => Promise.reject(new Error('sem imagens')),
    now: () => NOW,
    newId: ids(),
  });
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

describe('sessão com pacote de biblioteca', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('aplicar grava a pasta specs/<id>/ antes do mapping.json, com os bytes preservados', async () => {
    const root = new MemoryDirectory('p');
    const calls: string[] = [];
    session = start(root, calls);
    const files = material3Package();
    const font = new Uint8Array([0, 1, 2, 254, 255]);
    files.set('fonts/Roboto.ttf', new Blob([font]));
    expect(session.actions.applySpecialization(material3Spec(), files).ok).toBe(true);
    await settle();

    const project = deserialize((await root.read('mapping.json')) ?? '');
    if (!project.ok) throw new Error('mapping inválido');
    expect(project.project.specializations[0]?.file).toBe(SPEC_FILE);
    const onDisk = await createFolderStorage(root).listSpecDir(DIR);
    expect(onDisk).toHaveLength(files.size);
    expect(onDisk).toContain(SPEC_FILE);
    const ttf = await createFolderStorage(root).readSpecFile(`${DIR}/fonts/Roboto.ttf`);
    expect([...new Uint8Array((await ttf?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual(
      [...font],
    );
    // Os arquivos do pacote entram antes do mapping.json.
    const mappingAt = calls.indexOf('mapping');
    expect(mappingAt).toBeGreaterThan(0);
    expect(calls.slice(0, mappingAt)).toContain(`write ${DIR}/fonts/Roboto.ttf`);
    expect(calls.slice(mappingAt).some((c) => c.startsWith('write specs/'))).toBe(false);
    expect(
      session.libraryIssues.value.get('material3')?.filter((i) => i.severity === 'error'),
    ).toEqual([]);
  });

  it('reabrir lê o pacote: sem problemas no pacote íntegro; erro de nível 1 se faltar arquivo', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    await session.close();
    session = null;

    const storage = createFolderStorage(root);
    const ok = await loadProject(storage);
    if (!ok.ok) throw new Error('não abriu');
    expect(
      ok.libraryIssues.get('material3')?.filter((i) => i.severity === 'error'),
    ).toEqual([]);

    await storage.removeSpecDir(`${DIR}/components`);
    const broken = await loadProject(storage);
    if (!broken.ok) throw new Error('não abriu');
    const errors = broken.libraryIssues
      .get('material3')
      ?.filter((i) => i.severity === 'error');
    expect(errors?.length).toBeGreaterThan(0);
    expect(errors?.every((e) => e.file !== '' || e.message !== '')).toBe(true);
    // Abrir não bloqueia nem muda o projeto.
    expect(broken.project.specializations[0]?.file).toBe(SPEC_FILE);
  });

  it('atualizar a versão regrava a pasta inteira (sem os arquivos que a nova não tem)', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const v1 = { ...material3Spec(), version: 1 };
    const files = material3Package();
    files.set('docs/antigo.md', '# antigo');
    session.actions.applySpecialization(v1, files);
    await settle();
    const storage = createFolderStorage(root);
    expect(await storage.listSpecDir(DIR)).toContain(`${DIR}/docs/antigo.md`);

    const next = material3Package();
    next.set('docs/novo.md', '# novo');
    expect(
      session.actions.updateSpecialization({ ...v1, version: 2 }, undefined, next).ok,
    ).toBe(true);
    await settle();
    const after = await storage.listSpecDir(DIR);
    expect(after).toContain(`${DIR}/docs/novo.md`);
    expect(after).not.toContain(`${DIR}/docs/antigo.md`);
    expect(after).toContain(SPEC_FILE);

    // Desfazer a atualização traz o pacote da versão 1 de volta.
    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    const undone = await storage.listSpecDir(DIR);
    expect(undone).toContain(`${DIR}/docs/antigo.md`);
    expect(undone).not.toContain(`${DIR}/docs/novo.md`);
    const spec = JSON.parse((await root.read(SPEC_FILE)) ?? '{}') as { version: number };
    expect(spec.version).toBe(1);
  });

  it('remover apaga a pasta; desfazer a regrava e refazer apaga de novo', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    const storage = createFolderStorage(root);
    const before = await storage.listSpecDir(DIR);
    expect(before.length).toBeGreaterThan(5);

    expect(session.actions.removeSpecialization('material3', 'convert').ok).toBe(true);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual([]);
    expect(root.dirs.get('specs')?.dirs.has('material3')).toBe(false);

    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual(before);

    session.store.redo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual([]);
    expect(session.libraryIssues.value.size).toBe(0);
  });

  it('desfazer o aplicar remove a pasta e refazer a regrava', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    const storage = createFolderStorage(root);
    const before = await storage.listSpecDir(DIR);
    session.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual([]);
    session.store.redo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(await storage.listSpecDir(DIR)).toEqual(before);
  });

  it('collectFiles leva o pacote (specs com o arquivo da especialização, specAssets com o resto)', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const files = material3Package();
    files.set('fonts/Roboto.ttf', new Blob([new Uint8Array([5, 6, 7])]));
    session.actions.applySpecialization(material3Spec(), files);
    await settle();
    const collected = await session.collectFiles();
    expect([...collected.specs.keys()]).toEqual([SPEC_FILE]);
    const assets = [...(collected.specAssets?.keys() ?? [])];
    expect(assets).toContain(`${DIR}/fonts/Roboto.ttf`);
    expect(assets).toContain(`${DIR}/components/m3-button.json`);
    expect(assets).not.toContain(SPEC_FILE);
  });
});
