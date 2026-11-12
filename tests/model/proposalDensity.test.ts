import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DENSITY_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createProject,
  decide,
  parseProposal,
  reviewTree,
  serializeProposal,
  setContainerDensity,
  usesDensity,
} from '../../src/model';

// Densidade numa proposta (schema v19): o campo `density` do container e a `formatVersion` 7,
// gravada só quando a proposta o usa (uma app anterior recusa a 7 em vez de descartar o campo).

const AT = '2026-11-12T10:00:00.000Z';
const base = addBackgroundContainer(
  createProject({
    name: 'Teste',
    now: AT,
    firstLayer: { id: 'l1', name: 'Camada 1', color: '#FF0000' },
  }),
  { id: 'c1', width: 100, height: 80, background: '#FFFFFF' },
);
const build = (after: typeof base) =>
  buildProposal(base, after, { title: 'Densidade', createdAt: AT });

describe('proposta com a densidade do container', () => {
  it('sem densidade a proposta continua na formatVersion 4', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesDensity(proposal.changes)).toBe(false);
  });

  it('a densidade é o campo density do container; a proposta grava a 7; ida e volta', () => {
    const proposal = build(setContainerDensity(base, 'c1', 3));
    expect(proposal.formatVersion).toBe(PROPOSAL_DENSITY_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'density', from: null, to: 3 },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
  });

  it('aceitar e aplicar grava a densidade; null a remove', () => {
    const fixed = setContainerDensity(base, 'c1', 3);
    const proposal = build(fixed);
    const decided = decide(
      proposal,
      reviewTree(proposal, base),
      { level: 'proposal', id: null },
      'accepted',
      AT,
    );
    if (!decided.ok) throw new Error(decided.reason);
    const applied = applyAccepted(
      base,
      { ...proposal, decisions: decided.decisions },
      AT,
    );
    if (!applied.ok) throw new Error('bloqueada');
    expect(applied.project.containers[0]?.density).toBe(3);

    const back = buildProposal(fixed, base, { title: 'x', createdAt: AT });
    expect(back.changes).toMatchObject([{ field: 'density', from: 3, to: null }]);
  });

  it('density fora de 0,5 a 8 na proposta é recusada ao ler', () => {
    const json = JSON.parse(serializeProposal(build(setContainerDensity(base, 'c1', 3))));
    json.changes[0].to = 12;
    expect(parseProposal(json).ok).toBe(false);
  });

  it('um container criado com density na proposta leva a 7', () => {
    const after = setContainerDensity(
      addBackgroundContainer(base, {
        id: 'c2',
        width: 50,
        height: 50,
        background: '#000000',
      }),
      'c2',
      2,
    );
    const proposal = build(after);
    expect(usesDensity(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(PROPOSAL_DENSITY_FORMAT_VERSION);
  });
});
