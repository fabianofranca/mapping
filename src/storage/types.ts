/** Nome do arquivo do projeto na raiz da pasta/zip. */
export const MAPPING_FILE = 'mapping.json';
/** Pasta das imagens, relativa à raiz do projeto. */
export const IMAGES_DIR = 'images';
/** Pasta das cópias das especializações aplicadas (`specs/<id>.json`). */
export const SPECS_DIR = 'specs';
/** Pasta das cópias do `mapping.json` original guardadas antes de uma migração. */
export const BACKUPS_DIR = 'backups';

export type StorageKind = 'folder' | 'local';

/**
 * Onde o projeto vive: uma pasta no disco (File System Access API) ou o
 * IndexedDB do navegador. Os caminhos são relativos à raiz do projeto
 * (`mapping.json`, `images/foto.jpg`).
 */
export interface ProjectStorage {
  readonly kind: StorageKind;
  /** Texto do `mapping.json`, ou `null` se ele não existir. */
  loadMapping(): Promise<string | null>;
  saveMapping(text: string): Promise<void>;
  /** Conteúdo da imagem, ou `null` se o arquivo não existir. */
  readImage(path: string): Promise<Blob | null>;
  writeImage(path: string, data: Blob): Promise<void>;
  /** Remove a imagem. Não falha se ela já não existir. */
  removeImage(path: string): Promise<void>;
  /** Texto da cópia de uma especialização (`specs/sdui.json`), ou `null` se não existir. */
  readSpec(path: string): Promise<string | null>;
  writeSpec(path: string, text: string): Promise<void>;
  /** Remove a cópia da especialização. Não falha se ela já não existir. */
  removeSpec(path: string): Promise<void>;
  /**
   * Guarda uma cópia do `mapping.json` original (antes de migrar o schema).
   * `name` é o nome do arquivo (ver `backupFileName`), sem a pasta.
   */
  writeBackup(name: string, text: string): Promise<void>;
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

/** `mapping.v<versão>.<AAAAMMDD-HHMMSS>.json`, no horário local. */
export function backupFileName(version: number, date: Date): string {
  const day = `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `mapping.v${version}.${day}-${time}.json`;
}

/** Carimbo `AAAAMMDD-HHMMSS` de um nome gerado por `backupFileName` (para ordenar). */
export function backupTimestamp(name: string): string {
  return /\.(\d{8}-\d{6})\.json$/.exec(name)?.[1] ?? '';
}

/** `true` para `specs/<nome>.json` (sem subpastas). */
export function isSpecPath(path: string): boolean {
  return /^specs\/[^/]+\.json$/.test(path);
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];

/** `true` se o nome do arquivo tem extensão de imagem conhecida. */
export function isImageFileName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/** Tipo MIME a partir da extensão (para arquivos lidos sem tipo, como os do zip). */
export function imageMimeType(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (IMAGE_EXTENSIONS.includes(ext)) return `image/${ext}`;
  return 'application/octet-stream';
}
