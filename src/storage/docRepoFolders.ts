import { openDB, type DBSchema } from 'idb';
import { channelDbName } from '../utils/channel';
import { reportError } from '../utils/report';
import type { FolderPermission } from './folder';
import { withTimeout } from './local';

// Pastas dos repositórios de documentos (`docRepos` da especialização, schema v14): o `doc` de
// um tipo pode apontar um `.md` que vive num repositório externo. A app lê esse arquivo da
// pasta do clone que a pessoa conecta uma vez por máquina (`showDirectoryPicker`); o handle
// fica no IndexedDB, num banco só dele, com a `url` normalizada do repositório como chave. Ele
// nunca vai para o `mapping.json`. O `Map` em memória guarda tudo também: sem IndexedDB (ou
// se ele não abrir), a pasta vale até fechar a aba.

const DB_NAME = channelDbName('mapping-doc-folders');
const DB_VERSION = 1;

/** Subconjunto do `FileSystemDirectoryHandle` que a leitura de documentos usa. */
export interface DocDirectoryHandle {
  getDirectoryHandle(name: string): Promise<DocDirectoryHandle>;
  getFileHandle(
    name: string,
  ): Promise<{ getFile(): Promise<{ text(): Promise<string> }> }>;
  /** Ausente em handles que o navegador não sabe consultar: a leitura é tentada mesmo assim. */
  queryPermission?(descriptor: { mode: 'read' }): Promise<FolderPermission>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<FolderPermission>;
}

export type DocReadResult =
  | { status: 'found'; text: string }
  | { status: 'no-folder' }
  /** `queryPermission` != `granted` (prompt ou denied): a pessoa precisa permitir de novo. */
  | { status: 'permission' }
  /** Arquivo ou subpasta inexistente, ou que não pôde ser lido. */
  | { status: 'missing' };

export interface DocFolderAccess {
  /** `showDirectoryPicker` existe neste navegador. */
  supported(): boolean;
  read(repoUrl: string, path: string): Promise<DocReadResult>;
  /** Abre o seletor (só pode ser chamado por um clique) e guarda a pasta; `false` se cancelou ou falhou. */
  pick(repoUrl: string): Promise<boolean>;
  /** `requestPermission({ mode: 'read' })` (também só por clique); `true` se concedida. */
  request(repoUrl: string): Promise<boolean>;
}

/** O banco das pastas, atrás de uma interface pequena para os testes. */
export interface DocFolderStore {
  get(key: string): Promise<DocDirectoryHandle | undefined>;
  put(key: string, handle: DocDirectoryHandle): Promise<void>;
}

export interface DocFolderDeps {
  readonly picker?: () => Promise<DocDirectoryHandle>;
  /** Abre o banco; `null` se não houver. Chamado uma vez, na primeira necessidade. */
  readonly openStore?: () => Promise<DocFolderStore | null>;
}

/**
 * Chave de um repositório: a `url` sem espaços nas pontas, sem `/` finais e sem o sufixo
 * `.git` (`https://x.com/a/b.git/` → `https://x.com/a/b`).
 */
export function normalizeRepoUrl(url: string): string {
  const trimSlashes = (s: string) => s.replace(/\/+$/, '');
  return trimSlashes(trimSlashes(url.trim()).replace(/\.git$/, ''));
}

interface DocFoldersSchema extends DBSchema {
  folders: { key: string; value: DocDirectoryHandle };
}

async function openIdbStore(): Promise<DocFolderStore | null> {
  // Sem IndexedDB o `openDB` lança: `getStore` registra e segue só com a memória.
  const db = await withTimeout(
    openDB<DocFoldersSchema>(DB_NAME, DB_VERSION, {
      upgrade(upgrading) {
        upgrading.createObjectStore('folders');
      },
    }),
  );
  if (!db) return null;
  return {
    get: (key) => db.get('folders', key),
    put: async (key, handle) => {
      await db.put('folders', handle, key);
    },
  };
}

function defaultPicker(): (() => Promise<DocDirectoryHandle>) | null {
  const picker: unknown = Reflect.get(globalThis, 'showDirectoryPicker');
  if (typeof picker !== 'function') return null;
  return () => picker.call(globalThis) as Promise<DocDirectoryHandle>;
}

/** Cada segmento do caminho; `null` se vazio, com `..` ou sem nome de arquivo. */
function pathSegments(path: string): string[] | null {
  const parts = path.split('/').filter((s) => s !== '' && s !== '.');
  if (parts.length === 0 || parts.includes('..')) return null;
  return parts;
}

async function readText(root: DocDirectoryHandle, path: string): Promise<DocReadResult> {
  const parts = pathSegments(path);
  if (parts === null) return { status: 'missing' };
  try {
    const name = parts.pop() ?? '';
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(name)).getFile();
    return { status: 'found', text: await file.text() };
  } catch {
    // Inexistente (NotFoundError, TypeMismatchError) ou ilegível: o documento não aparece.
    return { status: 'missing' };
  }
}

async function isGranted(handle: DocDirectoryHandle): Promise<boolean> {
  if (typeof handle.queryPermission !== 'function') return true;
  try {
    return (await handle.queryPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

/** Cria o acesso às pastas dos repositórios de documentos; `deps` troca o seletor e o banco (testes). */
export function createDocFolderAccess(deps: DocFolderDeps = {}): DocFolderAccess {
  const memory = new Map<string, DocDirectoryHandle>();
  const picker = deps.picker ?? defaultPicker();
  let store: Promise<DocFolderStore | null> | null = null;

  const getStore = (): Promise<DocFolderStore | null> => {
    store ??= (deps.openStore ?? openIdbStore)().catch((e: unknown) => {
      reportError('docFolders.open', e);
      return null;
    });
    return store;
  };

  const handleOf = async (key: string): Promise<DocDirectoryHandle | null> => {
    const known = memory.get(key);
    if (known) return known;
    try {
      const stored = await (await getStore())?.get(key);
      if (stored) memory.set(key, stored);
      return stored ?? null;
    } catch (e) {
      reportError('docFolders.get', e);
      return null;
    }
  };

  const remember = async (key: string, handle: DocDirectoryHandle): Promise<void> => {
    memory.set(key, handle);
    try {
      await (await getStore())?.put(key, handle);
    } catch (e) {
      // Sem gravar, a pasta vale até fechar a aba.
      reportError('docFolders.put', e);
    }
  };

  return {
    supported: () => picker !== null,

    async read(repoUrl, path) {
      const handle = await handleOf(normalizeRepoUrl(repoUrl));
      if (!handle) return { status: 'no-folder' };
      if (!(await isGranted(handle))) return { status: 'permission' };
      return readText(handle, path);
    },

    async pick(repoUrl) {
      if (!picker) return false;
      try {
        await remember(normalizeRepoUrl(repoUrl), await picker());
        return true;
      } catch {
        // Cancelou (AbortError) ou o navegador recusou: nada muda.
        return false;
      }
    },

    async request(repoUrl) {
      const handle = await handleOf(normalizeRepoUrl(repoUrl));
      if (typeof handle?.requestPermission !== 'function') return false;
      try {
        return (await handle.requestPermission({ mode: 'read' })) === 'granted';
      } catch {
        return false;
      }
    },
  };
}

/** A instância da app. */
export const docFolderAccess: DocFolderAccess = createDocFolderAccess();
