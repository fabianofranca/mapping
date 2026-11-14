import {
  prepareRevision,
  reviseProposal,
  type Change,
  type Proposal,
  type ReviseError,
} from '../src/model';
import { batchReport, createdRefs, prepareBatch, readMapping, sha256 } from './changes';
import { ToolError, type McpErrorCode } from './errors';
import { Refs } from './items';
import type { Operation } from './operations';
import type { ProjectLocation } from './projects';
import { ProposalRefs, type ResolvedProposal } from './proposalRefs';
import {
  listStored,
  proposalFiles,
  reservedImages,
  reviseStored,
  type RevisionPlan,
  type RevisionStop,
} from './proposalStore';
import { ProposalLabels } from './proposalViews';
import { storedOperations } from './proposalOperations';
import type { Roots } from './paths';

// `revise_proposal` (stage #644): the agent corrects the open proposal in the same proposal. The model
// (`prepareRevision`/`reviseProposal`, CP1) decides what stays, what is replaced and what leaves; here the
// batch runs over the **whole proposed state** through the same path as `propose_changes` and the write
// goes through `reviseStored`, which rereads and recalculates if the proposal changed in the meantime.

type Json = Record<string, unknown>;

export interface ReviseArgs {
  readonly drop?: readonly string[] | undefined;
  readonly operations?: readonly Operation[] | undefined;
  readonly dryRun?: boolean | undefined;
}

const HINTS: Partial<Record<ReviseError['code'], string>> = {
  'proposal-applied':
    'there are already applied changes: send the corrections with propose_changes and `supersedes` pointing to this proposal',
  'change-frozen':
    'the user has already accepted these changes; ask them to clear the decision or send a new proposal with `supersedes`',
  'proposal-not-applicable':
    'withdraw the involved changes in `drop` and try again, or send a new proposal with `supersedes`',
};

/** The revision model's codes are the same as the server's (`mcp/errors.ts`). */
const CODES: Record<ReviseError['code'], McpErrorCode | 'not-open' | 'no-changes'> = {
  'not-open': 'not-open',
  'proposal-applied': 'proposal-applied',
  'change-not-found': 'change-not-found',
  'change-frozen': 'change-frozen',
  'proposal-not-applicable': 'proposal-not-applicable',
  'no-changes': 'no-changes',
};

function toToolError(error: ReviseError): ToolError {
  const hint = HINTS[error.code];
  return new ToolError(CODES[error.code], error.message, {
    ...(error.changeIds.length > 0 ? { changeIds: error.changeIds } : {}),
    ...(error.problems ? { problems: error.problems } : {}),
    ...(hint ? { hint } : {}),
  });
}

const SHOWN = 60;

/** The new value of a change in a few words (short text; a creation shows the name). */
function shownValue(c: Change): string {
  if (c.kind === 'remove') return '';
  const named = (c.to as { name?: unknown } | null)?.name;
  const value = c.kind === 'create' ? named : c.to;
  if (value === undefined || value === null || typeof value === 'object') return '';
  const text = JSON.stringify(value);
  return ` → ${text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text}`;
}

/** Readable summary of a change: what it does, to what and the new value. */
function summaryOf(c: Change, labels: ProposalLabels): string {
  const verb = { create: 'create', update: 'change', remove: 'remove' }[c.kind];
  const field = c.field !== null ? ` › ${c.field}` : '';
  return `${verb} ${labels.target(c)}${field}${shownValue(c)}`;
}

function itemsOf(
  ids: readonly string[],
  changes: readonly Change[],
  labels: ProposalLabels,
) {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return ids.map((id) => ({
    id,
    summary: byId.has(id) ? summaryOf(byId.get(id)!, labels) : id,
  }));
}

/** Files in `images/` that the revision cannot reuse: from other proposals and from its own folder. */
async function reservedFor(
  roots: Roots,
  location: ProjectLocation,
  proposalId: string,
): Promise<Set<string>> {
  const reserved = new Set<string>();
  for (const stored of (await listStored(roots, location)).proposals) {
    for (const file of reservedImages(stored.proposal)) reserved.add(file);
  }
  const prefix = `proposals/${proposalId}/`;
  for (const file of await proposalFiles(roots, location, proposalId)) {
    if (file.startsWith(prefix)) reserved.add(file.slice(prefix.length));
  }
  return reserved;
}

interface Computed {
  readonly summary: {
    readonly changed: readonly string[];
    readonly added: readonly string[];
    readonly dropped: readonly string[];
  };
  readonly view: Json;
}

async function compute(
  roots: Roots,
  location: ProjectLocation,
  now: () => number,
  args: ReviseArgs,
  current: Proposal,
): Promise<RevisionPlan<Computed> | RevisionStop<Computed>> {
  const drop = args.drop ?? [];
  const operations = args.operations ?? [];
  const prepared = await prepareBatch(roots, location, operations, {
    now,
    reservedImages: await reservedFor(roots, location, current.id),
    startFrom: (project) => {
      const prep = prepareRevision(project, current, drop);
      if (!prep.ok) throw toToolError(prep.error);
      return prep.proposed;
    },
  });
  const report = batchReport(prepared);
  const stop = (extra: Json): RevisionStop<Computed> => ({
    stop: {
      summary: { changed: [], added: [], dropped: [] },
      view: { ...report, ...extra },
    },
  });
  if (!prepared.valid) {
    return stop({
      revised: false,
      hint: 'nothing was written: fix the operations with errors and call revise_proposal again with the whole batch',
    });
  }
  if (prepared.result.packageFiles.size > 0) {
    throw new ToolError(
      'revise-unsupported',
      'a new or replaced library package does not fit in a revision: send it in a new proposal (propose_changes)',
    );
  }
  const { loaded, result } = prepared;
  const revised = reviseProposal(loaded.project, current, {
    drop,
    ...(operations.length > 0 ? { after: result.project } : {}),
    at: new Date(now()).toISOString(),
    operations: storedOperations(operations),
  });
  if (!revised.ok) throw toToolError(revised.error);
  const labels = ProposalLabels.ofRefs(prepared.refs, new Refs(loaded));
  const { summary } = revised;
  const { warnings } = report;
  return {
    proposal: revised.proposal,
    images: result.imageFiles,
    check: async () => {
      const text = await readMapping(roots, location.dir);
      if (text === null || sha256(text) !== prepared.baseHash) {
        throw new ToolError(
          'revision-conflict',
          'the project was changed by another process while the revision was being computed; reread and send again',
          { baseRevision: loaded.project.revision },
        );
      }
    },
    result: {
      summary,
      view: {
        counts: {
          changed: summary.changed.length,
          added: summary.added.length,
          dropped: summary.dropped.length,
        },
        changed: itemsOf(summary.changed, revised.proposal.changes, labels),
        added: itemsOf(summary.added, revised.proposal.changes, labels),
        dropped: itemsOf(summary.dropped, current.changes, labels),
        created: createdRefs(prepared.refs, result),
        ...(Array.isArray(warnings) && warnings.length > 0 ? { warnings } : {}),
      },
    },
  };
}

/** `revise_proposal`: validates, computes and (without `dryRun`) writes the revision in the same proposal. */
export async function reviseOnDisk(
  roots: Roots,
  now: () => number,
  resolved: ResolvedProposal,
  args: ReviseArgs,
): Promise<Json> {
  if ((args.drop?.length ?? 0) === 0 && (args.operations?.length ?? 0) === 0) {
    throw new ToolError(
      'invalid-arguments',
      'give `drop` (ids of changes to withdraw) or `operations` with at least one item',
    );
  }
  const { location, stored } = resolved;
  const dryRun = args.dryRun === true;
  const { proposal, result } = await reviseStored(
    roots,
    location,
    stored.id,
    !dryRun,
    (current) => compute(roots, location, now, args, current),
  );
  if (proposal === null) return result.view;
  const refs = new ProposalRefs(location.name, resolved.all);
  return {
    revised: !dryRun,
    ...(dryRun ? { dryRun: true } : {}),
    proposal: {
      ref: refs.ref(proposal.id),
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
    },
    revision: proposal.revision,
    ...result.view,
    hint: 'the proposal is the same (same reference): the replaced and new changes go back to awaiting a decision from the user ("Revised" mark); the accepted and untouched ones did not change. The mapping.json was not changed. Tell the user and wait for the review to finish (get_proposal). With dryRun nothing is written.',
  };
}
