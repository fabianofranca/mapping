import type { Proposal } from './proposal';
import type { ProposalIssue } from './proposalApply';
import type { JsonValue, Project } from './types';

export type ReviseErrorCode =
  | 'not-open'
  | 'proposal-applied'
  | 'change-not-found'
  | 'change-frozen'
  | 'proposal-not-applicable'
  | 'no-changes';

export interface ReviseError {
  readonly code: ReviseErrorCode;
  readonly message: string;
  readonly changeIds: readonly string[];
  readonly problems?: readonly ProposalIssue[];
}

export function prepareRevision(
  _project: Project,
  _proposal: Proposal,
  _drop: readonly string[],
):
  | { readonly ok: true; readonly dropped: readonly string[]; readonly proposed: Project }
  | { readonly ok: false; readonly error: ReviseError } {
  throw new Error('não implementado');
}

export interface ReviseArgs {
  readonly drop?: readonly string[];
  readonly after?: Project;
  readonly at: string;
  readonly operations?: readonly JsonValue[];
}

export interface ReviseSummary {
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly dropped: readonly string[];
}

export function reviseProposal(
  _project: Project,
  _proposal: Proposal,
  _args: ReviseArgs,
):
  | { readonly ok: true; readonly proposal: Proposal; readonly summary: ReviseSummary }
  | { readonly ok: false; readonly error: ReviseError } {
  throw new Error('não implementado');
}

