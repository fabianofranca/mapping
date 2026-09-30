// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize, serialize } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import type { PreparedImage } from '../../src/storage/imageImport';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** "Decodificador" fake: o conteúdo do arquivo é "LxA"; "ruim" falha. */
async function prepareImage(file: File): Promise<PreparedImage> {
  const text = await file.text();
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) throw new Error('decode');
  return {
    name: file.name,
    data: file,
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function start(root: MemoryDirectory, project = emptyProject(), readOnly = false) {
  return openSession({
    storage: createFolderStorage(root),
    project,
    readOnly,
    prepareImage,
    now: () => NOW,
    newId: ids(),
  });
}

async function savedProject(root: MemoryDirectory) {
  const text = await root.read('mapping.json');
  const parsed = deserialize(text ?? '');
  if (!parsed.ok) throw new Error(`mapping inválido: ${text}`);
  return parsed.project;
}

const file = (name: string, content: string) => new File([content], name);

describe('sessão de projeto', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('adiciona imagens: grava o arquivo, cria a entrada e salva o mapping após o debounce', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const result = await session.addImages([
      file('a.jpg', '400x300'),
      file('a.jpg', '100x100'),
    ]);

    expect(result).toEqual({ added: ['images/a.jpg', 'images/a-2.jpg'], failed: [] });
    expect(await root.read('images/a.jpg')).toBe('400x300');
    expect(await root.read('images/a-2.jpg')).toBe('100x100');
    expect(session.saveStatus.value).toBe('saving');
    expect(await root.read('mapping.json')).toBeNull();

    await vi.advanceTimersByTimeAsync(800);
    expect(session.saveStatus.value).toBe('saved');
    const saved = await savedProject(root);
    expect(saved.images.map((i) => [i.file, i.width, i.height])).toEqual([
      ['images/a.jpg', 400, 300],
      ['images/a-2.jpg', 100, 100],
    ]);
    // Cada imagem é uma entrada de desfazer.
    session.store.undo();
    expect(session.store.project.value?.images).toHaveLength(1);
  });

  it('informa as imagens que não puderam ser importadas', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const result = await session.addImages([
      file('ruim.jpg', 'ruim'),
      file('b.png', '8x8'),
    ]);
    expect(result).toEqual({ added: ['images/b.png'], failed: ['ruim.jpg'] });
    expect(await root.read('images/ruim.jpg')).toBeNull();
  });

  it('remove a imagem excluída só depois de salvar e a restaura no desfazer', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('a.jpg', '400x300')]);
    await session.flush();
    const imageId = session.store.project.value?.images[0]?.id ?? '';

    session.actions.removeImage(imageId);
    expect(await root.read('images/a.jpg')).toBe('400x300');
    await session.flush();
    expect(await root.read('images/a.jpg')).toBeNull();
    expect((await savedProject(root)).images).toEqual([]);
    // Enquanto isso, a sessão ainda consegue ler a imagem (para exibir no desfazer).
    expect(await (await session.readImage('images/a.jpg'))?.text()).toBe('400x300');

    session.store.undo();
    await session.flush();
    expect(await root.read('images/a.jpg')).toBe('400x300');
    expect((await savedProject(root)).images.map((i) => i.file)).toEqual([
      'images/a.jpg',
    ]);
  });

  it('com erro de gravação mostra o status e tenta de novo', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.renameProject('Outro nome');
    root.failWrites = new Error('sem permissão');
    await vi.advanceTimersByTimeAsync(800);
    expect(session.saveStatus.value).toBe('error');

    root.failWrites = null;
    await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect((await savedProject(root)).project.name).toBe('Outro nome');
  });

  it('não grava nada ao abrir, nem em modo somente leitura', async () => {
    const root = new MemoryDirectory('p');
    session = start(root, sampleProject(), true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await session.addImages([file('a.jpg', '10x10')])).toEqual({
      added: [],
      failed: ['a.jpg'],
    });
    await session.flush();
    expect(root.files.size).toBe(0);
    expect(root.dirs.size).toBe(0);
  });

  it('collectFiles grava o pendente e junta mapping e imagens existentes', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('a.jpg', '400x300')]);
    const files = await session.collectFiles();
    expect(files.mapping).toBe(await root.read('mapping.json'));
    expect(files.mapping).toBe(serialize(await savedProject(root)));
    expect([...files.images.keys()]).toEqual(['images/a.jpg']);
  });

  it('fechar grava o que estiver pendente', async () => {
    const root = new MemoryDirectory('p');
    const s = start(root);
    s.actions.renameProject('Fechado');
    await s.close();
    expect((await savedProject(root)).project.name).toBe('Fechado');
    expect(s.store.project.value).toBeNull();
  });
});
