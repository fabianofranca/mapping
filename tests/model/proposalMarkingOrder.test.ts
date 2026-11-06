import { describe, expect, it } from 'vitest';
import {
  applyAccepted,
  changeStatus,
  createMarking,
  parseProposalText,
  patchProject,
  previewProject,
  removeMarking,
  reorderMarking,
  serializeProposal,
  siblingPosition,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Ordem entre irmãs na proposta: o campo `position` de marcação (índice entre as irmãs),
// só quando a ordem relativa das irmãs muda.

function withSiblings(): Project {
  let p = sampleProject();
  for (const [id, x] of [
    ['M5', 200],
    ['M6', 400],
  ] as const) {
    p = createMarking(p, {
      id,
      containerId: 'I2',
      rect: { x, y: 0, width: 100, height: 100 },
    });
  }
  return p; // I2: M4, M5, M6
}

const order = (p: Project, imageId: string) =>
  p.markings
    .filter((m) => m.containerId === imageId && m.parentId === null)
    .map((m) => m.id);

describe('proposta: ordem entre marcações irmãs', () => {
  it('reordenar gera position só em quem sai da ordem relativa', () => {
    const base = withSiblings();
    const p = propose(base, reorderMarking(base, 'M6', 0));
    expect(p.changes).toMatchObject([
      {
        entity: 'marking',
        entityId: 'M6',
        imageId: 'I2',
        field: 'position',
        from: 2,
        to: 0,
      },
    ]);
    expect(p.changes).toHaveLength(1);
  });

  it('criar ou remover irmã não gera position', () => {
    const base = withSiblings();
    const created = createMarking(base, {
      id: 'M7',
      containerId: 'I2',
      rect: { x: 600, y: 0, width: 100, height: 100 },
    });
    expect(propose(base, created).changes.map((c) => c.field)).toEqual([null]);
    const removed = removeMarking(base, 'M5');
    expect(propose(base, removed).changes.some((c) => c.field === 'position')).toBe(
      false,
    );
  });

  it('criada no fim ou antes da âncora não leva position; o lugar dela vai em insertBefore', () => {
    const base = withSiblings();
    const created = reorderMarking(
      createMarking(base, {
        id: 'M7',
        containerId: 'I2',
        rect: { x: 600, y: 0, width: 100, height: 100 },
      }),
      'M7',
      0,
    );
    const p = propose(base, created);
    expect(p.changes.some((c) => c.field === 'position')).toBe(false);
    expect(changeOf(p, 'marking', 'M7', null).insertBefore).toBe('M4');
    const accepted = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    const applied = applyAccepted(base, accepted, AT);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(order(applied.project, 'I2')).toEqual(order(created, 'I2'));
  });

  it('criada que sai da maior subsequência leva position com from nulo', () => {
    // Projeto proposto M7, M6, M4, M5: a âncora de M7 é M6 e o array aplicado fica M4, M5,
    // M7, M6; a maior subsequência crescente tem empate, e M7 é uma das que se movem.
    const base = withSiblings();
    const withM7 = createMarking(base, {
      id: 'M7',
      containerId: 'I2',
      rect: { x: 600, y: 0, width: 100, height: 100 },
    });
    const byId = new Map(withM7.markings.map((m) => [m.id, m]));
    const after: Project = {
      ...withM7,
      markings: [
        ...withM7.markings.filter((m) => !['M4', 'M5', 'M6', 'M7'].includes(m.id)),
        ...['M7', 'M6', 'M4', 'M5'].map((id) => byId.get(id)!),
      ],
    };
    const p = propose(base, after);
    const position = changeOf(p, 'marking', 'M7', 'position');
    expect(position).toMatchObject({ from: null, to: 0 });
    const accepted = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    expect(changeStatus(accepted, position, base).conflict).toBe(false);
    const applied = applyAccepted(base, accepted, AT);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(order(applied.project, 'I2')).toEqual(order(after, 'I2'));
  });

  it('aplicar reordena como o modelo e a visão Proposto mostra a mesma ordem', () => {
    const base = withSiblings();
    const after = reorderMarking(reorderMarking(base, 'M4', 2), 'M6', 0);
    const p = propose(base, after);
    const result = previewProject(base, p);
    expect(result.problems).toEqual([]);
    expect(order(result.project, 'I2')).toEqual(order(after, 'I2'));
    expect(siblingPosition(result.project, 'M6').index).toBe(0);
  });

  it('conflito quando o from não bate; formato aceita o campo e recusa valor inválido', () => {
    const base = withSiblings();
    const p = propose(base, reorderMarking(base, 'M6', 0));
    const change = changeOf(p, 'marking', 'M6', 'position');
    const moved = reorderMarking(base, 'M6', 1);
    expect(changeStatus(p, change, base).conflict).toBe(false);
    expect(changeStatus(p, change, moved).conflict).toBe(true);

    const text = serializeProposal(p);
    expect(parseProposalText(text).ok).toBe(true);
    const bad = text.replace('"to": 0', '"to": -1');
    expect(parseProposalText(bad).ok).toBe(false);
  });
});

/** Container 1000×200 com as marcações lado a lado (sem pertencimento entre elas). */
function row(names: readonly string[]): Project {
  let p = sampleProject();
  names.forEach((id, i) => {
    p = createMarking(p, {
      id,
      containerId: 'I2',
      rect: { x: i * 100, y: 0, width: 90, height: 90 },
    });
  });
  return p;
}

describe('proposta: várias reordenações e duas criadas na mesma âncora (#549)', () => {
  /** Base P, Q, R, S, T e BIG, com as cinco primeiras dentro de BIG. */
  function nested(): Project {
    let p = sampleProject();
    ['P', 'Q', 'R', 'S', 'T'].forEach((id, i) => {
      p = createMarking(p, {
        id,
        containerId: 'I2',
        rect: { x: 100 + i * 100, y: 100, width: 90, height: 90 },
      });
    });
    return createMarking(p, {
      id: 'BIG',
      containerId: 'I2',
      rect: { x: 50, y: 50, width: 700, height: 200 },
    });
  }
  const children = (p: Project, parentId: string) =>
    p.markings.filter((m) => m.parentId === parentId).map((m) => m.id);

  it('os position de um grupo aplicados juntos dão a ordem do proposto', () => {
    const base = nested();
    expect(children(base, 'BIG')).toEqual(['P', 'Q', 'R', 'S', 'T']);
    let after = reorderMarking(base, 'T', 0);
    after = reorderMarking(after, 'S', 0);
    after = reorderMarking(after, 'R', 0);
    expect(children(after, 'BIG')).toEqual(['R', 'S', 'T', 'P', 'Q']);
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entityId, c.to])).toEqual([
      ['P', 3],
      ['Q', 4],
    ]);
    const all = patchProject(base, p.changes);
    expect(all.problems).toEqual([]);
    expect(children(all.project, 'BIG')).toEqual(['R', 'S', 'T', 'P', 'Q']);
    expect(children(previewProject(base, p).project, 'BIG')).toEqual([
      'R',
      'S',
      'T',
      'P',
      'Q',
    ]);
  });

  it('com só um position aceito, o resultado é o de uma mudança sozinha', () => {
    const base = nested();
    let after = reorderMarking(base, 'T', 0);
    after = reorderMarking(after, 'S', 0);
    after = reorderMarking(after, 'R', 0);
    const p = propose(base, after);
    const applied = patchProject(base, [changeOf(p, 'marking', 'Q', 'position')]);
    // Q para o índice 4 entre as irmãs, como o `reorderMarking` faria sozinho.
    expect(children(applied.project, 'BIG')).toEqual(
      children(reorderMarking(base, 'Q', 4), 'BIG'),
    );
  });

  it('dois position da mesma marcação: nenhuma duplicada nem perdida, vale o último', () => {
    let base = sampleProject();
    ['A', 'B', 'D', 'E'].forEach((id, i) => {
      base = createMarking(base, {
        id,
        containerId: 'I2',
        rect: { x: 200 + i * 100, y: 0, width: 90, height: 90 },
      });
    });
    const siblings = (p: Project) =>
      p.markings
        .filter((m) => m.containerId === 'I2' && m.parentId === null)
        .map((m) => m.id);
    const first = siblingPosition(base, 'A').index;
    const p = propose(base, reorderMarking(base, 'E', first));
    const toFirst = changeOf(p, 'marking', 'E', 'position');
    const toThird = { ...toFirst, id: `${toFirst.id}-2`, to: first + 2 };
    const applied = patchProject(base, [toFirst, toThird]);
    expect(applied.problems).toEqual([]);
    expect(siblings(applied.project)).toEqual(
      siblings(reorderMarking(base, 'E', first + 2)),
    );
    expect([...applied.project.markings.map((m) => m.id)].sort()).toEqual(
      base.markings.map((m) => m.id).sort(),
    );
  });

  it('duas criadas antes da mesma âncora não trazem position', () => {
    const base = row(['P', 'Q', 'R']);
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'I2',
      rect: { x: 300, y: 100, width: 50, height: 50 },
    });
    after = createMarking(after, {
      id: 'N2',
      containerId: 'I2',
      rect: { x: 400, y: 100, width: 50, height: 50 },
    });
    // Proposto P, Q, N1, N2, R: as duas criadas antes de R.
    const [n1, n2] = after.markings.slice(-2);
    const rest = after.markings.slice(0, -2);
    const at = rest.findIndex((m) => m.id === 'R');
    after = {
      ...after,
      markings: [...rest.slice(0, at), n1!, n2!, ...rest.slice(at)],
    };
    const p = propose(base, after);
    expect(p.changes.filter((c) => c.field === 'position')).toEqual([]);
    expect(
      p.changes.filter((c) => c.kind === 'create').map((c) => c.insertBefore),
    ).toEqual(['R', 'R']);
  });
});
