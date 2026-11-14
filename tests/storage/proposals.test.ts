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
import { countingDirectory, createFolderCalls } from '../../src/storage/folderCalls';
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
import type { DirectoryHandleLike, FileHandleLike } from '../../src/storage/folder';
import { MemoryDirectory } from './memoryFs';

/** A proposal with a new image and a new annotation, as the MCP would leave it. */
function sampleProposal(id = 'P1', title = 'Test'): Proposal {
  const base = sampleProject();
  let after = addContainer(base, {
    id: 'I3',
    file: 'images/new.webp',
    width: 800,
    height: 600,
  });
  after = addAnnotation(after, {
    id: 'A9',
    markingId: 'M4',
    layerId: 'L1',
    name: 'New',
  });
  return propose(base, after, { id, title });
}

/**
 * The folder with a file whose `getFile` fails with an error that is not "does not exist" (a cloud
 * client holding the file): the rest of the folder stays readable.
 */
function failingGetFile(root: MemoryDirectory, failing: string): DirectoryHandleLike {
  const wrapFile = (handle: FileHandleLike, dirName: string): FileHandleLike =>
    dirName === failing
      ? { ...handle, getFile: () => Promise.reject(new Error('arquivo em uso')) }
      : handle;
  const wrapDir = (dir: DirectoryHandleLike): DirectoryHandleLike => ({
    ...dir,
    getDirectoryHandle: async (name, options) =>
      wrapDir(await dir.getDirectoryHandle(name, options)),
    getFileHandle: async (name, options) =>
      wrapFile(await dir.getFileHandle(name, options), dir.name),
    values: async function* () {
      for await (const entry of dir.values()) {
        yield entry.kind === 'directory' ? wrapDir(entry) : wrapFile(entry, dir.name);
      }
    },
  });
  return wrapDir(root);
}

afterEach(() => clearReportedErrors());

describe('proposal paths', () => {
  it('recognizes the proposal.json and the images of a proposal', () => {
    expect(isProposalFilePath('proposals/P1/proposal.json')).toBe(true);
    expect(isProposalFilePath('proposals/P1/images/proposal.json')).toBe(false);
    expect(isProposalFilePath('proposals/.oculta/proposal.json')).toBe(false);
    expect(isProposalImagePath('proposals/P1/images/new.webp')).toBe(true);
    expect(isProposalImagePath('proposals/P1/images/sub/new.PNG')).toBe(true);
    expect(isProposalImagePath('proposals/P1/images/../../x.png')).toBe(false);
    expect(isProposalImagePath('proposals/P1/notas.txt')).toBe(false);
    expect(isProposalImagePath('images/new.webp')).toBe(false);
    expect(proposalIdOfPath('proposals/P1/images/a.png')).toBe('P1');
    expect(proposalIdOfPath('proposals/../x.png')).toBeNull();
  });
});

describe('folder: proposals/', () => {
  it('lists only the valid folders with proposal.json, reads, writes and stamps', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.listProposals()).toEqual([]);

    root.put(proposalFilePath('B'), 'b');
    root.put(proposalFilePath('A'), 'a');
    root.put('proposals/empty/images/x.png', 'x');
    root.put('proposals/.git/proposal.json', 'oculta');
    root.put('proposals/loose.txt', 'loose');
    expect(await storage.listProposals()).toEqual(['A', 'B']);

    expect(await storage.readProposal('A')).toBe('a');
    expect(await storage.readProposal('Z')).toBeNull();
    const stamp = await storage.statProposal?.('A');
    expect(stamp).toMatch(/^1:\d+$/);
    expect(await storage.statProposal?.('Z')).toBeNull();

    await storage.writeProposal('A', 'new');
    expect(await root.read(proposalFilePath('A'))).toBe('new');
    expect(await storage.statProposal?.('A')).not.toBe(stamp);
    await storage.writeProposal('C', 'c');
    expect(await storage.listProposals()).toEqual(['A', 'B', 'C']);
  });

  it('stampProposals stamps all the valid folders in a single step (decision 9, stage #1777)', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.stampProposals?.()).toEqual(new Map());

    root.put(proposalFilePath('B'), 'bb');
    root.put(proposalFilePath('A'), 'a');
    root.put('proposals/empty/images/x.png', 'x');
    root.put('proposals/.git/proposal.json', 'oculta');
    root.put('proposals/loose.txt', 'loose');
    const stamps = await storage.stampProposals?.();
    // As in `listProposals`, the folder without `proposal.json` (`empty`) is left out, and so are `.git` and the
    // loose file.
    expect([...(stamps ?? [])]).toEqual([
      ['A', await storage.statProposal?.('A')],
      ['B', await storage.statProposal?.('B')],
    ]);
    expect(stamps?.get('A')).toMatch(/^1:\d+$/);
    expect(stamps?.get('B')).toMatch(/^2:\d+$/);
  });

  it('stampProposals does not check the ids to skip (they come back with null) and makes far fewer calls', async () => {
    const root = new MemoryDirectory('p');
    for (const id of ['A', 'B', 'C']) root.put(proposalFilePath(id), id);
    const calls = createFolderCalls();
    const counted = createFolderStorage(countingDirectory(root, calls));
    const all = await counted.stampProposals?.();
    const full = calls.total;
    const partial = await counted.stampProposals?.(new Set(['A', 'B']));
    expect([...(partial ?? [])]).toEqual([
      ['A', null],
      ['B', null],
      ['C', all?.get('C')],
    ]);
    expect(calls.total - full).toBeLessThan(full);
  });

  it('an unreadable proposal.json (an error that is not "does not exist") does not break the scan', async () => {
    const root = new MemoryDirectory('p');
    for (const id of ['A', 'B']) root.put(proposalFilePath(id), id);
    const storage = createFolderStorage(failingGetFile(root, 'A'));
    const stamps = await storage.stampProposals?.();
    // `A` is still present (the scan re-reads it), and the stamp of `B` comes as usual.
    expect([...(stamps ?? [])]).toEqual([
      ['A', null],
      ['B', await createFolderStorage(root).statProposal?.('B')],
    ]);
  });

  it('the proposal images use the full path and coexist with images/', async () => {
    const storage = createFolderStorage(new MemoryDirectory('p'));
    const path = proposalImagePath('P1', 'images/new.webp');
    expect(path).toBe('proposals/P1/images/new.webp');
    await storage.writeImage(path, new Blob(['WEBP']));
    await storage.writeImage('images/new.webp', new Blob(['FINAL']));
    expect(await (await storage.readImage(path))?.text()).toBe('WEBP');
    await storage.removeImage(path);
    expect(await storage.readImage(path)).toBeNull();
    expect(await (await storage.readImage('images/new.webp'))?.text()).toBe('FINAL');
  });
});

describe('folder: listProposalFiles (phase B4)', () => {
  it('lists everything under proposals/<id>/, recursively and in order, only from that proposal', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.listProposalFiles('A')).toEqual([]);
    root.put(proposalFilePath('A'), 'a');
    root.put('proposals/A/images/new.webp', 'WEBP');
    root.put('proposals/A/specs/lib/m.spec.json', '{}');
    root.put('proposals/A/specs/lib/components/botao.json', '{}');
    root.put('proposals/A/specs/lib/fonts/f.ttf', 'F');
    root.put(proposalFilePath('A1'), 'a1');
    root.put('proposals/A1/specs/lib/other.json', '{}');
    root.put('specs/lib/m.spec.json', '{}');

    expect(await storage.listProposalFiles('A')).toEqual([
      'proposals/A/images/new.webp',
      'proposals/A/proposal.json',
      'proposals/A/specs/lib/components/botao.json',
      'proposals/A/specs/lib/fonts/f.ttf',
      'proposals/A/specs/lib/m.spec.json',
    ]);
    expect(await storage.listProposalFiles('B')).toEqual([]);
    const blob = await storage.readImage('proposals/A/specs/lib/fonts/f.ttf');
    expect(await blob?.text()).toBe('F');
  });

  it('refuses an id that would point outside the proposal folder', async () => {
    const storage = createFolderStorage(new MemoryDirectory('p'));
    for (const bad of ['', '..', '.git', 'a/b']) {
      await expect(storage.listProposalFiles(bad)).rejects.toThrow('invalid proposal id');
    }
  });
});

describe('folder: removeProposal (phase 9.2)', () => {
  it('deletes the whole proposals/<id>/ (proposal.json and images), only its own', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    root.put(proposalFilePath('A'), 'a');
    root.put('proposals/A/images/new.webp', 'WEBP');
    root.put('proposals/A/images/sub/outra.png', 'PNG');
    root.put(proposalFilePath('B'), 'b');
    root.put('images/final.webp', 'FINAL');
    expect(await storage.listProposals()).toEqual(['A', 'B']);

    await storage.removeProposal('A');

    expect(await storage.listProposals()).toEqual(['B']);
    expect(root.dirs.get('proposals')?.dirs.has('A')).toBe(false);
    expect(await storage.readImage('proposals/A/images/new.webp')).toBeNull();
    expect(await root.read(proposalFilePath('B'))).toBe('b');
    expect(await root.read('images/final.webp')).toBe('FINAL');
  });

  it('does not fail if the proposal (or the proposals/ folder) no longer exists', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    await expect(storage.removeProposal('A')).resolves.toBeUndefined();
    root.put(proposalFilePath('B'), 'b');
    await expect(storage.removeProposal('A')).resolves.toBeUndefined();
    await storage.removeProposal('B');
    await expect(storage.removeProposal('B')).resolves.toBeUndefined();
  });

  it('refuses an id that would point outside the proposal folder', async () => {
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
  it('reads the valid ones, keeps the exact text and separates the invalid ones', async () => {
    const root = new MemoryDirectory('p');
    const good = sampleProposal('P1');
    const text = serializeProposal(good);
    root.put(proposalFilePath('P1'), text);
    root.put(proposalFilePath('broken'), '{ not json');
    root.put(proposalFilePath('P2'), serializeProposal(sampleProposal('OUTRA')));
    const loaded = await loadProposals(createFolderStorage(root));

    expect(loaded.proposals.map((p) => p.proposal.id)).toEqual(['P1']);
    expect(loaded.proposals[0]?.text).toBe(text);
    expect(loaded.proposals[0]?.stamp).toMatch(/^\d+:\d+$/);
    expect(loaded.problems.map((p) => p.id).sort()).toEqual(['P2', 'broken']);
    expect(loaded.problems.find((p) => p.id === 'P2')?.errors[0]).toContain(
      'the folder name',
    );
    expect(loaded.problemTexts?.get('broken')).toBe('{ not json');
  });

  it('readProposal tells a missing file from an invalid file', async () => {
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

describe('local project (IndexedDB)', () => {
  let library: LocalLibrary;
  beforeEach(async () => {
    const opened = await openLocalLibrary();
    if (!opened) throw new Error('IndexedDB unavailable');
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

  it('stores the proposals and the images that came in create, and deletes them along with the project', async () => {
    const text = serializeProposal(sampleProposal());
    await library.create(
      'a',
      files({
        proposals: new Map([[proposalFilePath('P1'), text]]),
        proposalImages: new Map([
          ['proposals/P1/images/new.webp', new Blob(['WEBP'], { type: 'image/webp' })],
        ]),
      }),
      { unexported: false },
    );
    const storage: LocalProjectStorage = library.open('a');
    expect(await storage.listProposals()).toEqual(['P1']);
    expect(await storage.readProposal('P1')).toBe(text);
    expect(await storage.readProposal('P2')).toBeNull();
    const image = await storage.readImage('proposals/P1/images/new.webp');
    expect(await image?.text()).toBe('WEBP');
    expect(image?.type).toBe('image/webp');

    await library.remove('a');
    await library.create('a', files());
    expect(await library.open('a').listProposals()).toEqual([]);
    expect(await library.open('a').readImage('proposals/P1/images/new.webp')).toBeNull();
  });

  it('writing a proposal marks the project as not exported', async () => {
    await library.create('a', files(), { unexported: false });
    expect((await library.get('a'))?.unexported).toBe(false);
    await library.open('a').writeProposal('P1', 'texto');
    expect((await library.get('a'))?.unexported).toBe(true);
    expect(await library.open('a').readProposal('P1')).toBe('texto');
  });

  it('removeProposal deletes the proposal.json and the proposal images, only its own, and marks not exported', async () => {
    await library.create(
      'a',
      files({
        proposals: new Map([
          [proposalFilePath('P1'), 'um'],
          [proposalFilePath('P2'), 'dois'],
        ]),
        proposalImages: new Map([
          ['proposals/P1/images/new.webp', new Blob(['W1'], { type: 'image/webp' })],
          ['proposals/P1/images/sub/outra.png', new Blob(['P1'], { type: 'image/png' })],
          ['proposals/P2/images/new.webp', new Blob(['W2'], { type: 'image/webp' })],
        ]),
        images: new Map([['images/final.jpg', new Blob(['F'], { type: 'image/jpeg' })]]),
      }),
      { unexported: false },
    );
    const storage = library.open('a');

    await storage.removeProposal('P1');

    expect(await storage.listProposals()).toEqual(['P2']);
    expect(await storage.readProposal('P1')).toBeNull();
    expect(await storage.readImage('proposals/P1/images/new.webp')).toBeNull();
    expect(await storage.readImage('proposals/P1/images/sub/outra.png')).toBeNull();
    expect(await (await storage.readImage('proposals/P2/images/new.webp'))?.text()).toBe(
      'W2',
    );
    expect(await (await storage.readImage('images/final.jpg'))?.text()).toBe('F');
    expect((await library.get('a'))?.unexported).toBe(true);
    // Again, with nothing to delete: does not fail.
    await expect(storage.removeProposal('P1')).resolves.toBeUndefined();
  });

  it('removeProposal does not mix up ids that start the same (P1 and P10) and refuses an invalid id', async () => {
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
          ['proposals/P10/specs/lib/other.json', new Blob(['{}'])],
          ['proposals/P1/images/new.webp', new Blob(['W'], { type: 'image/webp' })],
        ]),
        images: new Map([['images/final.jpg', new Blob(['F'], { type: 'image/jpeg' })]]),
      }),
    );
    const storage = library.open('a');
    expect(await storage.listProposalFiles('P1')).toEqual([
      'proposals/P1/images/new.webp',
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

  it('the proposals of one project do not show up in another', async () => {
    await library.create('a', files());
    await library.create('b', files());
    await library.open('a').writeProposal('P1', 'a');
    expect(await library.open('b').listProposals()).toEqual([]);
  });
});

describe('zip with proposals', () => {
  async function zipWith(proposals: Map<string, string>, images: Map<string, Blob>) {
    return writeProjectZip({
      mapping: serialize(sampleProject()),
      images: new Map([['images/lateral.jpg', new Blob(['L'], { type: 'image/jpeg' })]]),
      specs: new Map(),
      proposals,
      proposalImages: images,
    });
  }

  it('lossless round-trip: identical text, decisions and notes included, images and several ids', async () => {
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
          text: 'No, the previous one was right.',
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
      ['proposals/P1/images/new.webp', new Blob(['WEBP1'], { type: 'image/webp' })],
      ['proposals/P2/images/sub/outra.png', new Blob(['PNG2'], { type: 'image/png' })],
    ]);
    const read = await readProjectZip(await zipWith(proposals, images));
    if (!read.ok) throw new Error(read.error);

    expect(read.files.proposals).toEqual(proposals);
    expect([...read.files.proposalImages.keys()].sort()).toEqual([...images.keys()]);
    expect(
      await read.files.proposalImages.get('proposals/P1/images/new.webp')?.text(),
    ).toBe('WEBP1');
    expect(read.files.proposalImages.get('proposals/P2/images/sub/outra.png')?.type).toBe(
      'image/png',
    );
    // The project images and the proposal ones do not mix.
    expect([...read.files.images.keys()]).toEqual(['images/lateral.jpg']);

    // And writing again gives the same content.
    const again = await readProjectZip(await writeProjectZip({ ...read.files }));
    if (!again.ok) throw new Error(again.error);
    expect(again.files.proposals).toEqual(proposals);
    expect([...again.files.proposalImages.keys()].sort()).toEqual([...images.keys()]);
  });

  it('finds the proposals in a zip made from the project folder', async () => {
    const zip = new JSZip();
    zip.file('my-project/mapping.json', serialize(sampleProject()));
    zip.file('my-project/proposals/P1/proposal.json', 'texto');
    zip.file('my-project/proposals/P1/images/new.webp', 'WEBP');
    zip.file('my-project/proposals/P1/rascunho.txt', 'ignorado');
    zip.file('other/proposals/PX/proposal.json', 'from another folder');
    const read = await readProjectZip(
      new Blob([await zip.generateAsync({ type: 'arraybuffer' })]),
    );
    if (!read.ok) throw new Error(read.error);
    expect([...read.files.proposals]).toEqual([['proposals/P1/proposal.json', 'texto']]);
    expect([...read.files.proposalImages.keys()]).toEqual([
      'proposals/P1/images/new.webp',
    ]);
  });

  it('after deleting the proposal, the exported zip does not carry it (folder and local project)', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    root.put(proposalFilePath('P1'), serializeProposal(sampleProposal('P1')));
    root.put('proposals/P1/images/new.webp', 'WEBP');
    root.put(proposalFilePath('P2'), serializeProposal(sampleProposal('P2', 'Outra')));
    await storage.removeProposal('P1');

    // The export reads what the session lists (`collect`), which comes from the folder.
    const loaded = await loadProposals(storage);
    const proposals = new Map(
      loaded.proposals.map((p) => [proposalFilePath(p.proposal.id), p.text]),
    );
    const images = new Map<string, Blob>();
    const blob = await storage.readImage('proposals/P1/images/new.webp');
    if (blob) images.set('proposals/P1/images/new.webp', blob);
    const read = await readProjectZip(await zipWith(proposals, images));
    if (!read.ok) throw new Error(read.error);
    expect([...read.files.proposals.keys()]).toEqual([proposalFilePath('P2')]);
    expect(read.files.proposalImages.size).toBe(0);
  });

  it('round-trip of the library package files in proposals/<id>/specs/ (binary included)', async () => {
    const font = new Uint8Array([0, 1, 2, 254, 255]);
    const files = new Map([
      ['proposals/P1/images/new.webp', new Blob(['W'], { type: 'image/webp' })],
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
    // The proposal files do not leak into the project packages.
    expect(read.files.specAssets).toBeUndefined();
    expect(read.files.specs.size).toBe(0);

    const again = await readProjectZip(await writeProjectZip({ ...read.files }));
    if (!again.ok) throw new Error(again.error);
    expect([...again.files.proposalImages.keys()].sort()).toEqual(
      [...files.keys()].sort(),
    );
  });

  it('only reads proposal package files with a valid id and path', async () => {
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
    // JSZip already normalizes `.`, `//` and `..` when building the zip; the filter covers whoever brings them.
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
