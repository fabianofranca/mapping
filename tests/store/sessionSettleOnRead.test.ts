// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize, serialize } from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Decisions 6 and 7 of #1971: reading settles the project in memory; opening does not write; the
// corrected `parentId` reaches the disk on the next save caused by an edit, with `revision + 1`.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** The sample project's `mapping.json` with `M2` (inside `M1` by geometry) edited to a null parent. */
function handEditedText(): string {
  const json = JSON.parse(serialize(sampleProject())) as {
    markings: { id: string; parentId: string | null }[];
  };
  const m2 = json.markings.find((m) => m.id === 'M2');
  if (!m2) throw new Error('fixture');
  m2.parentId = null;
  return JSON.stringify(json, null, 2);
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

describe('opening a hand-edited project settles it in memory only', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('opening does not write; the next edit writes the settled parentId with revision + 1', async () => {
    const root = new MemoryDirectory('p');
    const text = handEditedText();
    root.put('mapping.json', text);
    const storage = createFolderStorage(root);

    const loaded = await loadProject(storage);
    if (!loaded.ok) throw new Error(`load failed: ${loaded.error}`);
    expect(loaded.project.markings.find((m) => m.id === 'M2')?.parentId).toBe('M1');

    session = openSession({
      storage,
      project: loaded.project,
      readOnly: loaded.readOnly,
      prepareImage: () => Promise.reject(new Error('unused')),
      now: () => NOW,
      newId: ids(),
    });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    // Opening saved nothing: the file is the one the person edited.
    expect(await root.read('mapping.json')).toBe(text);

    session.actions.renameMarking('M1', 'Door');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('invalid saved mapping');
    expect(saved.project.revision).toBe(loaded.project.revision + 1);
    expect(saved.project.markings.find((m) => m.id === 'M2')?.parentId).toBe('M1');
    expect(saved.project.markings.find((m) => m.id === 'M1')?.name).toBe('Door');
  });

  it('an already settled file opens as the same object and is not rewritten', async () => {
    const root = new MemoryDirectory('p');
    const text = serialize(sampleProject());
    root.put('mapping.json', text);
    const loaded = await loadProject(createFolderStorage(root));
    if (!loaded.ok) throw new Error(`load failed: ${loaded.error}`);
    expect(await root.read('mapping.json')).toBe(text);
    const reread = deserialize(text);
    if (!reread.ok) throw new Error('invalid');
    expect(loaded.project).toEqual(reread.project);
  });
});
