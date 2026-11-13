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
import { MemoryDirectory } from './memoryFs';

// Linha de base das chamadas à pasta (etapa "pasta rápida", decisões 2 a 5). O projeto fixo:
// 2 containers com imagem, 1 especialização com pacote de 12 arquivos, 6 propostas (2 abertas,
// 3 aplicadas, 1 retirada) e 4 conversas abertas. Nesta fase o teste só REGISTRA os números
// (um `console.info` por operação); os limites entram nas fases seguintes.
//
// operação | chamadas | por tipo
// open    |  178 | getDirectoryHandle=81 getFileHandle=41 getFile=35 values=24
// save    |   16 | getDirectoryHandle=2 getFileHandle=6 getFile=5 createWritable=1 write=1 close=1
// library |  263 | getDirectoryHandle=111 getFileHandle=42 getFile=29 values=42 createWritable=13 write=13 close=13
// decide  |   22 | getDirectoryHandle=8 getFileHandle=6 getFile=5 createWritable=1 write=1 close=1
// apply   |   23 | getDirectoryHandle=7 getFileHandle=6 getFile=4 createWritable=2 write=2 close=2
// sync    |   64 | getDirectoryHandle=20 getFileHandle=20 getFile=14 values=10
//
// (`npx vitest run tests/storage/folderCallBudget.test.ts --silent=false` imprime as linhas.)

const FIXED_NOW = '2026-10-09T14:00:00.000Z';
const PACKAGE_DIR = 'specs/notas';

/** O pacote da biblioteca de notas completado com docs extras, até 12 arquivos em disco. */
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
  if (!result.ok) throw new Error('proposta aplicada inválida');
  return result.proposal;
}

function proposals(base: Project): Proposal[] {
  const open1 = propose(base, renameMarking(base, 'M1', 'Porta dianteira'), { id: 'P1' });
  const open2 = propose(base, renameMarking(base, 'M2', 'Puxador'), { id: 'P2' });
  const rect = { x: 10, y: 10, width: 100, height: 100 };
  const applied = [
    appliedProposal(base, renameMarking(base, 'M3', 'Trava'), 'P3'),
    appliedProposal(base, renameMarking(base, 'M4', 'Detalhe'), 'P4'),
    appliedProposal(base, setMarkingRect(base, 'M4', rect), 'P5'),
  ];
  const withdrawn: Proposal = {
    ...propose(base, renameMarking(base, 'M3', 'Outra'), { id: 'P6' }),
    status: 'withdrawn',
  };
  return [open1, open2, ...applied, withdrawn];
}

function buildFixture(): Fixture {
  const root = new MemoryDirectory('projeto');
  const applied = applyBundledLibrary(sampleProject(), NOTES_LIBRARY, {
    newId: (() => {
      let n = 0;
      return () => `note-${++n}`;
    })(),
  });
  const project: Project = { ...applied.project, revision: 3 };
  root.put('mapping.json', serialize(project));
  for (const file of ['lateral.jpg', 'frente.jpg']) {
    root.files.set(`images/${file}`, new Blob([new Uint8Array([1, 2, 3])]));
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

interface Opened {
  readonly session: ProjectSession;
  readonly calls: FolderCalls;
  readonly root: MemoryDirectory;
  readonly fixture: Fixture;
}

/** Abre como o controller (`openFromStorage`/`openLoaded`), medindo `open`. */
async function openFixture(): Promise<Opened> {
  const fixture = buildFixture();
  const calls = createFolderCalls();
  const storage = createFolderStorage(countingDirectory(fixture.root, calls), {
    copyId: 'copia-fixa',
  });
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
  return { session, calls, root: fixture.root, fixture };
}

const report: string[] = [];

function measured(opened: Opened, op: FolderOp) {
  const found = opened.calls.snapshot().find((m) => m.op === op);
  expect(found, `a operação ${op} foi medida`).toBeDefined();
  expect(found?.calls ?? 0).toBeGreaterThan(0);
  return found;
}

/** Imprime a linha da operação: chamadas totais e por tipo (só os tipos usados). */
function register(opened: Opened, op: FolderOp, since: Record<string, number>) {
  const found = measured(opened, op);
  const byKind = Object.entries(opened.calls.byKind)
    .map(([kind, n]) => [kind, n - (since[kind] ?? 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${kind}=${n}`)
    .join(' ');
  const line = `${op} | ${found?.calls ?? 0} | ${byKind}`;
  report.push(line);
  console.info(`[folderCallBudget] ${line}`);
}

describe('linha de base das chamadas à pasta (projeto fixo)', () => {
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
    register(opened, 'open', {});
  });

  it('save: uma edição só do mapping.json', async () => {
    const opened = await fresh();
    const since = { ...opened.calls.byKind };
    const result = opened.session.actions.renameMarking('M3', 'Fechadura nova');
    expect(result.ok).toBe(true);
    await opened.session.flush();
    register(opened, 'save', since);
  });

  it('library: atualizar a especialização de pacote', async () => {
    const opened = await fresh();
    const since = { ...opened.calls.byKind };
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
    register(opened, 'library', since);
  });

  it('decide e apply: uma mudança de uma proposta aberta', async () => {
    const opened = await fresh();
    const open = opened.session.proposals.list.value.find((e) => e.id === 'P1');
    expect(open?.status).toBe('open');
    const change = changeOf(open as Proposal, 'marking', 'M1', 'name');
    let since = { ...opened.calls.byKind };
    const decided = await opened.session.proposalActions.decide(
      'P1',
      { level: 'change', id: change.id },
      'accepted',
    );
    expect(decided.ok).toBe(true);
    register(opened, 'decide', since);

    since = { ...opened.calls.byKind };
    const result = await opened.session.proposalActions.applyAccepted('P1');
    expect(result.ok && result.applied).toBe(1);
    register(opened, 'apply', since);
  });

  it('sync: nada mudou por fora', async () => {
    const opened = await fresh();
    const since = { ...opened.calls.byKind };
    await opened.session.sync();
    register(opened, 'sync', since);
  });

  it('o projeto fixo tem o tamanho da decisão 5', async () => {
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
