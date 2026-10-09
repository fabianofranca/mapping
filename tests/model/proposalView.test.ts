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
  moveImage,
  removeAnnotation,
  renameMarking,
  replaceImage,
  reviewKey,
  setMarkingRect,
  stepChange,
  undecidedChanges,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { changeOf, decided, propose } from './proposalFixtures';

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
