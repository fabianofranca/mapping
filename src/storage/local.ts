import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { channelDbName } from '../utils/channel';
import type { ReopenableDirectory } from './folder';
import type { ProjectFiles } from './zip';
import { proposalFilePath } from '../model';
import {
  BACKUPS_DIR,
  backupTimestamp,
  isProposalFilePath,
  proposalIdOfPath,
  type ProjectStorage,
} from './types';
import { reportError } from '../utils/report';

/** O preview usa outro banco (`-preview`): nunca enxerga os projetos da versão principal. */
// O nome do banco continua o de antes do renome para "Mapping": mudá-lo faria os
// projetos locais já salvos nos navegadores dos usuários sumirem sem uma migração.
const DB_NAME = channelDbName('mapeador-imagens');
const DB_VERSION = 1;
/** Tempo máximo para abrir o banco (em `file://` alguns navegadores nunca respondem). */
const OPEN_TIMEOUT_MS = 3000;
/** As cópias de `specs/` e os backups ficam no mesmo store das imagens, com este tipo. */
const SPEC_TYPE = 'application/json';
/** Backups do `mapping.json` guardados por projeto (os mais recentes). */
export const MAX_LOCAL_BACKUPS = 3;
const BACKUP_PREFIX = `${BACKUPS_DIR}/`;

/** Mais recente primeiro. */
function byNewestBackup(a: string, b: string): number {
  return backupTimestamp(b).localeCompare(backupTimestamp(a)) || b.localeCompare(a);
}

/** Resumo de um projeto guardado neste dispositivo. */
export interface LocalProjectMeta {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  /** Há alterações desde a última exportação (ou o projeto nunca foi exportado). */
  readonly unexported: boolean;
  /** Última abertura (ISO 8601), para a lista de recentes; ausente se nunca reaberto. */
  readonly openedAt?: string;
}

interface StoredFile {
  readonly projectId: string;
  readonly path: string;
  readonly type: string;
  // ArrayBuffer em vez de Blob: o Safari já teve vários problemas com Blob no IndexedDB.
  readonly data: ArrayBuffer;
}

interface Schema extends DBSchema {
  projects: { key: string; value: LocalProjectMeta };
  mappings: { key: string; value: string };
  files: {
    key: [string, string];
    value: StoredFile;
    indexes: { byProject: string };
  };
}

type Db = IDBPDatabase<Schema>;

/** Nome e data lidos do texto do `mapping.json`, para a lista de projetos. */
function readInfo(mapping: string): { name?: string; updatedAt?: string } {
  try {
    const raw: unknown = JSON.parse(mapping);
    const project: unknown =
      typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'project') : null;
    if (typeof project !== 'object' || project === null) return {};
    const name: unknown = Reflect.get(project, 'name');
    const updatedAt: unknown = Reflect.get(project, 'updatedAt');
    return {
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
    };
  } catch {
    // Metadados opcionais: um `mapping.json` ilegível aparece sem nome na lista.
    return {};
  }
}

async function toStoredFile(
  projectId: string,
  path: string,
  data: Blob,
): Promise<StoredFile> {
  return { projectId, path, type: data.type, data: await data.arrayBuffer() };
}

export interface LocalProjectStorage extends ProjectStorage {
  readonly kind: 'local';
  readonly id: string;
}

/** Projetos guardados no IndexedDB deste navegador. */
export interface LocalLibrary {
  list(): Promise<LocalProjectMeta[]>;
  get(id: string): Promise<LocalProjectMeta | undefined>;
  /** Cria o projeto com o `mapping.json` e as imagens informadas. */
  create(
    id: string,
    files: ProjectFiles,
    options?: { unexported?: boolean },
  ): Promise<void>;
  open(id: string): LocalProjectStorage;
  remove(id: string): Promise<void>;
  setUnexported(id: string, unexported: boolean): Promise<void>;
  /** Registra a abertura (`openedAt`), para a ordem dos recentes. */
  markOpened(id: string, openedAt: string): Promise<void>;
  /** Nomes dos backups do `mapping.json` do projeto, do mais recente ao mais antigo. */
  listBackups(id: string): Promise<string[]>;
  close(): void;
}

function createLibrary(db: Db): LocalLibrary {
  return {
    async list() {
      const all = await db.getAll('projects');
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    get: (id) => db.get('projects', id),

    async create(id, files, options = {}) {
      // Converte antes de abrir a transação: ela fecha se esperar outra coisa.
      const stored = await Promise.all([
        ...[...files.images].map(([path, blob]) => toStoredFile(id, path, blob)),
        ...[...files.specs, ...files.proposals].map(([path, text]) =>
          toStoredFile(id, path, new Blob([text], { type: SPEC_TYPE })),
        ),
        ...[...files.proposalImages].map(([path, blob]) => toStoredFile(id, path, blob)),
      ]);
      const info = readInfo(files.mapping);
      const tx = db.transaction(['projects', 'mappings', 'files'], 'readwrite');
      await Promise.all([
        tx.objectStore('projects').put({
          id,
          name: info.name ?? '',
          updatedAt: info.updatedAt ?? new Date().toISOString(),
          unexported: options.unexported ?? true,
        }),
        tx.objectStore('mappings').put(files.mapping, id),
        ...stored.map((f) => tx.objectStore('files').put(f)),
        tx.done,
      ]);
    },

    open(id) {
      return {
        kind: 'local',
        id,
        async loadMapping() {
          return (await db.get('mappings', id)) ?? null;
        },
        async saveMapping(text) {
          const tx = db.transaction(['projects', 'mappings'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          await Promise.all([
            tx
              .objectStore('projects')
              .put({ ...meta, ...readInfo(text), unexported: true }),
            tx.objectStore('mappings').put(text, id),
            tx.done,
          ]);
        },
        async readImage(path) {
          const file = await db.get('files', [id, path]);
          return file ? new Blob([file.data], { type: file.type }) : null;
        },
        async writeImage(path, data) {
          await db.put('files', await toStoredFile(id, path, data));
        },
        async removeImage(path) {
          await db.delete('files', [id, path]);
        },
        async readSpec(path) {
          const file = await db.get('files', [id, path]);
          return file ? new Blob([file.data]).text() : null;
        },
        async writeSpec(path, text) {
          const blob = new Blob([text], { type: SPEC_TYPE });
          await db.put('files', await toStoredFile(id, path, blob));
        },
        async removeSpec(path) {
          await db.delete('files', [id, path]);
        },
        async listProposals() {
          const keys = await db.getAllKeysFromIndex('files', 'byProject', id);
          const ids: string[] = [];
          for (const [, path] of keys) {
            const proposalId = isProposalFilePath(path) ? proposalIdOfPath(path) : null;
            if (proposalId !== null) ids.push(proposalId);
          }
          return ids.sort();
        },
        async readProposal(proposalId) {
          const file = await db.get('files', [id, proposalFilePath(proposalId)]);
          return file ? new Blob([file.data]).text() : null;
        },
        async writeProposal(proposalId, text) {
          const blob = new Blob([text], { type: SPEC_TYPE });
          const stored = await toStoredFile(id, proposalFilePath(proposalId), blob);
          // Decidir numa proposta é trabalho a exportar, como salvar o `mapping.json`.
          const tx = db.transaction(['projects', 'files'], 'readwrite');
          const meta = await tx.objectStore('projects').get(id);
          if (!meta) throw new Error(`local project not found: ${id}`);
          await Promise.all([
            tx.objectStore('projects').put({ ...meta, unexported: true }),
            tx.objectStore('files').put(stored),
            tx.done,
          ]);
        },
        async writeBackup(name, text) {
          const blob = new Blob([text], { type: SPEC_TYPE });
          const stored = await toStoredFile(id, `${BACKUP_PREFIX}${name}`, blob);
          const tx = db.transaction('files', 'readwrite');
          await tx.store.put(stored);
          const keys = await tx.store.index('byProject').getAllKeys(id);
          const old = keys
            .map(([, path]) => path)
            .filter((path) => path.startsWith(BACKUP_PREFIX))
            .sort(byNewestBackup)
            .slice(MAX_LOCAL_BACKUPS);
          await Promise.all([...old.map((path) => tx.store.delete([id, path])), tx.done]);
        },
      };
    },

    async remove(id) {
      const tx = db.transaction(['projects', 'mappings', 'files'], 'readwrite');
      const files = tx.objectStore('files');
      const keys = await files.index('byProject').getAllKeys(id);
      await Promise.all([
        tx.objectStore('projects').delete(id),
        tx.objectStore('mappings').delete(id),
        ...keys.map((key) => files.delete(key)),
        tx.done,
      ]);
    },

    async setUnexported(id, unexported) {
      const tx = db.transaction('projects', 'readwrite');
      const meta = await tx.store.get(id);
      if (meta) await tx.store.put({ ...meta, unexported });
      await tx.done;
    },

    async markOpened(id, openedAt) {
      const tx = db.transaction('projects', 'readwrite');
      const meta = await tx.store.get(id);
      if (meta) await tx.store.put({ ...meta, openedAt });
      await tx.done;
    },

    async listBackups(id) {
      const keys = await db.getAllKeysFromIndex('files', 'byProject', id);
      return keys
        .map(([, path]) => path)
        .filter((path) => path.startsWith(BACKUP_PREFIX))
        .map((path) => path.slice(BACKUP_PREFIX.length))
        .sort(byNewestBackup);
    },

    close: () => db.close(),
  };
}

/**
 * Abre o banco local. Devolve `null` se o IndexedDB não estiver disponível
 * ou não responder (modo privado antigo, `file://` em alguns navegadores).
 */
export async function openLocalLibrary(): Promise<LocalLibrary | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await withTimeout(
      openDB<Schema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore('projects', { keyPath: 'id' });
          db.createObjectStore('mappings');
          const files = db.createObjectStore('files', { keyPath: ['projectId', 'path'] });
          files.createIndex('byProject', 'projectId');
        },
      }),
    );
    return db && createLibrary(db);
  } catch (e) {
    // Sem IndexedDB o modo local fica indisponível; o motivo vai para o Diagnóstico.
    reportError('local.open', e);
    return null;
  }
}

/** A abertura do banco, ou `null` se demorar mais que `OPEN_TIMEOUT_MS`. */
async function withTimeout<T extends { close(): void }>(
  open: Promise<T>,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), OPEN_TIMEOUT_MS);
  });
  const db = await Promise.race([open, timeout]);
  clearTimeout(timer);
  if (!db) {
    // A abertura demorou demais: se ela terminar depois, só fecha a conexão.
    void open.then((late) => late.close()).catch(() => undefined);
  }
  return db;
}

// ---- Recentes de pasta ----

/**
 * Banco à parte para os handles das pastas: criar um store no banco dos projetos locais
 * pediria uma versão nova, e uma aba antiga aberta bloquearia a atualização (o modo local
 * sumiria até ela fechar).
 */
const FOLDERS_DB_NAME = channelDbName('mapping-folders');
const FOLDERS_DB_VERSION = 1;

/** Pasta aberta recentemente. Só o handle: o navegador não deixa saber o caminho. */
export interface StoredFolder {
  readonly id: string;
  /** Nome do projeto na última vez que foi aberto. */
  readonly name: string;
  /** Nome da pasta (`handle.name`). */
  readonly folderName: string;
  /** Último uso (ISO 8601). */
  readonly usedAt: string;
  readonly handle: ReopenableDirectory;
}

interface FoldersSchema extends DBSchema {
  folders: { key: string; value: StoredFolder };
}

/** Os handles das pastas abertas, no IndexedDB deste navegador. */
export interface FolderLibrary {
  /** Do uso mais recente ao mais antigo. */
  list(): Promise<StoredFolder[]>;
  /**
   * Guarda a pasta (ou atualiza a entrada da mesma pasta, por `isSameEntry`) e devolve o id.
   * Com `replaceId` ("Localizar pasta…"), a entrada `replaceId` passa a apontar para ela.
   */
  remember(
    handle: ReopenableDirectory,
    info: { readonly name: string; readonly usedAt: string },
    replaceId?: string,
  ): Promise<string>;
  /** Atualiza o nome do projeto e o último uso de uma entrada que ainda existe. */
  touch(
    id: string,
    info: { readonly name: string; readonly usedAt: string },
  ): Promise<void>;
  /** Tira da lista. Nada no disco muda. */
  remove(id: string): Promise<void>;
  close(): void;
}

/** A entrada guardada aponta para a mesma pasta? Um handle velho que falha conta como não. */
async function sameFolder(stored: StoredFolder, handle: ReopenableDirectory) {
  try {
    return await stored.handle.isSameEntry(handle);
  } catch {
    return false;
  }
}

function createFolderLibrary(db: IDBPDatabase<FoldersSchema>): FolderLibrary {
  return {
    async list() {
      const all = await db.getAll('folders');
      return all.sort((a, b) => b.usedAt.localeCompare(a.usedAt));
    },

    async remember(handle, info, replaceId) {
      // `isSameEntry` é assíncrono e não cabe numa transação: compara antes de gravar.
      const all = await db.getAll('folders');
      let same: StoredFolder | undefined;
      for (const stored of all) {
        if (await sameFolder(stored, handle)) {
          same = stored;
          break;
        }
      }
      const id = same?.id ?? replaceId ?? crypto.randomUUID();
      const tx = db.transaction('folders', 'readwrite');
      await Promise.all([
        tx.store.put({
          id,
          name: info.name,
          folderName: handle.name,
          usedAt: info.usedAt,
          handle,
        }),
        // A pasta localizada já estava na lista: as duas entradas viram uma.
        ...(replaceId !== undefined && replaceId !== id
          ? [tx.store.delete(replaceId)]
          : []),
        tx.done,
      ]);
      return id;
    },

    async touch(id, info) {
      const tx = db.transaction('folders', 'readwrite');
      const stored = await tx.store.get(id);
      if (stored) await tx.store.put({ ...stored, ...info });
      await tx.done;
    },

    remove: (id) => db.delete('folders', id),

    close: () => db.close(),
  };
}

/**
 * Abre a lista de pastas recentes. `null` sem IndexedDB (ou se ele não responder): a tela
 * inicial fica só com os projetos deste dispositivo.
 */
export async function openFolderLibrary(): Promise<FolderLibrary | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await withTimeout(
      openDB<FoldersSchema>(FOLDERS_DB_NAME, FOLDERS_DB_VERSION, {
        upgrade(db) {
          db.createObjectStore('folders', { keyPath: 'id' });
        },
      }),
    );
    return db && createFolderLibrary(db);
  } catch (e) {
    reportError('folders.open', e);
    return null;
  }
}

/** Pede ao navegador para não apagar os dados locais sob pressão de espaço. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Sem suporte ou negado: os dados continuam lá, só sem a garantia.
  }
}
