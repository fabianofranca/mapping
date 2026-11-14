import {
  prepareRevision,
  renameMarking,
  reviseProposal,
  type Proposal,
} from '../../../src/model';
import { sampleProject } from '../../model/fixtures';
import { richScenario } from '../../store/proposalHarness';

export const REVISED_AT = '2026-11-07T10:00:00.000Z';

/**
 * The `richScenario` revised as the MCP would save it: replaces the name of M1 (change
 * `ids.name`, "replaced") and adds that of M2 (new change).
 */
export function revisedScenario() {
  const scenario = richScenario();
  const project = sampleProject();
  const prep = prepareRevision(project, scenario.proposal, []);
  if (!prep.ok) throw new Error(prep.error.code);
  // pt-BR kept: shared fixture data asserted by tests/store (revisedGuard)
  const after = renameMarking(
    renameMarking(prep.proposed, 'M1', 'Porta traseira'),
    'M2',
    'Capô novo',
  );
  const result = reviseProposal(project, scenario.proposal, {
    drop: [],
    at: REVISED_AT,
    after,
  });
  if (!result.ok) throw new Error(result.error.code);
  const proposal: Proposal = {
    ...result.proposal,
    title: 'Checkout',
    revision: scenario.proposal.revision + 1,
  };
  const added = proposal.revisions?.[0]?.added[0];
  if (!added) throw new Error('the revision added nothing');
  return { ...scenario, proposal, changedId: scenario.ids.name, addedId: added };
}
