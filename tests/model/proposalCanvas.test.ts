import { describe, expect, it } from 'vitest';
import {
  CANVAS_FILTER,
  NO_FILTERS,
  applyAccepted,
  changeStatus,
  changeTarget,
  compareProposals,
  createMarking,
  filterChanges,
  imageCanvasRect,
  moveMarking,
  parseProposal,
  previewProject,
  reviewKey,
  reviewTree,
  serializeProposal,
  settleHierarchy,
  validateProject,
  type Change,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Marcação do canvas na proposta (ME1): o nível Canvas da revisão, a mudança composta
// `space`, o pai sempre derivado (assentar depois de aplicar) e o caminho "Canvas › …".

/** O projeto de exemplo com uma marcação do canvas (`C1`) em volta do container I2. */
function withCanvasMarking(): Project {
  const base = sampleProject();
  const i2 = base.containers.find((c) => c.id === 'I2')!;
  const around = imageCanvasRect(i2, i2.placement);
  return settleHierarchy(
    createMarking(base, {
      id: 'C1',
      containerId: null,
      rect: {
        x: around.x - 20,
        y: around.y - 20,
        width: around.width + 40,
        height: around.height + 40,
      },
      name: 'Grupo',
    }),
  );
}

/** M4 (de I2) arrastada para fora de qualquer container: vira marcação do canvas. */
function leaving(): { base: Project; after: Project } {
  const base = withCanvasMarking();
  const after = moveMarking(base, 'M4', -3000, 0);
  return { base, after };
}

describe('troca de espaço', () => {
  it('uma marcação que sai do container vira UMA mudança `space` (sem `rect` à parte)', () => {
    const { base, after } = leaving();
    const moved = after.markings.find((m) => m.id === 'M4')!;
    expect(moved.containerId).toBeNull();
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entityId, c.field])).toEqual([['M4', 'space']]);
    expect(changeOf(p, 'marking', 'M4', 'space')).toMatchObject({
      from: { containerId: 'I2', rect: { x: 0, y: 0, width: 100, height: 100 } },
      to: { containerId: null, rect: moved.rect },
      // O cabeçalho aponta o espaço de depois: sem container, é o grupo Canvas.
      imageId: null,
      markingId: 'M4',
    });
  });

  it('aceitar `space` converte o espaço, refaz o pai e o resultado é o projeto proposto', () => {
    const { base, after } = leaving();
    const p = propose(base, after);
    const accepted = decided(p, base, { level: 'item', id: 'M4' }, 'accepted');
    const result = applyAccepted(base, accepted, AT);
    if (!result.ok) throw new Error('bloqueada');
    const m4 = result.project.markings.find((m) => m.id === 'M4')!;
    expect(m4.containerId).toBeNull();
    expect(m4.parentId).toBeNull();
    expect(validateProject(result.project)).toEqual([]);
    expect(result.project).toEqual(after);
  });

  it('rejeitar `space` mantém tudo como estava', () => {
    const { base, after } = leaving();
    const p = decided(
      propose(base, after),
      base,
      { level: 'item', id: 'M4' },
      'rejected',
    );
    const result = applyAccepted(base, p, AT);
    if (!result.ok) throw new Error('bloqueada');
    expect(result.project).toBe(base);
    expect(result.applied).toEqual([]);
  });

  it('o `space` em conflito é detectado pelo valor atual (container e rect juntos)', () => {
    const { base, after } = leaving();
    const p = propose(base, after);
    const change = changeOf(p, 'marking', 'M4', 'space');
    expect(changeStatus(p, change, base).conflict).toBe(false);
    expect(changeStatus(p, change, after).conflict).toBe(true);
  });

  it('o pai sai sempre do assentar: aceitar só o rect de uma filha refaz o pai', () => {
    const base = sampleProject();
    // M3 (filha de M2) vai para fora de M2 e continua dentro de M1.
    const p = propose(base, moveMarking(base, 'M3', 0, 200));
    expect(p.changes.map((c) => c.field)).toEqual(['rect']);
    const accepted = decided(
      p,
      base,
      { level: 'change', id: p.changes[0]!.id },
      'accepted',
    );
    const result = applyAccepted(base, accepted, AT);
    if (!result.ok) throw new Error('bloqueada');
    expect(result.project.markings.find((m) => m.id === 'M3')?.parentId).toBe('M1');
  });
});

describe('floating comparado', () => {
  it('trocar a flutuação com o espaço junto: `space` e `floating`', () => {
    const base = withCanvasMarking();
    const after = settleHierarchy({
      ...base,
      markings: base.markings.map((m) => (m.id === 'C1' ? { ...m, floating: true } : m)),
    });
    const p = propose(base, after);
    expect(changeOf(p, 'marking', 'C1', 'floating')).toMatchObject({
      from: false,
      to: true,
    });
    const result = applyAccepted(
      base,
      decided(p, base, { level: 'item', id: 'C1' }, 'accepted'),
      AT,
    );
    if (!result.ok) throw new Error('bloqueada');
    expect(result.project.markings.find((m) => m.id === 'C1')?.floating).toBe(true);
    // Flutuante não é pai de ninguém.
    expect(result.project.containers.find((c) => c.id === 'I2')?.parentId).toBeNull();
  });
});

describe('o nível Canvas da revisão', () => {
  function proposalWithCanvas() {
    const { base, after } = leaving();
    let next = createMarking(after, {
      id: 'C2',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 100, height: 100 },
      name: 'Nota',
    });
    next = settleHierarchy({
      ...next,
      containers: next.containers,
    });
    return { base, proposal: propose(base, next) };
  }

  it('as mudanças de marcações do canvas ficam no grupo Canvas, irmão das imagens', () => {
    const { base, proposal } = proposalWithCanvas();
    const tree = reviewTree(proposal, base);
    const canvas = tree.nodes.get(reviewKey({ level: 'canvas', id: null }));
    expect(canvas?.children.map((n) => n.id).sort()).toEqual(['C2', 'M4']);
    expect(tree.root.children.map((n) => n.level)).toEqual(['canvas']);
    expect(tree.changeIdsOf({ level: 'canvas', id: null })).toHaveLength(2);
    // Não é o grupo Projeto.
    expect(tree.changeIdsOf({ level: 'project', id: null })).toEqual([]);
  });

  it('o Canvas vem depois do Projeto e antes das imagens', () => {
    const { base, after } = leaving();
    let next = createMarking(after, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
    });
    next = {
      ...next,
      layers: next.layers.map((l, i) => (i === 0 ? { ...l, name: 'Outra' } : l)),
    };
    const tree = reviewTree(propose(base, next), base);
    expect(tree.root.children.map((n) => n.level)).toEqual([
      'project',
      'canvas',
      'image',
    ]);
  });

  it('sem marcação do canvas o nó Canvas existe, vazio', () => {
    const base = sampleProject();
    const p = propose(base, moveMarking(base, 'M4', 10, 10));
    const tree = reviewTree(p, base);
    expect(tree.nodes.get(reviewKey({ level: 'canvas', id: null }))?.changeIds).toEqual(
      [],
    );
    expect(tree.root.children.map((n) => n.level)).toEqual(['image']);
  });

  it('decidir o grupo Canvas decide as mudanças dele', () => {
    const { base, proposal } = proposalWithCanvas();
    const decidedP = decided(proposal, base, { level: 'canvas', id: null }, 'accepted');
    expect(Object.keys(decidedP.decisions)).toHaveLength(proposal.changes.length);
  });

  it('o filtro Canvas só deixa as mudanças de marcações do canvas', () => {
    const { base, proposal } = proposalWithCanvas();
    const next = settleHierarchy(base);
    const filtered = filterChanges(
      proposal,
      next,
      { ...NO_FILTERS, imageId: CANVAS_FILTER },
      new Set(),
    );
    expect(filtered.map((c) => c.entityId).sort()).toEqual(['C2', 'M4']);
    expect(
      filterChanges(proposal, next, { ...NO_FILTERS, imageId: 'I2' }, new Set()),
    ).toEqual([]);
  });

  it('o alvo de uma mudança de marcação do canvas é o item; a do projeto, o grupo Projeto', () => {
    const { proposal } = proposalWithCanvas();
    const c = proposal.changes[0] as Change;
    expect(changeTarget(c)).toEqual({ level: 'item', id: c.markingId });
    expect(
      changeTarget({ ...c, imageId: null, markingId: null, entity: 'layer' }),
    ).toEqual({
      level: 'project',
      id: null,
    });
  });

  it('a prévia ("como ficaria") assenta o pertencimento', () => {
    const { base, after } = leaving();
    const p = propose(base, after);
    expect(previewProject(base, p).project).toEqual(after);
  });

  it('serializa e relê: o nível `canvas` é um alvo válido de nota', () => {
    const { base, proposal } = proposalWithCanvas();
    const withNote: Proposal = {
      ...proposal,
      notes: [
        { id: 'n1', target: { level: 'canvas', id: null }, text: 'Revisar.', at: AT },
      ],
    };
    void base;
    const read = parseProposal(JSON.parse(serializeProposal(withNote)));
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.proposal.notes[0]?.target).toEqual({ level: 'canvas', id: null });
  });
});

describe('caminho legível na comparação de propostas', () => {
  it('marcações do canvas criadas em duas propostas casam por "Canvas › pai › nome"', () => {
    const base = sampleProject();
    const make = (id: string) =>
      createMarking(base, {
        id,
        containerId: null,
        rect: { x: 5000, y: 5000, width: 100, height: 100 },
        name: 'Nota',
      });
    const first = propose(base, make('X1'), { id: 'P1' });
    const second = propose(base, make('X2'), { id: 'P2' });
    expect(compareProposals(first, second).get('c1')).toBe('same');
    const other = propose(
      base,
      createMarking(base, {
        id: 'X3',
        containerId: null,
        rect: { x: 5000, y: 5000, width: 100, height: 100 },
        name: 'Outra',
      }),
      { id: 'P3' },
    );
    expect(compareProposals(first, other).get('c1')).toBe('missing');
  });
});

describe('proposta antiga com `parentId`', () => {
  it('a mudança de `parentId` é descartada na leitura, com aviso', () => {
    const base = sampleProject();
    const p = propose(base, moveMarking(base, 'M4', 10, 10));
    const json = JSON.parse(
      serializeProposal(decided(p, base, { level: 'change', id: 'c1' }, 'accepted')),
    );
    json.formatVersion = 2;
    json.changes.push({
      id: 'c9',
      kind: 'update',
      entity: 'marking',
      entityId: 'M3',
      imageId: 'I1',
      markingId: 'M3',
      field: 'parentId',
      from: 'M2',
      to: 'M1',
    });
    json.decisions.c9 = { ...json.decisions.c1 };
    json.notes = [
      { id: 'n1', target: { level: 'change', id: 'c9' }, text: 'Pai.', at: AT },
    ];
    const read = parseProposal(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.proposal.changes.map((c) => c.id)).toEqual(['c1']);
    expect(Object.keys(read.proposal.decisions)).toEqual(['c1']);
    expect(read.proposal.notes[0]?.target).toEqual({ level: 'proposal', id: null });
    expect(read.warnings.join(' ')).toContain('parentId');
  });

  it('criação antiga de marcação (sem `floating`) é lida como não flutuante', () => {
    const base = sampleProject();
    const p = propose(
      base,
      createMarking(base, {
        id: 'N1',
        containerId: 'I2',
        rect: { x: 300, y: 300, width: 100, height: 100 },
      }),
    );
    const json = JSON.parse(serializeProposal(p));
    delete json.changes[0].to.floating;
    json.formatVersion = 2;
    const read = parseProposal(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.proposal.changes[0]?.to).toMatchObject({ id: 'N1', floating: false });
    expect(read.warnings).toEqual([]);
  });
});
