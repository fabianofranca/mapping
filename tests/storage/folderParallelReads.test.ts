// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  renameMarking,
  serializeProposal,
  serializeThread,
  threadFilePath,
} from '../../src/model';
import { FOLDER_CONCURRENCY } from '../../src/storage/folderConcurrency';
import { loadProject } from '../../src/storage/loadProject';
import { loadProposals } from '../../src/storage/loadProposals';
import { loadThreads } from '../../src/storage/loadThreads';
import { readSpecPackage } from '../../src/storage/specPackage';
import type { ProjectStorage } from '../../src/storage/types';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { sampleThread } from '../model/threadFixtures';

/** Measures the peak of simultaneous calls and the order in which they started. */
function probe(delayMs = 3) {
  const state = { inFlight: 0, peak: 0, started: [] as string[] };
  const run = async <T>(label: string, value: () => T): Promise<T> => {
    state.started.push(label);
    state.inFlight++;
    state.peak = Math.max(state.peak, state.inFlight);
    await new Promise((r) => setTimeout(r, delayMs));
    state.inFlight--;
    return value();
  };
  return { state, run };
}

describe('batch reads with a limit (FA2, decision 10)', () => {
  it('readSpecPackage: 12 files, peak of 4 reads, same order and bytes', async () => {
    const { state, run } = probe();
    const paths = Array.from({ length: 12 }, (_, i) => `specs/p/f${i}.md`);
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: (path: string) => run(path, () => new Blob([`t:${path}`])),
    } as unknown as ProjectStorage;
    const pkg = await readSpecPackage(storage, 'specs/p');
    expect(state.peak).toBe(FOLDER_CONCURRENCY);
    expect(pkg?.entries.map((e) => e.path)).toEqual(paths);
    expect(pkg?.entries[3]).toEqual({ path: paths[3], text: `t:${paths[3]}` });
    expect(pkg?.bytes).toBe(paths.reduce((n, p) => n + `t:${p}`.length, 0));
  });

  it('readSpecPackage: a missing file is skipped and the order follows the listing', async () => {
    const { run } = probe();
    const paths = ['specs/p/a.md', 'specs/p/b.md', 'specs/p/c.md'];
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: (path: string) =>
        run(path, () => (path.endsWith('b.md') ? null : new Blob(['x']))),
    } as unknown as ProjectStorage;
    const pkg = await readSpecPackage(storage, 'specs/p');
    expect(pkg?.entries.map((e) => e.path)).toEqual([paths[0], paths[2]]);
  });

  it('loadProposals: 6 proposals, peak of 4 reads, order of the ids', async () => {
    const { state, run } = probe();
    const base = sampleProject();
    const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
    const texts = new Map(
      ids.map((id) => [
        id,
        id === 'P4'
          ? '{ quebrado'
          : serializeProposal(
              propose(base, renameMarking(base, 'M1', `n-${id}`), { id }),
            ),
      ]),
    );
    const storage = {
      listProposals: async () => ids,
      readProposal: (id: string) => run(id, () => texts.get(id) ?? null),
    } as unknown as ProjectStorage;
    const loaded = await loadProposals(storage);
    expect(state.peak).toBe(FOLDER_CONCURRENCY);
    expect(loaded.proposals.map((e) => e.proposal.id)).toEqual([
      'P1',
      'P2',
      'P3',
      'P5',
      'P6',
    ]);
    expect(loaded.problems.map((p) => p.id)).toEqual(['P4']);
    expect([...(loaded.problemTexts?.keys() ?? [])]).toEqual(['P4']);
  });

  it('loadThreads: peak of 4 reads; comments/ before resolved/, ids in order', async () => {
    const { state, run } = probe();
    const open = ['T1', 'T2', 'T3', 'T4', 'T5'];
    const resolved = ['T6', 'T7', 'T8'];
    const storage = {
      listThreads: async (isResolved: boolean) => (isResolved ? resolved : open),
      readThread: (id: string, isResolved: boolean) =>
        run(`${isResolved ? 'r' : 'o'}${id}`, () =>
          id === 'T2' ? '{ quebrado' : serializeThread(sampleThread({ id })),
        ),
    } as unknown as ProjectStorage;
    const loaded = await loadThreads(storage);
    expect(state.peak).toBe(FOLDER_CONCURRENCY);
    expect(loaded.threads.map((t) => [t.thread.id, t.resolvedDir])).toEqual([
      ['T1', false],
      ['T3', false],
      ['T4', false],
      ['T5', false],
      ['T6', true],
      ['T7', true],
      ['T8', true],
    ]);
    expect(loaded.problems.map((p) => p.id)).toEqual(['T2']);
    expect([...(loaded.problemTexts?.keys() ?? [])]).toEqual([
      threadFilePath('T2', false),
    ]);
  });

  it('loadProject: the specs/ copies are read with a peak of 4', async () => {
    const { state, run } = probe();
    const files = Array.from({ length: 8 }, (_, i) => `specs/s${i}.json`);
    const text = JSON.stringify({ specializations: files.map((file) => ({ file })) });
    const storage = {
      loadMapping: async () => text,
      readSpec: (path: string) => run(path, () => null),
    } as unknown as ProjectStorage;
    await loadProject(storage);
    expect(state.peak).toBe(FOLDER_CONCURRENCY);
    expect(state.started.slice(0, FOLDER_CONCURRENCY)).toEqual(files.slice(0, 4));
    expect(state.started).toEqual(files);
  });
});
