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

function isNotFound(e: unknown): boolean {
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

/** Projeto numa pasta do disco. Cada gravação vai direto para o arquivo. */
export function createFolderStorage(root: DirectoryHandleLike): ProjectStorage {
  return {
    kind: 'folder',
    folderName: root.name,
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
    writeBackup: (name, text) => writeFile(root, `${BACKUPS_DIR}/${name}`, text),
  };
}

/** Arquivo que diz ao git para ignorar os backups (`backups/`, ver `BACKUPS_DIR`). */
export const GITIGNORE_FILE = '.gitignore';

/** A linha já cobre `backups/` (com ou sem barra no começo ou no fim)? */
function ignoresBackups(line: string): boolean {
  return line.trim().replace(/^\//, '').replace(/\/$/, '') === BACKUPS_DIR;
}

/**
 * Garante `backups/` no `.gitignore` da raiz, para quem versiona o projeto com git: cria o
 * arquivo, ou acrescenta a linha ao que já existe (nunca sobrescreve nem duplica).
 * Devolve `true` se gravou alguma coisa.
 */
export async function ensureGitignore(root: DirectoryHandleLike): Promise<boolean> {
  const current = await readFile(root, GITIGNORE_FILE);
  const text = current ? await current.text() : '';
  if (text.split(/\r?\n/).some(ignoresBackups)) return false;
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  await writeFile(root, GITIGNORE_FILE, `${text}${separator}${BACKUPS_DIR}/\n`);
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
