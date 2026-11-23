// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { MemoryDirectory } from '../storage/memoryFs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function noModification(): Error {
  const e = new Error('The object can not be modified in this way.');
  e.name = 'NoModificationAllowedError';
  return e;
}

/** Folder whose write of `target` fails while `failing.on` is true. */
function start(root: MemoryDirectory, failing: { on: boolean; target: string }) {
  const inner = createFolderStorage(root);
  const storage = {
    ...inner,
    saveMapping: (text: string) =>
      failing.on && failing.target === 'mapping'
        ? Promise.reject(noModification())
        : inner.saveMapping(text),
    writeSpecFile: (path: string, data: Blob | string) =>
      failing.on && failing.target === 'specFile'
        ? Promise.reject(noModification())
        : inner.writeSpecFile(path, data),
    writeSpec: (file: string, text: string) =>
      failing.on && failing.target === 'spec'
        ? Promise.reject(noModification())
        : inner.writeSpec(file, text),
  };
  return openSession({
    storage,
    project: sampleProject(),
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => NOW,
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

describe('applying a specialization package when the write fails (R17.3)', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it.each(['mapping', 'specFile', 'spec'])(
    'a failing %s write leaves the status on error, never saved',
    async (target) => {
      const root = new MemoryDirectory('p');
      const failing = { on: true, target };
      session = await start(root, failing);
      expect(
        session.actions.applySpecialization(material3Spec(), material3Package()).ok,
      ).toBe(true);
      await settle();
      expect(session.saveStatus.value).toBe('error');
      // Retry after the folder is writable again: it saves.
      failing.on = false;
      await session.flush();
      expect(session.saveStatus.value).toBe('saved');
    },
  );

  it('a failed write followed by a no-op flush does not read as saved', async () => {
    const root = new MemoryDirectory('p');
    const failing = { on: true, target: 'mapping' };
    session = await start(root, failing);
    session.actions.applySpecialization(material3Spec(), material3Package());
    await settle();
    expect(session.saveStatus.value).toBe('error');
    const result = await session.flush();
    expect(result.ok).toBe(false);
    expect(session.saveStatus.value).toBe('error');
  });
});
