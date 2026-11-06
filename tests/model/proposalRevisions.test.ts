import { describe, expect, it } from 'vitest';
import {
  droppedNoteOrigin,
  latestRevisionSummary,
  revisionMark,
  revisionMarks,
  renameMarking,
  visibleRevisedChanges,
  PROPOSAL_REVISED_FORMAT_VERSION,
  type Change,
  type Proposal,
  type ProposalRevision,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, LATER, propose } from './proposalFixtures';

// Leitura da marca "Revisada" (etapa #644, decisão 5): a revisão mais nova que cita a mudança.

const T1 = '2026-11-07T10:00:00.000Z';
const T2 = '2026-11-07T11:00:00.000Z';

function revision(over: Partial<ProposalRevision>): ProposalRevision {
  return {
    at: T1,
    baseRevision: 1,
    operations: [],
    changed: {},
    added: [],
    dropped: [],
    ...over,
  };
}

/** Proposta com as mudanças c1 e c2 (renomeia M3 e M4) e as revisões dadas. */
function revised(revisions: readonly ProposalRevision[] | undefined): Proposal {
  const base = sampleProject();
  const p = propose(base, renameMarking(renameMarking(base, 'M3', 'A'), 'M4', 'B'));
  expect(p.changes.map((c) => c.id)).toEqual(['c1', 'c2']);
  return revisions === undefined
    ? p
    : { ...p, formatVersion: PROPOSAL_REVISED_FORMAT_VERSION, revisions };
}

function droppedChange(): Change {
  const base = revised(undefined);
  return { ...(base.changes[0] as Change), id: 'c7' };
}

describe('revisionMark', () => {
  it('sem revisions não há marca', () => {
    const p = revised(undefined);
    expect(revisionMark(p, 'c1')).toBeNull();
    expect(revisionMarks(p).size).toBe(0);
    expect(visibleRevisedChanges(p)).toEqual([]);
    expect(latestRevisionSummary(p)).toBeNull();
    expect(droppedNoteOrigin(p, 'n1')).toBeNull();
  });

  it('mudança trocada: a marca traz o to e a decisão de antes', () => {
    const p = revised([
      revision({ changed: { c1: { to: 'Antes', state: 'rejected' } } }),
    ]);
    expect(revisionMark(p, 'c1')).toEqual({
      kind: 'changed',
      at: T1,
      previous: { to: 'Antes', state: 'rejected' },
    });
    expect(revisionMark(p, 'c2')).toBeNull();
  });

  it('mudança nova: a marca é added, sem previous', () => {
    const p = revised([revision({ added: ['c2'] })]);
    expect(revisionMark(p, 'c2')).toEqual({ kind: 'added', at: T1 });
  });

  it('trocada em duas revisões: vale a mais nova', () => {
    const p = revised([
      revision({ changed: { c1: { to: 'Primeiro', state: null } } }),
      revision({ at: T2, changed: { c1: { to: 'Segundo', state: null } } }),
    ]);
    expect(revisionMark(p, 'c1')).toEqual({
      kind: 'changed',
      at: T2,
      previous: { to: 'Segundo', state: null },
    });
  });

  it('nova numa revisão e trocada depois: vale a troca (a mais nova)', () => {
    const p = revised([
      revision({ added: ['c2'] }),
      revision({ at: T2, changed: { c2: { to: 'x', state: null } } }),
    ]);
    expect(revisionMark(p, 'c2')?.kind).toBe('changed');
    expect(revisionMark(p, 'c2')?.at).toBe(T2);
  });

  it('mudança que não está mais em changes não tem marca', () => {
    const p = revised([
      revision({ added: ['c40'], changed: { c41: { to: 1, state: null } } }),
    ]);
    expect(revisionMark(p, 'c40')).toBeNull();
    expect(revisionMark(p, 'c41')).toBeNull();
    expect(revisionMarks(p).size).toBe(0);
  });

  it('revisionMarks junta todas as marcas e é memoizado pelas revisões', () => {
    const p = revised([
      revision({ added: ['c2'], changed: { c1: { to: 'a', state: null } } }),
    ]);
    const marks = revisionMarks(p);
    expect([...marks.keys()].sort()).toEqual(['c1', 'c2']);
    expect(revisionMarks({ ...p, decisions: {} })).toBe(marks);
  });
});

describe('visibleRevisedChanges', () => {
  const revisions = [
    revision({ added: ['c2'], changed: { c1: { to: 'a', state: null } } }),
  ];

  it('lista, na ordem de changes, as marcadas sem decisão', () => {
    expect(visibleRevisedChanges(revised(revisions))).toEqual(['c1', 'c2']);
  });

  it('decidir tira da lista e limpar a decisão traz de volta', () => {
    const p = revised(revisions);
    const decided: Proposal = {
      ...p,
      decisions: {
        c1: { state: 'accepted', at: AT },
        c2: { state: 'rejected', at: LATER },
      },
    };
    expect(visibleRevisedChanges(decided)).toEqual([]);
    const cleared: Proposal = {
      ...p,
      decisions: { c2: { state: 'rejected', at: LATER } },
    };
    expect(visibleRevisedChanges(cleared)).toEqual(['c1']);
    expect(visibleRevisedChanges({ ...p, decisions: {} })).toEqual(['c1', 'c2']);
  });
});

describe('latestRevisionSummary', () => {
  it('conta changed, added e dropped da revisão mais nova', () => {
    const p = revised([
      revision({ added: ['c1', 'c2'] }),
      revision({
        at: T2,
        changed: { c1: { to: 'a', state: null }, c2: { to: 'b', state: 'rejected' } },
        added: ['c9'],
        dropped: [{ change: droppedChange(), state: null, notes: [] }],
      }),
    ]);
    expect(latestRevisionSummary(p)).toEqual({
      at: T2,
      changed: 2,
      added: 1,
      dropped: 1,
    });
  });
});

describe('droppedNoteOrigin', () => {
  it('devolve a mudança retirada de onde a nota veio', () => {
    const change = droppedChange();
    const p = revised([
      revision({ dropped: [{ change, state: null, notes: ['n2', 'n3'] }] }),
      revision({ at: T2 }),
    ]);
    expect(droppedNoteOrigin(p, 'n3')).toEqual(change);
    expect(droppedNoteOrigin(p, 'n9')).toBeNull();
  });
});
