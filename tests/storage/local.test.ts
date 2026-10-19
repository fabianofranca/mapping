// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  imageFileNames,
  migrations,
  referencedSpecFiles,
  serialize,
  specFiles,
} from '../../src/model';
import {
  MAX_LOCAL_BACKUPS,
  openFolderLibrary,
  openLocalLibrary,
  type FolderLibrary,
  type LocalLibrary,
} from '../../src/storage/local';
import { readProjectZip, writeProjectZip } from '../../src/storage/zip';
import { emptyProject, sampleProject } from '../model/fixtures';
import { cadastroProject } from '../model/specFixtures';
import { keepDirectoriesInClone, PermissionDirectory } from './memoryFs';

let library: LocalLibrary;

beforeEach(async () => {
  const opened = await openLocalLibrary();
  if (!opened) throw new Error('IndexedDB indisponível');
  library = opened;
  for (const p of await library.list()) await library.remove(p.id);
});

afterEach(() => library.close());

const noImages = new Map<string, Blob>();
const noSpecs = new Map<string, string>();

describe('LocalLibrary (IndexedDB)', () => {
  // Etapa 8 (8.4), R10: `list()` não ordena (a ordem da tela inicial é a de
  // `recentProjects`, pelo último uso). Este teste fixava a ordem por `updatedAt`, que ninguém
  // usava; agora compara como conjunto.
  it('cria, lista e lê o mapping', async () => {
    const a = serialize(emptyProject());
    const b = serialize({
      ...sampleProject(),
      project: {
        ...sampleProject().project,
        name: 'B',
        updatedAt: '2027-01-01T00:00:00.000Z',
      },
    });
    await library.create('a', {
      mapping: a,
      images: noImages,
      specs: noSpecs,
      proposals: noSpecs,
      proposalImages: noImages,
    });
    await library.create(
      'b',
      {
        mapping: b,
        images: noImages,
        specs: noSpecs,
        proposals: noSpecs,
        proposalImages: noImages,
      },
      { unexported: false },
    );

    const list = await library.list();
    expect(list.map((p) => [p.id, p.name, p.unexported])).toEqual(
      expect.arrayContaining([
        ['b', 'B', false],
        ['a', 'Teste', true],
      ]),
    );
    expect(list).toHaveLength(2);
    expect(await library.open('a').loadMapping()).toBe(a);
  });

  it('list() devolve na ordem do banco, sem ordenar por updatedAt', async () => {
    const files = (name: string, updatedAt: string) => ({
      mapping: serialize({
        ...emptyProject(),
        project: { ...emptyProject().project, name, updatedAt },
      }),
      images: noImages,
      specs: noSpecs,
      proposals: noSpecs,
      proposalImages: noImages,
    });
    // Chaves em ordem alfabética (a ordem do IndexedDB); datas na ordem contrária.
    await library.create('a', files('A', '2026-01-01T00:00:00.000Z'));
    await library.create('b', files('B', '2027-01-01T00:00:00.000Z'));
    expect((await library.list()).map((p) => p.id)).toEqual(['a', 'b']);
    expect(library.open('a').copyId).toBe('a');
  });

  it('salvar o mapping atualiza nome, data e marca como não exportado', async () => {
    await library.create(
      'p',
      {
        mapping: serialize(emptyProject()),
        images: noImages,
        specs: noSpecs,
        proposals: noSpecs,
        proposalImages: noImages,
      },
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
      openedAt: expect.any(String),
    });
    await library.setUnexported('p', false);
    expect((await library.get('p'))?.unexported).toBe(false);
  });

  it('grava, lê e remove imagens separadas por projeto', async () => {
    const mapping = serialize(emptyProject());
    await library.create('p1', {
      mapping,
      images: noImages,
      specs: noSpecs,
      proposals: noSpecs,
      proposalImages: noImages,
    });
    await library.create('p2', {
      mapping,
      images: noImages,
      specs: noSpecs,
      proposals: noSpecs,
      proposalImages: noImages,
    });
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
      specs: new Map([['specs/sdui.json', '{}']]),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    await library.remove('p');
    expect(await library.list()).toEqual([]);
    expect(await library.open('p').loadMapping()).toBeNull();
    expect(await library.open('p').readImage('images/a.jpg')).toBeNull();
    expect(await library.open('p').readSpec('specs/sdui.json')).toBeNull();
    await expect(library.open('p').saveMapping(mapping)).rejects.toThrow();
  });

  it('grava, lê e remove as cópias de specs/', async () => {
    await library.create('p', {
      mapping: serialize(emptyProject()),
      images: noImages,
      specs: noSpecs,
      proposals: noSpecs,
      proposalImages: noImages,
    });
    const storage = library.open('p');
    expect(await storage.readSpec('specs/sdui.json')).toBeNull();
    await storage.writeSpec('specs/sdui.json', '{"id":"sdui"}\n');
    expect(await storage.readSpec('specs/sdui.json')).toBe('{"id":"sdui"}\n');
    await storage.removeSpec('specs/sdui.json');
    expect(await storage.readSpec('specs/sdui.json')).toBeNull();
  });

  it('lista, lê, grava e remove os arquivos de uma pasta de pacote (e marca não exportado)', async () => {
    await library.create(
      'p',
      {
        mapping: serialize(emptyProject()),
        images: noImages,
        specs: noSpecs,
        proposals: noSpecs,
        proposalImages: noImages,
      },
      { unexported: false },
    );
    const storage = library.open('p');
    expect(await storage.listSpecDir('specs/m3')).toEqual([]);
    expect(await storage.readSpecFile('specs/m3/fonts/R.ttf')).toBeNull();
    await storage.removeSpecDir('specs/m3');
    expect((await library.get('p'))?.unexported).toBe(false);

    const bytes = new Uint8Array([0, 255, 128, 7]);
    await storage.writeSpecFile('specs/m3/fonts/R.ttf', new Blob([bytes]));
    expect((await library.get('p'))?.unexported).toBe(true);
    await library.setUnexported('p', false);
    await storage.writeSpecFile('specs/m3/components/b.json', '{"b":1}');
    await storage.writeSpec('specs/m3/m3.spec.json', '{"id":"m3"}\n');
    await storage.writeSpec('specs/outra.json', '{}');
    // Outro projeto com o mesmo caminho não aparece.
    await library.create('q', {
      mapping: serialize(emptyProject()),
      images: noImages,
      specs: new Map([['specs/m3/intruso.json', '{}']]),
      proposals: noSpecs,
      proposalImages: noImages,
    });
    expect(await storage.listSpecDir('specs/m3')).toEqual([
      'specs/m3/components/b.json',
      'specs/m3/fonts/R.ttf',
      'specs/m3/m3.spec.json',
    ]);
    const read = await storage.readSpecFile('specs/m3/fonts/R.ttf');
    expect([
      ...new Uint8Array((await read?.arrayBuffer()) ?? new ArrayBuffer(0)),
    ]).toEqual([...bytes]);
    expect(await storage.readSpec('specs/m3/m3.spec.json')).toBe('{"id":"m3"}\n');

    await library.setUnexported('p', false);
    await storage.removeSpecFile('specs/m3/fonts/R.ttf');
    expect((await library.get('p'))?.unexported).toBe(true);
    expect(await storage.readSpecFile('specs/m3/fonts/R.ttf')).toBeNull();
    await library.setUnexported('p', false);
    await storage.removeSpecFile('specs/m3/fonts/R.ttf'); // já não existe: nada muda
    expect((await library.get('p'))?.unexported).toBe(false);
    await storage.removeSpecDir('specs/m3');
    expect((await library.get('p'))?.unexported).toBe(true);
    expect(await storage.listSpecDir('specs/m3')).toEqual([]);
    expect(await storage.readSpec('specs/outra.json')).toBe('{}');
    expect(await library.open('q').listSpecDir('specs/m3')).toEqual([
      'specs/m3/intruso.json',
    ]);
  });

  it('recusa caminhos fora de specs/ ou com ..', async () => {
    await library.create('p', {
      mapping: serialize(emptyProject()),
      images: noImages,
      specs: noSpecs,
      proposals: noSpecs,
      proposalImages: noImages,
    });
    const storage = library.open('p');
    await expect(storage.writeSpecFile('specs/../mapping.json', 'x')).rejects.toThrow();
    await expect(storage.writeSpecFile('images/a.png', 'x')).rejects.toThrow();
    await expect(storage.readSpecFile('/specs/m3/a.json')).rejects.toThrow();
    await expect(storage.listSpecDir('images')).rejects.toThrow();
    await expect(storage.removeSpecDir('specs')).rejects.toThrow();
  });

  it('o pacote importado do zip (specAssets) fica no projeto local e volta no zip', async () => {
    const font = new Uint8Array([9, 8, 7, 255]);
    await library.create('p', {
      mapping: serialize(emptyProject()),
      images: noImages,
      specs: new Map([['specs/m3/m3.spec.json', '{"id":"m3"}\n']]),
      specAssets: new Map([
        ['specs/m3/components/a.json', new Blob(['{"a":1}'])],
        ['specs/m3/fonts/R.ttf', new Blob([font])],
      ]),
      proposals: noSpecs,
      proposalImages: noImages,
    });
    const storage = library.open('p');
    expect(await storage.listSpecDir('specs/m3')).toEqual([
      'specs/m3/components/a.json',
      'specs/m3/fonts/R.ttf',
      'specs/m3/m3.spec.json',
    ]);
    const ttf = await storage.readSpecFile('specs/m3/fonts/R.ttf');
    expect([...new Uint8Array((await ttf?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual(
      [...font],
    );
  });

  it('round-trip: zip → IndexedDB → zip com o mesmo conteúdo, inclusive specs/', async () => {
    const project = cadastroProject();
    const mapping = serialize(project);
    const specs = specFiles(project);
    const images = new Map([
      ['images/cadastro.png', new Blob(['CADASTRO'], { type: 'image/png' })],
      ['images/frente.jpg', new Blob(['FRENTE'], { type: 'image/jpeg' })],
      ['images/lateral.jpg', new Blob(['LATERAL'], { type: 'image/jpeg' })],
    ]);
    const zip = await writeProjectZip({
      mapping,
      images,
      specs,
      proposals: new Map(),
      proposalImages: new Map(),
    });

    const read = await readProjectZip(zip);
    if (!read.ok) throw new Error(read.error);
    await library.create('importado', read.files, { unexported: false });

    const storage = library.open('importado');
    const loaded = await storage.loadMapping();
    const readSpecs = new Map<string, string>();
    for (const file of referencedSpecFiles(loaded ?? '')) {
      readSpecs.set(file, (await storage.readSpec(file)) ?? '');
    }
    const parsed = deserialize(loaded ?? '', migrations, readSpecs);
    if (!parsed.ok) throw new Error(parsed.error.code);
    const exported = new Map<string, Blob>();
    for (const file of imageFileNames(parsed.project.images)) {
      const blob = await storage.readImage(file);
      if (blob) exported.set(file, blob);
    }
    const again = await readProjectZip(
      await writeProjectZip({
        mapping: serialize(parsed.project),
        images: exported,
        specs: specFiles(parsed.project),
        proposals: new Map(),
        proposalImages: new Map(),
      }),
    );
    if (!again.ok) throw new Error(again.error);
    expect(parsed.specWarnings).toEqual([]);
    expect(parsed.project).toEqual(project);
    expect(again.files.mapping).toBe(mapping);
    expect(again.files.specs).toEqual(specs);
    expect([...again.files.specs.keys()].sort()).toEqual([
      'specs/modelo-dados.json',
      'specs/sdui.json',
    ]);
    expect(await again.files.images.get('images/cadastro.png')?.text()).toBe('CADASTRO');
  });

  describe('backups do mapping (antes de migrar)', () => {
    const create = (id: string) =>
      library.create(id, {
        mapping: serialize(emptyProject()),
        images: noImages,
        specs: noSpecs,
        proposals: noSpecs,
        proposalImages: noImages,
      });

    it(`guarda só os ${MAX_LOCAL_BACKUPS} mais recentes, por projeto`, async () => {
      await create('p');
      await create('q');
      const storage = library.open('p');
      // Fora de ordem e com versões diferentes: vale o carimbo de data.
      await storage.writeBackup('mapping.v2.20260103-000000.json', 'c');
      await storage.writeBackup('mapping.v1.20260101-000000.json', 'a');
      await storage.writeBackup('mapping.v3.20260104-000000.json', 'd');
      await storage.writeBackup('mapping.v1.20260102-000000.json', 'b');
      await library.open('q').writeBackup('mapping.v1.20250101-000000.json', 'q');

      expect(await library.listBackups('p')).toEqual([
        'mapping.v3.20260104-000000.json',
        'mapping.v2.20260103-000000.json',
        'mapping.v1.20260102-000000.json',
      ]);
      expect(await library.listBackups('q')).toEqual(['mapping.v1.20250101-000000.json']);
      // Os backups não mexem no mapping nem nas imagens.
      expect(await storage.loadMapping()).toBe(serialize(emptyProject()));
    });

    it('somem ao excluir o projeto', async () => {
      await create('p');
      await library.open('p').writeBackup('mapping.v1.20260101-000000.json', 'a');
      await library.remove('p');
      expect(await library.listBackups('p')).toEqual([]);
    });
  });

  it('markOpened guarda a última abertura sem mexer no resto', async () => {
    await library.create('p', {
      mapping: serialize(emptyProject()),
      images: noImages,
      specs: noSpecs,
      proposals: noSpecs,
      proposalImages: noImages,
    });
    const before = await library.get('p');
    await library.markOpened('p', '2026-10-12T10:00:00.000Z');
    await library.markOpened('nao-existe', '2026-10-12T10:00:00.000Z');
    expect(await library.get('p')).toEqual({
      ...before,
      openedAt: '2026-10-12T10:00:00.000Z',
    });
    expect(await library.list()).toHaveLength(1);
  });

  it('criar (ou importar um zip) conta como uso: grava openedAt de agora e mantém a data do mapping (G2)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
      const p = emptyProject();
      await library.create(
        'zip',
        {
          mapping: serialize({
            ...p,
            project: { ...p.project, updatedAt: '2026-10-09T09:00:00.000Z' },
          }),
          images: noImages,
          specs: noSpecs,
          proposals: noSpecs,
          proposalImages: noImages,
        },
        { unexported: false },
      );
      expect(await library.get('zip')).toMatchObject({
        updatedAt: '2026-10-09T09:00:00.000Z',
        openedAt: '2026-10-12T10:00:00.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('FolderLibrary (recentes de pasta)', () => {
  let folders: FolderLibrary;

  beforeEach(async () => {
    vi.stubGlobal('structuredClone', keepDirectoriesInClone());
    const opened = await openFolderLibrary();
    if (!opened) throw new Error('IndexedDB indisponível');
    folders = opened;
    for (const f of await folders.list()) await folders.remove(f.id);
  });

  afterEach(() => {
    folders.close();
    vi.unstubAllGlobals();
  });

  it('guarda handle, nome do projeto, nome da pasta e data; a lista não traz handles', async () => {
    const a = new PermissionDirectory('a');
    const b = new PermissionDirectory('b');
    const idA = await folders.remember(a, { name: 'A', usedAt: '2026-10-01T00:00:00Z' });
    await folders.remember(b, { name: 'B', usedAt: '2026-10-02T00:00:00Z' });
    const list = await folders.list();
    expect(list.map((f) => [f.name, f.folderName])).toEqual([
      ['B', 'b'],
      ['A', 'a'],
    ]);
    expect(list[1]).toEqual({
      id: idA,
      name: 'A',
      folderName: 'a',
      usedAt: '2026-10-01T00:00:00Z',
    });
    expect(await folders.handle(idA)).toBe(a);
    expect(await folders.handle('nao-existe')).toBeNull();
  });

  it('a mesma pasta (isSameEntry) atualiza a entrada em vez de duplicar', async () => {
    const a = new PermissionDirectory('a');
    const id = await folders.remember(a, { name: 'A', usedAt: '2026-10-01T00:00:00Z' });
    const again = await folders.remember(a, {
      name: 'A2',
      usedAt: '2026-10-03T00:00:00Z',
    });
    expect(again).toBe(id);
    expect((await folders.list()).map((f) => [f.id, f.name, f.usedAt])).toEqual([
      [id, 'A2', '2026-10-03T00:00:00Z'],
    ]);
  });

  it('um handle guardado que falha no isSameEntry não impede guardar outro', async () => {
    const broken = new PermissionDirectory('velha');
    vi.spyOn(broken, 'isSameEntry').mockRejectedValue(
      new DOMException('', 'NotFoundError'),
    );
    await folders.remember(broken, { name: 'V', usedAt: '2026-10-01T00:00:00Z' });
    // Mesmo nome de pasta: o handle guardado é comparado (e falha).
    await folders.remember(new PermissionDirectory('velha'), {
      name: 'N',
      usedAt: '2026-10-02T00:00:00Z',
    });
    expect(await folders.list()).toHaveLength(2);
  });

  it('replaceId: a entrada passa a apontar para a pasta localizada', async () => {
    const old = new PermissionDirectory('antiga');
    const id = await folders.remember(old, { name: 'P', usedAt: '2026-10-01T00:00:00Z' });
    const moved = new PermissionDirectory('movida');
    expect(
      await folders.remember(moved, { name: 'P', usedAt: '2026-10-02T00:00:00Z' }, id),
    ).toBe(id);
    expect((await folders.list()).map((f) => [f.id, f.folderName])).toEqual([
      [id, 'movida'],
    ]);
  });

  it('replaceId de uma pasta que já estava na lista junta as duas entradas', async () => {
    const a = new PermissionDirectory('a');
    const b = new PermissionDirectory('b');
    const idA = await folders.remember(a, { name: 'A', usedAt: '2026-10-01T00:00:00Z' });
    const idB = await folders.remember(b, { name: 'B', usedAt: '2026-10-02T00:00:00Z' });
    expect(
      await folders.remember(b, { name: 'B', usedAt: '2026-10-03T00:00:00Z' }, idA),
    ).toBe(idB);
    expect((await folders.list()).map((f) => f.id)).toEqual([idB]);
  });

  it('touch atualiza nome e data; remove tira da lista', async () => {
    const id = await folders.remember(new PermissionDirectory('a'), {
      name: 'A',
      usedAt: '2026-10-01T00:00:00Z',
    });
    await folders.touch(id, { name: 'Renomeado', usedAt: '2026-10-05T00:00:00Z' });
    await folders.touch('nao-existe', { name: 'X', usedAt: '2026-10-05T00:00:00Z' });
    expect((await folders.list()).map((f) => [f.name, f.usedAt])).toEqual([
      ['Renomeado', '2026-10-05T00:00:00Z'],
    ]);
    await folders.remove(id);
    expect(await folders.list()).toEqual([]);
    expect(await folders.handle(id)).toBeNull();
  });
});
