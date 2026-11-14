import {
  buildProposal,
  decide,
  reviewTree,
  type Change,
  type ChangeEntity,
  type DecisionState,
  type NewProposalArgs,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../src/model';

export const AT = '2026-10-09T12:00:00.000Z';
export const LATER = '2026-10-09T13:00:00.000Z';

/** Open proposal `P1` with the changes from `base` to `after`. */
export function propose(
  base: Project,
  after: Project,
  args: Partial<NewProposalArgs> = {},
): Proposal {
  // pt-BR kept: shared fixture data (title 'Teste') asserted by tests/store and tests/app\n  return buildProposal(base, after, { id: 'P1', title: 'Teste', createdAt: AT, ...args });
}

/** The only change of the entity (and of the field, if given); fails if there are zero or more than one. */
export function changeOf(
  p: Proposal,
  entity: ChangeEntity,
  entityId: string,
  field?: string | null,
): Change {
  const found = p.changes.filter(
    (c) =>
      c.entity === entity &&
      c.entityId === entityId &&
      (field === undefined || c.field === field),
  );
  if (found.length !== 1) {
    throw new Error(
      `${found.length} changes in ${entity}:${entityId}${field ? `.${field}` : ''}`,
    );
  }
  return found[0] as Change;
}

/** Decides the target (fails if the decision is refused) and returns the proposal with the decisions. */
export function decided(
  p: Proposal,
  project: Project,
  target: ReviewTarget,
  state: DecisionState | null,
): Proposal {
  const result = decide(p, reviewTree(p, project), target, state, AT);
  if (!result.ok) throw new Error(result.reason);
  return { ...p, decisions: result.decisions };
}

export function stateOf(p: Proposal, changeId: string): DecisionState | null {
  return p.decisions[changeId]?.state ?? null;
}
