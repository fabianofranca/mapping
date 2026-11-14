// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateProject } from '../../src/model';
import { importExistingImages } from '../../src/storage/existingImages';
import { createFolderStorage, findExistingImages } from '../../src/storage/folder';
import { emptyProject } from '../model/fixtures';
import { reportedErrors } from '../../src/utils/report';
import { MemoryDirectory } from './memoryFs';

/** Fake size: the file content is "WxH"; "bad" does not decode. */
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
  it('keeps the ones in images/, moves the ones in the root and positions without overlapping', async () => {
    const root = new MemoryDirectory('car');
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
    expect(project.containers.map((i) => [i.file, i.width, i.height])).toEqual([
      ['images/frente.jpg', 400, 300],
      ['images/lateral.jpg', 800, 600],
    ]);
    expect(validateProject(project)).toEqual([]);
    expect(await root.read('lateral.jpg')).toBeNull();
    expect(await root.read('images/lateral.jpg')).toBe('800x600');
  });

  it('renames on collision and does not overwrite an unreadable image in images/', async () => {
    const root = new MemoryDirectory('car');
    root.put('images/photo.jpg', '100x100');
    root.put('images/photo-2.jpg', 'bad');
    root.put('photo.jpg', '200x100');
    const storage = createFolderStorage(root);

    const { project, skipped } = await importExistingImages(
      storage,
      emptyProject(),
      await findExistingImages(root),
      { readSize, newId: ids() },
    );

    expect(skipped).toEqual(['images/photo-2.jpg']);
    expect(project.containers.map((i) => i.file)).toEqual([
      'images/photo.jpg',
      'images/photo-3.jpg',
    ]);
    expect(await root.read('images/photo-2.jpg')).toBe('bad');
    expect(await root.read('images/photo-3.jpg')).toBe('200x100');
  });

  it('the collision ignores case: a root photo.jpg does not land on top of images/Photo.jpg', async () => {
    const root = new MemoryDirectory('car');
    root.put('images/Photo.jpg', '100x100');
    root.put('photo.jpg', '200x100');
    const storage = createFolderStorage(root);

    const { project, skipped } = await importExistingImages(
      storage,
      emptyProject(),
      await findExistingImages(root),
      { readSize, newId: ids() },
    );

    expect(skipped).toEqual([]);
    expect(project.containers.map((i) => i.file)).toEqual([
      'images/Photo.jpg',
      'images/photo-2.jpg',
    ]);
    expect(await root.read('images/Photo.jpg')).toBe('100x100');
    expect(await root.read('images/photo-2.jpg')).toBe('200x100');
  });

  it('removeImage fails after writeImage: the container comes in with the copy, the failure goes to Diagnostics and is not "skipped"', async () => {
    const root = new MemoryDirectory('car');
    root.put('photo.jpg', '200x100');
    root.put('photo-2.jpg', '10x10');
    const storage = createFolderStorage(root);
    const failing = {
      ...storage,
      removeImage: async (path: string) => {
        if (path === 'photo.jpg') throw new Error('no permission');
        return storage.removeImage(path);
      },
    };
    const before = reportedErrors.value.length;

    const { project, skipped } = await importExistingImages(
      failing,
      emptyProject(),
      await findExistingImages(root),
      { readSize, newId: ids() },
    );

    expect(skipped).toEqual([]);
    expect(project.containers.map((i) => i.file).sort()).toEqual([
      'images/photo-2.jpg',
      'images/photo.jpg',
    ]);
    expect(await root.read('images/photo.jpg')).toBe('200x100');
    expect(await root.read('photo.jpg')).toBe('200x100');
    expect(reportedErrors.value.slice(before).map((e) => e.context)).toContain(
      'folder.importExisting.remove',
    );
  });
});
