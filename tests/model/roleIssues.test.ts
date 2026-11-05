// Pendências de papel (etapa #559, PD2, decisão 12): `missing-role` e `unknown-role`.
import { describe, expect, it } from 'vitest';
import { getAnnotationIssues, getProjectIssues, type Project } from '../../src/model';
import { addChild, roleProject, withRoles } from './roleFixtures';

const codes = (p: Project, id: string) => getAnnotationIssues(p, id).map((i) => i.code);

describe('missing-role', () => {
  it('o filho sem papel, num dono com childRoles, fica incompleto', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    expect(codes(p, 'E1')).toEqual(['missing-role']);
  });

  it('com um papel que o dono oferece, o filho está completo', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'hold');
    expect(codes(p, 'E1')).toEqual([]);
  });

  it('dono sem childRoles: filho sem papel não tem pendência de papel', () => {
    const p = addChild(roleProject(), 'E1', 'A1', null);
    expect(codes(p, 'E1')).toEqual([]);
  });
});

describe('unknown-role', () => {
  it('papel que o dono não oferece (a especialização mudou)', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const p = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'E1' ? { ...a, parentRole: 'sumiu' } : a,
      ),
    };
    expect(codes(p, 'E1')).toEqual(['unknown-role']);
  });

  it('papel num dono sem childRoles', () => {
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

describe('sem pendência de papel', () => {
  it('dono livre (sem tipo) ou de tipo desconhecido', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    // Dono de tipo que não existe mais na especialização.
    const unknownOwner = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'A1' ? { ...a, type: { specId: 's', typeId: 'nao-existe' } } : a,
      ),
    };
    expect(codes(unknownOwner, 'E1')).not.toContain('unknown-role');
    expect(codes(unknownOwner, 'E1')).not.toContain('missing-role');
    // Papel solto num filho cujo dono é livre: não há como medi-lo.
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

describe('contagem de Incompletas', () => {
  it('inclui as duas pendências de papel', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    p = addChild(p, 'E2', 'A1', 'click', 'onHold');
    p = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'E2' ? { ...a, parentRole: 'sumiu' } : a,
      ),
    };
    const issues = getProjectIssues(p);
    expect([...issues.keys()].sort()).toEqual(['E1', 'E2']);
    expect(issues.get('E1')?.map((i) => i.code)).toEqual(['missing-role']);
    expect(issues.get('E2')?.map((i) => i.code)).toEqual(['unknown-role']);
  });
});
