// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Perspective } from '../../src/model';
import {
  openLocalPerspectives,
  type LocalPerspectiveStore,
} from '../../src/storage/localPerspectives';

// The "Only me" perspectives live in IndexedDB by `project.id`, in the format of an item of
// `perspectives` of `mapping.json` (stage #659, PE2).

let store: LocalPerspectiveStore;

/** Reads/writes the database from outside the API, to prove what is stored and what is corrupted. */
async function rawDb() {
  // pt-BR kept: the IndexedDB name is the code identifier of src/storage/localPerspectives.ts
  return openDB('mapping-perspectivas', 1);
}
async function rawKeys(): Promise<IDBValidKey[]> {
  const db = await rawDb();
  try {
    return await db.getAllKeys('perspectives');
  } finally {
    db.close();
  }
}
async function rawPut(key: string, value: unknown): Promise<void> {
  const db = await rawDb();
  try {
    await db.put('perspectives', value, key);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  const opened = await openLocalPerspectives();
  if (!opened) throw new Error('IndexedDB unavailable');
  store = opened;
  await store.save('p1', []);
  await store.save('p2', []);
});

afterEach(() => store.close());

const mobile: Perspective = {
  id: 'PS1',
  name: 'Mobile',
  hiddenLayers: ['L2'],
  items: [{ root: 'I1', x: 10, y: 20 }],
};
const tablet: Perspective = { id: 'PS2', name: 'Tablet', hiddenLayers: [], items: [] };

describe('LocalPerspectiveStore (IndexedDB)', () => {
  it('with nothing stored, the list is empty', async () => {
    expect(await store.load('p1')).toEqual([]);
  });

  it('stores and returns the perspectives, per project', async () => {
    await store.save('p1', [mobile, tablet]);
    await store.save('p2', [tablet]);
    expect(await store.load('p1')).toEqual([mobile, tablet]);
    expect(await store.load('p2')).toEqual([tablet]);
  });

  it('save replaces the whole list', async () => {
    await store.save('p1', [mobile, tablet]);
    await store.save('p1', [tablet]);
    expect(await store.load('p1')).toEqual([tablet]);
  });

  it('an empty list deletes the key', async () => {
    await store.save('p1', [mobile]);
    await store.save('p1', []);
    expect(await store.load('p1')).toEqual([]);
    expect(await rawKeys()).not.toContain('p1');
  });

  it('discards what does not validate and keeps the rest', async () => {
    await rawPut('p1', [mobile, { id: 'X', name: 3 }, 'junk', tablet]);
    expect(await store.load('p1')).toEqual([mobile, tablet]);
  });

  it('a stored value that is not a list becomes an empty list', async () => {
    await rawPut('p1', { id: 'PS1' });
    expect(await store.load('p1')).toEqual([]);
  });

  it('without IndexedDB, openLocalPerspectives returns null', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      expect(await openLocalPerspectives()).toBeNull();
    } finally {
      if (saved) Object.defineProperty(globalThis, 'indexedDB', saved);
    }
  });
});
