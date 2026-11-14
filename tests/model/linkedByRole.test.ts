import { describe, expect, it } from 'vitest';
import { linkedByRole } from '../../src/model';
import { addChild, roleProject, withRoles } from './roleFixtures';

const owner = (p: ReturnType<typeof roleProject>, id: string) => {
  const found = p.annotations.find((a) => a.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};
const ids = (items: readonly { id: string }[]) => items.map((a) => a.id);

describe('linkedByRole (linked by role, decision 19)', () => {
  it('owner without roles: null (the list groups by layer, as before)', () => {
    const p = addChild(roleProject(), 'E1', 'A1', null);
    expect(linkedByRole(p, owner(p, 'A1'))).toBeNull();
  });

  it('one row per role, in childRoles order, with the children of each', () => {
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

  it('a role without children gets its row with an empty list', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const result = linkedByRole(p, owner(p, 'A1'));
    expect(result?.rows.map((r) => [r.role.id, r.items.length])).toEqual([
      ['click', 1],
      ['hold', 0],
    ]);
  });

  it('a child without a role or with a role the owner does not offer goes to unassigned', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    p = addChild(p, 'E2', 'A1', 'click');
    // Role that no longer exists in the owner's type (file edited by hand).
    p = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'E2' ? { ...a, parentRole: 'gone' } : a,
      ),
    };
    const result = linkedByRole(p, owner(p, 'A1'));
    expect(ids(result?.unassigned ?? [])).toEqual(['E1', 'E2']);
    expect(result?.rows.every((r) => r.items.length === 0)).toBe(true);
  });

  it('only considers the direct children of this owner', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    p = addChild(p, 'E2', 'A2', 'click');
    const result = linkedByRole(p, owner(p, 'A1'));
    expect(ids(result?.rows[0]?.items ?? [])).toEqual(['E1']);
  });
});
