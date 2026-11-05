import { describe, expect, it } from 'vitest';
import { linkedByRole } from '../../src/model';
import { addChild, roleProject, withRoles } from './roleFixtures';

const owner = (p: ReturnType<typeof roleProject>, id: string) => {
  const found = p.annotations.find((a) => a.id === id);
  if (!found) throw new Error(`sem ${id}`);
  return found;
};
const ids = (items: readonly { id: string }[]) => items.map((a) => a.id);

describe('linkedByRole (vinculadas por papel, decisão 19)', () => {
  it('dono sem papéis: null (a lista agrupa por camada, como antes)', () => {
    const p = addChild(roleProject(), 'E1', 'A1', null);
    expect(linkedByRole(p, owner(p, 'A1'))).toBeNull();
  });

  it('uma linha por papel, na ordem de childRoles, com os filhos de cada um', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', 'hold', 'onHold');
    p = addChild(p, 'E2', 'A1', 'click');
    p = addChild(p, 'E3', 'A1', 'click', 'navigate');
    const result = linkedByRole(p, owner(p, 'A1'));
    expect(result?.label).toBe('Trigger');
    expect(result?.rows.map((r) => r.role.id)).toEqual(['click', 'hold']);
    expect(ids(result?.rows[0]?.items ?? [])).toEqual(['E2', 'E3']);
    expect(ids(result?.rows[1]?.items ?? [])).toEqual(['E1']);
    expect(result?.unassigned).toEqual([]);
  });

  it('papel sem filhos ganha a linha com a lista vazia', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const result = linkedByRole(p, owner(p, 'A1'));
    expect(result?.rows.map((r) => [r.role.id, r.items.length])).toEqual([
      ['click', 1],
      ['hold', 0],
    ]);
  });

  it('filho sem papel ou com papel que o dono não oferece vai a unassigned', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    p = addChild(p, 'E2', 'A1', 'click');
    // Papel que deixou de existir no tipo do dono (arquivo editado à mão).
    p = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'E2' ? { ...a, parentRole: 'sumiu' } : a,
      ),
    };
    const result = linkedByRole(p, owner(p, 'A1'));
    expect(ids(result?.unassigned ?? [])).toEqual(['E1', 'E2']);
    expect(result?.rows.every((r) => r.items.length === 0)).toBe(true);
  });

  it('só considera os filhos diretos deste dono', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    p = addChild(p, 'E2', 'A2', 'click');
    const result = linkedByRole(p, owner(p, 'A1'));
    expect(ids(result?.rows[0]?.items ?? [])).toEqual(['E1']);
  });
});
