import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DRAWING_MODE_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createProject,
  decide,
  parseProposal,
  reviewTree,
  serializeProposal,
  setContainerDrawingMode,
  setProjectDrawingMode,
  usesDrawingMode,
} from '../../src/model';

// Fase CF6: o modo do desenho numa proposta (entidade `project`, campo `drawingMode` do container)
// e a `formatVersion` 6, gravada só quando a proposta o usa.

const AT = '2026-11-07T10:00:00.000Z';
const base = addBackgroundContainer(
  createProject({
    name: 'Teste',
    now: AT,
    firstLayer: { id: 'l1', name: 'Camada 1', color: '#FF0000' },
  }),
  {
    id: 'c1',
    width: 100,
    height: 80,
    background: '#FFFFFF',
  },
);
const build = (after: typeof base) =>
  buildProposal(base, after, { title: 'Modo', createdAt: AT });

describe('proposta com o modo do desenho', () => {
  it('sem modo a proposta continua na formatVersion 4', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesDrawingMode(proposal.changes)).toBe(false);
  });

  it('o modo do projeto vira a entidade project e a proposta grava a 6; ida e volta', () => {
    const proposal = build(setProjectDrawingMode(base, 'dark'));
    expect(proposal.formatVersion).toBe(PROPOSAL_DRAWING_MODE_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'project',
        entityId: 'project',
        kind: 'update',
        field: null,
        from: { drawingMode: null },
        to: { drawingMode: 'dark' },
      },
    ]);
    const parsed = parseProposal(JSON.parse(serializeProposal(proposal)));
    expect(parsed.ok).toBe(true);
  });

  it('o modo do container é o campo drawingMode; aceitar e aplicar grava e remove', () => {
    const fixed = setContainerDrawingMode(base, 'c1', 'dark');
    const proposal = build(fixed);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'drawingMode', from: null, to: 'dark' },
    ]);
    const tree = reviewTree(proposal, base);
    const decided = decide(
      proposal,
      tree,
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
    expect(applied.project.containers[0]?.drawingMode).toBe('dark');

    const back = build(setContainerDrawingMode(fixed, 'c1', null));
    expect(back.formatVersion).toBe(4);
    expect(
      usesDrawingMode(buildProposal(fixed, base, { title: 'x', createdAt: AT }).changes),
    ).toBe(true);
  });

  it('a 4 não aceita a entidade project com entityId errado', () => {
    const proposal = build(setProjectDrawingMode(base, 'dark'));
    const json = JSON.parse(serializeProposal(proposal));
    json.changes[0].entityId = 'outro';
    expect(parseProposal(json).ok).toBe(false);
  });
});
