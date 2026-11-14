// Role issues (stage #559, PD2, decision 12): `missing-role` e `unknown-role`.
import { describe, expect, it } from 'vitest';
import { getAnnotationIssues, projectIssues, type Project } from '../../src/model';
import { addChild, roleProject, withRoles } from './roleFixtures';

const codes = (p: Project, id: string) => getAnnotationIssues(p, id).map((i) => i.code);

describe('missing-role', () => {
  it('a child without a role, under an owner with childRoles, is incomplete', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    expect(codes(p, 'E1')).toEqual(['missing-role']);
  });

  it('with a role the owner offers, the child is complete', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'hold');
    expect(codes(p, 'E1')).toEqual([]);
  });

  it('owner without childRoles: a child without a role has no role issue', () => {
    const p = addChild(roleProject(), 'E1', 'A1', null);
    expect(codes(p, 'E1')).toEqual([]);
  });
});

describe('unknown-role', () => {
  it('a role the owner does not offer (the specialization changed)', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const p = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'E1' ? { ...a, parentRole: 'vanished' } : a,
      ),
    };
    expect(codes(p, 'E1')).toEqual(['unknown-role']);
  });

  it('a role on an owner without childRoles', () => {
    const base = addChild(roleProject(), 'E1', 'A1', null);
    const p = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'E1' ? { ...a, parentRole: 'click' } : a,
      ),
    };
    expect(codes(p, 'E1')).toEqual(['unknown-role']);
  });
});

describe('no role issue', () => {
  it('free owner (no type) or of an unknown type', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    // Owner of a type that no longer exists in the specialization.
    const unknownOwner = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'A1' ? { ...a, type: { specId: 's', typeId: 'does-not-exist' } } : a,
      ),
    };
    expect(codes(unknownOwner, 'E1')).not.toContain('unknown-role');
    expect(codes(unknownOwner, 'E1')).not.toContain('missing-role');
    // A loose role on a child whose owner is free: there is no way to measure it.
    const freeOwner = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'A1' ? { ...a, type: null, values: null } : a,
      ),
    };
    expect(codes(freeOwner, 'E1')).not.toContain('unknown-role');
    expect(codes(freeOwner, 'E1')).not.toContain('missing-role');
  });
});

describe('Incomplete count', () => {
  it('includes both role issues', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    p = addChild(p, 'E2', 'A1', 'click', 'onHold');
    p = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'E2' ? { ...a, parentRole: 'vanished' } : a,
      ),
    };
    const issues = projectIssues(p);
    expect([...issues.keys()].sort()).toEqual(['E1', 'E2']);
    expect(issues.get('E1')?.map((i) => i.code)).toEqual(['missing-role']);
    expect(issues.get('E2')?.map((i) => i.code)).toEqual(['unknown-role']);
  });
});
