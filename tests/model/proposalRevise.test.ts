import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addNote,
  createMarking,
  parseProposal,
  patchProject,
  prepareRevision,
  removeMarking,
  renameMarking,
  reorderMarking,
  reviseProposal,
  serializeProposal,
  type Change,
  type Project,
  type Proposal,
  type ReviseArgs,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { CONTAINER, shape } from './proposalFuzzSupport';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Revisão da proposta pelo agente (etapa #644, CP1): `prepareRevision` fecha o `drop` e monta o
// proposto inteiro; o lote (aqui, as operações puras do modelo) roda sobre ele; `reviseProposal`
// classifica cada mudança (intocada, trocada, nova ou retirada) pelo efeito líquido do
// resultado sobre o projeto atual. Regras: docs/PROPOSAL-FORMAT.md, "Revisão pelo agente".

const AT2 = '2026-11-07T10:00:00.000Z';

/** Prepara, aplica o lote ao proposto e revisa; sem `mutate`, só o `drop`. */
function revise(
  project: Project,
  p: Proposal,
  drop: readonly string[] = [],
  mutate?: (proposed: Project) => Project,
) {
  const prep = prepareRevision(project, p, drop);
  if (!prep.ok) throw new Error(`prepareRevision: ${prep.error.code}`);
  const args: ReviseArgs = {
    drop,
    at: AT2,
    ...(mutate ? { after: mutate(prep.proposed) } : {}),
  };
  return { prep, result: reviseProposal(project, p, args), after: args.after };
}

/** O resultado esperado como sucesso (falha com o código se for recusa). */
function okOf(r: ReturnType<typeof reviseProposal>) {
  if (!r.ok) throw new Error(`recusada: ${r.error.code} ${r.error.changeIds.join(',')}`);
  return r;
}

function errorOf(r: ReturnType<typeof reviseProposal>) {
  if (r.ok) throw new Error('esperava recusa');
  return r.error;
}

const sorted = <T extends { readonly id: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.id.localeCompare(b.id));

/** O projeto sem a ordem global dos arrays e sem `updatedAt`. */
function normalized(p: Project) {
  return {
    ...p,
    project: { ...p.project, updatedAt: '' },
    layers: sorted(p.layers),
    containers: sorted(p.containers),
    markings: sorted(p.markings),
    arrows: sorted(p.arrows),
    annotations: sorted(p.annotations),
  };
}

/** Fidelidade: aplicar a revisada ao projeto atual dá o `after` do lote. */
function expectFidelity(project: Project, revised: Proposal, after: Project) {
  const applied = patchProject(project, revised.changes);
  expect(applied.problems).toEqual([]);
  expect(normalized(applied.project)).toEqual(normalized(after));
  expect(shape(applied.project)).toEqual(shape(after));
}

const json = (value: unknown) => JSON.stringify(value);

/** Mudança nova de `base` com um marcação N1 em I2 (e, opcional, uma anotação). */
function withNewMarking(base: Project, annotated: boolean): Project {
  const created = createMarking(base, {
    id: 'N1',
    containerId: 'I2',
    rect: { x: 500, y: 500, width: 100, height: 100 },
  });
  return annotated
    ? addAnnotation(created, { id: 'A9', markingId: 'N1', layerId: 'L1' })
    : created;
}

describe('reviseProposal: classificação das mudanças', () => {
  it('troca o nome de um item cuja mudança foi rejeitada: trocada, sem decisão', () => {
    const base = sampleProject();
    let p = propose(base, renameMarking(base, 'M4', 'Farol'));
    const old = changeOf(p, 'marking', 'M4', 'name');
    p = decided(p, base, { level: 'change', id: old.id }, 'rejected');
    p = addNote(p, { level: 'change', id: old.id }, 'Prefiro outro nome', AT, 'n1');

    const { result, after } = revise(base, p, [], (x) =>
      renameMarking(x, 'M4', 'Lanterna'),
    );
    const r = okOf(result);

    const swapped = changeOf(r.proposal, 'marking', 'M4', 'name');
    expect(swapped).toEqual({ ...old, to: 'Lanterna' });
    expect(r.proposal.decisions[old.id]).toBeUndefined();
    expect(r.proposal.notes).toEqual(p.notes);
    expect(r.summary).toEqual({ changed: [old.id], added: [], dropped: [] });
    expect(r.proposal.formatVersion).toBe(5);
    expect(r.proposal.revisions).toEqual([
      {
        at: AT2,
        baseRevision: base.revision,
        operations: [],
        changed: { [old.id]: { to: 'Farol', state: 'rejected' } },
        added: [],
        dropped: [],
      },
    ]);
    expectFidelity(base, r.proposal, after as Project);
  });

  it('retira a criação rejeitada com as anotações; a nota vai para a proposta', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    const marking = changeOf(p, 'marking', 'N1');
    const annotation = changeOf(p, 'annotation', 'A9');
    p = decided(p, base, { level: 'change', id: marking.id }, 'rejected');
    p = addNote(p, { level: 'change', id: marking.id }, 'Não precisa', AT, 'n1');
    p = addNote(p, { level: 'proposal', id: null }, 'Geral', AT, 'n2');

    const { result } = revise(base, p, [marking.id]);
    const r = okOf(result);

    expect(r.proposal.changes).toEqual([]);
    expect(r.proposal.decisions).toEqual({});
    expect(r.summary.dropped).toEqual([marking.id, annotation.id]);
    expect(r.proposal.notes).toEqual([
      { id: 'n1', target: { level: 'proposal', id: null }, text: 'Não precisa', at: AT },
      p.notes[1],
    ]);
    const revision = r.proposal.revisions?.[0];
    expect(revision?.dropped).toEqual([
      { change: marking, state: 'rejected', notes: ['n1'] },
      { change: annotation, state: 'rejected', notes: [] },
    ]);
  });

  it('acrescenta uma anotação a um item criado e aceito: nova; a aceita fica idêntica', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    const marking = changeOf(p, 'marking', 'N1');
    p = decided(p, base, { level: 'change', id: marking.id }, 'accepted');
    p = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'annotation', 'A9').id },
      'accepted',
    );

    const { result, after } = revise(base, p, [], (x) =>
      addAnnotation(x, { id: 'A10', markingId: 'N1', layerId: 'L2' }),
    );
    const r = okOf(result);

    const added = changeOf(r.proposal, 'annotation', 'A10');
    expect(added.kind).toBe('create');
    expect(added.from).toBeNull();
    expect(r.proposal.decisions[added.id]).toBeUndefined();
    expect(r.summary).toEqual({ changed: [], added: [added.id], dropped: [] });
    for (const old of p.changes) {
      const now = r.proposal.changes.find((c) => c.id === old.id) as Change;
      expect(json(now)).toBe(json(old));
      expect(json(r.proposal.decisions[old.id])).toBe(json(p.decisions[old.id]));
    }
    expectFidelity(base, r.proposal, after as Project);
  });

  it('recusa trocar um item criado e aceito: change-frozen com o id da criação', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, false));
    const marking = changeOf(p, 'marking', 'N1');
    p = decided(p, base, { level: 'change', id: marking.id }, 'accepted');

    const { result } = revise(base, p, [], (x) => renameMarking(x, 'N1', 'Outro'));
    const error = errorOf(result);

    expect(error.code).toBe('change-frozen');
    expect(error.changeIds).toEqual([marking.id]);
  });

  it('o lote devolve o valor ao from: a mudança é retirada', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M1', 'Portal'));
    const old = changeOf(p, 'marking', 'M1', 'name');

    const { result } = revise(base, p, [], (x) => renameMarking(x, 'M1', 'Porta'));
    const r = okOf(result);

    expect(r.proposal.changes).toEqual([]);
    expect(r.summary).toEqual({ changed: [], added: [], dropped: [old.id] });
    expect(r.proposal.revisions?.[0]?.dropped).toEqual([
      { change: old, state: null, notes: [] },
    ]);
  });

  it('criação nova num grupo de irmãs com position: aplicar dá o mesmo do lote', () => {
    let base: Project = { ...emptyProject(), containers: [CONTAINER] };
    ['A', 'B', 'K'].forEach((id, i) => {
      base = createMarking(base, {
        id,
        containerId: 'C',
        rect: { x: i * 30, y: 0, width: 20, height: 20 },
      });
    });
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'C',
      rect: { x: 0, y: 50, width: 20, height: 20 },
    });
    after = reorderMarking(reorderMarking(after, 'N1', 0), 'K', 1);
    const p = propose(base, after);
    expect(p.changes.some((c) => c.field === 'position')).toBe(true);

    const { result, after: revised } = revise(base, p, [], (x) =>
      reorderMarking(
        createMarking(x, {
          id: 'N2',
          containerId: 'C',
          rect: { x: 30, y: 50, width: 20, height: 20 },
        }),
        'N2',
        1,
      ),
    );
    const r = okOf(result);

    expect(r.summary.added.length).toBeGreaterThan(0);
    expectFidelity(base, r.proposal, revised as Project);
  });

  it('âncora que precisa mudar: trocada; aceita: change-frozen', () => {
    // Caso do fuzz (semente 644, caso 327): a criação de P0 entra antes de B2; o lote remove B2 e
    // reordena B1, e a âncora de P0 passa a B3. O lugar no array faz parte do efeito da criação.
    let base: Project = { ...emptyProject(), containers: [CONTAINER] };
    const rects = {
      B0: [50, 25, 25, 25],
      B1: [75, 25, 25, 25],
      B2: [0, 50, 50, 50],
      B3: [50, 50, 50, 50],
    };
    for (const [id, [x, y, width, height]] of Object.entries(rects) as [
      string,
      number[],
    ][]) {
      base = createMarking(base, {
        id,
        containerId: 'C',
        rect: {
          x: x as number,
          y: y as number,
          width: width as number,
          height: height as number,
        },
      });
    }
    const proposed = reorderMarking(
      createMarking(base, {
        id: 'P0',
        containerId: 'C',
        rect: { x: 0, y: 75, width: 75, height: 25 },
      }),
      'P0',
      2,
    );
    const p = propose(base, proposed);
    const creation = changeOf(p, 'marking', 'P0');
    expect(creation.insertBefore).toBe('B2');
    const batch = (x: Project) => reorderMarking(removeMarking(x, 'B2'), 'B1', 0);

    const { result, after } = revise(base, p, [], batch);
    const r = okOf(result);
    const moved = changeOf(r.proposal, 'marking', 'P0');
    expect(moved).toEqual({ ...creation, insertBefore: 'B3' });
    expect(r.summary.changed).toEqual([creation.id]);
    expect(r.proposal.revisions?.[0]?.changed).toEqual({
      [creation.id]: { to: creation.to, state: null },
    });
    expectFidelity(base, r.proposal, after as Project);

    const accepted = decided(p, base, { level: 'change', id: creation.id }, 'accepted');
    const frozen = errorOf(revise(base, accepted, [], batch).result);
    expect(frozen.code).toBe('change-frozen');
    expect(frozen.changeIds).toEqual([creation.id]);
  });

  it('a numeração dos ids novos nunca reaproveita um id retirado', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Farol'));
    const first = okOf(
      revise(base, p, ['c1'], (x) => renameMarking(x, 'M1', 'Portal')).result,
    );
    expect(first.summary).toEqual({ changed: [], added: ['c2'], dropped: ['c1'] });

    const second = okOf(
      revise(base, first.proposal, ['c2'], (x) => renameMarking(x, 'M2', 'Puxador'))
        .result,
    );
    expect(second.summary.added).toEqual(['c3']);
    expect(second.proposal.revisions).toHaveLength(2);
    expect(second.proposal.revisions?.[0]).toEqual(first.proposal.revisions?.[0]);
  });
});

describe('prepareRevision e reviseProposal: recusas', () => {
  it('drop de um id que não existe: change-not-found', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Farol'));
    const prep = prepareRevision(base, p, ['c99']);
    expect(prep.ok).toBe(false);
    if (prep.ok) return;
    expect(prep.error.code).toBe('change-not-found');
    expect(prep.error.changeIds).toEqual(['c99']);
    expect(errorOf(reviseProposal(base, p, { drop: ['c99'], at: AT2 })).code).toBe(
      'change-not-found',
    );
  });

  it('revisão sem efeito: no-changes (sem lote e com lote que não muda nada)', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Farol'));
    expect(errorOf(reviseProposal(base, p, { at: AT2 })).code).toBe('no-changes');
    expect(errorOf(reviseProposal(base, p, { drop: [], at: AT2 })).code).toBe(
      'no-changes',
    );

    const { result } = revise(base, p, [], (x) => x);
    expect(errorOf(result).code).toBe('no-changes');
    const rewrite = revise(base, p, [], (x) => renameMarking(x, 'M4', 'Farol'));
    expect(errorOf(rewrite.result).code).toBe('no-changes');
  });

  it('proposta com applied (proposal-applied) ou que não está aberta (not-open)', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Farol'));
    const applied: Proposal = {
      ...p,
      decisions: { c1: { state: 'accepted', at: AT } },
      applied: { c1: { at: AT } },
    };
    const a = errorOf(reviseProposal(base, applied, { at: AT2 }));
    expect(a.code).toBe('proposal-applied');
    expect(a.changeIds).toEqual(['c1']);

    const closed = errorOf(
      reviseProposal(base, { ...p, status: 'withdrawn' }, { at: AT2 }),
    );
    expect(closed.code).toBe('not-open');
    // not-open vem antes de proposal-applied.
    expect(
      errorOf(reviseProposal(base, { ...applied, status: 'applied' }, { at: AT2 })).code,
    ).toBe('not-open');
  });

  it('drop de uma mudança aceita: change-frozen', () => {
    const base = sampleProject();
    let p = propose(base, renameMarking(base, 'M4', 'Farol'));
    p = decided(p, base, { level: 'change', id: 'c1' }, 'accepted');
    const prep = prepareRevision(base, p, ['c1']);
    expect(prep.ok).toBe(false);
    if (prep.ok) return;
    expect(prep.error.code).toBe('change-frozen');
    expect(prep.error.changeIds).toEqual(['c1']);
  });

  it('drop da criação aceita pelo fechamento (a aceita depende dela): change-frozen', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    const annotation = changeOf(p, 'annotation', 'A9');
    // Aceitar a anotação aceita a criação; retirar a criação retira a anotação aceita.
    p = decided(p, base, { level: 'change', id: annotation.id }, 'accepted');
    const error = errorOf(
      reviseProposal(base, p, { drop: [changeOf(p, 'marking', 'N1').id], at: AT2 }),
    );
    expect(error.code).toBe('change-frozen');
    expect(error.changeIds).toContain(annotation.id);
  });

  it('drop de uma remoção da cascata retira a remoção de quem a causa', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M1'));
    const a3 = changeOf(p, 'annotation', 'A3');
    const m2 = changeOf(p, 'marking', 'M2');
    const m1 = changeOf(p, 'marking', 'M1');

    const { prep, result } = revise(base, p, [a3.id]);
    expect(prep.ok && prep.dropped).toEqual(
      p.changes.filter((c) => [a3.id, m2.id, m1.id].includes(c.id)).map((c) => c.id),
    );
    const r = okOf(result);
    expect(r.summary.dropped).toEqual(prep.ok ? prep.dropped : []);
    // M3 continua sendo removida (filha de M2, que agora fica): a remoção dela não depende da causa.
    expect(r.proposal.changes.some((c) => c.entityId === 'M3')).toBe(true);
    expect(r.proposal.changes.some((c) => c.entityId === 'M1')).toBe(false);
  });

  it('proposta que não aplica mais: proposal-not-applicable com os ids', () => {
    const base = sampleProject();
    const created = propose(base, withNewMarking(base, false));
    const exists = withNewMarking(base, false);
    const e = errorOf(reviseProposal(exists, created, { at: AT2 }));
    expect(e.code).toBe('proposal-not-applicable');
    expect(e.changeIds).toEqual([changeOf(created, 'marking', 'N1').id]);
    expect(e.problems?.map((i) => i.code)).toContain('entity-exists');

    const renamed = propose(base, renameMarking(base, 'M4', 'Farol'));
    const gone = errorOf(reviseProposal(removeMarking(base, 'M4'), renamed, { at: AT2 }));
    expect(gone.code).toBe('proposal-not-applicable');
    expect(gone.changeIds).toEqual(['c1']);
    expect(gone.problems?.map((i) => i.code)).toContain('entity-missing');
  });
});

describe('proposta revisada: formato', () => {
  it('lê de volta: parseProposal da serialização, formatVersion 5', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    p = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N1').id },
      'rejected',
    );
    const { result } = revise(base, p, [changeOf(p, 'annotation', 'A9').id], (x) =>
      renameMarking(x, 'N1', 'Novo'),
    );
    const r = okOf(result);

    const parsed = parseProposal(JSON.parse(serializeProposal(r.proposal)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.proposal.formatVersion).toBe(5);
    expect(parsed.proposal.revisions).toEqual(r.proposal.revisions);
    expect(parsed.proposal.revision).toBe(p.revision);
  });
});
