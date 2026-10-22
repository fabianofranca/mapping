// @vitest-environment node
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addContainer,
  proposalFilePath,
  proposalImagePath,
  serialize,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProposals, readProposal } from '../../src/storage/loadProposals';
import {
  openLocalLibrary,
  type LocalLibrary,
  type LocalProjectStorage,
} from '../../src/storage/local';
import {
  isProposalFilePath,
  isProposalImagePath,
  isProposalPackagePath,
  proposalIdOfPath,
} from '../../src/storage/types';
import {
  readProjectZip,
  writeProjectZip,
  type ProjectFiles,
} from '../../src/storage/zip';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { MemoryDirectory } from './memoryFs';

/** Uma proposta com uma imagem nova e uma anotação nova, como o MCP a deixaria. */
function sampleProposal(id = 'P1', title = 'Teste'): Proposal {
  const base = sampleProject();
  let after = addContainer(base, {
    id: 'I3',
    file: 'images/nova.webp',
    width: 800,
    height: 600,
  });
  after = addAnnotation(after, {
    id: 'A9',
    markingId: 'M4',
    layerId: 'L1',
    name: 'Nova',
  });
  return propose(base, after, { id, title });
}

afterEach(() => clearReportedErrors());

describe('caminhos de proposta', () => {
  it('reconhece o proposal.json e as imagens de uma proposta', () => {
    expect(isProposalFilePath('proposals/P1/proposal.json')).toBe(true);
    expect(isProposalFilePath('proposals/P1/images/proposal.json')).toBe(false);
    expect(isProposalFilePath('proposals/.oculta/proposal.json')).toBe(false);
    expect(isProposalImagePath('proposals/P1/images/nova.webp')).toBe(true);
    expect(isProposalImagePath('proposals/P1/images/sub/nova.PNG')).toBe(true);
    expect(isProposalImagePath('proposals/P1/images/../../x.png')).toBe(false);
    expect(isProposalImagePath('proposals/P1/notas.txt')).toBe(false);
    expect(isProposalImagePath('images/nova.webp')).toBe(false);
    expect(proposalIdOfPath('proposals/P1/images/a.png')).toBe('P1');
    expect(proposalIdOfPath('proposals/../x.png')).toBeNull();
  });
});

describe('pasta: proposals/', () => {
  it('lista só as pastas válidas com proposal.json, lê, grava e carimba', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.listProposals()).toEqual([]);

    root.put(proposalFilePath('B'), 'b');
    root.put(proposalFilePath('A'), 'a');
    root.put('proposals/vazia/images/x.png', 'x');
    root.put('proposals/.git/proposal.json', 'oculta');
    root.put('proposals/solto.txt', 'solto');
    expect(await storage.listProposals()).toEqual(['A', 'B']);

    expect(await storage.readProposal('A')).toBe('a');
    expect(await storage.readProposal('Z')).toBeNull();
    const stamp = await storage.statProposal?.('A');
    expect(stamp).toMatch(/^1:\d+$/);
    expect(await storage.statProposal?.('Z')).toBeNull();

    await storage.writeProposal('A', 'novo');
    expect(await root.read(proposalFilePath('A'))).toBe('novo');
    expect(await storage.statProposal?.('A')).not.toBe(stamp);
    await storage.writeProposal('C', 'c');
    expect(await storage.listProposals()).toEqual(['A', 'B', 'C']);
  });

  it('as imagens da proposta usam o caminho completo e coexistem com images/', async () => {
    const storage = createFolderStorage(new MemoryDirectory('p'));
    const path = proposalImagePath('P1', 'images/nova.webp');
    expect(path).toBe('proposals/P1/images/nova.webp');
    await storage.writeImage(path, new Blob(['WEBP']));
    await storage.writeImage('images/nova.webp', new Blob(['FINAL']));
    expect(await (await storage.readImage(path))?.text()).toBe('WEBP');
    await storage.removeImage(path);
    expect(await storage.readImage(path)).toBeNull();
    expect(await (await storage.readImage('images/nova.webp'))?.text()).toBe('FINAL');
  });
});

describe('pasta: listProposalFiles (fase B4)', () => {
  it('lista tudo sob proposals/<id>/, recursivo e em ordem, só dessa proposta', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.listProposalFiles('A')).toEqual([]);
    root.put(proposalFilePath('A'), 'a');
    root.put('proposals/A/images/nova.webp', 'WEBP');
    root.put('proposals/A/specs/lib/m.spec.json', '{}');
    root.put('proposals/A/specs/lib/components/botao.json', '{}');
    root.put('proposals/A/specs/lib/fonts/f.ttf', 'F');
    root.put(proposalFilePath('A1'), 'a1');
    root.put('proposals/A1/specs/lib/outro.json', '{}');
    root.put('specs/lib/m.spec.json', '{}');

    expect(await storage.listProposalFiles('A')).toEqual([
      'proposals/A/images/nova.webp',
      'proposals/A/proposal.json',
      'proposals/A/specs/lib/components/botao.json',
      'proposals/A/specs/lib/fonts/f.ttf',
      'proposals/A/specs/lib/m.spec.json',
    ]);
    expect(await storage.listProposalFiles('B')).toEqual([]);
    const blob = await storage.readImage('proposals/A/specs/lib/fonts/f.ttf');
    expect(await blob?.text()).toBe('F');
  });

  it('recusa um id que apontaria para fora da pasta da proposta', async () => {
    const storage = createFolderStorage(new MemoryDirectory('p'));
    for (const bad of ['', '..', '.git', 'a/b']) {
      await expect(storage.listProposalFiles(bad)).rejects.toThrow('invalid proposal id');
    }
  });
});

describe('pasta: removeProposal (fase 9.2)', () => {
  it('apaga proposals/<id>/ inteira (proposal.json e imagens), só dela', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    root.put(proposalFilePath('A'), 'a');
    root.put('proposals/A/images/nova.webp', 'WEBP');
    root.put('proposals/A/images/sub/outra.png', 'PNG');
    root.put(proposalFilePath('B'), 'b');
    root.put('images/final.webp', 'FINAL');
    expect(await storage.listProposals()).toEqual(['A', 'B']);

    await storage.removeProposal('A');

    expect(await storage.listProposals()).toEqual(['B']);
    expect(root.dirs.get('proposals')?.dirs.has('A')).toBe(false);
    expect(await storage.readImage('proposals/A/images/nova.webp')).toBeNull();
    expect(await root.read(proposalFilePath('B'))).toBe('b');
    expect(await root.read('images/final.webp')).toBe('FINAL');
  });

  it('não falha se a proposta (ou a pasta proposals/) já não existe', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    await expect(storage.removeProposal('A')).resolves.toBeUndefined();
    root.put(proposalFilePath('B'), 'b');
    await expect(storage.removeProposal('A')).resolves.toBeUndefined();
    await storage.removeProposal('B');
    await expect(storage.removeProposal('B')).resolves.toBeUndefined();
  });

  it('recusa um id que apontaria para fora da pasta da proposta', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    root.put(proposalFilePath('A'), 'a');
    for (const bad of ['', '..', '.git', 'a/b']) {
      await expect(storage.removeProposal(bad)).rejects.toThrow('invalid proposal id');
    }
    expect(await storage.listProposals()).toEqual(['A']);
  });
});

describe('loadProposals', () => {
  it('lê as válidas, guarda o texto exato e separa as inválidas', async () => {
    const root = new MemoryDirectory('p');
    const good = sampleProposal('P1');
    const text = serializeProposal(good);
    root.put(proposalFilePath('P1'), text);
    root.put(proposalFilePath('quebrada'), '{ não é json');
    root.put(proposalFilePath('P2'), serializeProposal(sampleProposal('OUTRA')));
    const loaded = await loadProposals(createFolderStorage(root));

    expect(loaded.proposals.map((p) => p.proposal.id)).toEqual(['P1']);
    expect(loaded.proposals[0]?.text).toBe(text);
    expect(loaded.proposals[0]?.stamp).toMatch(/^\d+:\d+$/);
    expect(loaded.problems.map((p) => p.id).sort()).toEqual(['P2', 'quebrada']);
    expect(loaded.problems.find((p) => p.id === 'P2')?.errors[0]).toContain(
      'o nome da pasta',
    );
    expect(loaded.problemTexts?.get('quebrada')).toBe('{ não é json');
  });

  it('readProposal diferencia arquivo ausente de arquivo inválido', async () => {
    const root = new MemoryDirectory('p');
    root.put(proposalFilePath('X'), '[]');
    const storage = createFolderStorage(root);
    expect(await readProposal(storage, 'nada')).toMatchObject({
      ok: false,
      missing: true,
    });
    expect(await readProposal(storage, 'X')).toMatchObject({
      ok: false,
      missing: false,
    });
  });
});

describe('projeto local (IndexedDB)', () => {
  let library: LocalLibrary;
  beforeEach(async () => {
    const opened = await openLocalLibrary();
    if (!opened) throw new Error('IndexedDB indisponível');
    library = opened;
    for (const p of await library.list()) await library.remove(p.id);
  });
  afterEach(() => library.close());

  const files = (extra: Partial<ProjectFiles> = {}): ProjectFiles => ({
    mapping: serialize(sampleProject()),
    images: new Map(),
    specs: new Map(),
    proposals: new Map(),
    proposalImages: new Map(),
    ...extra,
  });

  it('guarda as propostas e as imagens que vieram no create, e apaga junto com o projeto', async () => {
    const text = serializeProposal(sampleProposal());
    await library.create(
      'a',
      files({
        proposals: new Map([[proposalFilePath('P1'), text]]),
        proposalImages: new Map([
          ['proposals/P1/images/nova.webp', new Blob(['WEBP'], { type: 'image/webp' })],
        ]),
      }),
      { unexported: false },
    );
    const storage: LocalProjectStorage = library.open('a');
    expect(await storage.listProposals()).toEqual(['P1']);
    expect(await storage.readProposal('P1')).toBe(text);
    expect(await storage.readProposal('P2')).toBeNull();
    const image = await storage.readImage('proposals/P1/images/nova.webp');
    expect(await image?.text()).toBe('WEBP');
    expect(image?.type).toBe('image/webp');

    await library.remove('a');
    await library.create('a', files());
    expect(await library.open('a').listProposals()).toEqual([]);
    expect(await library.open('a').readImage('proposals/P1/images/nova.webp')).toBeNull();
  });

  it('gravar uma proposta marca o projeto como não exportado', async () => {
    await library.create('a', files(), { unexported: false });
    expect((await library.get('a'))?.unexported).toBe(false);
    await library.open('a').writeProposal('P1', 'texto');
    expect((await library.get('a'))?.unexported).toBe(true);
    expect(await library.open('a').readProposal('P1')).toBe('texto');
  });

  it('removeProposal apaga o proposal.json e as imagens da proposta, só dela, e marca não exportado', async () => {
    await library.create(
      'a',
      files({
        proposals: new Map([
          [proposalFilePath('P1'), 'um'],
          [proposalFilePath('P2'), 'dois'],
        ]),
        proposalImages: new Map([
          ['proposals/P1/images/nova.webp', new Blob(['W1'], { type: 'image/webp' })],
          ['proposals/P1/images/sub/outra.png', new Blob(['P1'], { type: 'image/png' })],
          ['proposals/P2/images/nova.webp', new Blob(['W2'], { type: 'image/webp' })],
        ]),
        images: new Map([['images/final.jpg', new Blob(['F'], { type: 'image/jpeg' })]]),
      }),
      { unexported: false },
    );
    const storage = library.open('a');

    await storage.removeProposal('P1');

    expect(await storage.listProposals()).toEqual(['P2']);
    expect(await storage.readProposal('P1')).toBeNull();
    expect(await storage.readImage('proposals/P1/images/nova.webp')).toBeNull();
    expect(await storage.readImage('proposals/P1/images/sub/outra.png')).toBeNull();
    expect(await (await storage.readImage('proposals/P2/images/nova.webp'))?.text()).toBe(
      'W2',
    );
    expect(await (await storage.readImage('images/final.jpg'))?.text()).toBe('F');
    expect((await library.get('a'))?.unexported).toBe(true);
    // De novo, sem nada a apagar: não falha.
    await expect(storage.removeProposal('P1')).resolves.toBeUndefined();
  });

  it('removeProposal não confunde ids que começam igual (P1 e P10) e recusa id inválido', async () => {
    await library.create(
      'a',
      files({
        proposals: new Map([
          [proposalFilePath('P1'), 'um'],
          [proposalFilePath('P10'), 'dez'],
        ]),
      }),
    );
    const storage = library.open('a');
    await storage.removeProposal('P1');
    expect(await storage.listProposals()).toEqual(['P10']);
    await expect(storage.removeProposal('')).rejects.toThrow('invalid proposal id');
    await expect(storage.removeProposal('../x')).rejects.toThrow('invalid proposal id');
  });

  it('listProposalFiles lista tudo sob proposals/<id>/ em ordem, sem confundir P1 e P10', async () => {
    await library.create(
      'a',
      files({
        proposals: new Map([
          [proposalFilePath('P1'), 'um'],
          [proposalFilePath('P10'), 'dez'],
        ]),
        proposalImages: new Map([
          ['proposals/P1/specs/lib/fonts/f.ttf', new Blob(['F'])],
          ['proposals/P1/specs/lib/m.spec.json', new Blob(['{}'])],
          ['proposals/P10/specs/lib/outro.json', new Blob(['{}'])],
          ['proposals/P1/images/nova.webp', new Blob(['W'], { type: 'image/webp' })],
        ]),
        images: new Map([['images/final.jpg', new Blob(['F'], { type: 'image/jpeg' })]]),
      }),
    );
    const storage = library.open('a');
    expect(await storage.listProposalFiles('P1')).toEqual([
      'proposals/P1/images/nova.webp',
      'proposals/P1/proposal.json',
      'proposals/P1/specs/lib/fonts/f.ttf',
      'proposals/P1/specs/lib/m.spec.json',
    ]);
    expect(await storage.listProposalFiles('nada')).toEqual([]);
    expect(
      await (await storage.readImage('proposals/P1/specs/lib/fonts/f.ttf'))?.text(),
    ).toBe('F');
    await expect(storage.listProposalFiles('../x')).rejects.toThrow(
      'invalid proposal id',
    );
    await library.open('a').removeProposal('P1');
    expect(await storage.listProposalFiles('P1')).toEqual([]);
  });

  it('as propostas de um projeto não aparecem em outro', async () => {
    await library.create('a', files());
    await library.create('b', files());
    await library.open('a').writeProposal('P1', 'a');
    expect(await library.open('b').listProposals()).toEqual([]);
  });
});

describe('zip com propostas', () => {
  async function zipWith(proposals: Map<string, string>, images: Map<string, Blob>) {
    return writeProjectZip({
      mapping: serialize(sampleProject()),
      images: new Map([['images/lateral.jpg', new Blob(['L'], { type: 'image/jpeg' })]]),
      specs: new Map(),
      proposals,
      proposalImages: images,
    });
  }

  it('round-trip sem perdas: texto idêntico, decisões e notas incluídas, imagens e vários ids', async () => {
    const p1 = serializeProposal({
      ...sampleProposal('P1'),
      decisions: {
        c1: { state: 'accepted', at: '2026-10-09T12:30:00.000Z' },
        c2: { state: 'rejected', at: '2026-10-09T12:31:00.000Z' },
      },
      notes: [
        {
          id: 'n1',
          target: { level: 'change', id: 'c2' },
          text: 'Não, a anterior estava certa.',
          at: '2026-10-09T12:31:00.000Z',
        },
      ],
      revision: 7,
    });
    const p2 = serializeProposal(sampleProposal('P2', 'Segunda'));
    const proposals = new Map([
      [proposalFilePath('P1'), p1],
      [proposalFilePath('P2'), p2],
    ]);
    const images = new Map([
      ['proposals/P1/images/nova.webp', new Blob(['WEBP1'], { type: 'image/webp' })],
      ['proposals/P2/images/sub/outra.png', new Blob(['PNG2'], { type: 'image/png' })],
    ]);
    const read = await readProjectZip(await zipWith(proposals, images));
    if (!read.ok) throw new Error(read.error);

    expect(read.files.proposals).toEqual(proposals);
    expect([...read.files.proposalImages.keys()].sort()).toEqual([...images.keys()]);
    expect(
      await read.files.proposalImages.get('proposals/P1/images/nova.webp')?.text(),
    ).toBe('WEBP1');
    expect(read.files.proposalImages.get('proposals/P2/images/sub/outra.png')?.type).toBe(
      'image/png',
    );
    // As imagens do projeto e as das propostas não se misturam.
    expect([...read.files.images.keys()]).toEqual(['images/lateral.jpg']);

    // E escrever de novo dá o mesmo conteúdo.
    const again = await readProjectZip(await writeProjectZip({ ...read.files }));
    if (!again.ok) throw new Error(again.error);
    expect(again.files.proposals).toEqual(proposals);
    expect([...again.files.proposalImages.keys()].sort()).toEqual([...images.keys()]);
  });

  it('acha as propostas num zip feito a partir da pasta do projeto', async () => {
    const zip = new JSZip();
    zip.file('meu-projeto/mapping.json', serialize(sampleProject()));
    zip.file('meu-projeto/proposals/P1/proposal.json', 'texto');
    zip.file('meu-projeto/proposals/P1/images/nova.webp', 'WEBP');
    zip.file('meu-projeto/proposals/P1/rascunho.txt', 'ignorado');
    zip.file('outro/proposals/PX/proposal.json', 'de outra pasta');
    const read = await readProjectZip(
      new Blob([await zip.generateAsync({ type: 'arraybuffer' })]),
    );
    if (!read.ok) throw new Error(read.error);
    expect([...read.files.proposals]).toEqual([['proposals/P1/proposal.json', 'texto']]);
    expect([...read.files.proposalImages.keys()]).toEqual([
      'proposals/P1/images/nova.webp',
    ]);
  });

  it('depois de apagar a proposta, o zip exportado não a leva (pasta e projeto local)', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    root.put(proposalFilePath('P1'), serializeProposal(sampleProposal('P1')));
    root.put('proposals/P1/images/nova.webp', 'WEBP');
    root.put(proposalFilePath('P2'), serializeProposal(sampleProposal('P2', 'Outra')));
    await storage.removeProposal('P1');

    // A exportação lê o que a sessão lista (`collect`), que sai da pasta.
    const loaded = await loadProposals(storage);
    const proposals = new Map(
      loaded.proposals.map((p) => [proposalFilePath(p.proposal.id), p.text]),
    );
    const images = new Map<string, Blob>();
    const blob = await storage.readImage('proposals/P1/images/nova.webp');
    if (blob) images.set('proposals/P1/images/nova.webp', blob);
    const read = await readProjectZip(await zipWith(proposals, images));
    if (!read.ok) throw new Error(read.error);
    expect([...read.files.proposals.keys()]).toEqual([proposalFilePath('P2')]);
    expect(read.files.proposalImages.size).toBe(0);
  });

  it('round-trip dos arquivos de pacote de biblioteca em proposals/<id>/specs/ (inclusive binário)', async () => {
    const font = new Uint8Array([0, 1, 2, 254, 255]);
    const files = new Map([
      ['proposals/P1/images/nova.webp', new Blob(['W'], { type: 'image/webp' })],
      ['proposals/P1/specs/lib/m.spec.json', new Blob(['{"a":1}'])],
      ['proposals/P1/specs/lib/components/botao.json', new Blob(['{}'])],
      ['proposals/P1/specs/lib/fonts/f.ttf', new Blob([font])],
    ]);
    const proposals = new Map([[proposalFilePath('P1'), 'texto']]);
    const read = await readProjectZip(await zipWith(proposals, files));
    if (!read.ok) throw new Error(read.error);
    expect([...read.files.proposalImages.keys()].sort()).toEqual(
      [...files.keys()].sort(),
    );
    const ttf = read.files.proposalImages.get('proposals/P1/specs/lib/fonts/f.ttf');
    expect([...new Uint8Array((await ttf?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual(
      [...font],
    );
    expect(
      await read.files.proposalImages.get('proposals/P1/specs/lib/m.spec.json')?.text(),
    ).toBe('{"a":1}');
    // Os arquivos da proposta não vazam para os pacotes do projeto.
    expect(read.files.specAssets).toBeUndefined();
    expect(read.files.specs.size).toBe(0);

    const again = await readProjectZip(await writeProjectZip({ ...read.files }));
    if (!again.ok) throw new Error(again.error);
    expect([...again.files.proposalImages.keys()].sort()).toEqual(
      [...files.keys()].sort(),
    );
  });

  it('só lê arquivos de pacote de proposta com id e caminho válidos', async () => {
    const zip = new JSZip();
    zip.file('mapping.json', serialize(sampleProject()));
    zip.file('proposals/P1/specs/lib/ok.json', '{}');
    zip.file('proposals/P1/specs/solto.json', '{}');
    zip.file('proposals/P1/specs/lib/../fora.json', '{}');
    zip.file('proposals/.git/specs/lib/x.json', '{}');
    zip.file('proposals/P1/outra/lib/x.json', '{}');
    const read = await readProjectZip(
      new Blob([await zip.generateAsync({ type: 'arraybuffer' })]),
    );
    if (!read.ok) throw new Error(read.error);
    expect([...read.files.proposalImages.keys()]).toEqual([
      'proposals/P1/specs/lib/ok.json',
    ]);
    expect(isProposalPackagePath('proposals/P1/specs/lib/fonts/f.ttf')).toBe(true);
    expect(isProposalPackagePath('proposals/P1/specs/lib')).toBe(false);
    // O JSZip já normaliza `.`, `//` e `..` ao montar o zip; o filtro cobre quem os traga.
    for (const bad of [
      'proposals/P1/specs/lib/../x.json',
      'proposals/P1/specs/./lib/x.json',
      'proposals/P1/specs//lib/x.json',
      'proposals/P1/specs/lib\\x.json',
      'proposals/../specs/lib/x.json',
    ]) {
      expect(isProposalPackagePath(bad)).toBe(false);
    }
    expect(isProposalPackagePath('specs/lib/a.json')).toBe(false);
  });

  it('um zip sem propostas continua abrindo', async () => {
    const read = await readProjectZip(await zipWith(new Map(), new Map()));
    if (!read.ok) throw new Error(read.error);
    expect(read.files.proposals.size).toBe(0);
    expect(read.files.proposalImages.size).toBe(0);
  });
});
