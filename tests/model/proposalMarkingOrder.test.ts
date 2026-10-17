import { describe, expect, it } from 'vitest';
import {
  applyAccepted,
  changeStatus,
  createMarking,
  parseProposalText,
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
      imageId: 'I2',
      rect: { x, y: 0, width: 100, height: 100 },
    });
  }
  return p; // I2: M4, M5, M6
}

const order = (p: Project, imageId: string) =>
  p.markings.filter((m) => m.imageId === imageId && m.parentId === null).map((m) => m.id);

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
      imageId: 'I2',
      rect: { x: 600, y: 0, width: 100, height: 100 },
    });
    expect(propose(base, created).changes.map((c) => c.field)).toEqual([null]);
    const removed = removeMarking(base, 'M5');
    expect(propose(base, removed).changes.some((c) => c.field === 'position')).toBe(
      false,
    );
  });

  it('criada fora do fim leva position com from nulo', () => {
    const base = withSiblings();
    const created = reorderMarking(
      createMarking(base, {
        id: 'M7',
        imageId: 'I2',
        rect: { x: 600, y: 0, width: 100, height: 100 },
      }),
      'M7',
      0,
    );
    const p = propose(base, created);
    const position = changeOf(p, 'marking', 'M7', 'position');
    expect(position).toMatchObject({ from: null, to: 0 });
    const accepted = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    expect(changeStatus(accepted, position, base).conflict).toBe(false);
    const applied = applyAccepted(base, accepted, AT);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(order(applied.project, 'I2')).toEqual(order(created, 'I2'));
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
