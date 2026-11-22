import JSZip from 'jszip';
import {
  citationUrl,
  prepareRevision,
  proposalFilePath,
  renameMarking,
  reviseProposal,
  serializeProposal,
  serializeThread,
  threadFilePath,
  type Proposal,
  type Thread,
} from '../../src/model';
import {
  FIXTURE_PROPOSAL_ID,
  fixtureFiles,
  fixtureProject,
  fixtureProposal,
} from './proposalFixture';

// Fixture of stage #1881 (CV3): the sample project with its proposal and an open conversation
// that the agent linked to that proposal (the message has the card), and the same proposal as
// `revise_proposal` would write it (one change swapped).

export const CONVERSATION_ID = 'cv3-thread';
export const REVISED_AT = '2026-11-18T10:00:00.000Z';
const NOW = '2026-11-18T09:00:00.000Z';

/** The open conversation, anchored on the header marking, with the agent's proposal card. */
export function linkedThread(): Thread {
  const url =
    citationUrl('Store', fixtureProject(), [], {
      kind: 'proposal',
      id: FIXTURE_PROPOSAL_ID,
    }) ?? '';
  return {
    format: 'mapping-thread',
    formatVersion: 1,
    id: CONVERSATION_ID,
    anchor: { kind: 'marking', id: 'M1' },
    createdAt: NOW,
    revision: 1,
    resolved: null,
    messages: [
      {
        id: 'm1',
        author: { kind: 'agent', name: 'Claude Code', email: null },
        at: NOW,
        text: `Here is the checkout proposal [Checkout from Figma](${url}).`,
        proposal: FIXTURE_PROPOSAL_ID,
      },
    ],
  };
}

/** The files of the folder: the project, its proposal and the linked conversation. */
export function conversationFiles(): Map<string, string | Buffer> {
  const files = fixtureFiles();
  files.set(threadFilePath(CONVERSATION_ID, false), serializeThread(linkedThread()));
  return files;
}

/** The proposal revised as the MCP would save it: the header name is swapped again. */
export function revisedFixtureProposal(): { path: string; content: string } {
  const project = fixtureProject();
  const base: Proposal = fixtureProposal(project);
  const prep = prepareRevision(project, base, []);
  if (!prep.ok) throw new Error(prep.error.code);
  const after = renameMarking(prep.proposed, 'M1', 'Checkout top');
  const result = reviseProposal(project, base, { drop: [], at: REVISED_AT, after });
  if (!result.ok) throw new Error(result.error.code);
  const revised: Proposal = { ...result.proposal, revision: base.revision + 1 };
  return { path: proposalFilePath(revised.id), content: serializeProposal(revised) };
}

/** The zip of the same project, proposal and conversation (for "Open zip"). */
export async function conversationZip(): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of conversationFiles()) {
    zip.file(path, content, { date: new Date(NOW), compression: 'DEFLATE' });
  }
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}
