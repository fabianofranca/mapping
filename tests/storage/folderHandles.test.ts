// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import {
  countingDirectory,
  createFolderCalls,
  type FolderCallKind,
} from '../../src/storage/folderCalls';
import { MemoryDirectory } from './memoryFs';

function setup(latencyMs = 0) {
  const root = new MemoryDirectory('projeto');
  root.latencyMs = latencyMs;
  const calls = createFolderCalls();
  const storage = createFolderStorage(countingDirectory(root, calls));
  /** Quantas chamadas de cada tipo `fn` fez (só os tipos pedidos). */
  const measure = async (kinds: FolderCallKind[], fn: () => Promise<unknown>) => {
    const before = kinds.map((kind) => calls.byKind[kind]);
    await fn();
    return Object.fromEntries(
      kinds.map((kind, i) => [kind, calls.byKind[kind] - (before[i] ?? 0)]),
    );
  };
  return { root, calls, storage, measure };
}

const DIRS_AND_FILES: FolderCallKind[] = [
  'getDirectoryHandle',
  'getFileHandle',
  'getFile',
];

describe('handles de pasta guardados', () => {
  it('ler duas vezes proposals/P1/proposal.json resolve cada pasta uma vez só', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'um');
    const first = await measure(DIRS_AND_FILES, () => storage.readProposal('P1'));
    const second = await measure(DIRS_AND_FILES, () => storage.readProposal('P1'));
    expect(first).toEqual({ getDirectoryHandle: 2, getFileHandle: 1, getFile: 1 });
    expect(second).toEqual({ getDirectoryHandle: 0, getFileHandle: 1, getFile: 1 });
  });

  it('guarda também as pastas intermediárias (a/b/c guarda a, a/b e a/b/c)', async () => {
    const { root, storage, measure } = setup();
    root.put('specs/p/sub/x.json', 'x');
    root.put('specs/p/sub/y.json', 'y');
    root.put('specs/p/z.json', 'z');
    await storage.readSpecFile('specs/p/sub/x.json');
    expect(
      await measure(['getDirectoryHandle'], () =>
        storage.readSpecFile('specs/p/sub/y.json'),
      ),
    ).toEqual({ getDirectoryHandle: 0 });
    expect(
      await measure(['getDirectoryHandle'], () => storage.readSpecFile('specs/p/z.json')),
    ).toEqual({ getDirectoryHandle: 0 });
  });

  it('pasta apagada e recriada por fora: a leitura repete a partir da raiz e acha o arquivo novo', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'velho');
    expect(await storage.readProposal('P1')).toBe('velho');
    root.removeAt('proposals/P1');
    root.put('proposals/P1/proposal.json', 'novo');
    let text: string | null = null;
    const counts = await measure(DIRS_AND_FILES, async () => {
      text = await storage.readProposal('P1');
    });
    expect(text).toBe('novo');
    // O handle guardado falhou (1 getFileHandle) e a raiz foi percorrida de novo
    // (2 getDirectoryHandle + 1 getFileHandle): é a prova de que havia cache.
    expect(counts).toEqual({ getDirectoryHandle: 2, getFileHandle: 2, getFile: 1 });
  });

  it('pasta de pacote apagada por fora: writeSpecFile recria a pasta e a gravação vale', async () => {
    const { root, storage } = setup();
    await storage.writeSpecFile('specs/s1/a.json', 'um');
    root.removeAt('specs/s1');
    await storage.writeSpecFile('specs/s1/a.json', 'dois');
    expect(await root.read('specs/s1/a.json')).toBe('dois');
    expect(await (await storage.readSpecFile('specs/s1/a.json'))?.text()).toBe('dois');
  });

  it('as remoções de pasta limpam o mapa antes: gravar de novo recria sem falha nem repetição', async () => {
    const { root, storage, measure } = setup();
    await storage.writeProposal('P1', 'um');
    await storage.removeProposal('P1');
    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    const counts = await measure(DIRS_AND_FILES, () =>
      storage.writeProposal('P1', 'dois'),
    );
    // `proposals` continua guardada; só P1 é aberta (criada), sem getFileHandle falho.
    expect(counts).toEqual({ getDirectoryHandle: 1, getFileHandle: 1, getFile: 0 });
    expect(await root.read('proposals/P1/proposal.json')).toBe('dois');

    await storage.writeSpecFile('specs/s1/sub/a.json', 'x');
    await storage.removeSpecDir('specs/s1');
    const specCounts = await measure(DIRS_AND_FILES, () =>
      storage.writeSpecFile('specs/s1/sub/a.json', 'y'),
    );
    expect(specCounts).toEqual({ getDirectoryHandle: 2, getFileHandle: 1, getFile: 0 });
    expect(await root.read('specs/s1/sub/a.json')).toBe('y');
  });

  it('duas chamadas simultâneas à mesma pasta abrem-na uma vez só', async () => {
    const { root, storage, measure } = setup(2);
    root.put('proposals/P1/proposal.json', 'um');
    const counts = await measure(['getDirectoryHandle'], () =>
      Promise.all([storage.readProposal('P1'), storage.readProposal('P1')]),
    );
    expect(counts).toEqual({ getDirectoryHandle: 2 });
  });

  it('pasta inexistente devolve null e não guarda nada', async () => {
    const { root, storage, measure } = setup();
    root.put('specs/outra/a.json', 'a');
    expect(await storage.readSpecFile('specs/nada/x.json')).toBeNull();
    // `specs` ficou guardada e `nada` não. O "não existe" veio de um pai guardado, então a
    // chamada confere repetindo desde a raiz (specs + nada = 2 chamadas, além da tentativa).
    expect(
      await measure(['getDirectoryHandle'], () =>
        storage.readSpecFile('specs/nada/x.json'),
      ),
    ).toEqual({ getDirectoryHandle: 3 });
    root.put('specs/nada/x.json', 'agora existe');
    expect(await (await storage.readSpecFile('specs/nada/x.json'))?.text()).toBe(
      'agora existe',
    );
  });

  it('arquivo que nunca existiu numa pasta recém-resolvida custa o mínimo (sem repetição)', async () => {
    const { root, storage, measure } = setup();
    root.put('specs/p/a.json', 'a');
    const counts = await measure(DIRS_AND_FILES, () =>
      storage.readSpecFile('specs/p/falta.json'),
    );
    expect(counts).toEqual({ getDirectoryHandle: 2, getFileHandle: 1, getFile: 0 });
  });

  it('um erro que não é NotFound/TypeMismatch não repete', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'um');
    await storage.readProposal('P1');
    const p1 = root.dirs.get('proposals')?.dirs.get('P1');
    if (!p1) throw new Error('setup');
    const spy = vi.spyOn(p1, 'getFileHandle').mockRejectedValue(new Error('disco'));
    let error: unknown;
    const counts = await measure(['getDirectoryHandle'], async () => {
      error = await storage.readProposal('P1').catch((e: unknown) => e);
    });
    expect((error as Error).message).toBe('disco');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(counts).toEqual({ getDirectoryHandle: 0 });
  });

  it('listProposals e listFiles começam do handle guardado', async () => {
    const { root, storage, measure } = setup();
    root.put('proposals/P1/proposal.json', 'um');
    root.put('proposals/P1/img/a.png', 'a');
    await storage.readProposal('P1');
    expect(await measure(['getDirectoryHandle'], () => storage.listProposals())).toEqual({
      getDirectoryHandle: 0,
    });
    let files: string[] = [];
    const counts = await measure(['getDirectoryHandle'], async () => {
      files = await storage.listProposalFiles('P1');
    });
    expect(files).toEqual(['proposals/P1/img/a.png', 'proposals/P1/proposal.json']);
    expect(counts).toEqual({ getDirectoryHandle: 0 });
  });

  it('pasta guardada apagada por fora: a listagem repete a partir da raiz', async () => {
    const { root, storage } = setup();
    root.put('proposals/P1/proposal.json', 'um');
    expect(await storage.listProposals()).toEqual(['P1']);
    root.removeAt('proposals');
    root.put('proposals/P2/proposal.json', 'dois');
    expect(await storage.listProposals()).toEqual(['P2']);
  });
});

describe('loadMappingStamped e o carimbo depois de gravar', () => {
  it('uma chamada custa 1 getFile e devolve texto e lastModified do mesmo File', async () => {
    const { root, storage, measure } = setup();
    root.put('mapping.json', '{"a":1}');
    let stamped: { text: string; lastModified: number } | null = null;
    const counts = await measure(DIRS_AND_FILES, async () => {
      stamped = (await storage.loadMappingStamped?.()) ?? null;
    });
    expect(counts).toEqual({ getDirectoryHandle: 0, getFileHandle: 1, getFile: 1 });
    expect(stamped).toEqual({
      text: '{"a":1}',
      lastModified: root.modified.get('mapping.json'),
    });
  });

  it('devolve null quando o mapping.json não existe', async () => {
    const { storage } = setup();
    expect(await storage.loadMappingStamped?.()).toBeNull();
  });

  it('saveMapping seguido de statMapping não resolve o caminho de novo', async () => {
    const { root, storage, measure } = setup();
    await storage.saveMapping('{"a":1}');
    let stamp: number | null = null;
    const counts = await measure(DIRS_AND_FILES, async () => {
      stamp = (await storage.statMapping?.()) ?? null;
    });
    expect(counts).toEqual({ getDirectoryHandle: 0, getFileHandle: 0, getFile: 1 });
    expect(stamp).toBe(root.modified.get('mapping.json'));
  });

  it('arquivo apagado e recriado por fora: o carimbo repete a partir da raiz', async () => {
    const { root, storage } = setup();
    await storage.saveMapping('{"a":1}');
    root.files.delete('mapping.json');
    expect(await storage.statMapping?.()).toBeNull();
    root.put('mapping.json', '{"a":2}');
    expect(await storage.statMapping?.()).toBe(root.modified.get('mapping.json'));
    expect((await storage.loadMappingStamped?.())?.text).toBe('{"a":2}');
  });
});
