import {
  addAnnotation,
  addContainer,
  createMarking,
  parseProposalText,
  proposalFilePath,
  renameMarking,
  serialize,
  serializeProposal,
  setMarkingRect,
  type Project,
  type Proposal,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { loadProposals } from '../../src/storage/loadProposals';
import { loadThreads } from '../../src/storage/loadThreads';
import { createReviewState } from '../../src/store/review';
import { openSession } from '../../src/store/session';
import { sampleProject } from '../model/fixtures';
import { changeOf, propose } from '../model/proposalFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

export const REVIEW_AT = '2026-10-09T14:00:00.000Z';

/**
 * A proposal with a new image (`I3`) with a marking (`M5`) and an annotation (`A9`),
 * a renamed marking (`M1`) and a moved one (`M4`).
 */
export function richScenario(id = 'P1') {
  const base = sampleProject();
  // pt-BR kept: shared fixture data (names 'Porta dianteira', 'Botão' and the path 'nova.webp') asserted by tests/components and tests/store
  let after = renameMarking(base, 'M1', 'Porta dianteira');
  after = setMarkingRect(after, 'M4', { x: 10, y: 10, width: 100, height: 100 });
  after = addContainer(after, {
    id: 'I3',
    file: 'images/nova.webp',
    width: 800,
    height: 600,
  });
  after = createMarking(after, {
    id: 'M5',
    containerId: 'I3',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    name: 'Botão',
  });
  after = addAnnotation(after, {
    id: 'A9',
    markingId: 'M5',
    layerId: 'L1',
    name: 'onClick',
  });
  const proposal = propose(base, after, { id });
  return {
    base,
    after,
    proposal,
    ids: {
      image: changeOf(proposal, 'image', 'I3').id,
      name: changeOf(proposal, 'marking', 'M1', 'name').id,
      rect: changeOf(proposal, 'marking', 'M4', 'rect').id,
      marking: changeOf(proposal, 'marking', 'M5').id,
      annotation: changeOf(proposal, 'annotation', 'A9').id,
    },
  };
}

// pt-BR kept: shared fixture data (the path 'nova.webp') asserted by tests/components
export const NEW_IMAGE_PATH = 'proposals/P1/images/nova.webp';

export interface HarnessOptions {
  readonly project?: Project;
  readonly proposals?: readonly Proposal[];
  /** Extra files (path → text), e.g. the image waiting in `proposals/P1/images/`. */
  readonly files?: Readonly<Record<string, string>>;
  /** Opens the session without the proposals (then `session.proposals.scan()` finds them). */
  readonly skipProposals?: boolean;
  /** Folder name (the `<project>` of the references; does not identify the copy). */
  readonly folderName?: string;
  /**
   * The project copy (`ProjectStorage.copyId`, the review resume key): by
   * default a new id (each harness is another copy); the same id in two harnesses is "the
   * same copy, reopened"; `null` opens a storage without the field.
   */
  readonly copyId?: string | null;
}

/** A folder with a project and proposals, the session open over it and the review state. */
export async function openHarness(options: HarnessOptions = {}) {
  // pt-BR kept: shared fixture data (default folder name 'projeto') asserted by tests/app
  const root = new MemoryDirectory(options.folderName ?? 'projeto');
  const project: Project = { ...(options.project ?? sampleProject()), revision: 3 };
  root.put('mapping.json', serialize(project));
  for (const p of options.proposals ?? [])
    root.put(proposalFilePath(p.id), serializeProposal(p));
  for (const [path, text] of Object.entries(options.files ?? {})) root.put(path, text);
  const copyId = options.copyId === undefined ? crypto.randomUUID() : options.copyId;
  const storage = createFolderStorage(root, copyId === null ? {} : { copyId });
  const loaded = await loadProject(storage);
  if (!loaded.ok) throw new Error(loaded.error);
  let n = 0;
  const session = openSession({
    storage,
    project: loaded.project,
    loadedText: loaded.text,
    ...(options.skipProposals ? {} : { proposals: await loadProposals(storage) }),
    threads: await loadThreads(storage),
    prepareImage: () => Promise.reject(new Error('no images here')),
    now: () => REVIEW_AT,
    newId: () => `id-${++n}`,
    autosaveDelay: 1,
  });
  const review = createReviewState(session);
  return { root, storage, session, review };
}

export type Harness = Awaited<ReturnType<typeof openHarness>>;

/** The `proposal.json` as it is on disk. */
export async function diskProposal(root: MemoryDirectory, id = 'P1'): Promise<Proposal> {
  const text = await root.read(proposalFilePath(id));
  const parsed = parseProposalText(text ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.proposal;
}

/** Writes the proposal from outside, as the MCP would (without going through the session). */
export function writeOutside(root: MemoryDirectory, p: Proposal): void {
  root.put(proposalFilePath(p.id), serializeProposal(p));
}
