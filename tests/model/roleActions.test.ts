// Ações do modelo sobre o papel (etapa #559, PD2, decisão 15).
import { describe, expect, it } from 'vitest';
import {
  addTypedAnnotation,
  setAnnotationParent,
  setAnnotationRole,
  type ModelError,
  type Project,
} from '../../src/model';
import { layerOf } from './specFixtures';
import { addChild, roleProject, withRoles } from './roleFixtures';

const role = (p: Project, id: string) =>
  p.annotations.find((a) => a.id === id)?.parentRole;

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as ModelError).code;
  }
  return 'no-error';
}

describe('criar vinculada com papel', () => {
  it('grava o papel junto com o dono', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'hold');
    expect(role(p, 'E1')).toBe('hold');
  });

  it('papel que o dono não oferece falha com unknown-role', () => {
    expect(codeOf(() => addChild(roleProject(withRoles), 'E1', 'A1', 'nao'))).toBe(
      'unknown-role',
    );
    expect(codeOf(() => addChild(roleProject(), 'E1', 'A1', 'click'))).toBe(
      'unknown-role',
    );
  });

  it('papel sem dono falha com role-without-owner', () => {
    const p = roleProject(withRoles);
    expect(
      codeOf(() =>
        addTypedAnnotation(p, {
          id: 'X',
          markingId: 'M1',
          layerId: layerOf(p, 's', 'componentes'),
          type: { specId: 's', typeId: 'image' },
          parentRole: 'click',
        }),
      ),
    ).toBe('role-without-owner');
  });

  it('sem papel, nasce com parentRole nulo', () => {
    expect(role(addChild(roleProject(withRoles), 'E1', 'A1', null), 'E1')).toBeNull();
  });
});

describe('trocar o papel', () => {
  it('troca por um papel que o dono oferece, e null limpa', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    p = setAnnotationRole(p, 'E1', 'hold');
    expect(role(p, 'E1')).toBe('hold');
    p = setAnnotationRole(p, 'E1', null);
    expect(role(p, 'E1')).toBeNull();
  });

  it('papel que o dono não oferece falha com unknown-role; sem dono, com role-without-owner', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(codeOf(() => setAnnotationRole(p, 'E1', 'nao'))).toBe('unknown-role');
    const free = setAnnotationParent(p, 'E1', null);
    expect(codeOf(() => setAnnotationRole(free, 'E1', 'click'))).toBe(
      'role-without-owner',
    );
  });

  it('o mesmo papel devolve o mesmo projeto', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(setAnnotationRole(p, 'E1', 'click')).toBe(p);
  });
});

describe('trocar o dono', () => {
  it('um dono que oferece o papel atual mantém o papel', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'hold');
    const moved = setAnnotationParent(p, 'E1', 'A2');
    expect(moved.annotations.find((a) => a.id === 'E1')?.parentAnnotationId).toBe('A2');
    expect(role(moved, 'E1')).toBe('hold');
  });

  it('um dono que não oferece o papel limpa o papel na mesma operação', () => {
    // O A2 é de um tipo que aceita filhos, mas não declara papéis (`image`).
    let p = addChild(
      roleProject((s) => {
        withRoles(s);
        s.layers[0].annotationTypes[1].allowedChildren = [{ layer: 'eventos' }];
      }),
      'E1',
      'A1',
      'click',
    );
    p = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'A2' ? { ...a, type: { specId: 's', typeId: 'image' } } : a,
      ),
    };
    const moved = setAnnotationParent(p, 'E1', 'A2');
    expect(role(moved, 'E1')).toBeNull();
  });

  it('tirar o dono limpa o papel', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(role(setAnnotationParent(p, 'E1', null), 'E1')).toBeNull();
  });
});
