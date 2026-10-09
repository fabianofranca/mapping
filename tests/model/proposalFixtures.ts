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

/** Proposta aberta `P1` com as mudanças de `base` para `after`. */
export function propose(
  base: Project,
  after: Project,
  args: Partial<NewProposalArgs> = {},
): Proposal {
  return buildProposal(base, after, { id: 'P1', title: 'Teste', createdAt: AT, ...args });
}

/** A única mudança da entidade (e do campo, se informado); falha se houver zero ou mais de uma. */
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
      `${found.length} mudanças em ${entity}:${entityId}${field ? `.${field}` : ''}`,
    );
  }
  return found[0] as Change;
}

/** Decide o alvo (falha se a decisão for recusada) e devolve a proposta com as decisões. */
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
