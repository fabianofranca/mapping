import { describe, expect, it } from 'vitest';
import { serialize } from '../../../src/model';
import { createFolderStorage } from '../../../src/storage/folder';
import { loadProject } from '../../../src/storage/loadProject';
import { openSession, type ProjectSession } from '../../../src/store/session';
import { buildScaleProject } from '../../model/scaleProject';
import { MemoryDirectory } from '../../storage/memoryFs';
import { GROWTH_OPTIONS, expectLinearGrowthAsync } from '../../support/growth';

// Session cases of the growth test (#881): saving an already open project and opening it, 1,250 × 5,000 markings.
async function folderWith(markings: number) {
  const root = new MemoryDirectory('scale');
  const text = serialize(buildScaleProject({ markings }));
  root.put('mapping.json', text);
  return { root };
}

const storageOf = (root: MemoryDirectory) =>
  createFolderStorage(root, { copyId: 'scale' });

async function open(root: MemoryDirectory): Promise<ProjectSession> {
  const storage = storageOf(root);
  const loaded = await loadProject(storage);
  if (!loaded.ok) throw new Error(`scale project does not open: ${loaded.error}`);
  return openSession({
    storage,
    project: loaded.project,
    loadedText: loaded.text,
    readOnly: false,
    prepareImage: () => Promise.reject(new Error('no images')),
  });
}

describe('session growth (n = 1,250, 4n = 5,000 markings)', () => {
  it(
    'saves an already open project (checks revision and content, revision + 1)',
    GROWTH_OPTIONS,
    async () => {
      const sessions: ProjectSession[] = [];
      let counter = 0;
      // Proof that the measurement is the real save: the file comes out with revision + 1 and the new name.
      const { root: probeRoot } = await folderWith(25);
      const probe = await open(probeRoot);
      probe.actions.renameProject('Probe');
      expect((await probe.flush()).ok).toBe(true);
      const saved = JSON.parse((await probeRoot.read('mapping.json')) ?? '{}');
      expect(saved.revision).toBe(1);
      expect(saved.project.name).toBe('Probe');
      await probe.close();
      await expectLinearGrowthAsync('session: save', {
        build: async (n) => {
          const { root } = await folderWith(n);
          const session = await open(root);
          sessions.push(session);
          return { root, session };
        },
        // The edit happens outside the measured time; the measurement is the save.
        prepare: ({ session }) => {
          session.actions.renameProject(`Scale ${++counter}`);
        },
        run: async ({ session }) => {
          const saved = await session.flush();
          if (!saved.ok) throw new Error('the save failed');
        },
      });
      for (const session of sessions) await session.close();
    },
  );

  it(
    'opens the project (read, validate, migrate and build the session)',
    GROWTH_OPTIONS,
    async () => {
      let last: ProjectSession | null = null;
      await expectLinearGrowthAsync('session: open', {
        build: async (n) => folderWith(n),
        // The session of the previous round is dropped first (outside the measured time), so the heap does not grow with the rounds.
        prepare: async () => {
          await last?.close();
          last = null;
        },
        run: async ({ root }) => {
          last = await open(root);
        },
        warmup: 4,
        runs: 9,
      });
      await (last as ProjectSession | null)?.close();
    },
  );
});
