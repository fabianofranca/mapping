import { parseProposalText, type Proposal } from '../model';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import { FOLDER_CONCURRENCY } from './folderConcurrency';
import type { ProjectStorage } from './types';

// Reading the change proposals (`proposals/<id>/proposal.json`, stage 4): on opening
// the project and when the folder is checked again. An invalid file does not bring anything down:
// it becomes a problem listed separately (the proposal vanishes from the list, the rest goes on).

/** A proposal read: the proposal, the file's exact text and its stamp (folder only). */
export interface LoadedProposal {
  readonly proposal: Proposal;
  readonly text: string;
  readonly stamp: string | null;
}

/** `proposal.json` that could not be read: the folder id and the errors, with the exact path. */
export interface ProposalProblem {
  readonly id: string;
  readonly errors: readonly string[];
}

export interface LoadedProposals {
  readonly proposals: readonly LoadedProposal[];
  readonly problems: readonly ProposalProblem[];
  /** Text of the invalid files (id → text), kept to export without loss. */
  readonly problemTexts?: ReadonlyMap<string, string>;
}

export const NO_PROPOSALS: LoadedProposals = { proposals: [], problems: [] };

export type ReadProposalResult =
  | ({ readonly ok: true } & LoadedProposal)
  | {
      readonly ok: false;
      /** The file does not exist (any more). */
      readonly missing: boolean;
      readonly errors: readonly string[];
      /** The text read, when the file exists but is invalid (so as not to lose it on export). */
      readonly text: string | null;
    };

/** Reads and validates a proposal. The file's `id` must be the folder's. */
export async function readProposal(
  storage: ProjectStorage,
  id: string,
): Promise<ReadProposalResult> {
  let text: string | null;
  let stamp: string | null;
  try {
    stamp = storage.statProposal ? await storage.statProposal(id) : null;
    text = await storage.readProposal(id);
  } catch (e) {
    reportError('proposals.read', e);
    return {
      ok: false,
      missing: false,
      errors: [e instanceof Error ? e.message : String(e)],
      text: null,
    };
  }
  if (text === null) return { ok: false, missing: true, errors: [], text: null };
  return parseProposalFile(id, text, stamp);
}

export function parseProposalFile(
  id: string,
  text: string,
  stamp: string | null,
): ReadProposalResult {
  const parsed = parseProposalText(text);
  if (!parsed.ok) return { ok: false, missing: false, errors: parsed.errors, text };
  if (parsed.proposal.id !== id) {
    return {
      ok: false,
      missing: false,
      errors: [`id: must be "${id}" (the folder name), but is "${parsed.proposal.id}"`],
      text,
    };
  }
  for (const warning of parsed.warnings)
    reportError('proposals.read', `${id}: ${warning}`);
  return { ok: true, proposal: parsed.proposal, text, stamp };
}

/** Reads all the proposals from storage. */
export async function loadProposals(storage: ProjectStorage): Promise<LoadedProposals> {
  let ids: string[];
  try {
    ids = await storage.listProposals();
  } catch (e) {
    reportError('proposals.list', e);
    return NO_PROPOSALS;
  }
  const proposals: LoadedProposal[] = [];
  const problems: ProposalProblem[] = [];
  const problemTexts = new Map<string, string>();
  const reads = await mapLimit(ids, FOLDER_CONCURRENCY, (id) =>
    readProposal(storage, id),
  );
  ids.forEach((id, i) => {
    const read = reads[i] as ReadProposalResult;
    if (read.ok) {
      proposals.push({ proposal: read.proposal, text: read.text, stamp: read.stamp });
    } else if (!read.missing) {
      problems.push({ id, errors: read.errors });
      if (read.text !== null) problemTexts.set(id, read.text);
    }
  });
  return { proposals, problems, problemTexts };
}
