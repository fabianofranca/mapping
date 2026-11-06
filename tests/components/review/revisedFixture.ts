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
 * A `richScenario` revisada como o MCP a gravaria: troca o nome da M1 (mudança `ids.name`,
 * "trocada") e acrescenta o do M2 (mudança nova).
 */
export function revisedScenario() {
  const scenario = richScenario();
  const project = sampleProject();
  const prep = prepareRevision(project, scenario.proposal, []);
  if (!prep.ok) throw new Error(prep.error.code);
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
  if (!added) throw new Error('a revisão não acrescentou nada');
  return { ...scenario, proposal, changedId: scenario.ids.name, addedId: added };
}
