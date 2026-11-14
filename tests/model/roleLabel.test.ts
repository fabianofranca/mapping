// Role name of the link (stage #559, PD4, decision 22): the text of the List and of the review
// shows the name the owner gives the role ("Clique"), not the id.
import { describe, expect, it } from 'vitest';
import { roleLabelOf, roleNameOf, type Annotation } from '../../src/model';
import { addChild, roleProject, withRoles } from './roleFixtures';
import { forceRole } from './roleFixtures';

const annotation = (p: ReturnType<typeof roleProject>, id: string): Annotation => {
  const found = p.annotations.find((a) => a.id === id);
  if (!found) throw new Error(id);
  return found;
};

// pt-BR kept: shared fixture data asserted by tests/mcp (role names from roleFixtures)
describe('roleNameOf', () => {
  const p = roleProject(withRoles);

  it('returns the name of the role the owner type offers', () => {
    expect(roleNameOf(p, annotation(p, 'A1'), 'click')).toBe('Clique');
    expect(roleNameOf(p, annotation(p, 'A1'), 'hold')).toBe('Pressionar');
  });

  it('an id the owner does not offer: the id itself', () => {
    expect(roleNameOf(p, annotation(p, 'A1'), 'zzz')).toBe('zzz');
  });

  it('owner without roles or absent: the id itself', () => {
    const plain = roleProject();
    expect(roleNameOf(plain, annotation(plain, 'A1'), 'click')).toBe('click');
    expect(roleNameOf(p, undefined, 'click')).toBe('click');
  });
});

describe('roleLabelOf', () => {
  it('the name of the annotation role, by the owner type', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(roleLabelOf(p, annotation(p, 'E1'))).toBe('Clique');
  });

  it('unknown role: the raw id', () => {
    const p = forceRole(
      addChild(roleProject(withRoles), 'E1', 'A1', 'click'),
      'E1',
      'gone',
    );
    expect(roleLabelOf(p, annotation(p, 'E1'))).toBe('gone');
  });

  it('without a role or without an owner: null', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    expect(roleLabelOf(p, annotation(p, 'E1'))).toBeNull();
    expect(roleLabelOf(p, annotation(p, 'A1'))).toBeNull();
  });
});
