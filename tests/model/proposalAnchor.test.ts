import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_ANCHOR_FORMAT_VERSION,
  PROPOSAL_DIRECTION_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createMarking,
  createProject,
  decide,
  parseProposal,
  proposalFormatVersionFor,
  proposalUsesAnchor,
  removeMarking,
  reviewTree,
  serializeProposal,
  setContainerDirection,
  setMarkingAnchor,
  snapToAnchor,
  type Project,
  type Proposal,
} from '../../src/model';

// Âncora numa proposta (schema v20, R3): o campo `anchor` da marcação (valor da âncora ou `null`) e
// o `anchor` do valor de uma marcação criada; a `formatVersion` 9, gravada só quando a proposta o
// usa (uma app anterior recusa a 9 em vez de descartar a âncora de uma marcação criada). O
// `snap_to_anchor` é a Posição (`rect`) de sempre.

const AT = '2026-11-13T10:00:00.000Z';
const T = { x: 40, y: 40, width: 20, height: 20 };
const B = { x: 100, y: 5, width: 10, height: 10 };
const base = createMarking(
  createMarking(
    addBackgroundContainer(
      createProject({
        name: 'Teste',
        now: AT,
        firstLayer: { id: 'l1', name: 'Camada 1', color: '#FF0000' },
      }),
      { id: 'c1', width: 200, height: 160, background: '#FFFFFF' },
    ),
    { id: 'T', containerId: 'c1', rect: T },
  ),
  { id: 'B', containerId: 'c1', rect: B },
);
const build = (after: Project, from: Project = base): Proposal =>
  buildProposal(from, after, { title: 'Âncora', createdAt: AT });

function accept(from: Project, proposal: Proposal, only?: string): Project {
  const tree = reviewTree(proposal, from);
  const target = only
    ? { level: 'change' as const, id: only }
    : { level: 'proposal' as const, id: null };
  const decided = decide(proposal, tree, target, 'accepted', AT);
  if (!decided.ok) throw new Error(decided.reason);
  const applied = applyAccepted(from, { ...proposal, decisions: decided.decisions }, AT);
  if (!applied.ok) throw new Error('bloqueada');
  return applied.project;
}

const markingOf = (p: Project, id: string) => p.markings.find((m) => m.id === id)!;

describe('proposta com a âncora da marcação', () => {
  it('sem âncora a proposta fica na formatVersion 4 e a 9 é uma versão lida', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(proposalUsesAnchor(proposal.changes)).toBe(false);
    expect(PROPOSAL_ANCHOR_FORMAT_VERSION).toBe(9);
    expect(PROPOSAL_FORMAT_VERSIONS).toContain(9);
  });

  it('ancorar é o campo anchor da marcação (from null); grava a 9; ida e volta; aceitar grava', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'top' });
    const proposal = build(anchored);
    expect(proposal.formatVersion).toBe(PROPOSAL_ANCHOR_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'marking',
        entityId: 'B',
        field: 'anchor',
        from: null,
        to: { to: 'T', side: 'top' },
      },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
    expect(markingOf(accept(base, proposal), 'B').anchor).toEqual({
      to: 'T',
      side: 'top',
    });
  });

  it('tirar a âncora é anchor null e também sobe a versão', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T' });
    const proposal = build(base, anchored);
    expect(proposal.changes).toMatchObject([
      { field: 'anchor', from: { to: 'T' }, to: null },
    ]);
    expect(proposal.formatVersion).toBe(9);
    expect(markingOf(accept(anchored, proposal), 'B').anchor ?? null).toBeNull();
  });

  it('uma marcação criada com anchor leva a âncora no valor e a 9', () => {
    const after = setMarkingAnchor(
      createMarking(base, {
        id: 'N',
        containerId: 'c1',
        rect: { x: 100, y: 100, width: 10, height: 10 },
      }),
      'N',
      { to: 'T', align: 'end' },
    );
    const proposal = build(after);
    expect(proposalUsesAnchor(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(9);
    const applied = accept(base, proposal);
    expect(markingOf(applied, 'N').anchor).toEqual({ to: 'T', align: 'end' });
  });

  it('a âncora criada na mesma proposta exige a criação do alvo (aceitar só a âncora aceita as duas)', () => {
    const withTarget = createMarking(base, {
      id: 'T2',
      containerId: 'c1',
      rect: { x: 120, y: 100, width: 20, height: 20 },
    });
    const proposal = build(setMarkingAnchor(withTarget, 'B', { to: 'T2' }), base);
    const anchorChange = proposal.changes.find((c) => c.field === 'anchor')!;
    const applied = accept(base, proposal, anchorChange.id);
    expect(markingOf(applied, 'B').anchor).toEqual({ to: 'T2' });
    expect(applied.markings.some((m) => m.id === 'T2')).toBe(true);
  });

  it('excluir a âncora aparece como a mudança anchor null da ancorada', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T' });
    const proposal = build(removeMarking(anchored, 'T'), anchored);
    expect(
      proposal.changes.map((c) => `${c.kind}:${c.entityId}:${c.field ?? ''}`).sort(),
    ).toEqual(['remove:T:', 'update:B:anchor']);
    const applied = accept(anchored, proposal);
    expect(applied.markings.map((m) => m.id)).toEqual(['B']);
    expect(markingOf(applied, 'B').anchor ?? null).toBeNull();
  });

  it('anchor + snap_to_anchor: a âncora e a Posição são duas mudanças e se aceita só uma', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'top' });
    const snapped = snapToAnchor(anchored, 'B').project;
    const proposal = build(snapped);
    const fields = proposal.changes.map((c) => c.field).sort();
    expect(fields).toEqual(['anchor', 'rect']);
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    const anchor = proposal.changes.find((c) => c.field === 'anchor')!;
    const onlyRect = accept(base, proposal, rect.id);
    expect(markingOf(onlyRect, 'B').rect).toEqual(markingOf(snapped, 'B').rect);
    expect(markingOf(onlyRect, 'B').anchor ?? null).toBeNull();
    const onlyAnchor = accept(base, proposal, anchor.id);
    expect(markingOf(onlyAnchor, 'B').rect).toEqual(B);
    expect(markingOf(onlyAnchor, 'B').anchor).toEqual({ to: 'T', side: 'top' });
  });

  it('anchor inválido (side desconhecido, to vazio) é recusado ao ler', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'top' });
    const json = JSON.parse(serializeProposal(build(anchored)));
    json.changes[0].to.side = 'diagonal';
    expect(parseProposal(json).ok).toBe(false);
  });

  it('a versão é monótona: a 9 não desce e a direção sozinha continua 8', () => {
    const direction = build(setContainerDirection(base, 'c1', 'rtl'));
    expect(direction.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(proposalFormatVersionFor(direction.changes, 5, 9)).toBe(9);
    expect(proposalFormatVersionFor([], 5, 9)).toBe(9);
    const both = build(
      setMarkingAnchor(setContainerDirection(base, 'c1', 'rtl'), 'B', { to: 'T' }),
    );
    expect(both.formatVersion).toBe(9);
  });
});
