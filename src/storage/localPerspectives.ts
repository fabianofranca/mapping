import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { perspectiveSchema, type Perspective } from '../model';
import { channelDbName } from '../utils/channel';
import { reportError } from '../utils/report';
import { hasIndexedDb, withTimeout } from './local';

// "Only me" perspectives (stage #659, PE2): they stay in this browser, by `project.id`, in the
// same format as an item of `perspectives` in `mapping.json`, and do not go to the file. Own
// database: changing the version of the local projects database (`local.ts`) would require an
// upgrade that an old open tab would block (the same reason as the recent folders database).

const DB_NAME = channelDbName('mapping-perspectivas');
const DB_VERSION = 1;

interface Schema extends DBSchema {
  /** `project.id` → the project's "Only me" list. */
  perspectives: { key: string; value: readonly Perspective[] };
}

/**
 * The "Only me" perspectives kept in this browser. `load` never rejects (failures go to
 * Diagnostics and the list comes back empty); `save` records the failure and rejects, and the
 * caller decides what to do.
 */
export interface LocalPerspectiveStore {
  /** The project's perspectives; whatever does not validate is discarded. Empty if there is
   * nothing or if it fails. */
  load(projectId: string): Promise<readonly Perspective[]>;
  /** Replaces the project's list. An empty list deletes the key. */
  save(projectId: string, list: readonly Perspective[]): Promise<void>;
  close(): void;
}

/** Only what validates as a perspective: a corrupted entry does not take down the others. */
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
 * Opens the "Only me" database. `null` without IndexedDB or if it does not answer in time: the
 * "Only me" option becomes unavailable (decision 14).
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
