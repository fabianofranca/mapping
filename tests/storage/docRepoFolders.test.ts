// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDocFolderAccess,
  normalizeRepoUrl,
  type DocFolderAccess,
  type DocFolderStore,
} from '../../src/storage/docRepoFolders';
import { keepDirectoriesInClone, PermissionDirectory } from './memoryFs';

const REPO = 'https://gitlab.empresa.com/grupo/design-docs';

function folderWith(files: Record<string, string>): PermissionDirectory {
  const dir = new PermissionDirectory('design-docs');
  for (const [path, text] of Object.entries(files)) dir.put(path, text);
  return dir;
}

/** Deps com um seletor que devolve sempre a pasta dada. */
function accessFor(
  dir: PermissionDirectory,
  openStore?: () => Promise<DocFolderStore | null>,
) {
  return createDocFolderAccess({
    picker: async () => dir,
    ...(openStore === undefined ? {} : { openStore }),
  });
}

beforeEach(() => {
  vi.stubGlobal('structuredClone', keepDirectoriesInClone());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('normalizeRepoUrl', () => {
  it('apara espaços e tira a barra final e o sufixo .git', () => {
    expect(normalizeRepoUrl(`  ${REPO}  `)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}/`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}.git`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}.git/`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}/.git`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}//`)).toBe(REPO);
  });

  it('não mexe numa url já normal', () => {
    expect(normalizeRepoUrl(REPO)).toBe(REPO);
  });
});

describe('docFolderAccess: leitura', () => {
  it('pasta conectada e arquivo presente: found com o texto', async () => {
    const access = accessFor(folderWith({ 'components/button.md': '# Button' }));
    expect(await access.pick(REPO)).toBe(true);
    expect(await access.read(REPO, 'components/button.md')).toEqual({
      status: 'found',
      text: '# Button',
    });
  });

  it('caminho aninhado a/b/c.md', async () => {
    const access = accessFor(folderWith({ 'a/b/c.md': 'fundo' }));
    await access.pick(REPO);
    expect(await access.read(REPO, 'a/b/c.md')).toEqual({
      status: 'found',
      text: 'fundo',
    });
  });

  it('sem pasta conectada: no-folder', async () => {
    const access = createDocFolderAccess({ openStore: async () => null });
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'no-folder' });
  });

  it('arquivo ou subpasta ausente: missing', async () => {
    const access = accessFor(folderWith({ 'components/button.md': 'x' }));
    await access.pick(REPO);
    expect(await access.read(REPO, 'components/outro.md')).toEqual({ status: 'missing' });
    expect(await access.read(REPO, 'nada/button.md')).toEqual({ status: 'missing' });
  });

  it('caminho inválido (.., vazio): missing, sem lançar', async () => {
    const access = accessFor(folderWith({ 'a.md': 'x' }));
    await access.pick(REPO);
    expect(await access.read(REPO, '../a.md')).toEqual({ status: 'missing' });
    expect(await access.read(REPO, '')).toEqual({ status: 'missing' });
  });

  it('falha ao ler o arquivo: missing', async () => {
    const dir = folderWith({ 'a.md': 'x' });
    vi.spyOn(dir, 'getFileHandle').mockRejectedValue(new Error('boom'));
    const access = accessFor(dir);
    await access.pick(REPO);
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'missing' });
  });

  it('permissão em prompt ou negada: permission; request pede e devolve o resultado', async () => {
    const dir = folderWith({ 'a.md': 'x' });
    const access = accessFor(dir);
    await access.pick(REPO);
    dir.permission = 'prompt';
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'permission' });
    dir.permission = 'denied';
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'permission' });

    dir.answer = 'granted';
    expect(await access.request(REPO)).toBe(true);
    expect(dir.requests).toBe(1);
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'found', text: 'x' });

    dir.permission = 'prompt';
    dir.answer = 'denied';
    expect(await access.request(REPO)).toBe(false);
    expect(dir.requests).toBe(2);
  });

  it('request sem pasta ou com requestPermission lançando: false', async () => {
    const access = createDocFolderAccess({ openStore: async () => null });
    expect(await access.request(REPO)).toBe(false);
    const dir = folderWith({});
    vi.spyOn(dir, 'requestPermission').mockRejectedValue(new Error('sem gesto'));
    const picked = accessFor(dir);
    await picked.pick(REPO);
    expect(await picked.request(REPO)).toBe(false);
  });

  it('queryPermission é consultado em modo leitura', async () => {
    const dir = folderWith({ 'a.md': 'x' });
    const query = vi.spyOn(dir, 'queryPermission');
    const access = accessFor(dir);
    await access.pick(REPO);
    await access.read(REPO, 'a.md');
    expect(query).toHaveBeenCalledWith({ mode: 'read' });
  });
});

describe('docFolderAccess: seletor', () => {
  it('supported: com seletor injetado, sim; sem showDirectoryPicker, não', () => {
    expect(
      createDocFolderAccess({ picker: async () => folderWith({}) }).supported(),
    ).toBe(true);
    expect(createDocFolderAccess().supported()).toBe(false);
    vi.stubGlobal('showDirectoryPicker', async () => folderWith({}));
    expect(createDocFolderAccess().supported()).toBe(true);
  });

  it('cancelar (AbortError) ou falhar: pick devolve false e nada fica guardado', async () => {
    const abort = createDocFolderAccess({
      picker: async () => {
        throw new DOMException('cancelado', 'AbortError');
      },
      openStore: async () => null,
    });
    expect(await abort.pick(REPO)).toBe(false);
    expect(await abort.read(REPO, 'a.md')).toEqual({ status: 'no-folder' });
    const boom = createDocFolderAccess({
      picker: async () => {
        throw new Error('boom');
      },
      openStore: async () => null,
    });
    expect(await boom.pick(REPO)).toBe(false);
  });

  it('sem seletor: pick devolve false', async () => {
    expect(await createDocFolderAccess({ openStore: async () => null }).pick(REPO)).toBe(
      false,
    );
  });
});

describe('docFolderAccess: persistência no IndexedDB', () => {
  it('outro acesso sobre o mesmo banco enxerga a pasta conectada', async () => {
    const dir = folderWith({ 'a.md': 'persistido' });
    await accessFor(dir).pick(REPO);
    const other: DocFolderAccess = createDocFolderAccess();
    expect(await other.read(REPO, 'a.md')).toEqual({
      status: 'found',
      text: 'persistido',
    });
  });

  it('a chave é a url normalizada: .git, barra final e espaços dão a mesma pasta', async () => {
    const dir = folderWith({ 'a.md': 'mesma' });
    await accessFor(dir).pick(`${REPO}.git`);
    const other = createDocFolderAccess();
    for (const url of [REPO, `${REPO}/`, ` ${REPO}.git/ `]) {
      expect(await other.read(url, 'a.md'), url).toEqual({
        status: 'found',
        text: 'mesma',
      });
    }
    expect(await other.read(`${REPO}-outro`, 'a.md')).toEqual({ status: 'no-folder' });
  });

  it('conectar de novo troca a pasta da url', async () => {
    await accessFor(folderWith({ 'a.md': 'antiga' })).pick(REPO);
    await accessFor(folderWith({ 'a.md': 'nova' })).pick(REPO);
    expect(await createDocFolderAccess().read(REPO, 'a.md')).toEqual({
      status: 'found',
      text: 'nova',
    });
  });
});

describe('docFolderAccess: sem IndexedDB utilizável', () => {
  const unusable: [string, () => Promise<DocFolderStore | null>][] = [
    ['store ausente (null)', async () => null],
    [
      'abertura lançando',
      async () => {
        throw new Error('sem IndexedDB');
      },
    ],
    [
      'get e put lançando',
      async () => ({
        get: async () => {
          throw new Error('get');
        },
        put: async () => {
          throw new Error('put');
        },
      }),
    ],
  ];

  it.each(unusable)(
    '%s: a pasta vale na memória e nada lança',
    async (_name, openStore) => {
      const access = accessFor(folderWith({ 'a.md': 'memória' }), openStore);
      expect(await access.pick(REPO)).toBe(true);
      expect(await access.read(`${REPO}/`, 'a.md')).toEqual({
        status: 'found',
        text: 'memória',
      });
      expect(await access.request(REPO)).toBe(true);
    },
  );

  it('indexedDB indefinido: a pasta vale na memória', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const access = accessFor(folderWith({ 'a.md': 'memória' }));
    expect(await access.pick(REPO)).toBe(true);
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'found', text: 'memória' });
  });

  it('abertura que nunca responde: o timeout libera e a memória segue valendo', async () => {
    vi.useFakeTimers();
    const request = new EventTarget();
    vi.spyOn(indexedDB, 'open').mockReturnValue(request as unknown as IDBOpenDBRequest);
    const access = accessFor(folderWith({ 'a.md': 'sem banco' }));
    const picked = access.pick(REPO);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await picked).toBe(true);
    expect(await access.read(REPO, 'a.md')).toEqual({
      status: 'found',
      text: 'sem banco',
    });
  });
});
