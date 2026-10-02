import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { channelDbName } from '../utils/channel';
import type { ProjectFiles } from './zip';
import { BACKUPS_DIR, backupTimestamp, type ProjectStorage } from './types';

/** O preview usa outro banco (`-preview`): nunca enxerga os projetos da versão principal. */
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
        ...[...files.specs].map(([path, text]) =>
          toStoredFile(id, path, new Blob([text], { type: SPEC_TYPE })),
        ),
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
    const open = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('mappings');
        const files = db.createObjectStore('files', { keyPath: ['projectId', 'path'] });
        files.createIndex('byProject', 'projectId');
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), OPEN_TIMEOUT_MS);
    });
    const db = await Promise.race([open, timeout]);
    clearTimeout(timer);
    if (!db) {
      void open.then((late) => late.close()).catch(() => undefined);
      return null;
    }
    return createLibrary(db);
  } catch {
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
