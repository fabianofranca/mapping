// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { NOTES_LIBRARY } from '../../libraries/notas';
import {
  applyAccepted,
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  proposalFilePath,
  renameMarking,
  serialize,
  serializeProposal,
  serializeThread,
  setMarkingRect,
  threadFilePath,
  type Project,
  type Proposal,
} from '../../src/model';
import {
  countingDirectory,
  createFolderCalls,
  type FolderCalls,
  type FolderOp,
} from '../../src/storage/folderCalls';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { loadProposals } from '../../src/storage/loadProposals';
import { loadThreads } from '../../src/storage/loadThreads';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { changeOf, propose } from '../model/proposalFixtures';
import { sampleThread } from '../model/threadFixtures';
import type { DirectoryHandleLike } from '../../src/storage/folder';
import { MemoryDirectory } from './memoryFs';

// Budget of the calls to the folder (stage "fast folder", decisions 2 to 5). The fixed project:
// 2 containers with an image, 1 specialization with a 12-file package, 6 proposals (2 open,
// 3 applied, 1 withdrawn) and 4 open threads. FA1 recorded the baseline; FA2 fixed the
// limits below (`toBeLessThanOrEqual`) at the number it reached; FA3 fixed the `sync` one.
//
// operation | before (FA1) | FA2 (limit) | FA3 | by type after FA3
// open     |  178 | 115 | 115 | getDirectoryHandle=16 getFileHandle=40 getFile=35 values=24
// save     |   18 |  14 |  14 | getFileHandle=5 getFile=6 createWritable=1 write=1 close=1
// library  |  265 | 113 | 113 | getFileHandle=28 getFile=18 values=28 createWritable=13 write=13 close=13
// decide   |   28 |  16 |  16 | getFileHandle=7 getFile=6 createWritable=1 write=1 close=1
// apply    |   25 |  16 |  16 | getFileHandle=4 getFile=4 values=2 createWritable=2 write=2 close=2
// sync     |   70 |  45 |  19 | getFileHandle=2 getFile=7 values=10 (the steady-state cycle, no change)
//
// (The "before" is the FA1 code over this fixture, in which `images/` is now a real folder;
// the `getFile` of `save` and `decide` include lazy reads from the open that fall in the
// measurement window. The `sync` of FA1 and FA2 was the first one after the open, with those
// reads inside; the FA3 one is the second, the steady-state cycle (37 in the FA2 code, which still
// re-read the final proposals and stamped them one by one). With the open reads inside, the FA3 cycle
// measures 27.)
// `npx vitest run tests/storage/folderCallBudget.test.ts --silent=false` prints the lines.

const FIXED_NOW = '2026-10-09T14:00:00.000Z';
// pt-BR kept: shared fixture data asserted by tests/model and tests/components: the spec id 'notas' of libraries/notas
const PACKAGE_DIR = 'specs/notas';

/** The notes library package completed with extra docs, up to 12 files on disk. */
function packageFiles(extra: string): Map<string, string> {
  const files = new Map<string, string>(NOTES_LIBRARY.files);
  files.delete(NOTES_LIBRARY.specFile);
  for (let i = 1; files.size < 11; i++)
    files.set(`docs/extra-${i}.md`, `# extra ${i}${extra}`);
  return files;
}

interface Fixture {
  readonly root: MemoryDirectory;
  readonly project: Project;
  readonly applied: ReturnType<typeof applyBundledLibrary>;
}

function appliedProposal(base: Project, after: Project, id: string): Proposal {
  const p = propose(base, after, { id });
  const decidedAll: Proposal = {
    ...p,
    decisions: Object.fromEntries(
      p.changes.map((c) => [c.id, { state: 'accepted' as const, at: NOW }]),
    ),
  };
  const result = applyAccepted(base, decidedAll, NOW);
  if (!result.ok) throw new Error('invalid applied proposal');
  return result.proposal;
}

function proposals(base: Project): Proposal[] {
  const open1 = propose(base, renameMarking(base, 'M1', 'Front door'), { id: 'P1' });
  const open2 = propose(base, renameMarking(base, 'M2', 'Handle'), { id: 'P2' });
  const rect = { x: 10, y: 10, width: 100, height: 100 };
  const applied = [
    appliedProposal(base, renameMarking(base, 'M3', 'Lock'), 'P3'),
    appliedProposal(base, renameMarking(base, 'M4', 'Detail'), 'P4'),
    appliedProposal(base, setMarkingRect(base, 'M4', rect), 'P5'),
  ];
  const withdrawn: Proposal = {
    ...propose(base, renameMarking(base, 'M3', 'Another'), { id: 'P6' }),
    status: 'withdrawn',
  };
  return [open1, open2, ...applied, withdrawn];
}

function buildFixture(): Fixture {
  const root = new MemoryDirectory('project');
  const applied = applyBundledLibrary(sampleProject(), NOTES_LIBRARY, {
    newId: (() => {
      let n = 0;
      return () => `note-${++n}`;
    })(),
  });
  const project: Project = { ...applied.project, revision: 3 };
  root.put('mapping.json', serialize(project));
  // pt-BR kept: shared fixture data asserted by tests/model: the image names of sampleProject
  for (const file of ['lateral.jpg', 'frente.jpg']) {
    root.put(`images/${file}`, '\u0001\u0002\u0003');
  }
  const diskFiles = bundledLibraryDiskFiles(project, {
    ...NOTES_LIBRARY,
    files: new Map([...packageFiles(''), [NOTES_LIBRARY.specFile, 'x']]),
  });
  for (const [path, text] of diskFiles) root.put(path, text);
  for (const p of proposals(sampleProject()))
    root.put(proposalFilePath(p.id), serializeProposal(p));
  for (let i = 1; i <= 4; i++) {
    const id = `T${i}`;
    root.put(threadFilePath(id, false), serializeThread(sampleThread({ id })));
  }
  return { root, project, applied };
}

/**
 * Wraps the folder recording the full path of each `getDirectoryHandle` (`proposals/P1`),
 * so the test can check that no folder is resolved twice in the same operation.
 */
function trackingDirectory(
  inner: DirectoryHandleLike,
  resolved: string[],
  prefix = '',
): DirectoryHandleLike {
  return {
    kind: 'directory',
    name: inner.name,
    async getDirectoryHandle(name, options) {
      const path = `${prefix}${name}`;
      resolved.push(path);
      return trackingDirectory(
        await inner.getDirectoryHandle(name, options),
        resolved,
        `${path}/`,
      );
    },
    getFileHandle: (name, options) => inner.getFileHandle(name, options),
    removeEntry: (name, options) => inner.removeEntry(name, options),
    values: () => inner.values(),
  };
}

interface Opened {
  readonly session: ProjectSession;
  readonly calls: FolderCalls;
  readonly root: MemoryDirectory;
  readonly fixture: Fixture;
  /** Path of each `getDirectoryHandle` made so far, in order. */
  readonly resolved: string[];
}

/** The starting point of a measurement: the calls by type and the folders resolved up to there. */
interface Mark {
  readonly kinds: Record<string, number>;
  readonly resolved: number;
}

/** Does the folder path exist in the double's tree? */
function existsIn(root: MemoryDirectory, path: string): boolean {
  let dir: MemoryDirectory | undefined = root;
  for (const name of path.split('/')) dir = dir?.dirs.get(name);
  return dir !== undefined;
}

const markOf = (opened: Opened): Mark => ({
  kinds: { ...opened.calls.byKind },
  resolved: opened.resolved.length,
});

/** Opens like the controller (`openFromStorage`/`openLoaded`), measuring `open`. */
async function openFixture(): Promise<Opened> {
  const fixture = buildFixture();
  const calls = createFolderCalls();
  const resolved: string[] = [];
  const storage = createFolderStorage(
    countingDirectory(trackingDirectory(fixture.root, resolved), calls),
    { copyId: 'copia-fixa' },
  );
  const session = await calls.measure('open', async () => {
    const loaded = await loadProject(storage);
    if (!loaded.ok) throw new Error(loaded.error);
    let n = 0;
    return openSession({
      storage,
      project: loaded.project,
      loadedText: loaded.text,
      folderCalls: calls,
      proposals: await loadProposals(storage),
      threads: await loadThreads(storage),
      prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
      now: () => FIXED_NOW,
      newId: () => `id-${++n}`,
      autosaveDelay: 1,
    });
  });
  return { session, calls, root: fixture.root, fixture, resolved };
}

const report: string[] = [];

function measured(opened: Opened, op: FolderOp) {
  const found = opened.calls.snapshot().find((m) => m.op === op);
  expect(found, `the operation ${op} was measured`).toBeDefined();
  expect(found?.calls ?? 0).toBeGreaterThan(0);
  return found;
}

/** Prints the operation line: total calls and by type (only the types used). */
function register(opened: Opened, op: FolderOp, since: Mark, limit?: number) {
  const found = measured(opened, op);
  const byKind = Object.entries(opened.calls.byKind)
    .map(([kind, n]) => [kind, n - (since.kinds[kind] ?? 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${kind}=${n}`)
    .join(' ');
  const line = `${op} | ${found?.calls ?? 0} | ${byKind}`;
  report.push(line);
  console.info(`[folderCallBudget] ${line}`);
  if (limit !== undefined) {
    expect(found?.calls ?? 0, `chamadas de ${op}`).toBeLessThanOrEqual(limit);
  }
  // Decision 6: each folder is resolved at most once per operation (stored handles).
  const paths = opened.resolved.slice(since.resolved);
  // Exception of decision 6 itself: a folder that does NOT exist under a stored handle repeats the
  // resolution once from the root (the handle may be stale); the parent repeats along with it.
  const missingUnder = (path: string) =>
    !existsIn(opened.root, path) ||
    paths.some((other) => other.startsWith(`${path}/`) && !existsIn(opened.root, other));
  const repeated = paths.filter(
    (path, i) => paths.indexOf(path) !== i && !missingUnder(path),
  );
  expect(repeated, `folders resolved more than once in ${op}`).toEqual([]);
}

describe('baseline of the calls to the folder (fixed project)', () => {
  let current: Opened | null = null;
  afterEach(async () => {
    await current?.session.close();
    current = null;
  });

  async function fresh(): Promise<Opened> {
    current = await openFixture();
    return current;
  }

  it('open', async () => {
    const opened = await fresh();
    expect(opened.session.store.project.value?.containers).toHaveLength(2);
    register(opened, 'open', { kinds: {}, resolved: 0 }, 115);
  });

  it('save: a single edit of mapping.json', async () => {
    const opened = await fresh();
    const since = markOf(opened);
    const result = opened.session.actions.renameMarking('M3', 'Fechadura nova');
    expect(result.ok).toBe(true);
    await opened.session.flush();
    register(opened, 'save', since, 14);
    // Decision 5: a single edit of `mapping.json` resolves no folder (the root is enough).
    expect(opened.resolved.length - since.resolved).toBe(0);
    expect(
      opened.calls.byKind.getDirectoryHandle - (since.kinds.getDirectoryHandle ?? 0),
    ).toBe(0);
  });

  it('library: update the package specialization', async () => {
    const opened = await fresh();
    const since = markOf(opened);
    const spec = {
      ...opened.fixture.applied.spec,
      version: opened.fixture.applied.spec.version + 1,
    };
    const result = opened.session.actions.updateSpecialization(
      spec,
      undefined,
      packageFiles(' (v2)'),
    );
    expect(result.ok).toBe(true);
    await opened.session.flush();
    expect(await opened.root.read(`${PACKAGE_DIR}/docs/extra-1.md`)).toContain('(v2)');
    register(opened, 'library', since, 113);
  });

  it('decide and apply: one change of an open proposal', async () => {
    const opened = await fresh();
    const open = opened.session.proposals.list.value.find((e) => e.id === 'P1');
    expect(open?.status).toBe('open');
    const change = changeOf(open as Proposal, 'marking', 'M1', 'name');
    let since = markOf(opened);
    const decided = await opened.session.proposalActions.decide(
      'P1',
      { level: 'change', id: change.id },
      'accepted',
    );
    expect(decided.ok).toBe(true);
    register(opened, 'decide', since, 16);

    since = markOf(opened);
    const result = await opened.session.proposalActions.applyAccepted('P1');
    expect(result.ok && result.applied).toBe(1);
    register(opened, 'apply', since, 16);
  });

  // Decision 5 (FA3): a check cycle without changes makes at most
  // `3 + 2 × (open proposals) + (open threads)` calls, plus the listings of
  // `proposals/` and `comments/` (one call per `values()` entry). The `3` are the stamp of
  // `mapping.json` and the root's slack; each open proposal costs the handle and the `getFile` of
  // `proposal.json`, each thread the `getFile` of its own file; the final proposals already read
  // (applied and withdrawn) stay out of the cycle (decision 8).
  const entriesOf = (dir: MemoryDirectory | undefined) =>
    (dir?.files.size ?? 0) + (dir?.dirs.size ?? 0);

  it('sync: nothing changed outside (cycle)', async () => {
    const opened = await fresh();
    // The first check absorbs the lazy reads of the open (stamps of the images and
    // of the components); the budget is that of the steady-state cycle.
    await opened.session.sync();
    const since = markOf(opened);
    await opened.session.sync();
    const openProposals = opened.session.proposals.list.value.filter(
      (p) => p.status === 'open',
    ).length;
    const openThreads = opened.session.threads.list.value.filter(
      (t) => t.resolved === null,
    ).length;
    expect([openProposals, openThreads]).toEqual([2, 4]);
    const listings =
      entriesOf(opened.root.dirs.get('proposals')) +
      entriesOf(opened.root.dirs.get('comments'));
    const limit = 3 + 2 * openProposals + openThreads + listings;
    register(opened, 'sync', since, limit);
    // No folder is resolved again (the `proposals/` and `comments/` handles are stored).
    expect(opened.resolved.length - since.resolved).toBe(0);
  });

  it('full sync (the focus): also looks at the final proposals and the images', async () => {
    const opened = await fresh();
    await opened.session.sync();
    await opened.session.sync();
    const cycle = measured(opened, 'sync')?.calls ?? 0;
    const since = markOf(opened);
    await opened.session.sync({ images: true });
    const full = measured(opened, 'sync')?.calls ?? 0;
    expect(full).toBeGreaterThan(cycle);
    register(opened, 'sync', since);
  });

  it('the fixed project has the size of decision 5', async () => {
    const { root } = buildFixture();
    const dir = await root
      .getDirectoryHandle('specs')
      .then((d) => d.getDirectoryHandle('notas'));
    let count = 0;
    const walk = async (d: MemoryDirectory) => {
      count += d.files.size;
      for (const sub of d.dirs.values()) await walk(sub);
    };
    await walk(dir);
    expect(count).toBe(12);
    const storage = createFolderStorage(root);
    const loaded = await loadProposals(storage);
    expect(loaded.proposals.filter((e) => e.proposal.status === 'open')).toHaveLength(2);
    expect(loaded.proposals).toHaveLength(6);
    expect((await loadThreads(storage)).threads).toHaveLength(4);
  });
});
