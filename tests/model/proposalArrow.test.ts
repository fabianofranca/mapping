import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  applyAccepted,
  changeStatus,
  compareProposals,
  createArrow,
  createMarking,
  levelType,
  moveMarking,
  parseProposal,
  previewProject,
  removeArrow,
  removeMarking,
  requiredChanges,
  reviewTree,
  serializeProposal,
  setArrowLocked,
  setArrowName,
  setArrowRoute,
  setArrowStyle,
  validateAccepted,
  validateProject,
  type Change,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose, stateOf } from './proposalFixtures';

// Mudanças `create-arrow` e `delete-arrow` (ME4, formatVersion 3): a seta é um item da revisão
// como a marcação (`markingId` = id dela, `imageId` = container da marcação de origem); nenhum
// campo de uma seta que já existe é proposto, e a rota (`points`) nunca vem de proposta.

/** `sampleProject` (I1: M1 › M2 › M3; I2: M4) com a seta R1 de M1 para M4 e a R2 de M2 para M3. */
function withArrows(): Project {
  let p = createArrow(sampleProject(), {
    id: 'R1',
    from: 'M1',
    to: 'M4',
    style: 'elbow',
    name: 'abre',
  });
  p = createArrow(p, { id: 'R2', from: 'M2', to: 'M3' });
  return p;
}

const changesOf = (p: Proposal, entity: Change['entity']) =>
  p.changes.filter((c) => c.entity === entity);

describe('create-arrow e delete-arrow: o cálculo das mudanças', () => {
  it('uma seta criada é uma mudança, sob o container da marcação de origem', () => {
    const base = sampleProject();
    const after = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
      name: 'Evento',
    });
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entity, c.entityId, c.kind])).toEqual([
      ['arrow', 'R1', 'create'],
      ['arrow', 'R2', 'create'],
      ['annotation', 'AR1', 'create'],
    ]);
    expect(changeOf(p, 'arrow', 'R1')).toMatchObject({
      kind: 'create',
      field: null,
      from: null,
      imageId: 'I1',
      markingId: 'R1',
      to: {
        id: 'R1',
        from: 'M1',
        to: 'M4',
        fromSide: null,
        toSide: null,
        style: 'elbow',
        name: 'abre',
        locked: false,
      },
    });
    // A anotação da seta usa a mudança de anotação de sempre, sob o mesmo container.
    expect(changeOf(p, 'annotation', 'AR1')).toMatchObject({
      imageId: 'I1',
      markingId: 'R1',
    });
  });

  it('a rota nunca vai na proposta: o valor da seta não tem `points`', () => {
    const base = sampleProject();
    const after = setArrowRoute(withArrows(), 'R2', [{ x: 1250, y: 1500 }]);
    const p = propose(base, after);
    for (const c of changesOf(p, 'arrow')) {
      expect(c.to).not.toHaveProperty('points');
    }
  });

  it('uma seta de uma marcação do canvas aparece no grupo Canvas (imageId nulo)', () => {
    const base = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 100, height: 100 },
    });
    const after = createArrow(base, { id: 'R1', from: 'K', to: 'M1' });
    expect(changeOf(propose(base, after), 'arrow', 'R1')).toMatchObject({
      imageId: null,
      markingId: 'R1',
    });
  });

  it('remover a seta é uma mudança de remoção, com o valor de antes', () => {
    const base = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
    });
    const p = propose(base, removeArrow(base, 'R1'));
    expect(p.changes.map((c) => [c.entity, c.entityId, c.kind])).toEqual([
      ['arrow', 'R1', 'remove'],
      ['annotation', 'AR1', 'remove'],
    ]);
    expect(changeOf(p, 'arrow', 'R1')).toMatchObject({
      to: null,
      imageId: 'I1',
      markingId: 'R1',
      from: { id: 'R1', from: 'M1', to: 'M4', style: 'elbow', name: 'abre' },
    });
    expect(changeOf(p, 'annotation', 'AR1')).toMatchObject({
      imageId: 'I1',
      markingId: 'R1',
    });
  });

  it('apagar a ponta leva a seta: a remoção dela aparece, sob a origem de antes', () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    expect(p.changes.map((c) => [c.entity, c.entityId, c.kind])).toEqual([
      ['marking', 'M4', 'remove'],
      ['arrow', 'R1', 'remove'],
      ['annotation', 'A4', 'remove'],
    ]);
    expect(changeOf(p, 'arrow', 'R1').imageId).toBe('I1');
  });

  it('estilo, nome, trava, pontas e rota de uma seta que já existe não viram mudança', () => {
    const base = withArrows();
    let after = setArrowStyle(base, 'R1', 'straight');
    after = setArrowName(after, 'R1', 'outro nome');
    after = setArrowLocked(after, 'R1', true);
    after = setArrowRoute(after, 'R2', [{ x: 1250, y: 1500 }]);
    expect(propose(base, after).changes).toEqual([]);
  });
});

describe('create-arrow e delete-arrow: a leitura', () => {
  const base = sampleProject();
  const created = () => propose(base, withArrows());

  it('o arquivo relê igual (grava e lê)', () => {
    const p = created();
    const parsed = parseProposal(JSON.parse(serializeProposal(p)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(parsed.proposal.changes).toEqual(p.changes);
    expect(parsed.proposal.formatVersion).toBe(3);
  });

  it('uma alteração de campo de seta é ignorada, com aviso; o resto da proposta fica', () => {
    const p = created();
    const first = changeOf(p, 'arrow', 'R1');
    const edited = {
      ...p,
      changes: [
        ...p.changes,
        {
          id: 'cx',
          kind: 'update',
          entity: 'arrow',
          entityId: 'R1',
          imageId: 'I1',
          markingId: 'R1',
          field: 'style',
          from: 'curve',
          to: 'straight',
        },
      ],
      decisions: { cx: { state: 'accepted', at: AT } },
      notes: [{ id: 'n1', target: { level: 'change', id: 'cx' }, text: 'x', at: AT }],
    };
    const parsed = parseProposal(JSON.parse(JSON.stringify(edited)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.proposal.changes.map((c) => c.id)).toEqual(p.changes.map((c) => c.id));
    expect(parsed.proposal.decisions).toEqual({});
    // A nota presa à mudança ignorada passa para a proposta.
    expect(parsed.proposal.notes[0]?.target).toEqual({ level: 'proposal', id: null });
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('seta');
    expect(first.entity).toBe('arrow');
  });

  it('o cabeçalho da seta tem de apontar para ela: markingId obrigatório e igual ao id', () => {
    const p = created();
    const json = (patch: Record<string, unknown>) =>
      parseProposal({
        ...JSON.parse(JSON.stringify(p)),
        changes: JSON.parse(JSON.stringify(p.changes)).map(
          (c: Record<string, unknown>) => (c.entityId === 'R1' ? { ...c, ...patch } : c),
        ),
      });
    expect(json({ markingId: null })).toMatchObject({ ok: false });
    expect(json({ markingId: 'R2' })).toMatchObject({ ok: false });
    expect(json({})).toMatchObject({ ok: true });
  });

  it('o valor da seta é conferido: estilo ou ponta fora do formato', () => {
    const p = created();
    const patchTo = (to: Record<string, unknown>) =>
      parseProposal({
        ...JSON.parse(JSON.stringify(p)),
        changes: JSON.parse(JSON.stringify(p.changes)).map(
          (c: Record<string, unknown>) =>
            c.entityId === 'R1' ? { ...c, to: { ...(c.to as object), ...to } } : c,
        ),
      });
    expect(patchTo({ style: 'zigzag' })).toMatchObject({ ok: false });
    expect(patchTo({ from: '' })).toMatchObject({ ok: false });
    expect(patchTo({ fromSide: 'middle' })).toMatchObject({ ok: false });
    // Um `points` que venha escrito à mão não invalida a proposta (é ignorado ao aplicar).
    expect(patchTo({ points: [{ x: 1, y: 2 }] })).toMatchObject({ ok: true });
  });
});

describe('create-arrow e delete-arrow: a árvore da revisão', () => {
  it('a seta fica sob a marcação de origem quando ela também muda; senão sob o container', () => {
    const base = sampleProject();
    // N1 (nova, em I1) com uma seta de N1 para M4; R2 sai de M2 (sem mudança própria).
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
      name: 'Nova',
    });
    after = createArrow(after, { id: 'R1', from: 'N1', to: 'M4' });
    after = createArrow(after, { id: 'R2', from: 'M2', to: 'M3' });
    const p = propose(base, after);
    const tree = reviewTree(p, base);
    const nested = tree.nodes.get('item:R1');
    expect(nested).toMatchObject({ level: 'item', id: 'R1' });
    expect(tree.nodes.get('item:N1')?.children.map((n) => n.id)).toEqual(['R1']);
    // R2 não tem origem com mudanças: vai direto sob o container I1.
    expect(tree.nodes.get('image:I1')?.children.map((n) => n.id)).toEqual(['N1', 'R2']);
    expect(tree.changeIdsOf({ level: 'item', id: 'N1' })).toEqual(
      expect.arrayContaining([
        changeOf(p, 'marking', 'N1').id,
        changeOf(p, 'arrow', 'R1').id,
      ]),
    );
    expect(tree.changeIdsOf({ level: 'item', id: 'R2' })).toEqual([
      changeOf(p, 'arrow', 'R2').id,
    ]);
  });

  it('a seta de uma marcação do canvas fica sob o grupo Canvas', () => {
    const base = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 100, height: 100 },
    });
    const p = propose(base, createArrow(base, { id: 'R1', from: 'K', to: 'M1' }));
    const tree = reviewTree(p, base);
    expect(tree.nodes.get('canvas:')?.children.map((n) => n.id)).toEqual(['R1']);
  });

  it('a anotação da seta aparece no item da seta', () => {
    const base = sampleProject();
    const after = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
    });
    const p = propose(base, after);
    expect(reviewTree(p, base).changeIdsOf({ level: 'item', id: 'R1' })).toEqual([
      changeOf(p, 'arrow', 'R1').id,
      changeOf(p, 'annotation', 'AR1').id,
    ]);
  });

  it('o tipo do item seta: criada, removida', () => {
    const base = sampleProject();
    const created = propose(base, withArrows());
    expect(
      levelType(
        'item',
        'R1',
        created.changes.filter((c) => c.markingId === 'R1'),
      ),
    ).toBe('created');
    const removed = propose(withArrows(), removeArrow(withArrows(), 'R1'));
    expect(levelType('item', 'R1', removed.changes)).toBe('removed');
  });
});

describe('create-arrow e delete-arrow: dependências entre as mudanças', () => {
  /** N1 nova em I1 e uma seta de N1 para M4 com uma anotação. */
  function proposeNew() {
    const base = sampleProject();
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
      name: 'Nova',
    });
    after = createArrow(after, { id: 'R1', from: 'N1', to: 'M4' });
    after = addAnnotation(after, { id: 'AR1', markingId: 'R1', layerId: 'L1' });
    return { base, p: propose(base, after) };
  }

  it('criar a seta exige a criação da marcação nova que é ponta dela', () => {
    const { p } = proposeNew();
    const marking = changeOf(p, 'marking', 'N1').id;
    const arrow = changeOf(p, 'arrow', 'R1').id;
    const note = changeOf(p, 'annotation', 'AR1').id;
    expect(requiredChanges(p, [arrow])).toEqual([marking]);
    // A anotação da seta exige a seta (e, por ela, a marcação).
    expect(requiredChanges(p, [note])).toEqual([arrow, marking]);
  });

  it('rejeitar a criação da marcação rejeita a seta e as anotações dela', () => {
    const { base, p } = proposeNew();
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N1').id },
      'rejected',
    );
    expect(stateOf(next, changeOf(p, 'arrow', 'R1').id)).toBe('rejected');
    expect(stateOf(next, changeOf(p, 'annotation', 'AR1').id)).toBe('rejected');
  });

  it('aceitar a seta aceita a marcação que ela exige', () => {
    const { base, p } = proposeNew();
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'arrow', 'R1').id },
      'accepted',
    );
    expect(stateOf(next, changeOf(p, 'marking', 'N1').id)).toBe('accepted');
    expect(stateOf(next, changeOf(p, 'annotation', 'AR1').id)).toBeNull();
  });

  it('apagar a marcação exige apagar as setas presas a ela; rejeitar a remoção da seta rejeita a da marcação', () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    const marking = changeOf(p, 'marking', 'M4').id;
    const arrow = changeOf(p, 'arrow', 'R1').id;
    expect(requiredChanges(p, [marking])).toEqual(expect.arrayContaining([arrow]));
    const accepted = decided(p, base, { level: 'change', id: marking }, 'accepted');
    expect(stateOf(accepted, arrow)).toBe('accepted');
    const rejected = decided(p, base, { level: 'change', id: arrow }, 'rejected');
    expect(stateOf(rejected, marking)).toBe('rejected');
  });
});

describe('create-arrow e delete-arrow: aplicar', () => {
  const allAccepted = (p: Proposal): Proposal => ({
    ...p,
    decisions: Object.fromEntries(
      p.changes.map((c) => [c.id, { state: 'accepted', at: AT }]),
    ),
  });

  it('aceitar tudo dá o projeto proposto, com as setas e a anotação delas', () => {
    const base = sampleProject();
    const after = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
      name: 'Evento',
    });
    const result = applyAccepted(base, allAccepted(propose(base, after)), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows).toEqual(after.arrows);
    expect(result.project.annotations.map((a) => a.id)).toEqual(
      after.annotations.map((a) => a.id),
    );
    expect(validateProject(result.project)).toEqual([]);
    expect(result.proposal.status).toBe('applied');
  });

  it('a seta criada nasce com `points: []`, mesmo que a proposta traga pontos', () => {
    const base = sampleProject();
    const p = propose(base, withArrows());
    const tampered: Proposal = {
      ...p,
      changes: p.changes.map((c) =>
        c.entity === 'arrow' && c.entityId === 'R1'
          ? {
              ...c,
              to: { ...(c.to as object), points: [{ x: 5, y: 5 }] } as Change['to'],
            }
          : c,
      ),
    };
    const result = applyAccepted(base, allAccepted(tampered), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.every((a) => a.points.length === 0)).toBe(true);
  });

  it('a criação sem os opcionais usa os padrões do formato', () => {
    const base = sampleProject();
    const p = propose(base, createArrow(base, { id: 'R1', from: 'M1', to: 'M4' }));
    const slim: Proposal = {
      ...p,
      changes: p.changes.map((c) => ({
        ...c,
        to: { id: 'R1', from: 'M1', to: 'M4' },
      })),
    };
    const result = applyAccepted(base, allAccepted(slim), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows).toEqual([
      {
        id: 'R1',
        from: 'M1',
        to: 'M4',
        fromSide: null,
        toSide: null,
        points: [],
        style: 'curve',
        name: null,
        locked: false,
      },
    ]);
  });

  it('aceitar só a remoção da marcação, sem a da seta, bloqueia (ponta inexistente)', () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    const onlyMarking: Proposal = {
      ...p,
      decisions: {
        [changeOf(p, 'marking', 'M4').id]: { state: 'accepted', at: AT },
        [changeOf(p, 'annotation', 'A4').id]: { state: 'accepted', at: AT },
      },
    };
    const validation = validateAccepted(base, onlyMarking);
    expect(validation.ok).toBe(false);
    const issue = validation.issues.find((i) => i.code === 'arrow-endpoint-missing');
    expect(issue).toMatchObject({ id: 'R1', otherId: 'M4' });
    // Rejeitar a remoção da marcação resolve (a seta fica aceita ou não).
    expect(issue?.changeIds).toContain(changeOf(p, 'marking', 'M4').id);
    expect(applyAccepted(base, onlyMarking, AT).ok).toBe(false);
  });

  it('rejeitar a criação da marcação leva a seta: aplicar o resto dá um projeto válido', () => {
    const base = sampleProject();
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
    });
    after = createArrow(after, { id: 'R1', from: 'N1', to: 'M4' });
    after = createArrow(after, { id: 'R2', from: 'M2', to: 'M3' });
    const p = propose(base, after);
    const rejected = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N1').id },
      'rejected',
    );
    const accepted = decided(
      rejected,
      base,
      { level: 'change', id: changeOf(p, 'arrow', 'R2').id },
      'accepted',
    );
    const result = applyAccepted(base, accepted, AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R2']);
    expect(result.project.markings.some((m) => m.id === 'N1')).toBe(false);
  });

  it('apagar a marcação aceita leva as setas dela', () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    const result = applyAccepted(base, allAccepted(p), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R2']);
    expect(result.project.markings.some((m) => m.id === 'M4')).toBe(false);
  });

  it('remover só a seta: a marcação e as outras setas ficam', () => {
    const base = withArrows();
    const p = propose(base, removeArrow(base, 'R2'));
    const result = applyAccepted(base, allAccepted(p), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R1']);
    expect(result.project.markings).toEqual(base.markings);
  });

  it('a seta que já existe perde a rota se uma ponta troca de espaço pela proposta', () => {
    const base = setArrowRoute(withArrows(), 'R2', [{ x: 1250, y: 1500 }]);
    // M3 arrastada para fora do container: vira marcação do canvas (mudança `space`).
    const after = moveMarking(base, 'M3', 5000, 0);
    const p = propose(base, after);
    expect(changeOf(p, 'marking', 'M3', 'space').kind).toBe('update');
    expect(changesOf(p, 'arrow')).toEqual([]);
    const result = applyAccepted(base, allAccepted(p), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.find((a) => a.id === 'R2')?.points).toEqual([]);
    // A que não mudou de espaço fica como estava.
    expect(result.project.arrows.find((a) => a.id === 'R1')).toEqual(
      base.arrows.find((a) => a.id === 'R1'),
    );
  });

  it('a visão Proposto (previewProject) inclui as setas propostas, menos as rejeitadas', () => {
    const base = sampleProject();
    const p = propose(base, withArrows());
    expect(previewProject(base, p).project.arrows.map((a) => a.id)).toEqual(['R1', 'R2']);
    const r1 = changeOf(p, 'arrow', 'R1').id;
    const noR1: Proposal = {
      ...p,
      decisions: { [r1]: { state: 'rejected', at: AT } },
    };
    expect(previewProject(base, noR1).project.arrows.map((a) => a.id)).toEqual(['R2']);
  });
});

describe('create-arrow e delete-arrow: situação no projeto atual', () => {
  it('remover a seta não entra em conflito se só a rota mudou; entra se outro campo mudou', () => {
    const base = withArrows();
    const p = propose(base, removeArrow(base, 'R2'));
    const c = changeOf(p, 'arrow', 'R2');
    expect(changeStatus(p, c, base).conflict).toBe(false);
    // A pessoa traçou a rota depois: a rota é só dela, sem conflito.
    const routed = setArrowRoute(base, 'R2', [{ x: 1250, y: 1500 }]);
    expect(changeStatus(p, c, routed).conflict).toBe(false);
    // Mas renomear a seta muda o que a proposta viu.
    expect(changeStatus(p, c, setArrowName(base, 'R2', 'outro')).conflict).toBe(true);
    // E a seta que sumiu é conflito.
    expect(changeStatus(p, c, removeArrow(base, 'R2')).conflict).toBe(true);
  });

  it('remover uma seta trancada traz o aviso de item trancado; aceitar é permitido', () => {
    const base = withArrows();
    const p = propose(base, removeArrow(base, 'R2'));
    const c = changeOf(p, 'arrow', 'R2');
    expect(changeStatus(p, c, base).locked).toBe(false);
    const locked = setArrowLocked(base, 'R2', true);
    expect(changeStatus(p, c, locked).locked).toBe(true);
    // A revisão é uma decisão deliberada: aplicar remove a seta mesmo trancada.
    const accepted: Proposal = {
      ...p,
      decisions: { [c.id]: { state: 'accepted', at: AT } },
    };
    const result = applyAccepted(locked, accepted, AT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.arrows.map((a) => a.id)).toEqual(['R1']);
  });

  it('criar uma seta com id que já existe é conflito', () => {
    const base = sampleProject();
    const p = propose(base, withArrows());
    const c = changeOf(p, 'arrow', 'R1');
    expect(changeStatus(p, c, base).conflict).toBe(false);
    expect(changeStatus(p, c, withArrows()).conflict).toBe(true);
  });
});

describe('create-arrow: comparação entre propostas', () => {
  const only = (p: Project, id: string, style?: 'straight') =>
    createArrow(p, { id, from: 'M1', to: 'M4', ...(style ? { style } : {}) });

  it('a mesma seta com outro id gerado é a mesma mudança; outro estilo é diferente', () => {
    const base = sampleProject();
    const previous = propose(base, only(base, 'RA'), { id: 'P1' });
    const same = propose(base, only(base, 'RB'), { id: 'P2' });
    const different = propose(base, only(base, 'RC', 'straight'), { id: 'P3' });
    const idOf = previous.changes[0]!.id;
    expect(compareProposals(previous, same).get(idOf)).toBe('same');
    expect(compareProposals(previous, different).get(idOf)).toBe('different');
    // A nova não cria seta nenhuma: não consta.
    const none = propose(base, base, { id: 'P4' });
    expect(compareProposals(previous, none).get(idOf)).toBe('missing');
  });

  it('a seta que liga marcações criadas na proposta é achada pelo caminho legível', () => {
    const base = sampleProject();
    const build = (markingId: string, arrowId: string) => {
      const m = createMarking(base, {
        id: markingId,
        containerId: 'I1',
        rect: { x: 3000, y: 2000, width: 100, height: 100 },
        name: 'Nova',
      });
      return createArrow(m, { id: arrowId, from: markingId, to: 'M4' });
    };
    const previous = propose(base, build('N1', 'RA'), { id: 'P1' });
    const next = propose(base, build('N9', 'RB'), { id: 'P2' });
    const result = compareProposals(previous, next);
    expect(result.get(changeOf(previous, 'marking', 'N1').id)).toBe('same');
    expect(result.get(changeOf(previous, 'arrow', 'RA').id)).toBe('same');
  });
});
