// @vitest-environment node
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addImage,
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
  let after = addImage(base, {
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

  it('um zip sem propostas continua abrindo', async () => {
    const read = await readProjectZip(await zipWith(new Map(), new Map()));
    if (!read.ok) throw new Error(read.error);
    expect(read.files.proposals.size).toBe(0);
    expect(read.files.proposalImages.size).toBe(0);
  });
});
