// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../../src/model';
import { openLocalLibrary, type LocalLibrary } from '../../src/storage/local';
import { readProjectZip, writeProjectZip } from '../../src/storage/zip';
import { emptyProject, sampleProject } from '../model/fixtures';

let library: LocalLibrary;

beforeEach(async () => {
  const opened = await openLocalLibrary();
  if (!opened) throw new Error('IndexedDB indisponível');
  library = opened;
  for (const p of await library.list()) await library.remove(p.id);
});

afterEach(() => library.close());

const noImages = new Map<string, Blob>();

describe('LocalLibrary (IndexedDB)', () => {
  it('cria, lista (mais recente primeiro) e lê o mapping', async () => {
    const a = serialize(emptyProject());
    const b = serialize({
      ...sampleProject(),
      project: {
        ...sampleProject().project,
        name: 'B',
        updatedAt: '2027-01-01T00:00:00.000Z',
      },
    });
    await library.create('a', { mapping: a, images: noImages });
    await library.create('b', { mapping: b, images: noImages }, { unexported: false });

    const list = await library.list();
    expect(list.map((p) => [p.id, p.name, p.unexported])).toEqual([
      ['b', 'B', false],
      ['a', 'Teste', true],
    ]);
    expect(await library.open('a').loadMapping()).toBe(a);
  });

  it('salvar o mapping atualiza nome, data e marca como não exportado', async () => {
    await library.create(
      'p',
      { mapping: serialize(emptyProject()), images: noImages },
      {
        unexported: false,
      },
    );
    const storage = library.open('p');
    const renamed = {
      ...emptyProject(),
      project: {
        ...emptyProject().project,
        name: 'Novo',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    };
    await storage.saveMapping(serialize(renamed));
    expect(await library.get('p')).toEqual({
      id: 'p',
      name: 'Novo',
      updatedAt: '2026-10-01T00:00:00.000Z',
      unexported: true,
    });
    await library.setUnexported('p', false);
    expect((await library.get('p'))?.unexported).toBe(false);
  });

  it('grava, lê e remove imagens separadas por projeto', async () => {
    const mapping = serialize(emptyProject());
    await library.create('p1', { mapping, images: noImages });
    await library.create('p2', { mapping, images: noImages });
    const s1 = library.open('p1');
    await s1.writeImage('images/a.jpg', new Blob(['A1'], { type: 'image/jpeg' }));
    await library.open('p2').writeImage('images/a.jpg', new Blob(['A2']));

    const read = await s1.readImage('images/a.jpg');
    expect(await read?.text()).toBe('A1');
    expect(read?.type).toBe('image/jpeg');
    await s1.removeImage('images/a.jpg');
    expect(await s1.readImage('images/a.jpg')).toBeNull();
    expect(await (await library.open('p2').readImage('images/a.jpg'))?.text()).toBe('A2');
  });

  it('excluir apaga o projeto e as imagens dele', async () => {
    const mapping = serialize(emptyProject());
    await library.create('p', {
      mapping,
      images: new Map([['images/a.jpg', new Blob(['A'])]]),
    });
    await library.remove('p');
    expect(await library.list()).toEqual([]);
    expect(await library.open('p').loadMapping()).toBeNull();
    expect(await library.open('p').readImage('images/a.jpg')).toBeNull();
    await expect(library.open('p').saveMapping(mapping)).rejects.toThrow();
  });

  it('round-trip: zip → IndexedDB → zip com o mesmo conteúdo', async () => {
    const project = sampleProject();
    const mapping = serialize(project);
    const images = new Map([
      ['images/lateral.jpg', new Blob(['LATERAL'], { type: 'image/jpeg' })],
      ['images/frente.jpg', new Blob(['FRENTE'], { type: 'image/jpeg' })],
    ]);
    const zip = await writeProjectZip({ mapping, images });

    const read = await readProjectZip(zip);
    if (!read.ok) throw new Error(read.error);
    await library.create('importado', read.files, { unexported: false });

    const storage = library.open('importado');
    const loaded = await storage.loadMapping();
    const parsed = deserialize(loaded ?? '');
    if (!parsed.ok) throw new Error(parsed.error.code);
    const exported = new Map<string, Blob>();
    for (const image of parsed.project.images) {
      const blob = await storage.readImage(image.file);
      if (blob) exported.set(image.file, blob);
    }
    const again = await readProjectZip(
      await writeProjectZip({ mapping: serialize(parsed.project), images: exported }),
    );
    if (!again.ok) throw new Error(again.error);
    expect(again.files.mapping).toBe(mapping);
    expect(await again.files.images.get('images/frente.jpg')?.text()).toBe('FRENTE');
    expect(await again.files.images.get('images/lateral.jpg')?.text()).toBe('LATERAL');
  });
});
