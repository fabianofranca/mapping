import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DENSITY_FORMAT_VERSION,
  PROPOSAL_DIRECTION_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createProject,
  decide,
  parseProposal,
  proposalFormatVersionFor,
  reviewTree,
  serializeProposal,
  setContainerDensity,
  setContainerDirection,
  setProjectDirection,
  setProjectDrawingMode,
  proposalUsesDirection,
  type Project,
  type Proposal,
} from '../../src/model';

// Direção numa proposta (schema v20): o campo `direction` do container e do projeto e a
// `formatVersion` 8, gravada só quando a proposta o usa (uma app anterior recusa a 8 em vez de
// descartar o campo).

const AT = '2026-11-13T10:00:00.000Z';
const base = addBackgroundContainer(
  createProject({
    name: 'Teste',
    now: AT,
    firstLayer: { id: 'l1', name: 'Camada 1', color: '#FF0000' },
  }),
  { id: 'c1', width: 100, height: 80, background: '#FFFFFF' },
);
const build = (after: Project, from: Project = base): Proposal =>
  buildProposal(from, after, { title: 'Direção', createdAt: AT });

function accept(from: Project, proposal: Proposal): Project {
  const decided = decide(
    proposal,
    reviewTree(proposal, from),
    { level: 'proposal', id: null },
    'accepted',
    AT,
  );
  if (!decided.ok) throw new Error(decided.reason);
  const applied = applyAccepted(from, { ...proposal, decisions: decided.decisions }, AT);
  if (!applied.ok) throw new Error('bloqueada');
  return applied.project;
}

describe('proposta com a direção de leitura', () => {
  it('sem direção a proposta continua na formatVersion 4', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(proposalUsesDirection(proposal.changes)).toBe(false);
    expect(PROPOSAL_FORMAT_VERSIONS).toContain(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(PROPOSAL_DIRECTION_FORMAT_VERSION).toBe(8);
  });

  it('a direção do container é o campo direction; a proposta grava a 8; ida e volta', () => {
    const proposal = build(setContainerDirection(base, 'c1', 'rtl'));
    expect(proposal.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'direction', from: null, to: 'rtl' },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
  });

  it('aceitar e aplicar grava a direção do container; voltar a seguir o projeto a tira', () => {
    const fixed = setContainerDirection(base, 'c1', 'rtl');
    expect(accept(base, build(fixed)).containers[0]?.direction).toBe('rtl');
    const back = build(base, fixed);
    expect(back.changes).toMatchObject([{ field: 'direction', from: 'rtl', to: null }]);
    expect(back.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(accept(fixed, back).containers[0]?.direction ?? null).toBeNull();
  });

  it('a direção do projeto é um campo da entidade project; aplicar a grava e a tira', () => {
    const rtl = setProjectDirection(base, 'rtl');
    const proposal = build(rtl);
    expect(proposal.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'project',
        entityId: 'project',
        kind: 'update',
        field: null,
        from: { drawingMode: null },
        to: { drawingMode: null, direction: 'rtl' },
      },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
    expect(accept(base, proposal).direction).toBe('rtl');
    const back = build(base, rtl);
    expect(proposalUsesDirection(back.changes)).toBe(true);
    expect(accept(rtl, back).direction).toBeUndefined();
  });

  it('trocar só o modo do desenho num projeto rtl não perde a direção', () => {
    const rtl = setProjectDirection(base, 'rtl');
    const proposal = build(setProjectDrawingMode(rtl, 'dark'), rtl);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'project',
        from: { drawingMode: null, direction: 'rtl' },
        to: { drawingMode: 'dark', direction: 'rtl' },
      },
    ]);
    const applied = accept(rtl, proposal);
    expect(applied.drawingMode).toBe('dark');
    expect(applied.direction).toBe('rtl');
  });

  it('direction fora de ltr/rtl (container ou projeto) é recusada ao ler', () => {
    const container = JSON.parse(
      serializeProposal(build(setContainerDirection(base, 'c1', 'rtl'))),
    );
    container.changes[0].to = 'cima';
    expect(parseProposal(container).ok).toBe(false);
    const project = JSON.parse(
      serializeProposal(build(setProjectDirection(base, 'rtl'))),
    );
    project.changes[0].to.direction = 'cima';
    expect(parseProposal(project).ok).toBe(false);
  });

  it('um container criado com direction na proposta leva a 8', () => {
    const after = setContainerDirection(
      addBackgroundContainer(base, {
        id: 'c2',
        width: 50,
        height: 50,
        background: '#000000',
      }),
      'c2',
      'rtl',
    );
    const proposal = build(after);
    expect(proposalUsesDirection(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(accept(base, proposal).containers.find((c) => c.id === 'c2')?.direction).toBe(
      'rtl',
    );
  });

  it('a versão escolhida é monótona: a 8 não desce e a densidade sozinha continua 7', () => {
    const density = build(setContainerDensity(base, 'c1', 2));
    expect(density.formatVersion).toBe(PROPOSAL_DENSITY_FORMAT_VERSION);
    expect(proposalFormatVersionFor(density.changes, 5, 8)).toBe(8);
    expect(proposalFormatVersionFor(density.changes, 5, 7)).toBe(7);
    const both = build(
      setContainerDirection(setContainerDensity(base, 'c1', 2), 'c1', 'rtl'),
    );
    expect(both.formatVersion).toBe(8);
    expect(proposalFormatVersionFor([], 5, 8)).toBe(8);
    expect(proposalFormatVersionFor([], 5)).toBe(5);
  });
});
