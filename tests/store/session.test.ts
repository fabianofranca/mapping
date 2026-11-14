// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  serialize,
  serializeProposal,
  specFiles,
  type Project,
} from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import type { PreparedImage } from '../../src/storage/imageImport';
import { loadProposals } from '../../src/storage/loadProposals';
import { HISTORY_LIMIT } from '../../src/store/history';
import { openSession, type ProjectSession } from '../../src/store/session';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';
import { cadastroProject, legacyCodeFiles, loadExample } from '../model/specFixtures';
import { richScenario } from './proposalHarness';
import { MemoryDirectory } from '../storage/memoryFs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Fake "decoder": the file content is "LxA"; "bad" fails. */
async function prepareImage(file: File): Promise<PreparedImage> {
  const text = await file.text();
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) throw new Error('decode');
  return {
    name: file.name,
    data: file,
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function start(root: MemoryDirectory, project = emptyProject(), readOnly = false) {
  return openSession({
    storage: createFolderStorage(root),
    project,
    readOnly,
    prepareImage,
    now: () => NOW,
    newId: ids(),
  });
}

async function savedProject(root: MemoryDirectory) {
  const text = await root.read('mapping.json');
  const parsed = deserialize(text ?? '');
  if (!parsed.ok) throw new Error(`invalid mapping: ${text}`);
  return parsed.project;
}

const file = (name: string, content: string) => new File([content], name);

describe('project session', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('writes and removes the copy in specs/ on apply, remove and undo', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const sdui = loadExample('sdui');
    expect(session.actions.applySpecialization(sdui).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const copy = await root.read('specs/sdui.json');
    expect(JSON.parse(copy ?? '')).toEqual(sdui);
    expect((await savedProject(root)).specializations).toEqual([
      { id: 'sdui', version: sdui.version, file: 'specs/sdui.json', spec: null },
    ]);

    expect(session.actions.removeSpecialization('sdui', 'convert').ok).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(await root.read('specs/sdui.json')).toBeNull();
    expect((await savedProject(root)).specializations).toEqual([]);

    session.store.undo();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(await root.read('specs/sdui.json')).toBe(copy);

    const files = await session.collectFiles();
    expect([...files.specs.keys()]).toEqual(['specs/sdui.json']);
    expect(files.specs.get('specs/sdui.json')).toBe(copy);
  });

  it('adds images: writes the file, creates the entry and saves the mapping without waiting for the debounce', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const result = await session.addImages([
      file('a.jpg', '400x300'),
      file('a.jpg', '100x100'),
    ]);

    expect(result).toEqual({ added: ['images/a.jpg', 'images/a-2.jpg'], failed: [] });
    expect(await root.read('images/a.jpg')).toBe('400x300');
    expect(await root.read('images/a-2.jpg')).toBe('100x100');
    // Expensive operation (phase 5.5): the whole import writes once, when it finishes.
    expect(session.saveStatus.value).toBe('saved');
    const saved = await savedProject(root);
    expect(saved.containers.map((i) => [i.file, i.width, i.height])).toEqual([
      ['images/a.jpg', 400, 300],
      ['images/a-2.jpg', 100, 100],
    ]);
    // Each image is one undo entry.
    session.store.undo();
    expect(session.store.project.value?.containers).toHaveLength(1);
  });

  it('reports the images that could not be imported', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const result = await session.addImages([
      file('bad.jpg', 'bad'),
      file('b.png', '8x8'),
    ]);
    expect(result).toEqual({ added: ['images/b.png'], failed: ['bad.jpg'] });
    expect(await root.read('images/bad.jpg')).toBeNull();
  });

  describe('truly free name when importing and replacing', () => {
    it('delete the container, import another foo.png and undo: the original comes back intact', async () => {
      const root = new MemoryDirectory('p');
      session = start(root);
      await session.addImages([file('foo.png', '400x300')]);
      await session.flush();
      const containerId = session.store.project.value?.containers[0]?.id ?? '';
      session.actions.removeContainer(containerId);
      await session.flush();
      expect(await root.read('images/foo.png')).toBeNull();

      const result = await session.addImages([file('foo.png', '100x100')]);
      expect(result.added).toEqual(['images/foo-2.png']);
      await session.flush();

      session.store.undo(); // undoes the import
      session.store.undo(); // undoes the removal
      await session.flush();
      expect(await root.read('images/foo.png')).toBe('400x300');
      expect(await root.read('images/foo-2.png')).toBeNull();
    });

    it('two concurrent imports with the same name write different files', async () => {
      const root = new MemoryDirectory('p');
      session = start(root);
      const [a, b] = await Promise.all([
        session.addImages([file('image.png', '100x100')]),
        session.addImages([file('image.png', '200x200')]),
      ]);
      await session.flush();
      expect([...a.added, ...b.added].sort()).toEqual([
        'images/image-2.png',
        'images/image.png',
      ]);
      const contents = [
        await root.read('images/image.png'),
        await root.read('images/image-2.png'),
      ];
      expect(contents.sort()).toEqual(['100x100', '200x200']);
    });

    it('a loose file in images/ (even with another case) is not overwritten', async () => {
      const root = new MemoryDirectory('p');
      root.put('images/Loose.png', 'user data');
      session = start(root);
      const result = await session.addImages([file('loose.png', '100x100')]);
      expect(result.added).toEqual(['images/loose-2.png']);
      await session.flush();
      expect(await root.read('images/Loose.png')).toBe('user data');
      expect(await root.read('images/loose-2.png')).toBe('100x100');
    });

    it('replaceImage picks the name by the same rule', async () => {
      const root = new MemoryDirectory('p');
      session = start(root);
      await session.addImages([file('a.png', '400x300')]);
      await session.flush();
      root.put('images/B.png', 'user data');
      const containerId = session.store.project.value?.containers[0]?.id ?? '';
      const outcome = await session.replaceImage(
        containerId,
        file('b.png', '400x300'),
        async () => true,
      );
      expect(outcome).toBe('replaced');
      expect(session.store.project.value?.containers[0]?.file).toBe('images/b-2.png');
      expect(await root.read('images/B.png')).toBe('user data');
    });

    it('the reserved name is released when the write fails', async () => {
      const root = new MemoryDirectory('p');
      session = start(root);
      const failed = await session.addImages([file('x.png', 'bad')]);
      expect(failed.failed).toEqual(['x.png']);
      const ok = await session.addImages([file('x.png', '10x10')]);
      expect(ok.added).toEqual(['images/x.png']);
    });
  });

  it('removes the deleted image only after saving and restores it on undo', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('a.jpg', '400x300')]);
    await session.flush();
    const containerId = session.store.project.value?.containers[0]?.id ?? '';

    session.actions.removeContainer(containerId);
    expect(await root.read('images/a.jpg')).toBe('400x300');
    await session.flush();
    expect(await root.read('images/a.jpg')).toBeNull();
    expect((await savedProject(root)).containers).toEqual([]);
    // Meanwhile, the session can still read the image (to display it on undo).
    expect(await (await session.readImage('images/a.jpg'))?.text()).toBe('400x300');

    session.store.undo();
    await session.flush();
    expect(await root.read('images/a.jpg')).toBe('400x300');
    expect((await savedProject(root)).containers.map((i) => i.file)).toEqual([
      'images/a.jpg',
    ]);
  });

  describe('swap image', () => {
    async function withImage(content = '400x300') {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', content)]);
      const created = s.actions.createMarking(
        s.store.project.value?.containers[0]?.id ?? '',
        { x: 100, y: 100, width: 200, height: 100 },
      );
      if (!created.ok) throw new Error(created.error);
      await s.flush();
      const containerId = s.store.project.value?.containers[0]?.id ?? '';
      return { root, s, containerId };
    }
    const current = (s: ProjectSession) => {
      const p = s.store.project.value;
      if (!p) throw new Error('no project');
      return p;
    };

    it('same aspect ratio: rescales without asking and swaps the file', async () => {
      const { root, s, containerId } = await withImage();
      const confirm = vi.fn(async () => true);
      expect(await s.replaceImage(containerId, file('b.jpg', '800x600'), confirm)).toBe(
        'replaced',
      );
      expect(confirm).not.toHaveBeenCalled();
      const p = current(s);
      expect(p.containers[0]).toMatchObject({
        file: 'images/b.jpg',
        width: 800,
        height: 600,
      });
      expect(p.markings[0]).toMatchObject({
        rect: { x: 200, y: 200, width: 400, height: 200 },
        needsReview: false,
        locked: false,
      });
      await s.flush();
      expect(await root.read('images/b.jpg')).toBe('800x600');
      expect(await root.read('images/a.jpg')).toBeNull();

      // Undo goes back to the old file, which is restored on disk.
      s.store.undo();
      await s.flush();
      expect(current(s).containers[0]?.file).toBe('images/a.jpg');
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('different aspect ratio: asks and marks the markings for review', async () => {
      const { s, containerId } = await withImage();
      const confirm = vi.fn(async () => true);
      expect(await s.replaceImage(containerId, file('b.jpg', '400x400'), confirm)).toBe(
        'replaced',
      );
      expect(confirm).toHaveBeenCalledWith({
        from: { width: 400, height: 300 },
        to: { width: 400, height: 400 },
      });
      expect(current(s).markings[0]?.needsReview).toBe(true);
    });

    it('different aspect ratio refused: writes and changes nothing', async () => {
      const { root, s, containerId } = await withImage();
      const before = current(s);
      const result = await s.replaceImage(
        containerId,
        file('b.jpg', '400x400'),
        async () => false,
      );
      expect(result).toBe('cancelled');
      expect(current(s)).toBe(before);
      expect(await root.read('images/b.jpg')).toBeNull();
    });

    it('locked image: swapping for another size is refused without asking or writing; for the same size, it is not', async () => {
      const { root, s, containerId } = await withImage();
      s.actions.setImageLocked(containerId, true);
      const before = current(s);
      const confirm = vi.fn(async () => true);
      expect(await s.replaceImage(containerId, file('b.jpg', '400x400'), confirm)).toBe(
        'locked',
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(current(s)).toBe(before);
      expect(await root.read('images/b.jpg')).toBeNull();
      expect(await s.replaceImage(containerId, file('c.jpg', '400x300'), confirm)).toBe(
        'replaced',
      );
      expect(current(s).containers[0]).toMatchObject({
        file: 'images/c.jpg',
        locked: true,
      });
    });

    it('locked marking: swapping for another size is refused', async () => {
      const { s, containerId } = await withImage();
      s.actions.setMarkingLocked(current(s).markings[0]?.id ?? '', true);
      expect(
        await s.replaceImage(containerId, file('b.jpg', '800x600'), async () => true),
      ).toBe('locked');
    });

    it('unreadable file fails without changing the project', async () => {
      const { s, containerId } = await withImage();
      const before = current(s);
      expect(
        await s.replaceImage(containerId, file('b.jpg', 'bad'), async () => true),
      ).toBe('failed');
      expect(current(s)).toBe(before);
    });

    it('repoints a missing image', async () => {
      const { root, s, containerId } = await withImage();
      await root.getDirectoryHandle('images').then((d) => d.removeEntry('a.jpg'));
      expect(await s.readImage('images/a.jpg')).toBeNull();
      expect(
        await s.replaceImage(containerId, file('a.jpg', '400x300'), async () => true),
      ).toBe('replaced');
      expect(current(s).containers[0]?.file).toBe('images/a-2.jpg');
      expect(current(s).markings[0]?.rect).toEqual({
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
    });
  });

  describe('memory: content of the removed images', () => {
    async function removedImage() {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      await s.flush();
      const containerId = s.store.project.value?.containers[0]?.id ?? '';
      s.actions.removeContainer(containerId);
      await s.flush();
      return { root, s };
    }
    const bump = (s: ProjectSession, n: number) => {
      for (let i = 0; i < n; i++) s.actions.renameProject(`name ${i}`);
    };

    it('keeps the content while undo would still restore the image', async () => {
      const { root, s } = await removedImage();
      bump(s, 5);
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      expect(await (await s.readImage('images/a.jpg'))?.text()).toBe('400x300');
      for (let i = 0; i < 6; i++) s.store.undo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('keeps an in-memory copy: on a real disk the read file disappears along with the file', async () => {
      const root = new MemoryDirectory('p');
      const real = createFolderStorage(root);
      const gone = new Set<string>();
      // Like a folder's `File`: after the file is removed, reading the content fails.
      const storage: typeof real = {
        ...real,
        readImage: async (path) => {
          const blob = await real.readImage(path);
          if (!blob) return null;
          return {
            type: blob.type,
            arrayBuffer: () =>
              gone.has(path)
                ? Promise.reject(new Error('NotReadableError'))
                : blob.arrayBuffer(),
          } as unknown as Blob;
        },
        removeImage: async (path) => {
          await real.removeImage(path);
          gone.add(path);
        },
      };
      const s = openSession({
        storage,
        project: emptyProject(),
        readOnly: false,
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      await s.flush();
      s.store.undo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      s.store.redo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('releases the content when no history snapshot references the file', async () => {
      const { s } = await removedImage();
      expect(await s.readImage('images/a.jpg')).not.toBeNull();
      // Past the history limit: the snapshot with the image leaves `past`.
      bump(s, HISTORY_LIMIT + 1);
      await s.flush();
      expect(await s.readImage('images/a.jpg')).toBeNull();
    });

    it('releases the content when a new change discards the "redo"', async () => {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      await s.flush();
      // Undoes the addition: the image leaves the project, but the "redo" would still restore it.
      s.store.undo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      expect(await s.readImage('images/a.jpg')).not.toBeNull();
      s.store.redo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBe('400x300');

      s.store.undo();
      await s.flush();
      bump(s, 1);
      await s.flush();
      expect(await s.readImage('images/a.jpg')).toBeNull();
    });

    it('does not even keep the content of a file that the history would never restore', async () => {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      s.actions.removeContainer(s.store.project.value?.containers[0]?.id ?? '');
      bump(s, HISTORY_LIMIT + 1);
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      expect(await s.readImage('images/a.jpg')).toBeNull();
    });
  });

  it('records the write failure and the import failure in Diagnostics', async () => {
    clearReportedErrors();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('bad.jpg', 'bad')]);
    session.actions.renameProject('Other name');
    root.failWrites = new Error('no permission');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(reportedErrors.value.map((e) => [e.context, e.message])).toEqual([
      ['session.addImage', 'decode'],
      ['save', 'no permission'],
    ]);
    root.failWrites = null;
    vi.restoreAllMocks();
  });

  it('with a write error shows the status and tries again', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.renameProject('Other name');
    root.failWrites = new Error('no permission');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.saveStatus.value).toBe('error');

    root.failWrites = null;
    await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect((await savedProject(root)).project.name).toBe('Other name');
  });

  it('a cleanup failure after mapping.json is not a write error (phase 5.2)', async () => {
    clearReportedErrors();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new MemoryDirectory('p');
    session = start(root);
    const storage = session.storage;
    await session.addImages([file('a.jpg', '400x300')]);
    await session.flush();
    const revision = (await savedProject(root)).revision;
    const containerId = session.store.project.value?.containers[0]?.id ?? '';

    const remove = vi
      .spyOn(storage, 'removeImage')
      .mockRejectedValue(new Error('file in use'));
    session.actions.removeContainer(containerId);
    const flushed = await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect(flushed).toEqual({ ok: true });
    expect((await savedProject(root)).revision).toBe(revision + 1);
    expect((await savedProject(root)).containers).toEqual([]);
    expect(reportedErrors.value.map((e) => [e.context, e.message])).toEqual([
      ['session.cleanup', 'file in use'],
    ]);

    // The next write bumps only one revision and tries the removal again.
    remove.mockRestore();
    session.actions.renameProject('Other name');
    await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect((await savedProject(root)).revision).toBe(revision + 2);
    expect(await root.read('images/a.jpg')).toBeNull();
    vi.restoreAllMocks();
  });

  it('writes nothing on open, not even in read-only mode', async () => {
    const root = new MemoryDirectory('p');
    session = start(root, sampleProject(), true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await session.addImages([file('a.jpg', '10x10')])).toEqual({
      added: [],
      failed: ['a.jpg'],
    });
    await session.flush();
    expect(root.files.size).toBe(0);
    expect(root.dirs.size).toBe(0);
  });

  it('collectFiles writes the pending one and joins the mapping and existing images', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('a.jpg', '400x300')]);
    const files = await session.collectFiles();
    expect(files.mapping).toBe(await root.read('mapping.json'));
    expect(files.mapping).toBe(serialize(await savedProject(root)));
    expect([...files.images.keys()]).toEqual(['images/a.jpg']);
  });

  describe('gesto em andamento (fase 5.1)', () => {
    /** Session over the folder, counting the writes of `mapping.json`. */
    function startCounting(root: MemoryDirectory) {
      const storage = createFolderStorage(root);
      let saves = 0;
      const s = openSession({
        storage: {
          ...storage,
          saveMapping: async (text) => {
            saves++;
            await storage.saveMapping(text);
          },
        },
        project: sampleProject(),
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      return { session: s, saves: () => saves };
    }

    const m4x = (p: { markings: readonly { id: string; rect: { x: number } }[] }) =>
      p.markings.find((m) => m.id === 'M4')?.rect.x;

    it('timer in the middle of the gesture canceled: the disk stays equal to the committed state', async () => {
      const root = new MemoryDirectory('p');
      const counting = startCounting(root);
      session = counting.session;
      session.actions.renameProject('Renamed');
      expect(session.actions.beginGesture().ok).toBe(true);
      expect(session.actions.previewMarkingMove('M4', 50, 0).ok).toBe(true);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      session.actions.cancelGesture();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

      const saved = await savedProject(root);
      expect(saved.project.name).toBe('Renamed');
      expect(m4x(saved)).toBe(0);
      const committed = session.store.committed.value;
      if (!committed) throw new Error('no project');
      expect(await root.read('mapping.json')).toBe(
        serialize({ ...committed, revision: saved.revision }),
      );
      expect(session.saveStatus.value).toBe('saved');
    });

    it('committed gesture writes once, with the final geometry', async () => {
      const root = new MemoryDirectory('p');
      const counting = startCounting(root);
      session = counting.session;
      session.actions.beginGesture();
      session.actions.previewMarkingMove('M4', 20, 0);
      session.actions.previewMarkingMove('M4', 50, 0);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(counting.saves()).toBe(0);
      session.actions.commitGesture();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(counting.saves()).toBe(1);
      expect(m4x(await savedProject(root))).toBe(50);
    });

    it('flush during the gesture writes the committed state, not the preview', async () => {
      const root = new MemoryDirectory('p');
      session = start(root, sampleProject());
      session.actions.renameProject('Renamed');
      session.actions.beginGesture();
      session.actions.previewMarkingMove('M4', 50, 0);
      await session.flush();
      expect(m4x(await savedProject(root))).toBe(0);
      session.actions.commitGesture();
      await session.flush();
      expect(m4x(await savedProject(root))).toBe(50);
    });

    it('collectFiles durante o gesto exporta o confirmado', async () => {
      const root = new MemoryDirectory('p');
      session = start(root, sampleProject());
      session.actions.beginGesture();
      session.actions.previewMarkingMove('M4', 50, 0);
      const files = await session.collectFiles();
      const parsed = deserialize(files.mapping);
      if (!parsed.ok) throw new Error('invalid mapping.json');
      expect(m4x(parsed.project)).toBe(0);
      session.actions.cancelGesture();
    });
  });

  it('collectFiles lists the images missing from the storage', async () => {
    const root = new MemoryDirectory('p');
    session = start(root, sampleProject());
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject images 'images/frente.jpg' and 'images/lateral.jpg')
    root.put('images/frente.jpg', 'jpg');
    const files = await session.collectFiles();
    expect([...files.images.keys()]).toEqual(['images/frente.jpg']);
    expect(files.missingImages).toEqual(['images/lateral.jpg']);
  });

  describe('expensive operations write without debounce (phase 5.5)', () => {
    /** Session over the folder, measuring how many `mapping.json` writes run at the same time. */
    function startTracking(
      root: MemoryDirectory,
      project = emptyProject(),
      gate: Promise<void> = Promise.resolve(),
    ) {
      const storage = createFolderStorage(root);
      let saves = 0;
      let running = 0;
      let maxParallel = 0;
      const s = openSession({
        storage: {
          ...storage,
          saveMapping: async (text) => {
            saves++;
            running++;
            maxParallel = Math.max(maxParallel, running);
            await gate;
            await storage.saveMapping(text);
            running--;
          },
        },
        project,
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      return { session: s, saves: () => saves, maxParallel: () => maxParallel };
    }

    it('adding an image writes mapping.json without waiting for the timer', async () => {
      const root = new MemoryDirectory('p');
      const t = startTracking(root);
      session = t.session;
      await session.addImages([file('a.jpg', '400x300')]);
      expect(session.saveStatus.value).toBe('saved');
      expect((await savedProject(root)).containers.map((i) => i.file)).toEqual([
        'images/a.jpg',
      ]);
      expect(t.saves()).toBe(1);
    });

    it('swapping an image writes without waiting for the timer', async () => {
      const root = new MemoryDirectory('p');
      root.put('images/lateral.jpg', 'jpg');
      session = startTracking(root, sampleProject()).session;
      const result = await session.replaceImage('I1', file('new.jpg', '4000x3000'), () =>
        Promise.resolve(true),
      );
      expect(result).toBe('replaced');
      expect((await savedProject(root)).containers.find((i) => i.id === 'I1')?.file).toBe(
        'images/new.jpg',
      );
    });

    it('removing an image and applying, updating or removing a specialization write without waiting for the timer', async () => {
      const root = new MemoryDirectory('p');
      session = startTracking(root, sampleProject()).session;
      const sdui = loadExample('sdui');

      expect(session.actions.applySpecialization(sdui).ok).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).specializations.map((s) => s.id)).toEqual([
        'sdui',
      ]);

      expect(
        session.actions.updateSpecialization({ ...sdui, version: sdui.version + 1 }).ok,
      ).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).specializations[0]?.version).toBe(
        sdui.version + 1,
      );

      expect(session.actions.removeSpecialization('sdui', 'convert').ok).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).specializations).toEqual([]);

      expect(session.actions.removeContainer('I2').ok).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).containers.map((i) => i.id)).toEqual(['I1']);
    });

    it('two expensive operations in a row do not write in parallel', async () => {
      const root = new MemoryDirectory('p');
      let release = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      const t = startTracking(root, sampleProject(), gate);
      session = t.session;
      // Releases the write even if a check fails, so that the afterEach `close` can finish.
      try {
        expect(session.actions.applySpecialization(loadExample('sdui')).ok).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        // The first write is in progress when the second operation arrives.
        expect(t.saves()).toBe(1);
        expect(session.actions.removeContainer('I2').ok).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        expect(t.saves()).toBe(1);
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(t.saves()).toBe(2);
        expect(t.maxParallel()).toBe(1);
        expect(session.saveStatus.value).toBe('saved');
        const saved = await savedProject(root);
        expect(saved.revision).toBe(sampleProject().revision + 2);
        expect(saved.containers.map((i) => i.id)).toEqual(['I1']);
        expect(saved.specializations.map((s) => s.id)).toEqual(['sdui']);
      } finally {
        release();
      }
    });

    it('an ordinary edit reaches the disk within 250 ms', async () => {
      const root = new MemoryDirectory('p');
      session = startTracking(root).session;
      session.actions.renameProject('Fast');
      await vi.advanceTimersByTimeAsync(250);
      expect((await savedProject(root)).project.name).toBe('Fast');
    });

    it('ordinary edits keep waiting for the debounce', async () => {
      const root = new MemoryDirectory('p');
      session = startTracking(root).session;
      session.actions.renameProject('Slow');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
      expect(await root.read('mapping.json')).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect((await savedProject(root)).project.name).toBe('Slow');
    });
  });

  it('closing writes whatever is pending', async () => {
    const root = new MemoryDirectory('p');
    const s = start(root);
    s.actions.renameProject('Closed');
    await s.close();
    expect((await savedProject(root)).project.name).toBe('Closed');
    expect(s.store.project.value).toBeNull();
  });

  // Phase 8.1: `onChanged` (S4, S8), orphan images on reload (S6) and `collectFiles().saved`.
  describe('what changed in the storage and the orphan files (phase 8.1)', () => {
    /** Another process writes `mapping.json`: changes the name and bumps the revision. */
    function externalWrite(root: MemoryDirectory, project: Project, name: string) {
      const next = {
        ...project,
        revision: project.revision + 1,
        project: { ...project.project, name },
      };
      root.put('mapping.json', serialize(next));
      return next;
    }

    /** Session over the folder, with `onChanged` counted and the next mapping write holdable. */
    function hookedStart(root: MemoryDirectory, project: Project) {
      const storage = createFolderStorage(root);
      const gates: { resolve: () => void; promise: Promise<void> }[] = [];
      let savesStarted = 0;
      const onChanged = vi.fn();
      const s = openSession({
        storage: {
          ...storage,
          saveMapping: async (text) => {
            savesStarted++;
            const gate = gates.shift();
            if (gate) await gate.promise;
            await storage.saveMapping(text);
          },
        },
        project,
        prepareImage,
        now: () => NOW,
        newId: ids(),
        onChanged,
      });
      return {
        session: s,
        onChanged,
        savesStarted: () => savesStarted,
        holdSave() {
          let resolve: () => void = () => undefined;
          const promise = new Promise<void>((res) => (resolve = res));
          const gate = { resolve: () => resolve(), promise };
          gates.push(gate);
          return gate;
        },
      };
    }

    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it('writing a proposal calls onChanged, without writing mapping.json (S4)', async () => {
      const root = new MemoryDirectory('p');
      const { proposal, ids: changeIds } = richScenario();
      const project = sampleProject();
      const text = serialize(project);
      root.put('mapping.json', text);
      root.put('proposals/P1/proposal.json', serializeProposal(proposal));
      const storage = createFolderStorage(root);
      const onChanged = vi.fn();
      session = openSession({
        storage,
        project,
        loadedText: text,
        prepareImage,
        now: () => NOW,
        onChanged,
        proposals: await loadProposals(storage),
      });
      const decided = await session.proposalActions.decide(
        'P1',
        { level: 'change', id: changeIds.name },
        'accepted',
      );
      expect(decided.ok).toBe(true);
      expect(onChanged).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await root.read('mapping.json')).toBe(text);
    });

    it('Reload after adding an image with the write refused deletes the orphan file (S6)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      session = start(root, project);
      externalWrite(root, project, 'From outside');
      const added = await session.addImages([file('a.jpg', '400x300')]);
      expect(added.added).toEqual(['images/a.jpg']);
      expect(await root.read('images/a.jpg')).toBe('400x300');
      expect(session.conflict.value).not.toBeNull();

      await session.resolveConflict('reload');
      expect(session.store.project.value?.project.name).toBe('From outside');
      // The file that only the refused write would cite does not stay in the folder forever.
      expect(await root.read('images/a.jpg')).toBeNull();
    });

    it('a file cited by an already written mapping.json is not deleted on Reload (S6)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      session = start(root, project);
      await session.addImages([file('a.jpg', '400x300')]);
      const saved = await savedProject(root);
      expect(saved.containers.map((i) => i.file)).toContain('images/a.jpg');

      session.actions.renameProject('Pending');
      // Someone outside rewrites the file without the image: it became an orphan by an outside decision.
      externalWrite(
        root,
        {
          ...saved,
          containers: saved.containers.filter((i) => i.file !== 'images/a.jpg'),
        },
        'From outside',
      );
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.conflict.value).not.toBeNull();
      await session.resolveConflict('reload');
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('image added during a write in progress, next write refused, Reload: the file is deleted (S6, A3)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      const h = hookedStart(root, project);
      session = h.session;
      session.actions.renameProject('One');
      const first = h.holdSave();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
      // The image comes in while the first write (which does not cite it) is stopped.
      const adding = session.addImages([file('a.jpg', '400x300')]);
      await vi.waitFor(async () =>
        expect(await root.read('images/a.jpg')).toBe('400x300'),
      );
      const second = h.holdSave();
      first.resolve();
      await vi.waitFor(() => expect(h.savesStarted()).toBe(2));
      // The second write (the one that would cite the image) fails on disk.
      root.failWrites = new Error('NoModificationAllowedError');
      second.resolve();
      await adding;
      expect(session.saveStatus.value).toBe('error');
      root.failWrites = null;

      const onDisk = await savedProject(root);
      expect(onDisk.project.name).toBe('One');
      externalWrite(root, onDisk, 'From outside');
      expect(await session.sync()).toBe('conflict');
      await session.resolveConflict('reload');
      expect(session.store.project.value?.project.name).toBe('From outside');
      expect(await root.read('images/a.jpg')).toBeNull();
    });

    it('image added during a write in progress: the first does not cite it and deletes it; the second rewrites it before citing (audit §6.2)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      const h = hookedStart(root, project);
      session = h.session;
      session.actions.renameProject('One');
      const first = h.holdSave();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
      const adding = session.addImages([file('a.jpg', '400x300')]);
      await vi.waitFor(async () =>
        expect(await root.read('images/a.jpg')).toBe('400x300'),
      );
      const second = h.holdSave();
      first.resolve();
      await vi.waitFor(() => expect(h.savesStarted()).toBe(2));
      // The first write does not cite the image; the second already rewrote it (it is stopped at saveMapping).
      const between = await savedProject(root);
      expect(between.project.name).toBe('One');
      expect(between.containers.map((i) => i.file)).not.toContain('images/a.jpg');
      expect(await root.read('images/a.jpg')).toBe('400x300');
      second.resolve();
      await adding;
      expect(session.saveStatus.value).toBe('saved');
      const after = await savedProject(root);
      expect(after.containers.map((i) => i.file)).toContain('images/a.jpg');
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('image added during a write, undone before the next one and redone: the disk never cites a missing file (audit §6.2)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      const h = hookedStart(root, project);
      session = h.session;
      session.actions.renameProject('One');
      const first = h.holdSave();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
      const adding = session.addImages([file('a.jpg', '400x300')]);
      await vi.waitFor(async () =>
        expect(await root.read('images/a.jpg')).toBe('400x300'),
      );
      expect(session.store.undo()).toBe(true);
      first.resolve();
      await adding;
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
      expect(session.saveStatus.value).toBe('saved');
      // Nothing to write after the undo (the disk already has 'One'); the first one's cleanup deleted the file.
      expect(h.savesStarted()).toBe(1);
      expect((await savedProject(root)).containers.map((i) => i.file)).not.toContain(
        'images/a.jpg',
      );
      expect(await root.read('images/a.jpg')).toBeNull();
      // Redo: the image comes back from the in-memory trash before the mapping.json that cites it.
      expect(session.store.redo()).toBe(true);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
      await vi.waitFor(() => expect(h.session.saveStatus.value).toBe('saved'));
      expect(h.savesStarted()).toBe(2);
      expect((await savedProject(root)).containers.map((i) => i.file)).toContain(
        'images/a.jpg',
      );
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('collectFiles with the write in error returns saved: false and carries the committed state (S8)', async () => {
      const root = new MemoryDirectory('p');
      const h = hookedStart(root, emptyProject());
      session = h.session;
      session.actions.renameProject('Not saved');
      root.failWrites = new Error('no permission');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');

      const files = await session.collectFiles();
      expect(files.saved).toBe(false);
      expect(deserialize(files.mapping)).toMatchObject({
        ok: true,
        project: { project: { name: 'Not saved' } },
      });
      root.failWrites = null;
      expect((await session.collectFiles()).saved).toBe(true);
    });

    it('the write that finally goes through with the already exported content does not call onChanged; the one of a different project does (S8)', async () => {
      const root = new MemoryDirectory('p');
      const h = hookedStart(root, emptyProject());
      session = h.session;
      session.actions.renameProject('Exported');
      root.failWrites = new Error('no permission');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');
      expect(h.onChanged).not.toHaveBeenCalled();

      // The export only counts when the file went out (8.7): the controller calls noteExported
      // at the same point as markExported.
      const files = await session.collectFiles();
      session.noteExported(files.snapshot);
      root.failWrites = null;
      expect(await session.flush()).toEqual({ ok: true });
      expect(h.onChanged).not.toHaveBeenCalled();

      session.actions.renameProject('Other');
      expect(await session.flush()).toEqual({ ok: true });
      expect(h.onChanged).toHaveBeenCalledTimes(1);
    });
    // Stage 8 (8.7), owner's decision: generating the zip (`collectFiles`) without the download marks
    // nothing as exported; the write that finally goes through with the same content calls onChanged.
    it('collectFiles without noteExported: the write of the same content calls onChanged', async () => {
      const root = new MemoryDirectory('p');
      const h = hookedStart(root, emptyProject());
      session = h.session;
      session.actions.renameProject('Cancelled');
      root.failWrites = new Error('no permission');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');

      await session.collectFiles();
      root.failWrites = null;
      expect(await session.flush()).toEqual({ ok: true });
      expect(h.onChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('backup before writing a migrated project', () => {
    const v1Text = readFileSync(
      new URL('../fixtures/mapping-v1.json', import.meta.url),
      'utf8',
    );
    // NOW = 2026-09-30T12:00:00Z; the name uses local time.
    const backupPath = () => {
      const d = new Date(NOW);
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      return `backups/mapping.v1.${stamp}.json`;
    };

    /** Opens the test v1 in a folder, as the controller does. */
    function openV1(root: MemoryDirectory, log: string[] = []) {
      root.files.set('mapping.json', new Blob([v1Text]));
      const loaded = deserialize(v1Text);
      if (!loaded.ok || loaded.migratedFrom === null) throw new Error('fixture v1');
      const storage = createFolderStorage(root);
      return openSession({
        storage: {
          ...storage,
          writeBackup: async (name, text) => {
            log.push(`backup ${name}`);
            await storage.writeBackup(name, text);
          },
          saveMapping: async (text) => {
            log.push('mapping');
            await storage.saveMapping(text);
          },
        },
        project: loaded.project,
        migratedFrom: { version: loaded.migratedFrom, text: v1Text },
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
    }

    it('opening the v1 writes nothing; the first save keeps the original and only then writes the v4', async () => {
      const root = new MemoryDirectory('p');
      const log: string[] = [];
      session = openV1(root, log);
      await vi.advanceTimersByTimeAsync(2000);
      expect(log).toEqual([]);
      expect(session.backupSaved.value).toBeNull();

      session.actions.renameProject('Migrated');
      await session.flush();
      expect(log).toEqual([`backup ${backupPath().slice('backups/'.length)}`, 'mapping']);
      expect(await root.read(backupPath())).toBe(v1Text);
      const saved = JSON.parse((await root.read('mapping.json')) ?? '') as {
        schemaVersion: number;
      };
      expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
      expect((await savedProject(root)).project.name).toBe('Migrated');
      expect(session.backupSaved.value).toBe(1);

      // Only once per opening.
      session.actions.renameProject('Again');
      await session.flush();
      expect(log).toEqual([
        `backup ${backupPath().slice('backups/'.length)}`,
        'mapping',
        'mapping',
      ]);
    });

    it('migrated file rewritten in the current schema outside before the first edit: creates no backup and does not warn', async () => {
      const root = new MemoryDirectory('p');
      const log: string[] = [];
      session = openV1(root, log);
      const current = session.store.project.value;
      if (!current) throw new Error('project');
      // Another program writes the file already in the current schema.
      root.put(
        'mapping.json',
        serialize({
          ...current,
          revision: current.revision + 1,
          project: { ...current.project, name: 'From outside' },
        }),
      );
      session.actions.renameProject('Mine');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.conflict.value).not.toBeNull();
      await session.resolveConflict('reload');
      expect(session.store.project.value?.project.name).toBe('From outside');

      session.actions.renameProject('Afterwards');
      await session.flush();
      expect(log.filter((entry) => entry.startsWith('backup'))).toEqual([]);
      expect(root.dirs.has('backups')).toBe(false);
      expect(session.backupSaved.value).toBeNull();
    });

    it('if the backup fails, the original mapping is not overwritten', async () => {
      const root = new MemoryDirectory('p');
      session = openV1(root);
      session.actions.renameProject('Migrated');
      root.failWrites = new Error('no permission');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');
      expect(await root.read('mapping.json')).toBe(v1Text);
      expect(session.backupSaved.value).toBeNull();

      // The backups/ folder created in the attempt inherited the failure (memoryFs).
      root.failWrites = null;
      const backups = root.dirs.get('backups');
      if (backups) backups.failWrites = null;
      await session.flush();
      expect(session.saveStatus.value).toBe('saved');
      expect(await root.read(backupPath())).toBe(v1Text);
      expect((await savedProject(root)).project.name).toBe('Migrated');
    });

    it('migrated project: editing and undoing to the start still writes the new format (A2)', async () => {
      const root = new MemoryDirectory('p');
      const log: string[] = [];
      session = openV1(root, log);
      session.actions.renameProject('Migrated');
      session.store.undo();
      await session.flush();
      // What is in memory (v8) differs from the disk (v1): the write happens, with the backup.
      expect(log).toEqual([`backup ${backupPath().slice('backups/'.length)}`, 'mapping']);
      const saved = JSON.parse((await root.read('mapping.json')) ?? '') as {
        schemaVersion: number;
      };
      expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
      expect(await root.read(backupPath())).toBe(v1Text);
    });

    it('v6 project: the original goes to backups/mapping.v6.… and the save writes v16', async () => {
      const root = new MemoryDirectory('p');
      const project = cadastroProject();
      const data = JSON.parse(serialize(project)) as Record<string, unknown>;
      delete data.platformRepos;
      const v6Text = `${JSON.stringify({ ...data, schemaVersion: 6 }, null, 2)}\n`;
      root.put('mapping.json', v6Text);
      const specs = specFiles(project);
      for (const [path, text] of specs) root.put(path, text);
      const loaded = deserialize(v6Text, undefined, specs);
      if (!loaded.ok || loaded.migratedFrom !== 6) throw new Error('fixture v6');
      session = openSession({
        storage: createFolderStorage(root),
        project: loaded.project,
        migratedFrom: { version: loaded.migratedFrom, text: v6Text },
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(root.dirs.has('backups')).toBe(false);

      session.actions.setPlatformRepo('android', { localPath: '../..' });
      await session.flush();
      const backup = backupPath().replace('mapping.v1.', 'mapping.v6.');
      expect(await root.read(backup)).toBe(v6Text);
      const saved = JSON.parse((await root.read('mapping.json')) ?? '') as {
        schemaVersion: number;
        revision: number;
        platformRepos: unknown;
      };
      expect(saved.schemaVersion).toBe(20);
      expect(saved.revision).toBe(1);
      expect(saved.platformRepos).toEqual({ android: { localPath: '../..' } });
      expect(session.backupSaved.value).toBe(6);
    });

    it('v8 project with the code field removed: backup of the original and writes v16 without the values', async () => {
      const root = new MemoryDirectory('p');
      const { text: v8Text, specs } = legacyCodeFiles();
      root.put('mapping.json', v8Text);
      for (const [path, text] of specs) root.put(path, text);
      const loaded = deserialize(v8Text, undefined, specs);
      if (!loaded.ok || loaded.migratedFrom !== 8) throw new Error('fixture v8');
      expect(
        loaded.project.annotations.find((a) => a.id === 'AS')?.values,
      // pt-BR kept: legacy field name 'implementacao' of the v8 fixture (migration data)
      ).not.toHaveProperty('implementacao');
      session = openSession({
        storage: createFolderStorage(root),
        project: loaded.project,
        migratedFrom: { version: loaded.migratedFrom, text: v8Text },
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(root.dirs.has('backups')).toBe(false);

      session.actions.renameProject('Registry v9');
      await session.flush();
      const backup = backupPath().replace('mapping.v1.', 'mapping.v8.');
      expect(await root.read(backup)).toBe(v8Text);
      const savedText = (await root.read('mapping.json')) ?? '';
      const saved = JSON.parse(savedText) as { schemaVersion: number; revision: number };
      expect(saved.schemaVersion).toBe(20);
      expect(saved.revision).toBe(1);
      // pt-BR kept: legacy field name 'implementacao' of the v8 fixture (migration data)
      expect(savedText).not.toContain('implementacao');
      // The old copy in specs/ stays as it was (the read ignores the field).
      expect(await root.read('specs/sdui.json')).toBe(specs.get('specs/sdui.json'));
      expect(session.backupSaved.value).toBe(8);
      // Reopened, the saved project no longer goes through the migration.
      const reopened = deserialize(savedText, undefined, specs);
      expect(reopened.ok && reopened.migratedFrom).toBeNull();
    });

    it('v10 project with urlTemplate: the original goes to backups/mapping.v10.… and the save writes v16 without the address', async () => {
      const root = new MemoryDirectory('p');
      const project = cadastroProject();
      const data = JSON.parse(serialize(project)) as Record<string, unknown>;
      data.platformRepos = {
        android: {
          urlTemplate: 'https://github.com/org/app-android/blob/main/{path}',
          localPath: '../..',
        },
        ios: {
          urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}',
          localPath: null,
        },
      };
      const v10Text = `${JSON.stringify({ ...data, schemaVersion: 10 }, null, 2)}\n`;
      root.put('mapping.json', v10Text);
      const specs = specFiles(project);
      for (const [path, text] of specs) root.put(path, text);
      const loaded = deserialize(v10Text, undefined, specs);
      if (!loaded.ok || loaded.migratedFrom !== 10) throw new Error('fixture v10');
      expect(loaded.discardedUrlTemplates.map((d) => d.platform)).toEqual([
        'android',
        'ios',
      ]);
      session = openSession({
        storage: createFolderStorage(root),
        project: loaded.project,
        migratedFrom: { version: loaded.migratedFrom, text: v10Text },
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(root.dirs.has('backups')).toBe(false);

      session.actions.renameProject('Registry v11');
      await session.flush();
      const backup = backupPath().replace('mapping.v1.', 'mapping.v10.');
      expect(await root.read(backup)).toBe(v10Text);
      const savedText = (await root.read('mapping.json')) ?? '';
      const saved = JSON.parse(savedText) as {
        schemaVersion: number;
        revision: number;
        platformRepos: unknown;
      };
      expect(saved.schemaVersion).toBe(20);
      expect(saved.revision).toBe(1);
      expect(saved.platformRepos).toEqual({ android: { localPath: '../..' } });
      expect(savedText).not.toContain('urlTemplate');
      expect(session.backupSaved.value).toBe(10);
    });

    it('project already at the current version does not generate a backup', async () => {
      const root = new MemoryDirectory('p');
      session = start(root);
      session.actions.renameProject('Other');
      await session.flush();
      expect(root.dirs.has('backups')).toBe(false);
      expect(session.backupSaved.value).toBeNull();
    });
  });
});
