import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';
import {
  applyAccepted,
  decide,
  deserialize,
  parseProposalText,
  proposalFilePath,
  referencedSpecFiles,
  reviewTree,
  serialize,
  serializeProposal,
  specFiles,
  touchProject,
  type DecisionState,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../src/model';
import type { Call, Connection } from './workspace';

// Support for the proposal tests: reads what the server wrote and imitates what the app does in the
// review (deciding, applying accepted), using the same pure functions from `src/model/`.

export const hashOf = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

/** Result of `propose_changes` (only what the tests check). */
export interface Proposed {
  valid: boolean;
  proposed?: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  issues: { before: number; after: number; resolved: number; new: unknown[] };
  created: { op: number; alias?: string; kind: string; ref?: string; id?: string }[];
  proposal: {
    ref: string;
    id: string;
    title: string;
    status: string;
    baseRevision: number;
    supersedes: string | null;
  };
  reviewChanges: { total: number; create: number; update: number; remove: number };
  levels: {
    project?: { state: string; changes: number };
    containers: { container: string; change: string; items: number; changes: number }[];
  };
  files: {
    proposal: string;
    images: string[];
    packages?: { dir: string; files: number }[];
  };
  superseded?: { ref: string; status: string };
  warnings?: { code: string; [key: string]: unknown }[];
  hint: string;
}

export interface Failure {
  error: { code: string; message: string; [key: string]: unknown };
}

export function ok<T>(result: Call<T>): T {
  expect(result.isError, JSON.stringify(result.data)).toBe(false);
  return result.data;
}

export function errorOf(result: Call<unknown>): Failure['error'] {
  expect(result.isError).toBe(true);
  return (result.data as Failure).error;
}

/** The project as the app opens it: `mapping.json` and the copies in `specs/`. */
export function readProject(dir: string): Project {
  const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
  const specs = new Map(
    referencedSpecFiles(text).map((file) => [
      file,
      readFileSync(join(dir, file), 'utf8'),
    ]),
  );
  const result = deserialize(text, undefined, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

/** The proposal written in `proposals/<id>/proposal.json`, validated by the model. */
export function readProposal(dir: string, id: string): Proposal {
  const parsed = parseProposalText(readFileSync(join(dir, proposalFilePath(id)), 'utf8'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.proposal;
}

function writeProposal(dir: string, proposal: Proposal): Proposal {
  // Like the app session: writes with `revision + 1`.
  const next = { ...proposal, revision: proposal.revision + 1 };
  writeFileSync(join(dir, proposalFilePath(proposal.id)), serializeProposal(next));
  return next;
}

const AT = '2026-10-09T13:00:00.000Z';

/**
 * Imitates the user deciding in the review: decides the target (the whole level and what is below it, with
 * the dependencies) and writes the decisions to the file, as the app does.
 */
export function reviewDecide(
  dir: string,
  id: string,
  target: ReviewTarget,
  state: DecisionState | null,
): Proposal {
  const proposal = readProposal(dir, id);
  const result = decide(
    proposal,
    reviewTree(proposal, readProject(dir)),
    target,
    state,
    AT,
  );
  if (!result.ok) throw new Error(`decision refused: ${result.reason}`);
  return writeProposal(dir, { ...proposal, decisions: result.decisions });
}

/** Imitates a user note (the app writes `notes` in the proposal). */
export function reviewNote(
  dir: string,
  id: string,
  target: ReviewTarget,
  text: string,
): Proposal {
  const proposal = readProposal(dir, id);
  const note = { id: `n${proposal.notes.length + 1}`, target, text, at: AT };
  return writeProposal(dir, { ...proposal, notes: [...proposal.notes, note] });
}

/**
 * Imitates the app's "Apply accepted": `applyAccepted` over the project read from the folder, images
 * moved from `proposals/<id>/` to `images/`, copies in `specs/`, `mapping.json` with
 * `revision + 1` and the updated proposal. Returns the written project.
 */
export function applyAcceptedOnDisk(dir: string, id: string): Project {
  const project = readProject(dir);
  const proposal = readProposal(dir, id);
  const result = applyAccepted(project, proposal, AT);
  if (!result.ok)
    throw new Error(`application blocked: ${JSON.stringify(result.issues)}`);
  for (const move of result.files) {
    mkdirSync(dirname(join(dir, move.to)), { recursive: true });
    renameSync(join(dir, move.from), join(dir, move.to));
  }
  const next: Project = {
    ...touchProject(result.project, AT),
    revision: project.revision + 1,
  };
  for (const [file, text] of specFiles(next)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  writeFileSync(join(dir, 'mapping.json'), serialize(next));
  // Like the session: image and specialization files that nobody else references are removed.
  const referenced = new Set(next.containers.map((i) => i.file));
  if (existsSync(join(dir, 'images'))) {
    for (const name of readdirSync(join(dir, 'images'))) {
      if (!referenced.has(`images/${name}`)) rmSync(join(dir, 'images', name));
    }
  }
  writeProposal(dir, result.proposal);
  return next;
}

/** Accepts everything (proposal level) and applies, like the user who agrees with everything. */
export function acceptAllAndApply(dir: string, id: string): Project {
  reviewDecide(dir, id, { level: 'proposal', id: null }, 'accepted');
  return applyAcceptedOnDisk(dir, id);
}

/** Sends the batch with `propose_changes`. */
export async function propose(
  mcp: Connection,
  project: string,
  operations: unknown[],
  extra: Record<string, unknown> = {},
): Promise<Proposed> {
  return ok(
    await mcp.call<Proposed>('propose_changes', {
      project,
      title: 'Teste',
      operations,
      ...extra,
    }),
  );
}
