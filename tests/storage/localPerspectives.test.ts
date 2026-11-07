// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Perspective } from '../../src/model';
import {
  openLocalPerspectives,
  type LocalPerspectiveStore,
} from '../../src/storage/localPerspectives';

// As perspectivas "Só eu" ficam no IndexedDB por `project.id`, no formato de um item de
// `perspectives` do `mapping.json` (etapa #659, PE2).

let store: LocalPerspectiveStore;

/** Lê/escreve o banco por fora da API, para provar o que fica guardado e o que está corrompido. */
async function rawDb() {
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
  if (!opened) throw new Error('IndexedDB indisponível');
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
  it('sem nada guardado, a lista é vazia', async () => {
    expect(await store.load('p1')).toEqual([]);
  });

  it('guarda e devolve as perspectivas, por projeto', async () => {
    await store.save('p1', [mobile, tablet]);
    await store.save('p2', [tablet]);
    expect(await store.load('p1')).toEqual([mobile, tablet]);
    expect(await store.load('p2')).toEqual([tablet]);
  });

  it('save substitui a lista inteira', async () => {
    await store.save('p1', [mobile, tablet]);
    await store.save('p1', [tablet]);
    expect(await store.load('p1')).toEqual([tablet]);
  });

  it('lista vazia apaga a chave', async () => {
    await store.save('p1', [mobile]);
    await store.save('p1', []);
    expect(await store.load('p1')).toEqual([]);
    expect(await rawKeys()).not.toContain('p1');
  });

  it('descarta o que não valida e fica com o resto', async () => {
    await rawPut('p1', [mobile, { id: 'X', name: 3 }, 'lixo', tablet]);
    expect(await store.load('p1')).toEqual([mobile, tablet]);
  });

  it('um valor guardado que não é lista vira lista vazia', async () => {
    await rawPut('p1', { id: 'PS1' });
    expect(await store.load('p1')).toEqual([]);
  });

  it('sem IndexedDB, openLocalPerspectives devolve null', async () => {
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
