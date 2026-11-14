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

const REPO = 'https://gitlab.company.com/group/design-docs';

function folderWith(files: Record<string, string>): PermissionDirectory {
  const dir = new PermissionDirectory('design-docs');
  for (const [path, text] of Object.entries(files)) dir.put(path, text);
  return dir;
}

/** Deps with a picker that always returns the given folder. */
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
  it('trims spaces and removes the trailing slash and the .git suffix', () => {
    expect(normalizeRepoUrl(`  ${REPO}  `)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}/`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}.git`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}.git/`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}/.git`)).toBe(REPO);
    expect(normalizeRepoUrl(`${REPO}//`)).toBe(REPO);
  });

  it('leaves an already normal url alone', () => {
    expect(normalizeRepoUrl(REPO)).toBe(REPO);
  });
});

describe('docFolderAccess: reading', () => {
  it('connected folder and present file: found with the text', async () => {
    const access = accessFor(folderWith({ 'components/button.md': '# Button' }));
    expect(await access.pick(REPO)).toBe(true);
    expect(await access.read(REPO, 'components/button.md')).toEqual({
      status: 'found',
      text: '# Button',
    });
  });

  it('nested path a/b/c.md', async () => {
    const access = accessFor(folderWith({ 'a/b/c.md': 'deep' }));
    await access.pick(REPO);
    expect(await access.read(REPO, 'a/b/c.md')).toEqual({
      status: 'found',
      text: 'deep',
    });
  });

  it('no connected folder: no-folder', async () => {
    const access = createDocFolderAccess({ openStore: async () => null });
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'no-folder' });
  });

  it('missing file or subfolder: missing', async () => {
    const access = accessFor(folderWith({ 'components/button.md': 'x' }));
    await access.pick(REPO);
    expect(await access.read(REPO, 'components/other.md')).toEqual({ status: 'missing' });
    expect(await access.read(REPO, 'nothing/button.md')).toEqual({ status: 'missing' });
  });

  it('invalid path (.., empty): missing, without throwing', async () => {
    const access = accessFor(folderWith({ 'a.md': 'x' }));
    await access.pick(REPO);
    expect(await access.read(REPO, '../a.md')).toEqual({ status: 'missing' });
    expect(await access.read(REPO, '')).toEqual({ status: 'missing' });
  });

  it('failure reading the file: missing', async () => {
    const dir = folderWith({ 'a.md': 'x' });
    vi.spyOn(dir, 'getFileHandle').mockRejectedValue(new Error('boom'));
    const access = accessFor(dir);
    await access.pick(REPO);
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'missing' });
  });

  it('permission in prompt or denied: permission; request asks and returns the result', async () => {
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

  it('request without a folder or with requestPermission throwing: false', async () => {
    const access = createDocFolderAccess({ openStore: async () => null });
    expect(await access.request(REPO)).toBe(false);
    const dir = folderWith({});
    vi.spyOn(dir, 'requestPermission').mockRejectedValue(new Error('no gesture'));
    const picked = accessFor(dir);
    await picked.pick(REPO);
    expect(await picked.request(REPO)).toBe(false);
  });

  it('queryPermission is queried in read mode', async () => {
    const dir = folderWith({ 'a.md': 'x' });
    const query = vi.spyOn(dir, 'queryPermission');
    const access = accessFor(dir);
    await access.pick(REPO);
    await access.read(REPO, 'a.md');
    expect(query).toHaveBeenCalledWith({ mode: 'read' });
  });
});

describe('docFolderAccess: picker', () => {
  it('supported: with an injected picker, yes; without showDirectoryPicker, no', () => {
    expect(
      createDocFolderAccess({ picker: async () => folderWith({}) }).supported(),
    ).toBe(true);
    expect(createDocFolderAccess().supported()).toBe(false);
    vi.stubGlobal('showDirectoryPicker', async () => folderWith({}));
    expect(createDocFolderAccess().supported()).toBe(true);
  });

  it('cancelling (AbortError) or failing: pick returns false and nothing is stored', async () => {
    const abort = createDocFolderAccess({
      picker: async () => {
        throw new DOMException('cancelled', 'AbortError');
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

  it('without a picker: pick returns false', async () => {
    expect(await createDocFolderAccess({ openStore: async () => null }).pick(REPO)).toBe(
      false,
    );
  });
});

describe('docFolderAccess: persistence in IndexedDB', () => {
  it('another access over the same database sees the connected folder', async () => {
    const dir = folderWith({ 'a.md': 'persisted' });
    await accessFor(dir).pick(REPO);
    const other: DocFolderAccess = createDocFolderAccess();
    expect(await other.read(REPO, 'a.md')).toEqual({
      status: 'found',
      text: 'persisted',
    });
  });

  it('the key is the normalized url: .git, trailing slash and spaces give the same folder', async () => {
    const dir = folderWith({ 'a.md': 'same' });
    await accessFor(dir).pick(`${REPO}.git`);
    const other = createDocFolderAccess();
    for (const url of [REPO, `${REPO}/`, ` ${REPO}.git/ `]) {
      expect(await other.read(url, 'a.md'), url).toEqual({
        status: 'found',
        text: 'same',
      });
    }
    expect(await other.read(`${REPO}-other`, 'a.md')).toEqual({ status: 'no-folder' });
  });

  it('connecting again replaces the url folder', async () => {
    await accessFor(folderWith({ 'a.md': 'old' })).pick(REPO);
    await accessFor(folderWith({ 'a.md': 'new' })).pick(REPO);
    expect(await createDocFolderAccess().read(REPO, 'a.md')).toEqual({
      status: 'found',
      text: 'new',
    });
  });
});

describe('docFolderAccess: without usable IndexedDB', () => {
  const unusable: [string, () => Promise<DocFolderStore | null>][] = [
    ['missing store (null)', async () => null],
    [
      'open throwing',
      async () => {
        throw new Error('no IndexedDB');
      },
    ],
    [
      'get and put throwing',
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
    '%s: the folder is valid in memory and nothing throws',
    async (_name, openStore) => {
      const access = accessFor(folderWith({ 'a.md': 'memory' }), openStore);
      expect(await access.pick(REPO)).toBe(true);
      expect(await access.read(`${REPO}/`, 'a.md')).toEqual({
        status: 'found',
        text: 'memory',
      });
      expect(await access.request(REPO)).toBe(true);
    },
  );

  it('indexedDB undefined: the folder is valid in memory', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const access = accessFor(folderWith({ 'a.md': 'memory' }));
    expect(await access.pick(REPO)).toBe(true);
    expect(await access.read(REPO, 'a.md')).toEqual({ status: 'found', text: 'memory' });
  });

  it('open that never responds: the timeout releases and the memory keeps being valid', async () => {
    vi.useFakeTimers();
    const request = new EventTarget();
    vi.spyOn(indexedDB, 'open').mockReturnValue(request as unknown as IDBOpenDBRequest);
    const access = accessFor(folderWith({ 'a.md': 'no database' }));
    const picked = access.pick(REPO);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await picked).toBe(true);
    expect(await access.read(REPO, 'a.md')).toEqual({
      status: 'found',
      text: 'no database',
    });
  });
});
