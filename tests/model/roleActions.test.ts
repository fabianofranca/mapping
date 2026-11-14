// Model actions on the role (stage #559, PD2, decision 15).
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

describe('creating a linked annotation with a role', () => {
  it('stores the role together with the owner', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'hold');
    expect(role(p, 'E1')).toBe('hold');
  });

  it('a role the owner does not offer fails with unknown-role', () => {
    expect(codeOf(() => addChild(roleProject(withRoles), 'E1', 'A1', 'nope'))).toBe(
      'unknown-role',
    );
    expect(codeOf(() => addChild(roleProject(), 'E1', 'A1', 'click'))).toBe(
      'unknown-role',
    );
  });

  it('a role without an owner fails with role-without-owner', () => {
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

  it('without a role, it is born with a null parentRole', () => {
    expect(role(addChild(roleProject(withRoles), 'E1', 'A1', null), 'E1')).toBeNull();
  });
});

describe('changing the role', () => {
  it('switches to a role the owner offers, and null clears it', () => {
    let p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    p = setAnnotationRole(p, 'E1', 'hold');
    expect(role(p, 'E1')).toBe('hold');
    p = setAnnotationRole(p, 'E1', null);
    expect(role(p, 'E1')).toBeNull();
  });

  it('a role the owner does not offer fails with unknown-role; without an owner, with role-without-owner', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(codeOf(() => setAnnotationRole(p, 'E1', 'nope'))).toBe('unknown-role');
    const free = setAnnotationParent(p, 'E1', null);
    expect(codeOf(() => setAnnotationRole(free, 'E1', 'click'))).toBe(
      'role-without-owner',
    );
  });

  it('the same role returns the same project', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(setAnnotationRole(p, 'E1', 'click')).toBe(p);
  });
});

describe('changing the owner', () => {
  it('an owner that offers the current role keeps the role', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'hold');
    const moved = setAnnotationParent(p, 'E1', 'A2');
    expect(moved.annotations.find((a) => a.id === 'E1')?.parentAnnotationId).toBe('A2');
    expect(role(moved, 'E1')).toBe('hold');
  });

  it('an owner that does not offer the role clears the role in the same operation', () => {
    // A2 is of a type that accepts children but does not declare roles (`image`).
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

  it('removing the owner clears the role', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(role(setAnnotationParent(p, 'E1', null), 'E1')).toBeNull();
  });
});
