// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import { FOLDER_CONCURRENCY } from '../../src/storage/folderConcurrency';
import type { ProjectStorage } from '../../src/storage/types';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';
import { material3Package, material3Spec } from '../storage/packageFixture';

// FA2, decision 10: the files of a package (and the copies in `specs/`) are written in parallel with
// a limit, but ALWAYS before `mapping.json`: no `saveMapping` starts before all of them
// finish, and a failure aborts the write without touching `mapping.json`.

interface Probe {
  readonly session: ProjectSession;
  readonly root: MemoryDirectory;
  readonly state: {
    inFlight: number;
    peak: number;
    started: number;
    finished: number;
    /** Files finished / started when `saveMapping` began (one item per call). */
    atSave: { started: number; finished: number; inFlight: number }[];
    /** Fails every write from the `failFrom`-th on (while it is not `null`). */
    failFrom: number | null;
  };
}

let current: ProjectSession | null = null;
afterEach(async () => {
  await current?.close();
  current = null;
});

function start(): Probe {
  const root = new MemoryDirectory('p');
  const inner = createFolderStorage(root);
  const state: Probe['state'] = {
    inFlight: 0,
    peak: 0,
    started: 0,
    finished: 0,
    atSave: [],
    failFrom: null,
  };
  const tracked =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      const index = state.started++;
      state.inFlight++;
      state.peak = Math.max(state.peak, state.inFlight);
      try {
        await new Promise((r) => setTimeout(r, 3));
        if (state.failFrom !== null && index >= state.failFrom)
          throw new Error('disk full');
        await fn(...args);
      } finally {
        state.inFlight--;
        state.finished++;
      }
    };
  const storage: ProjectStorage = {
    ...inner,
    writeSpecFile: tracked(inner.writeSpecFile),
    writeSpec: tracked(inner.writeSpec),
    async saveMapping(text) {
      state.atSave.push({
        started: state.started,
        finished: state.finished,
        inFlight: state.inFlight,
      });
      await inner.saveMapping(text);
    },
  };
  const session = openSession({
    storage,
    project: sampleProject(),
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => NOW,
    autosaveDelay: 1,
  });
  current = session;
  return { session, root, state };
}

describe('package write in parallel with a limit', () => {
  it('writes the package files with a peak of 4 and no saveMapping before all finish', async () => {
    const h = start();
    const files = material3Package();
    expect(files.size).toBeGreaterThan(8);
    expect(
      h.session.actions.applySpecialization({ ...material3Spec(), version: 1 }, files).ok,
    ).toBe(true);
    await h.session.flush();
    expect(h.state.peak).toBe(FOLDER_CONCURRENCY);
    expect(h.state.atSave.length).toBeGreaterThan(0);
    for (const at of h.state.atSave) {
      expect(at.inFlight).toBe(0);
      expect(at.finished).toBe(at.started);
    }
    // The whole package reached the disk (the files plus the specialization copy).
    expect(h.state.atSave[0]?.started).toBeGreaterThanOrEqual(files.size);
  });

  it('failure on one package file: mapping.json is not touched and the rewrite redoes the package', async () => {
    const h = start();
    h.state.failFrom = 2;
    const files = material3Package();
    h.session.actions.applySpecialization({ ...material3Spec(), version: 1 }, files);
    await expect(h.session.flush()).resolves.toMatchObject({ ok: false });
    expect(h.state.atSave).toEqual([]);
    expect(await h.root.read('mapping.json')).toBeNull();
    // It passed: the next write rewrites the whole package and only then mapping.json.
    h.state.failFrom = null;
    h.state.started = 0;
    h.state.finished = 0;
    await expect(h.session.flush()).resolves.toMatchObject({ ok: true });
    expect(h.state.started).toBeGreaterThanOrEqual(files.size);
    expect(h.state.atSave[0]?.finished).toBe(h.state.atSave[0]?.started);
    expect(await h.root.read('mapping.json')).not.toBeNull();
  });
});
