import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserialize, parseProposalText, validateAccepted } from '../../src/model';
import { readProjectZip } from '../../src/storage/zip';
import {
  FIXTURE_PROPOSAL_ID,
  fixtureFiles,
  fixtureProject,
  fixtureProposal,
  fixtureZip,
} from '../e2e/proposalFixture';

// `examples/proposal-example.zip`: a project with a change proposal to test the review
// without the agent ("Open zip", on desktop and phone). The zip is generated from
// `tests/e2e/proposalFixture.ts` (the same as the e2e); this test checks that it still
// matches the generator. To regenerate: `UPDATE_EXAMPLES=1 npx vitest run tests/examples`.

const EXAMPLE = 'examples/proposal-example.zip';

describe('example zip with a proposal', () => {
  it('the proposal is valid and applicable on the project', () => {
    const project = fixtureProject();
    const proposal = fixtureProposal(project);
    expect(proposal.changes.length).toBeGreaterThan(10);
    const types = new Set(proposal.changes.map((c) => `${c.entity}:${c.kind}`));
    for (const t of [
      'marking:create',
      'marking:remove',
      'marking:update',
      'image:create',
      'image:update',
      'annotation:create',
      'annotation:update',
      'layer:create',
    ]) {
      expect(types, t).toContain(t);
    }
    // Accepting everything gives a valid project.
    const all = Object.fromEntries(
      proposal.changes.map((c) => [c.id, { state: 'accepted' as const, at: 'x' }]),
    );
    expect(validateAccepted(project, { ...proposal, decisions: all }).ok).toBe(true);
  });

  it('examples/proposal-example.zip is up to date with the generator', async () => {
    if (process.env.UPDATE_EXAMPLES === '1') writeFileSync(EXAMPLE, await fixtureZip());
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const expected = fixtureFiles();
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    expect(names.sort()).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      const entry = zip.file(path);
      if (typeof content === 'string') {
        expect(await entry?.async('string'), path).toBe(content);
      } else {
        expect(Buffer.from((await entry?.async('uint8array')) ?? []), path).toEqual(
          content,
        );
      }
    }
  });

  it('the app reads the zip with the proposal and the images that await acceptance', async () => {
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE)]));
    if (!read.ok) throw new Error(read.error);
    const { files } = read;
    expect(deserialize(files.mapping).ok).toBe(true);
    const text = files.proposals.get(`proposals/${FIXTURE_PROPOSAL_ID}/proposal.json`);
    expect(text && parseProposalText(text).ok).toBe(true);
    expect([...files.proposalImages.keys()].sort()).toEqual([
      `proposals/${FIXTURE_PROPOSAL_ID}/images/cart-v2.png`,
      `proposals/${FIXTURE_PROPOSAL_ID}/images/confirmation.png`,
    ]);
  });
});
