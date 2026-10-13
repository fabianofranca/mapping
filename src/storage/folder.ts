import {
  GITIGNORE_FILE,
  PROPOSALS_DIR,
  PROPOSAL_FILE,
  PROPOSAL_ID_RE,
  gitignoreWithBackups,
  proposalFilePath,
} from '../model';
import {
  BACKUPS_DIR,
  IMAGES_DIR,
  MAPPING_FILE,
  isImageFileName,
  type ProjectStorage,
} from './types';

// Subconjunto da File System Access API usado pela app. Tipado à parte para
// não depender das definições do navegador e para permitir mocks nos testes.

export interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface FileHandleLike {
  readonly kind: 'file';
  readonly name: string;
  /** O `File` real tem `lastModified`; os mocks dos testes podem devolver só um `Blob`. */
  getFile(): Promise<Blob & { readonly lastModified?: number }>;
  createWritable(): Promise<WritableLike>;
}

export interface DirectoryHandleLike {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
}

export type FolderPermission = 'granted' | 'denied' | 'prompt';

/**
 * Handle que pode ser guardado e reaberto noutra visita (recentes de pasta): o navegador
 * pede a permissão de novo com um clique, e `isSameEntry` evita a mesma pasta duas vezes.
 */
export interface ReopenableDirectory extends DirectoryHandleLike {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<FolderPermission>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<FolderPermission>;
  isSameEntry(other: DirectoryHandleLike): Promise<boolean>;
}

/** O navegador oferece o que os recentes de pasta precisam neste handle? */
export function isReopenable(handle: DirectoryHandleLike): handle is ReopenableDirectory {
  return ['queryPermission', 'requestPermission', 'isSameEntry'].every(
    (method) => typeof Reflect.get(handle, method) === 'function',
  );
}

/**
 * A pasta é do armazenamento privado da origem (OPFS, `navigator.storage.getDirectory()`)?
 * O seletor de pastas nunca devolve uma (ela é invisível para a pessoa); só os testes a usam
 * no lugar dele. Não vai para os recentes: no Chromium, ler de volta do IndexedDB um handle
 * do OPFS derruba a página. Sem OPFS (ou em `file://`, onde ele recusa): `false`.
 */
export async function isOriginPrivate(handle: DirectoryHandleLike): Promise<boolean> {
  try {
    const storage: unknown = Reflect.get(globalThis.navigator ?? {}, 'storage');
    const getDirectory: unknown =
      typeof storage === 'object' && storage !== null
        ? Reflect.get(storage, 'getDirectory')
        : undefined;
    if (typeof getDirectory !== 'function') return false;
    const root = (await getDirectory.call(storage)) as FileSystemDirectoryHandle;
    const entry = handle as unknown as FileSystemHandle;
    return (await root.isSameEntry(entry)) || (await root.resolve(entry)) !== null;
  } catch {
    return false;
  }
}

/**
 * Leitura e escrita na pasta: consulta e, se preciso, pede a permissão. Chamar no próprio
 * clique, sem espera longa antes (ler o handle do IndexedDB cabe na ativação do gesto): o
 * `requestPermission` só abre o diálogo do navegador dentro de um gesto da pessoa.
 */
export async function ensurePermission(handle: ReopenableDirectory): Promise<boolean> {
  const mode = { mode: 'readwrite' } as const;
  if ((await handle.queryPermission(mode)) === 'granted') return true;
  return (await handle.requestPermission(mode)) === 'granted';
}

type DirectoryPicker = (options: { mode: 'readwrite' }) => Promise<DirectoryHandleLike>;

function directoryPicker(): DirectoryPicker | null {
  const picker: unknown = Reflect.get(globalThis, 'showDirectoryPicker');
  return typeof picker === 'function' ? (picker as DirectoryPicker) : null;
}

/** `showDirectoryPicker` existe e a página não está num iframe (onde ele é bloqueado). */
export function isFolderModeSupported(): boolean {
  try {
    return directoryPicker() !== null && window.self === window.top;
  } catch {
    return false;
  }
}

/** Abre o seletor de pasta. `null` se o usuário cancelar. */
export async function pickDirectory(): Promise<DirectoryHandleLike | null> {
  const picker = directoryPicker();
  if (!picker) return null;
  try {
    return await picker.call(globalThis, { mode: 'readwrite' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

/** A pasta (ou o arquivo) não existe mais: movida, renomeada ou apagada. */
export function isNotFound(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')
  );
}

function splitPath(path: string): { dirs: string[]; name: string } {
  const parts = path.split('/').filter((s) => s !== '' && s !== '.');
  if (parts.some((s) => s === '..')) throw new Error(`invalid path: ${path}`);
  const name = parts.pop();
  if (!name) throw new Error(`invalid path: ${path}`);
  return { dirs: parts, name };
}

async function resolveDir(
  root: DirectoryHandleLike,
  dirs: readonly string[],
  create: boolean,
): Promise<DirectoryHandleLike | null> {
  let dir = root;
  for (const name of dirs) {
    try {
      dir = await dir.getDirectoryHandle(name, { create });
    } catch (e) {
      if (!create && isNotFound(e)) return null;
      throw e;
    }
  }
  return dir;
}

async function readFile(
  root: DirectoryHandleLike,
  path: string,
): Promise<(Blob & { readonly lastModified?: number }) | null> {
  const { dirs, name } = splitPath(path);
  const dir = await resolveDir(root, dirs, false);
  if (!dir) return null;
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function writeFile(
  root: DirectoryHandleLike,
  path: string,
  data: Blob | string,
): Promise<void> {
  const { dirs, name } = splitPath(path);
  const dir = await resolveDir(root, dirs, true);
  if (!dir) throw new Error(`cannot create ${path}`);
  const writable = await (
    await dir.getFileHandle(name, { create: true })
  ).createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (e) {
    // Descarta a escrita pela metade: o arquivo continua com o conteúdo anterior.
    try {
      await writable.abort(e);
    } catch {
      // O gravável já pode estar fechado ou com erro; o que importa é a falha original.
    }
    throw e;
  }
}

async function removeFile(root: DirectoryHandleLike, path: string): Promise<void> {
  const { dirs, name } = splitPath(path);
  const dir = await resolveDir(root, dirs, false);
  if (!dir) return;
  try {
    await dir.removeEntry(name);
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
}

/**
 * A pasta tem `mapping.json`? Para conferir se ela é um projeto (abrir, Localizar) sem passar
 * pelo `loadMapping` de um `ProjectStorage`, que só a sessão usa. A pasta sumida conta como
 * sem projeto; outros erros sobem.
 */
export async function hasMappingFile(root: DirectoryHandleLike): Promise<boolean> {
  return (await readFile(root, MAPPING_FILE)) !== null;
}

/**
 * Projeto numa pasta do disco. Cada gravação vai direto para o arquivo. `copyId`: a cópia do
 * projeto (ver `ProjectStorage.copyId`), dada pelo controller antes de a sessão abrir.
 */
export function createFolderStorage(
  root: DirectoryHandleLike,
  options: { readonly copyId?: string } = {},
): ProjectStorage {
  return {
    kind: 'folder',
    folderName: root.name,
    ...(options.copyId === undefined ? {} : { copyId: options.copyId }),
    async loadMapping() {
      const blob = await readFile(root, MAPPING_FILE);
      return blob ? blob.text() : null;
    },
    saveMapping: (text) => writeFile(root, MAPPING_FILE, text),
    async statMapping() {
      const file = await readFile(root, MAPPING_FILE);
      return file ? (file.lastModified ?? 0) : null;
    },
    readImage: (path) => readFile(root, path),
    async statImage(path) {
      const file = await readFile(root, path);
      return file ? `${file.size}:${file.lastModified ?? 0}` : null;
    },
    writeImage: (path, data) => writeFile(root, path, data),
    removeImage: (path) => removeFile(root, path),
    async readSpec(path) {
      const blob = await readFile(root, path);
      return blob ? blob.text() : null;
    },
    writeSpec: (path, text) => writeFile(root, path, text),
    removeSpec: (path) => removeFile(root, path),
    async listProposals() {
      const dir = await resolveDir(root, [PROPOSALS_DIR], false);
      if (!dir) return [];
      const ids: string[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind !== 'directory' || !PROPOSAL_ID_RE.test(entry.name)) continue;
        try {
          await entry.getFileHandle(PROPOSAL_FILE);
          ids.push(entry.name);
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
      }
      return ids.sort();
    },
    async readProposal(id) {
      const blob = await readFile(root, proposalFilePath(id));
      return blob ? blob.text() : null;
    },
    writeProposal: (id, text) => writeFile(root, proposalFilePath(id), text),
    async statProposal(id) {
      const file = await readFile(root, proposalFilePath(id));
      return file ? `${file.size}:${file.lastModified ?? 0}` : null;
    },
    writeBackup: (name, text) => writeFile(root, `${BACKUPS_DIR}/${name}`, text),
  };
}

/**
 * Garante `backups/` no `.gitignore` da raiz, para quem versiona o projeto com git: cria o
 * arquivo, ou acrescenta a linha ao que já existe (nunca sobrescreve nem duplica; o texto vem
 * de `gitignoreWithBackups`, o mesmo do `create_project` do MCP). Devolve `true` se gravou.
 */
export async function ensureGitignore(root: DirectoryHandleLike): Promise<boolean> {
  const current = await readFile(root, GITIGNORE_FILE);
  const next = gitignoreWithBackups(current ? await current.text() : '');
  if (next === null) return false;
  await writeFile(root, GITIGNORE_FILE, next);
  return true;
}

export interface ExistingImage {
  /** Caminho atual, relativo à raiz (`foto.jpg` ou `images/foto.jpg`). */
  readonly path: string;
  readonly name: string;
}

/** Imagens já presentes em `images/` e na raiz da pasta, em ordem alfabética. */
export async function findExistingImages(
  root: DirectoryHandleLike,
): Promise<ExistingImage[]> {
  const list = async (dir: DirectoryHandleLike, prefix: string) => {
    const found: ExistingImage[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && isImageFileName(entry.name)) {
        found.push({ path: `${prefix}${entry.name}`, name: entry.name });
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  };
  const imagesDir = await resolveDir(root, [IMAGES_DIR], false);
  const inImages = imagesDir ? await list(imagesDir, `${IMAGES_DIR}/`) : [];
  return [...inImages, ...(await list(root, ''))];
}
