import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addImage,
  addNote,
  addTypedAnnotation,
  changeStatus,
  changeStatuses,
  createMarking,
  decide,
  editNote,
  moveImage,
  moveMarking,
  notesOf,
  removeImage,
  removeMarking,
  removeNote,
  renameMarking,
  replaceImage,
  reviewProgress,
  reviewTree,
  setAnnotationParent,
  setFieldValue,
  setImageLocked,
  setMarkingLocked,
  setMarkingRect,
  summarizeDecisions,
  supersedeProposal,
  withdrawProposal,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, LATER, changeOf, decided, propose, stateOf } from './proposalFixtures';
import { cadastroProject, layerOf } from './specFixtures';

/**
 * Sobre o `sampleProject`: a imagem I3 nova com as marcações N1 › N2 (criadas), a
 * anotação B1 em N2, B2 (L1) e B3 (L2, vinculada a B2) em N1, e o nome novo de M4.
 */
function creations(): { base: Project; after: Project; p: Proposal } {
  const base = sampleProject();
  let after = addImage(base, {
    id: 'I3',
    file: 'images/nova.png',
    width: 1000,
    height: 1000,
  });
  after = createMarking(after, {
    id: 'N1',
    imageId: 'I3',
    rect: { x: 100, y: 100, width: 500, height: 500 },
  });
  after = createMarking(after, {
    id: 'N2',
    imageId: 'I3',
    rect: { x: 200, y: 200, width: 100, height: 100 },
  });
  after = addAnnotation(after, { id: 'B1', markingId: 'N2', layerId: 'L1' });
  after = addAnnotation(after, { id: 'B2', markingId: 'N1', layerId: 'L1' });
  after = addAnnotation(after, { id: 'B3', markingId: 'N1', layerId: 'L2' });
  after = setAnnotationParent(after, 'B3', 'B2');
  after = renameMarking(after, 'M4', 'Farol');
  return { base, after, p: propose(base, after) };
}

describe('níveis da revisão', () => {
  it('Projeto, imagens e itens aninhados pela hierarquia, com as anotações no item', () => {
    const { base, p } = creations();
    const tree = reviewTree(p, base);
    const shape = (n: (typeof tree)['root']): unknown => ({
      [`${n.level}:${n.id ?? ''}`]: [
        ...n.changeIds.map((id) => {
          const c = p.changes.find((x) => x.id === id);
          return `${c?.entity}:${c?.entityId}`;
        }),
        ...n.children.map(shape),
      ],
    });
    expect(shape(tree.root)).toEqual({
      'proposal:': [
        {
          'image:I3': [
            'image:I3',
            {
              'item:N1': [
                'marking:N1',
                'annotation:B2',
                'annotation:B3',
                { 'item:N2': ['marking:N2', 'annotation:B1'] },
              ],
            },
          ],
        },
        {
          'image:I2': [{ 'item:M4': ['marking:M4'] }],
        },
      ],
    });
    expect(tree.changeIdsOf({ level: 'item', id: 'N1' })).toHaveLength(5);
    expect(tree.changeIdsOf({ level: 'image', id: 'I3' })).toHaveLength(6);
    expect(tree.changeIdsOf({ level: 'proposal', id: null })).toHaveLength(7);
    expect(tree.changeIdsOf({ level: 'project', id: null })).toEqual([]);
    expect(tree.changeIdsOf({ level: 'item', id: 'nada' })).toEqual([]);
  });

  it('decidir um nível vale para tudo abaixo; o de cima mostra "parcial" com as contagens', () => {
    const { base, p } = creations();
    let next = decided(p, base, { level: 'image', id: 'I3' }, 'accepted');
    const tree = reviewTree(next, base);
    const of = (level: 'proposal' | 'image' | 'item', id: string | null) =>
      summarizeDecisions(next, tree.changeIdsOf({ level, id }));
    expect(of('image', 'I3')).toMatchObject({ state: 'accepted', accepted: 6 });
    expect(of('image', 'I2').state).toBe('undecided');
    expect(of('proposal', null)).toMatchObject({
      state: 'partial',
      accepted: 6,
      rejected: 0,
      undecided: 1,
    });
    // Um nível menor contraria o maior.
    const b1 = changeOf(next, 'annotation', 'B1').id;
    next = decided(next, base, { level: 'change', id: b1 }, 'rejected');
    expect(
      summarizeDecisions(next, tree.changeIdsOf({ level: 'image', id: 'I3' })),
    ).toMatchObject({ state: 'partial', accepted: 5, rejected: 1, undecided: 0 });
    next = decided(next, base, { level: 'proposal', id: null }, 'rejected');
    expect(
      summarizeDecisions(next, tree.changeIdsOf({ level: 'proposal', id: null })).state,
    ).toBe('rejected');
  });
});

describe('dependências', () => {
  it('1. aceitar uma mudança dentro de um item criado aceita a criação dele e dos ancestrais', () => {
    const { base, p } = creations();
    const b1 = changeOf(p, 'annotation', 'B1').id;
    const result = decide(
      p,
      reviewTree(p, base),
      { level: 'change', id: b1 },
      'accepted',
      AT,
    );
    if (!result.ok) throw new Error(result.reason);
    const accepted = (entity: 'image' | 'marking', id: string) =>
      result.decisions[changeOf(p, entity, id).id]?.state;
    expect(accepted('marking', 'N2')).toBe('accepted');
    expect(accepted('marking', 'N1')).toBe('accepted');
    expect(accepted('image', 'I3')).toBe('accepted');
    expect(result.changed).toEqual([b1]);
    expect(result.cascaded).toHaveLength(3);
    // O que não é requisito continua sem decisão.
    expect(result.decisions[changeOf(p, 'annotation', 'B2').id]).toBeUndefined();
  });

  it('2. rejeitar a criação de um item rejeita o que depende dele (filhas, anotações, vinculadas)', () => {
    const { base, p } = creations();
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    const n1 = changeOf(p, 'marking', 'N1').id;
    const result = decide(
      next,
      reviewTree(next, base),
      { level: 'change', id: n1 },
      'rejected',
      AT,
    );
    if (!result.ok) throw new Error(result.reason);
    next = { ...next, decisions: result.decisions };
    for (const [entity, id] of [
      ['marking', 'N1'],
      ['marking', 'N2'],
      ['annotation', 'B1'],
      ['annotation', 'B2'],
      ['annotation', 'B3'],
    ] as const) {
      expect(stateOf(next, changeOf(p, entity, id).id), id).toBe('rejected');
    }
    // A imagem (requisito, não dependente) continua aceita.
    expect(stateOf(next, changeOf(p, 'image', 'I3').id)).toBe('accepted');
    expect(result.cascaded).toHaveLength(4);
  });

  it('2. … inclusive as referências que apontam para ele', () => {
    const base = cadastroProject();
    let after = createMarking(base, {
      id: 'MX',
      imageId: 'I1',
      rect: { x: 100, y: 1500, width: 300, height: 100 },
    });
    after = addAnnotation(after, {
      id: 'AX',
      markingId: 'MX',
      layerId: 'LM',
      entries: [{ id: 'EX', key: 'cpf', value: 'string' }],
    });
    after = setFieldValue(after, 'AIN', 'dado', { annotationId: 'AX', entryId: 'EX' });
    const p = propose(base, after);
    const ref = changeOf(p, 'annotation', 'AIN', 'values.dado').id;
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'MX').id },
      'rejected',
    );
    expect(stateOf(next, changeOf(p, 'annotation', 'AX').id)).toBe('rejected');
    expect(stateOf(next, ref)).toBe('rejected');
    // E aceitar a referência traz de volta a anotação citada e a marcação dela.
    const back = decided(next, base, { level: 'change', id: ref }, 'accepted');
    expect(stateOf(back, changeOf(p, 'annotation', 'AX').id)).toBe('accepted');
    expect(stateOf(back, changeOf(p, 'marking', 'MX').id)).toBe('accepted');
  });

  it('3. aceitar a remoção de um item aceita a remoção do que a cascata remove (e conta quantos)', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M1'));
    const m1 = changeOf(p, 'marking', 'M1').id;
    const result = decide(
      p,
      reviewTree(p, base),
      { level: 'change', id: m1 },
      'accepted',
      AT,
    );
    if (!result.ok) throw new Error(result.reason);
    // M2 e M3 (descendentes) e A1, A2 e A3 (anotações de M1 e M2).
    expect(result.cascaded).toHaveLength(5);
    expect(Object.values(result.decisions).every((d) => d.state === 'accepted')).toBe(
      true,
    );
  });

  it('4. rejeitar a remoção de algo da cascata rejeita a remoção de quem a causa', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M1'));
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    next = decided(
      next,
      base,
      { level: 'change', id: changeOf(p, 'annotation', 'A3').id },
      'rejected',
    );
    expect(stateOf(next, changeOf(p, 'marking', 'M2').id)).toBe('rejected');
    expect(stateOf(next, changeOf(p, 'marking', 'M1').id)).toBe('rejected');
    // As outras remoções da cascata continuam aceitas.
    expect(stateOf(next, changeOf(p, 'marking', 'M3').id)).toBe('accepted');
    expect(stateOf(next, changeOf(p, 'annotation', 'A1').id)).toBe('accepted');
  });

  it('limpar a decisão de uma criação tira a aceitação do que dependia dela', () => {
    const { base, p } = creations();
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    next = decided(
      next,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N2').id },
      null,
    );
    expect(stateOf(next, changeOf(p, 'marking', 'N2').id)).toBeNull();
    expect(stateOf(next, changeOf(p, 'annotation', 'B1').id)).toBeNull();
    expect(stateOf(next, changeOf(p, 'marking', 'N1').id)).toBe('accepted');
  });

  it('mudanças aplicadas não mudam e só uma proposta aberta aceita decisões', () => {
    const { base, p } = creations();
    const i3 = changeOf(p, 'image', 'I3').id;
    const applied: Proposal = {
      ...p,
      decisions: { [i3]: { state: 'accepted', at: AT } },
      applied: { [i3]: { at: AT } },
    };
    const result = decide(
      applied,
      reviewTree(applied, base),
      { level: 'image', id: 'I3' },
      'rejected',
      LATER,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.decisions[i3]).toEqual({ state: 'accepted', at: AT });
    const tree = reviewTree(p, base);
    expect(
      decide(supersedeProposal(p), tree, { level: 'proposal', id: null }, 'accepted', AT),
    ).toEqual({
      ok: false,
      reason: 'not-open',
    });
    expect(decide(p, tree, { level: 'item', id: 'nada' }, 'accepted', AT)).toEqual({
      ok: false,
      reason: 'unknown-target',
    });
  });
});

describe('conflitos', () => {
  it('a mudança cujo from não bate com o atual vira conflito, com o valor atual', () => {
    const base = sampleProject();
    const p = propose(
      base,
      renameMarking(moveMarking(base, 'M4', 10, 10), 'M1', 'Porta dianteira'),
    );
    // Alteração externa depois da proposta: M4 foi movida à mão.
    const edited = setMarkingRect(base, 'M4', { x: 50, y: 50, width: 100, height: 100 });
    const rect = changeOf(p, 'marking', 'M4', 'rect');
    expect(changeStatus(p, rect, edited)).toMatchObject({
      conflict: true,
      current: { x: 50, y: 50, width: 100, height: 100 },
    });
    expect(changeStatus(p, changeOf(p, 'marking', 'M1', 'name'), edited).conflict).toBe(
      false,
    );
    expect(changeStatus(p, rect, base).conflict).toBe(false);
  });

  it('criação de id existente, remoção de item editado ou sumido e alteração de item sumido', () => {
    const base = sampleProject();
    const created = propose(
      base,
      createMarking(base, {
        id: 'M9',
        imageId: 'I2',
        rect: { x: 300, y: 300, width: 50, height: 50 },
      }),
    );
    const taken = createMarking(base, {
      id: 'M9',
      imageId: 'I2',
      rect: { x: 600, y: 600, width: 50, height: 50 },
    });
    expect(changeStatus(created, created.changes[0]!, taken).conflict).toBe(true);

    const removed = propose(base, removeMarking(base, 'M4'));
    const removal = changeOf(removed, 'marking', 'M4');
    expect(
      changeStatus(removed, removal, renameMarking(base, 'M4', 'Outro')).conflict,
    ).toBe(true);
    // Confirmar a posição ("a revisar") não é mudança: não vira conflito.
    expect(changeStatus(removed, removal, base).conflict).toBe(false);
    expect(changeStatus(removed, removal, removeImage(base, 'I2'))).toMatchObject({
      conflict: true,
      current: undefined,
    });

    const renamed = propose(base, renameMarking(base, 'M4', 'Farol'));
    expect(
      changeStatus(renamed, renamed.changes[0]!, removeImage(base, 'I2')).conflict,
    ).toBe(true);
  });

  it('alterar algo criado pela mesma proposta não é conflito, e as decisões das outras ficam', () => {
    const { base, p } = creations();
    const accepted = decided(p, base, { level: 'image', id: 'I2' }, 'accepted');
    const statuses = changeStatuses(accepted, renameMarking(base, 'M4', 'Outro'));
    const m4 = changeOf(p, 'marking', 'M4', 'name').id;
    expect(statuses.get(m4)).toMatchObject({
      conflict: true,
      decision: 'accepted',
      current: 'Outro',
    });
    expect([...statuses.values()].filter((s) => s.conflict)).toHaveLength(1);
  });
});

describe('aviso de item trancado', () => {
  it('geometria e remoção de marcação trancada (própria ou pelo ancestral)', () => {
    const base = setMarkingLocked(sampleProject(), 'M1', true);
    let after = setMarkingLocked(base, 'M1', false);
    after = moveMarking(after, 'M1', 10, 10);
    after = renameMarking(after, 'M2', 'Puxador');
    const p = propose(base, after);
    expect(changeStatus(p, changeOf(p, 'marking', 'M1', 'rect'), base).locked).toBe(true);
    // A filha tem a geometria travada pela trava do pai.
    expect(changeStatus(p, changeOf(p, 'marking', 'M2', 'rect'), base).locked).toBe(true);
    expect(changeStatus(p, changeOf(p, 'marking', 'M2', 'name'), base).locked).toBe(
      false,
    );
    expect(changeStatus(p, changeOf(p, 'marking', 'M1', 'locked'), base).locked).toBe(
      false,
    );

    const removal = propose(
      base,
      removeMarking(setMarkingLocked(base, 'M1', false), 'M1'),
    );
    expect(changeStatus(removal, changeOf(removal, 'marking', 'M1'), base).locked).toBe(
      true,
    );
    expect(changeStatus(removal, changeOf(removal, 'marking', 'M2'), base).locked).toBe(
      false,
    );
  });

  it('imagem trancada: mover, remover e trocar por outro tamanho', () => {
    const base = setImageLocked(sampleProject(), 'I2', true);
    const free = setImageLocked(base, 'I2', false);
    const moved = propose(
      base,
      setImageLocked(moveImage(free, 'I2', 5000, 0), 'I2', true),
    );
    expect(
      changeStatus(moved, changeOf(moved, 'image', 'I2', 'placement'), base).locked,
    ).toBe(true);
    const replaced = propose(
      base,
      setImageLocked(
        replaceImage(free, 'I2', { file: 'images/f2.jpg', width: 2000, height: 2000 }),
        'I2',
        true,
      ),
    );
    expect(
      changeStatus(replaced, changeOf(replaced, 'image', 'I2', 'file'), base).locked,
    ).toBe(true);
    const removed = propose(base, removeImage(free, 'I2'));
    expect(changeStatus(removed, changeOf(removed, 'image', 'I2'), base).locked).toBe(
      true,
    );
    expect(changeStatus(removed, changeOf(removed, 'image', 'I2'), free).locked).toBe(
      false,
    );
  });
});

describe('progresso, notas e estado da proposta', () => {
  it('conta as aceitas aguardando aplicação e diz quando a revisão terminou', () => {
    const { base, p } = creations();
    expect(reviewProgress(p)).toMatchObject({ total: 7, undecided: 7, complete: false });
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    expect(reviewProgress(next)).toMatchObject({
      accepted: 7,
      acceptedPending: 7,
      complete: false,
    });
    next = {
      ...next,
      applied: Object.fromEntries(next.changes.map((c) => [c.id, { at: AT }])),
    };
    expect(reviewProgress(next)).toMatchObject({
      applied: 7,
      acceptedPending: 0,
      complete: true,
    });
  });

  it('notas em qualquer nível; editar com texto vazio remove', () => {
    const { p } = creations();
    let next = addNote(p, { level: 'item', id: 'N1' }, 'O nome está errado.', AT, 'n1');
    next = addNote(next, { level: 'proposal', id: null }, 'Faltou a tela 3.', AT, 'n2');
    expect(notesOf(next, { level: 'item', id: 'N1' }).map((n) => n.text)).toEqual([
      'O nome está errado.',
    ]);
    next = editNote(next, 'n1', 'O nome e a posição.', LATER);
    expect(next.notes[0]).toMatchObject({ text: 'O nome e a posição.', at: LATER });
    expect(editNote(next, 'n1', '  ', LATER).notes.map((n) => n.id)).toEqual(['n2']);
    expect(removeNote(next, 'n2').notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('retirar e substituir só valem para a proposta aberta', () => {
    const { p } = creations();
    expect(withdrawProposal(p).status).toBe('withdrawn');
    expect(supersedeProposal(p).status).toBe('superseded');
    expect(withdrawProposal(supersedeProposal(p)).status).toBe('superseded');
  });

  it('anotação tipada criada numa marcação nova depende das duas', () => {
    const base = cadastroProject();
    let after = createMarking(base, {
      id: 'MB',
      imageId: 'I1',
      rect: { x: 100, y: 850, width: 800, height: 100 },
    });
    after = addTypedAnnotation(after, {
      id: 'AB2',
      markingId: 'MB',
      layerId: layerOf(after, 'sdui', 'componentes'),
      type: { specId: 'sdui', typeId: 'button' },
    });
    after = addTypedAnnotation(after, {
      id: 'AOC2',
      markingId: 'MB',
      layerId: layerOf(after, 'sdui', 'eventos'),
      type: { specId: 'sdui', typeId: 'onClick' },
      parentAnnotationId: 'AB2',
    });
    const p = propose(base, after);
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'annotation', 'AOC2').id },
      'accepted',
    );
    expect(stateOf(next, changeOf(p, 'annotation', 'AB2').id)).toBe('accepted');
    expect(stateOf(next, changeOf(p, 'marking', 'MB').id)).toBe('accepted');
  });
});
