// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFolderStorage, findExistingImages } from '../../src/storage/folder';
import { MemoryDirectory } from './memoryFs';

describe('FolderStorage', () => {
  it('lê null quando não há mapping.json e grava na raiz', async () => {
    const root = new MemoryDirectory('projeto');
    const storage = createFolderStorage(root);
    expect(storage.kind).toBe('folder');
    expect(await storage.loadMapping()).toBeNull();
    await storage.saveMapping('{"a":1}\n');
    expect(await storage.loadMapping()).toBe('{"a":1}\n');
    await storage.saveMapping('{"a":2}\n');
    expect(await root.read('mapping.json')).toBe('{"a":2}\n');
  });

  it('grava, lê e remove imagens criando a pasta images/', async () => {
    const root = new MemoryDirectory('projeto');
    const storage = createFolderStorage(root);
    await storage.writeImage('images/a.jpg', new Blob(['AAA']));
    expect(root.dirs.has('images')).toBe(true);
    expect(await (await storage.readImage('images/a.jpg'))?.text()).toBe('AAA');
    await storage.removeImage('images/a.jpg');
    expect(await storage.readImage('images/a.jpg')).toBeNull();
    // Remover de novo (ou numa pasta inexistente) não falha.
    await storage.removeImage('images/a.jpg');
    await storage.removeImage('outra/b.jpg');
  });

  it('rejeita caminhos com ..', async () => {
    const storage = createFolderStorage(new MemoryDirectory('projeto'));
    await expect(storage.writeImage('../fora.jpg', new Blob(['x']))).rejects.toThrow();
  });

  it('propaga erro de escrita', async () => {
    const root = new MemoryDirectory('projeto');
    root.failWrites = new Error('disco cheio');
    await expect(createFolderStorage(root).saveMapping('{}')).rejects.toThrow(
      'disco cheio',
    );
  });

  it('encontra imagens em images/ e na raiz, ignorando outros arquivos', async () => {
    const root = new MemoryDirectory('projeto');
    root.put('images/b.png', 'b');
    root.put('images/a.JPG', 'a');
    root.put('images/notas.txt', 'x');
    root.put('raiz.jpeg', 'r');
    root.put('leia-me.md', 'x');
    root.put('outra/c.jpg', 'c');
    expect(await findExistingImages(root)).toEqual([
      { path: 'images/a.JPG', name: 'a.JPG' },
      { path: 'images/b.png', name: 'b.png' },
      { path: 'raiz.jpeg', name: 'raiz.jpeg' },
    ]);
  });
});
