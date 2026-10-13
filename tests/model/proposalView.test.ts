import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  addAnnotation,
  addImage,
  changeImageFile,
  changeLayerId,
  changeTarget,
  changeType,
  dominantChangeType,
  filterChanges,
  hasActiveFilters,
  leftBehind,
  levelType,
  moveImage,
  needsExitReminder,
  proposalListStatus,
  removeAnnotation,
  removeMarking,
  renameMarking,
  replaceImage,
  reviewKey,
  reviewProgress,
  reviewTree,
  setMarkingRect,
  stepChange,
  undecidedChanges,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

function scenario() {
  const base = sampleProject();
  let after = renameMarking(base, 'M1', 'Porta dianteira');
  after = setMarkingRect(after, 'M4', { x: 10, y: 10, width: 100, height: 100 });
  after = addAnnotation(after, {
    id: 'A9',
    markingId: 'M4',
    layerId: 'L1',
    name: 'Novo',
  });
  after = removeAnnotation(after, 'A4');
  after = moveImage(after, 'I2', 5000, 5000);
  after = addImage(after, {
    id: 'I3',
    file: 'images/nova.webp',
    width: 800,
    height: 600,
  });
  return { base, proposal: propose(base, after) };
}

describe('tipo e alvo das mudanças', () => {
  it('classifica criada, removida, movida, alterada e imagem trocada', () => {
    const { base, proposal } = scenario();
    expect(changeType(changeOf(proposal, 'annotation', 'A9'))).toBe('created');
    expect(changeType(changeOf(proposal, 'annotation', 'A4'))).toBe('removed');
    expect(changeType(changeOf(proposal, 'marking', 'M4', 'rect'))).toBe('moved');
    expect(changeType(changeOf(proposal, 'image', 'I2', 'placement'))).toBe('moved');
    expect(changeType(changeOf(proposal, 'marking', 'M1', 'name'))).toBe('changed');

    const replaced = propose(
      base,
      replaceImage(base, 'I2', { file: 'images/outra.jpg', width: 1000, height: 1000 }),
    );
    expect(changeType(changeOf(replaced, 'image', 'I2', 'file'))).toBe('replaced');
    expect(changeImageFile(changeOf(replaced, 'image', 'I2', 'file'))).toBe(
      'images/outra.jpg',
    );
    expect(changeImageFile(changeOf(proposal, 'image', 'I3'))).toBe('images/nova.webp');
    expect(changeImageFile(changeOf(proposal, 'marking', 'M1', 'name'))).toBeNull();
  });

  it('o tipo dominante: criada > removida > imagem trocada > alterada; movida só sozinha', () => {
    expect(dominantChangeType(['moved', 'changed'])).toBe('changed');
    expect(dominantChangeType(['moved'])).toBe('moved');
    expect(dominantChangeType(['moved', 'changed', 'removed'])).toBe('removed');
    expect(dominantChangeType(['changed', 'replaced'])).toBe('replaced');
    expect(dominantChangeType(['removed', 'created', 'changed'])).toBe('created');
    expect(dominantChangeType([])).toBeNull();
  });

  it('o alvo é o item, a imagem ou o grupo Projeto, e a chave junta nível e id', () => {
    const { proposal } = scenario();
    expect(changeTarget(changeOf(proposal, 'marking', 'M1', 'name'))).toEqual({
      level: 'item',
      id: 'M1',
    });
    expect(changeTarget(changeOf(proposal, 'image', 'I2', 'placement'))).toEqual({
      level: 'image',
      id: 'I2',
    });
    expect(reviewKey({ level: 'item', id: 'M1' })).toBe('item:M1');
    expect(reviewKey({ level: 'project', id: null })).toBe('project:');
  });

  it('a camada de uma mudança vem da anotação (nova, atual ou removida)', () => {
    const { base, proposal } = scenario();
    expect(changeLayerId(changeOf(proposal, 'annotation', 'A9'), base)).toBe('L1');
    expect(changeLayerId(changeOf(proposal, 'annotation', 'A4'), base)).toBe('L2');
    expect(changeLayerId(changeOf(proposal, 'marking', 'M1', 'name'), base)).toBeNull();
  });
});

describe('filtros', () => {
  const noConflicts = new Set<string>();

  it('sem filtros devolve todas, na ordem da proposta', () => {
    const { base, proposal } = scenario();
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(filterChanges(proposal, base, NO_FILTERS, noConflicts)).toEqual(
      proposal.changes,
    );
  });

  it('filtra por tipo, imagem, camada, decisão e só conflitos', () => {
    const { base, proposal } = scenario();
    const ids = (filters: Partial<typeof NO_FILTERS>, conflicts = noConflicts) =>
      filterChanges(proposal, base, { ...NO_FILTERS, ...filters }, conflicts).map(
        (c) => c.id,
      );
    const created = changeOf(proposal, 'annotation', 'A9').id;
    const removed = changeOf(proposal, 'annotation', 'A4').id;
    const moved = changeOf(proposal, 'marking', 'M4', 'rect').id;

    expect(ids({ types: ['created'] })).toContain(created);
    expect(ids({ types: ['created'] })).not.toContain(removed);
    expect(ids({ types: ['removed', 'moved'] })).toEqual(
      expect.arrayContaining([removed, moved]),
    );
    expect(
      filterChanges(proposal, base, { ...NO_FILTERS, imageId: 'I2' }, noConflicts).every(
        (c) => c.imageId === 'I2',
      ),
    ).toBe(true);
    expect(ids({ layerId: 'L2' })).toEqual([removed]);
    expect(ids({ onlyConflicts: true }, new Set([moved]))).toEqual([moved]);

    const half = decided(proposal, base, { level: 'change', id: created }, 'accepted');
    expect(
      filterChanges(half, base, { ...NO_FILTERS, decision: 'accepted' }, noConflicts).map(
        (c) => c.id,
      ),
    ).toContain(created);
    expect(
      filterChanges(
        half,
        base,
        { ...NO_FILTERS, decision: 'undecided' },
        noConflicts,
      ).map((c) => c.id),
    ).not.toContain(created);
    expect(
      filterChanges(half, base, { ...NO_FILTERS, decision: 'rejected' }, noConflicts),
    ).toEqual([]);
  });
});

describe('pendências, o que ficou para trás e navegação', () => {
  it('lista o que ficou sem decisão, aceito sem aplicar e rejeitado', () => {
    const { base, proposal } = scenario();
    const accepted = changeOf(proposal, 'marking', 'M1', 'name').id;
    const rejected = changeOf(proposal, 'marking', 'M4', 'rect').id;
    let p = decided(
      proposal,
      base as Project,
      { level: 'change', id: accepted },
      'accepted',
    );
    p = decided(p, base, { level: 'change', id: rejected }, 'rejected');
    const behind = leftBehind(p);
    expect(behind.acceptedPending).toEqual([accepted]);
    expect(behind.rejected).toEqual([rejected]);
    expect(behind.undecided).toEqual(undecidedChanges(p));
    expect(behind.undecided).not.toContain(accepted);
    expect(behind.undecided.length + 2).toBe(p.changes.length);
  });

  it('a mudança seguinte e a anterior dão a volta', () => {
    const order = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ]);
    const ids = ['b', 'd'];
    expect(stepChange(ids, order, null, 1)).toBe('b');
    expect(stepChange(ids, order, null, -1)).toBe('d');
    expect(stepChange(ids, order, 'b', 1)).toBe('d');
    expect(stepChange(ids, order, 'd', 1)).toBe('b');
    expect(stepChange(ids, order, 'b', -1)).toBe('d');
    expect(stepChange(ids, order, 'c', 1)).toBe('d');
    expect(stepChange(ids, order, 'c', -1)).toBe('b');
    expect(stepChange([], order, 'a', 1)).toBeNull();
  });
});

// Fase 8.2 (P10): a regra de negócio da revisão que morava no store e na interface.
describe('tipo do nível, status da lista e lembrete ao sair (fase 8.2)', () => {
  const changesOf = (p: Proposal, project: Project, target: ReviewTarget) => {
    const ids = new Set(reviewTree(p, project).changeIdsOf(target));
    return p.changes.filter((c) => ids.has(c.id));
  };

  it('levelType: item e imagem pelo tipo da própria entidade; "movida" só sozinha; mudança interna = alterada; proposta e projeto pelo dominante', () => {
    const { base, proposal } = scenario();
    const of = (target: ReviewTarget) =>
      levelType(target.level, target.id, changesOf(proposal, base, target));
    // M1: só o nome muda.
    expect(of({ level: 'item', id: 'M1' })).toBe('changed');
    // M4: a posição muda, mas uma anotação entra e outra sai → alterada, não movida.
    expect(of({ level: 'item', id: 'M4' })).toBe('changed');
    // I2: a imagem move, mas um item dela muda → alterada.
    expect(of({ level: 'image', id: 'I2' })).toBe('changed');
    expect(of({ level: 'image', id: 'I3' })).toBe('created');
    expect(of({ level: 'proposal', id: null })).toBe('created');
    expect(levelType('project', null, [])).toBeNull();

    // Só a posição muda: movida (item e imagem).
    const onlyMoved = propose(
      base,
      moveImage(
        setMarkingRect(base, 'M4', { x: 1, y: 1, width: 10, height: 10 }),
        'I1',
        9,
        9,
      ),
    );
    expect(
      levelType('item', 'M4', changesOf(onlyMoved, base, { level: 'item', id: 'M4' })),
    ).toBe('moved');
    expect(
      levelType('image', 'I1', changesOf(onlyMoved, base, { level: 'image', id: 'I1' })),
    ).toBe('moved');
    // Removida e imagem trocada ganham de alterada.
    const removed = propose(base, removeMarking(base, 'M2'));
    expect(
      levelType('item', 'M2', changesOf(removed, base, { level: 'item', id: 'M2' })),
    ).toBe('removed');
    const swapped = propose(
      base,
      renameMarking(replaceImage(base, 'I1', 'images/outra.webp', 4000, 3000), 'M1', 'X'),
    );
    expect(
      levelType('image', 'I1', changesOf(swapped, base, { level: 'image', id: 'I1' })),
    ).toBe('replaced');
  });

  it('proposalListStatus: Nova e Revisar primário só na fresh; Em revisão depois de decidir ou anotar; fechadas só se veem', () => {
    const { base, proposal } = scenario();
    const progress = reviewProgress(proposal);
    expect(proposalListStatus(proposal, progress, true)).toEqual({
      flag: 'new',
      action: 'review',
      primary: true,
    });
    // Aberta, já vista, sem decisão nem nota: sem selo, Revisar comum.
    expect(proposalListStatus(proposal, progress, false)).toEqual({
      flag: null,
      action: 'review',
      primary: false,
    });
    const started = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    expect(proposalListStatus(started, reviewProgress(started), false)).toEqual({
      flag: 'inReview',
      action: 'continue',
      primary: false,
    });
    const noted: Proposal = {
      ...proposal,
      notes: [{ id: 'n1', target: { level: 'proposal', id: null }, text: 'x', at: AT }],
    };
    expect(proposalListStatus(noted, progress, false).flag).toBe('inReview');
    for (const [status, flag] of [
      ['superseded', 'superseded'],
      ['applied', 'applied'],
      ['withdrawn', 'withdrawn'],
    ] as const) {
      // O derivado nunca marca uma fechada como `fresh`; a regra não depende disso.
      expect(proposalListStatus({ ...proposal, status }, progress, true)).toEqual({
        flag,
        action: 'view',
        primary: false,
      });
    }
  });

  it('needsExitReminder: só com aceitas aguardando aplicação numa proposta aplicável', () => {
    expect(needsExitReminder('open', 0)).toBe(false);
    expect(needsExitReminder('open', 3)).toBe(true);
    expect(needsExitReminder('superseded', 1)).toBe(true);
    expect(needsExitReminder('applied', 2)).toBe(false);
    expect(needsExitReminder('withdrawn', 2)).toBe(false);
    expect(needsExitReminder(undefined, 2)).toBe(false);
  });
});
