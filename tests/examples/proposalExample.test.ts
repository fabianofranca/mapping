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

// `examples/proposta-exemplo.zip`: um projeto com uma proposta de alteração para testar a
// revisão sem o agente ("Abrir zip", no desktop e no celular). O zip é gerado de
// `tests/e2e/proposalFixture.ts` (o mesmo do e2e); este teste confere que ele continua
// igual ao gerador. Para gerar de novo: `UPDATE_EXAMPLES=1 npx vitest run tests/examples`.

const EXAMPLE = 'examples/proposta-exemplo.zip';

describe('zip de exemplo com proposta', () => {
  it('a proposta é válida e aplicável sobre o projeto', () => {
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
    // Aceitar tudo dá um projeto válido.
    const all = Object.fromEntries(
      proposal.changes.map((c) => [c.id, { state: 'accepted' as const, at: 'x' }]),
    );
    expect(validateAccepted(project, { ...proposal, decisions: all }).ok).toBe(true);
  });

  it('examples/proposta-exemplo.zip está em dia com o gerador', async () => {
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
        expect(Buffer.from((await entry?.async('uint8array')) ?? []), path).toEqual(content);
      }
    }
  });

  it('a app lê o zip com a proposta e as imagens que esperam a aceitação', async () => {
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE)]));
    if (!read.ok) throw new Error(read.error);
    const { files } = read;
    expect(deserialize(files.mapping).ok).toBe(true);
    const text = files.proposals.get(`proposals/${FIXTURE_PROPOSAL_ID}/proposal.json`);
    expect(text && parseProposalText(text).ok).toBe(true);
    expect([...files.proposalImages.keys()].sort()).toEqual([
      `proposals/${FIXTURE_PROPOSAL_ID}/images/carrinho-v2.png`,
      `proposals/${FIXTURE_PROPOSAL_ID}/images/confirmacao.png`,
    ]);
  });
});
