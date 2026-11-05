// Nome do papel do vínculo (etapa #559, PD4, decisão 22): o texto da Lista e da revisão
// mostra o nome que o dono dá ao papel ("Clique"), não o id.
import { describe, expect, it } from 'vitest';
import { roleLabelOf, roleNameOf, type Annotation } from '../../src/model';
import { addChild, roleProject, withRoles } from './roleFixtures';
import { forceRole } from './roleFixtures';

const annotation = (p: ReturnType<typeof roleProject>, id: string): Annotation => {
  const found = p.annotations.find((a) => a.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('roleNameOf', () => {
  const p = roleProject(withRoles);

  it('devolve o nome do papel que o tipo do dono oferece', () => {
    expect(roleNameOf(p, annotation(p, 'A1'), 'click')).toBe('Clique');
    expect(roleNameOf(p, annotation(p, 'A1'), 'hold')).toBe('Pressionar');
  });

  it('id que o dono não oferece: o próprio id', () => {
    expect(roleNameOf(p, annotation(p, 'A1'), 'zzz')).toBe('zzz');
  });

  it('dono sem papéis ou ausente: o próprio id', () => {
    const plain = roleProject();
    expect(roleNameOf(plain, annotation(plain, 'A1'), 'click')).toBe('click');
    expect(roleNameOf(p, undefined, 'click')).toBe('click');
  });
});

describe('roleLabelOf', () => {
  it('o nome do papel da anotação, pelo tipo do dono', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    expect(roleLabelOf(p, annotation(p, 'E1'))).toBe('Clique');
  });

  it('papel desconhecido: o id cru', () => {
    const p = forceRole(
      addChild(roleProject(withRoles), 'E1', 'A1', 'click'),
      'E1',
      'gone',
    );
    expect(roleLabelOf(p, annotation(p, 'E1'))).toBe('gone');
  });

  it('sem papel ou sem dono: null', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', null);
    expect(roleLabelOf(p, annotation(p, 'E1'))).toBeNull();
    expect(roleLabelOf(p, annotation(p, 'A1'))).toBeNull();
  });
});
