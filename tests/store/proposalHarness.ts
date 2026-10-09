import {
  addAnnotation,
  addImage,
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
import { createReviewState } from '../../src/store/review';
import { openSession } from '../../src/store/session';
import { sampleProject } from '../model/fixtures';
import { changeOf, propose } from '../model/proposalFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

export const REVIEW_AT = '2026-10-09T14:00:00.000Z';

/**
 * Uma proposta com uma imagem nova (`I3`) com uma marcação (`M5`) e uma anotação (`A9`),
 * uma marcação renomeada (`M1`) e outra movida (`M4`).
 */
export function richScenario(id = 'P1') {
  const base = sampleProject();
  let after = renameMarking(base, 'M1', 'Porta dianteira');
  after = setMarkingRect(after, 'M4', { x: 10, y: 10, width: 100, height: 100 });
  after = addImage(after, {
    id: 'I3',
    file: 'images/nova.webp',
    width: 800,
    height: 600,
  });
  after = createMarking(after, {
    id: 'M5',
    imageId: 'I3',
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

export const NEW_IMAGE_PATH = 'proposals/P1/images/nova.webp';

export interface HarnessOptions {
  readonly project?: Project;
  readonly proposals?: readonly Proposal[];
  /** Arquivos extras (caminho → texto), ex: a imagem que espera em `proposals/P1/images/`. */
  readonly files?: Readonly<Record<string, string>>;
  /** Abre a sessão sem as propostas (depois `session.proposals.scan()` as encontra). */
  readonly skipProposals?: boolean;
}

/** Uma pasta com projeto e propostas, a sessão aberta sobre ela e o estado da revisão. */
export async function openHarness(options: HarnessOptions = {}) {
  const root = new MemoryDirectory('projeto');
  const project: Project = { ...(options.project ?? sampleProject()), revision: 3 };
  root.put('mapping.json', serialize(project));
  for (const p of options.proposals ?? [])
    root.put(proposalFilePath(p.id), serializeProposal(p));
  for (const [path, text] of Object.entries(options.files ?? {})) root.put(path, text);
  const storage = createFolderStorage(root);
  const loaded = await loadProject(storage);
  if (!loaded.ok) throw new Error(loaded.error);
  let n = 0;
  const session = openSession({
    storage,
    project: loaded.project,
    loadedText: loaded.text,
    ...(options.skipProposals ? {} : { proposals: await loadProposals(storage) }),
    prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
    now: () => REVIEW_AT,
    newId: () => `id-${++n}`,
    autosaveDelay: 1,
  });
  const review = createReviewState(session);
  return { root, storage, session, review };
}

export type Harness = Awaited<ReturnType<typeof openHarness>>;

/** O `proposal.json` como está em disco. */
export async function diskProposal(root: MemoryDirectory, id = 'P1'): Promise<Proposal> {
  const text = await root.read(proposalFilePath(id));
  const parsed = parseProposalText(text ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.proposal;
}

/** Grava a proposta por fora, como o MCP faria (sem passar pela sessão). */
export function writeOutside(root: MemoryDirectory, p: Proposal): void {
  root.put(proposalFilePath(p.id), serializeProposal(p));
}
