// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';
import { material3Package, material3Spec } from '../storage/packageFixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

describe('sessão: componentes', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  function start(root: MemoryDirectory) {
    let n = 0;
    return openSession({
      storage: createFolderStorage(root),
      project: sampleProject(),
      prepareImage: () => Promise.reject(new Error('sem imagens')),
      now: () => NOW,
      newId: () => `id-${++n}`,
    });
  }

  it('aplicar a biblioteca carrega o catálogo e addComponent usa o tipo', async () => {
    session = start(new MemoryDirectory('p'));
    expect(session.components.catalog.value.size).toBe(0);
    expect(
      session.actions.applySpecialization(material3Spec(), material3Package()).ok,
    ).toBe(true);
    await session.components.whenIdle();
    const components = session.components.catalog.value.get('material3');
    expect(components?.problems).toEqual([]);
    expect(components?.byType.has('m3-button')).toBe(true);

    const created = session.actions.addComponent({
      imageId: 'I2',
      parentId: null,
      specId: 'material3',
      typeId: 'm3-button',
    });
    expect(created.ok).toBe(true);
    await settle();
  });

  it('reabrir o projeto lê os componentes do disco', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    await session.components.whenIdle();
    const saved = session.store.committed.value;
    await session.close();
    session = null;

    const reopened = openSession({
      storage: createFolderStorage(root),
      project: saved ?? sampleProject(),
      prepareImage: () => Promise.reject(new Error('sem imagens')),
      now: () => NOW,
    });
    session = reopened;
    await reopened.components.whenIdle();
    expect(
      reopened.components.catalog.value.get('material3')?.byType.size,
    ).toBeGreaterThan(5);
  });

  it('desfazer a aplicação tira o catálogo e refazer o traz de volta', async () => {
    session = start(new MemoryDirectory('p'));
    session.actions.applySpecialization(material3Spec(), material3Package());
    await session.components.whenIdle();
    expect(session.components.catalog.value.size).toBe(1);
    session.store.undo();
    expect(session.components.catalog.value.size).toBe(0);
    session.store.redo();
    await session.components.whenIdle();
    expect(session.components.catalog.value.size).toBe(1);
  });
});
