import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { perspectiveSchema, type Perspective } from '../model';
import { channelDbName } from '../utils/channel';
import { reportError } from '../utils/report';
import { hasIndexedDb, withTimeout } from './local';

// Perspectivas "Só eu" (etapa #659, PE2): ficam neste navegador, por `project.id`, no mesmo
// formato de um item de `perspectives` do `mapping.json`, e não vão ao arquivo. Banco próprio:
// mexer na versão do banco dos projetos locais (`local.ts`) pediria uma atualização que uma aba
// antiga aberta bloquearia (o mesmo motivo do banco das pastas recentes).

const DB_NAME = channelDbName('mapping-perspectivas');
const DB_VERSION = 1;

interface Schema extends DBSchema {
  /** `project.id` → a lista das "Só eu" do projeto. */
  perspectives: { key: string; value: readonly Perspective[] };
}

/** As "Só eu" guardadas neste navegador. Nunca rejeita: falhas vão para o Diagnóstico. */
export interface LocalPerspectiveStore {
  /** As perspectivas do projeto; o que não valida é descartado. Vazio se não há nada ou se falhar. */
  load(projectId: string): Promise<readonly Perspective[]>;
  /** Substitui a lista do projeto. Lista vazia apaga a chave. */
  save(projectId: string, list: readonly Perspective[]): Promise<void>;
  close(): void;
}

/** Só o que valida como perspectiva: uma entrada corrompida não derruba as demais. */
function validPerspectives(raw: unknown): readonly Perspective[] {
  if (!Array.isArray(raw)) return [];
  const out: Perspective[] = [];
  for (const item of raw as readonly unknown[]) {
    const parsed = perspectiveSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function createStore(db: IDBPDatabase<Schema>): LocalPerspectiveStore {
  return {
    async load(projectId) {
      try {
        return validPerspectives(await db.get('perspectives', projectId));
      } catch (e) {
        reportError('perspectives.load', e);
        return [];
      }
    },

    async save(projectId, list) {
      try {
        if (list.length === 0) await db.delete('perspectives', projectId);
        else await db.put('perspectives', list, projectId);
      } catch (e) {
        reportError('perspectives.save', e);
        throw e;
      }
    },

    close: () => db.close(),
  };
}

/**
 * Abre o banco das "Só eu". `null` sem IndexedDB ou se ele não responder a tempo: a opção "Só eu"
 * fica indisponível (decisão 14).
 */
export async function openLocalPerspectives(): Promise<LocalPerspectiveStore | null> {
  try {
    if (!hasIndexedDb()) return null;
    const db = await withTimeout(
      openDB<Schema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore('perspectives');
        },
      }),
    );
    return db && createStore(db);
  } catch (e) {
    reportError('perspectives.open', e);
    return null;
  }
}
