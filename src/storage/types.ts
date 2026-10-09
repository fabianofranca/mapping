/** Nome do arquivo do projeto na raiz da pasta/zip. */
export const MAPPING_FILE = 'mapping.json';
/** Pasta das imagens, relativa à raiz do projeto. */
export const IMAGES_DIR = 'images';
/** Pasta das cópias das especializações aplicadas (`specs/<id>.json`). */
export const SPECS_DIR = 'specs';
import { PROPOSALS_DIR, PROPOSAL_FILE, PROPOSAL_ID_RE } from '../model';
export { BACKUPS_DIR, backupFileName, backupTimestamp } from '../model';

export type StorageKind = 'folder' | 'local';

/**
 * Onde o projeto vive: uma pasta no disco (File System Access API) ou o
 * IndexedDB do navegador. Os caminhos são relativos à raiz do projeto
 * (`mapping.json`, `images/foto.jpg`).
 */
export interface ProjectStorage {
  readonly kind: StorageKind;
  /**
   * Nome da pasta do projeto no disco (o `<projeto>` das referências `mapping://`).
   * Só existe no modo pasta: é o que o MCP alcança.
   */
  readonly folderName?: string;
  /** Texto do `mapping.json`, ou `null` se ele não existir. */
  loadMapping(): Promise<string | null>;
  saveMapping(text: string): Promise<void>;
  /**
   * `lastModified` do `mapping.json` (ms), ou `null` se ele não existir. Só os
   * armazenamentos que podem mudar por fora (a pasta) implementam; é o que a app
   * confere a cada poucos segundos para perceber uma alteração externa.
   */
  statMapping?(): Promise<number | null>;
  /** Conteúdo da imagem, ou `null` se o arquivo não existir. */
  readImage(path: string): Promise<Blob | null>;
  writeImage(path: string, data: Blob): Promise<void>;
  /**
   * Carimbo do arquivo da imagem (tamanho e `lastModified`), ou `null` se ele não existir.
   * Mudou entre duas leituras = o arquivo foi trocado por fora. Opcional, como `statMapping`.
   */
  statImage?(path: string): Promise<string | null>;
  /** Remove a imagem. Não falha se ela já não existir. */
  removeImage(path: string): Promise<void>;
  /** Texto da cópia de uma especialização (`specs/sdui.json`), ou `null` se não existir. */
  readSpec(path: string): Promise<string | null>;
  writeSpec(path: string, text: string): Promise<void>;
  /** Remove a cópia da especialização. Não falha se ela já não existir. */
  removeSpec(path: string): Promise<void>;
  /**
   * Ids das propostas (`proposals/<id>/proposal.json`, etapa 4), em ordem alfabética.
   * O conteúdo das imagens de uma proposta usa `readImage`/`writeImage`/`removeImage`
   * com o caminho completo (`proposals/<id>/images/tela.webp`).
   */
  listProposals(): Promise<string[]>;
  /** Texto do `proposal.json`, ou `null` se ele não existir. */
  readProposal(id: string): Promise<string | null>;
  writeProposal(id: string, text: string): Promise<void>;
  /**
   * Carimbo (tamanho e `lastModified`) do `proposal.json`, ou `null` se ele não existir.
   * Só a pasta implementa, como `statMapping`: é como a app percebe propostas novas ou
   * alteradas por fora.
   */
  statProposal?(id: string): Promise<string | null>;
  /**
   * Guarda uma cópia do `mapping.json` original (antes de migrar o schema).
   * `name` é o nome do arquivo (ver `backupFileName`), sem a pasta.
   */
  writeBackup(name: string, text: string): Promise<void>;
}

/** `true` para `specs/<nome>.json` (sem subpastas). */
export function isSpecPath(path: string): boolean {
  return /^specs\/[^/]+\.json$/.test(path);
}

const PROPOSAL_PATH_RE = new RegExp(`^${PROPOSALS_DIR}/([^/]+)/(.+)$`);

/** Id da proposta de um caminho `proposals/<id>/…`; `null` se não for um. */
export function proposalIdOfPath(path: string): string | null {
  const id = PROPOSAL_PATH_RE.exec(path)?.[1];
  return id !== undefined && PROPOSAL_ID_RE.test(id) ? id : null;
}

/** `true` para `proposals/<id>/proposal.json`. */
export function isProposalFilePath(path: string): boolean {
  const match = PROPOSAL_PATH_RE.exec(path);
  return (
    match !== null && match[2] === PROPOSAL_FILE && PROPOSAL_ID_RE.test(match[1] ?? '')
  );
}

/**
 * `true` para uma imagem de proposta (`proposals/<id>/images/tela.webp`): imagem
 * dentro da pasta da proposta, sem `..`.
 */
export function isProposalImagePath(path: string): boolean {
  const match = PROPOSAL_PATH_RE.exec(path);
  if (!match || !PROPOSAL_ID_RE.test(match[1] ?? '')) return false;
  const rest = match[2] ?? '';
  return (
    isImageFileName(rest) && !rest.split('/').some((part) => part === '..' || part === '')
  );
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
