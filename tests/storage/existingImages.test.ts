// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateProject } from '../../src/model';
import { importExistingImages } from '../../src/storage/existingImages';
import { createFolderStorage, findExistingImages } from '../../src/storage/folder';
import { emptyProject } from '../model/fixtures';
import { MemoryDirectory } from './memoryFs';

/** Tamanho fake: o conteúdo do arquivo é "LxA"; "ruim" não decodifica. */
async function readSize(data: Blob) {
  const text = await data.text();
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) throw new Error('decode');
  return { width: Number(match[1]), height: Number(match[2]) };
}

function ids() {
  let n = 0;
  return () => `I${++n}`;
}

describe('importExistingImages', () => {
  it('mantém as de images/, move as da raiz e posiciona sem sobrepor', async () => {
    const root = new MemoryDirectory('carro');
    root.put('images/frente.jpg', '400x300');
    root.put('lateral.jpg', '800x600');
    const storage = createFolderStorage(root);

    const images = await findExistingImages(root);
    const { project, skipped } = await importExistingImages(
      storage,
      emptyProject(),
      images,
      { readSize, newId: ids() },
    );

    expect(skipped).toEqual([]);
    expect(project.images.map((i) => [i.file, i.width, i.height])).toEqual([
      ['images/frente.jpg', 400, 300],
      ['images/lateral.jpg', 800, 600],
    ]);
    expect(validateProject(project)).toEqual([]);
    expect(await root.read('lateral.jpg')).toBeNull();
    expect(await root.read('images/lateral.jpg')).toBe('800x600');
  });

  it('renomeia na colisão e não sobrescreve imagem ilegível de images/', async () => {
    const root = new MemoryDirectory('carro');
    root.put('images/foto.jpg', '100x100');
    root.put('images/foto-2.jpg', 'ruim');
    root.put('foto.jpg', '200x100');
    const storage = createFolderStorage(root);

    const { project, skipped } = await importExistingImages(
      storage,
      emptyProject(),
      await findExistingImages(root),
      { readSize, newId: ids() },
    );

    expect(skipped).toEqual(['images/foto-2.jpg']);
    expect(project.images.map((i) => i.file)).toEqual([
      'images/foto.jpg',
      'images/foto-3.jpg',
    ]);
    expect(await root.read('images/foto-2.jpg')).toBe('ruim');
    expect(await root.read('images/foto-3.jpg')).toBe('200x100');
  });
});
