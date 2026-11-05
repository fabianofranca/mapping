import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';
import { parsedV11, type Json } from './specV11Fixtures';

/** O tipo dono (`button`) da especialização `s` de teste. */
const owner = (s: Json) => s.layers[0].annotationTypes[0] as Json;

/** Edita a especialização: o `button` ganha papéis (Clique e Pressionar, rótulo "Trigger"). */
export const withRoles = (s: Json): void => {
  owner(s).childRoles = [
    { id: 'click', name: 'Clique' },
    { id: 'hold', name: 'Pressionar' },
  ];
  owner(s).childRolesLabel = 'Trigger';
};

/** E declara um repositório de documentos. */
export const withDocRepo = (s: Json): void => {
  s.docRepos = [{ id: 'design-docs', url: 'https://gitlab.example.com/g/design-docs' }];
};

/**
 * Projeto com a especialização `s`, a marcação `M1` e dois donos (`A1`, `A2`, tipo `button`) nela.
 * Sem `edit`, o `button` não tem papéis.
 */
export function roleProject(edit?: (s: Json) => void): Project {
  let p = applySpecialization(emptyProject(), parsedV11(edit), { newId: idGen('SL') });
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 100, height: 100 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 0, y: 0, width: 50, height: 50 },
    name: 'M',
  });
  for (const id of ['A1', 'A2']) {
    p = addTypedAnnotation(p, {
      id,
      markingId: 'M1',
      layerId: layerOf(p, 's', 'componentes'),
      type: { specId: 's', typeId: 'button' },
    });
  }
  return p;
}

/** Cria o filho `typeId` (camada `eventos`) vinculado a `ownerId`, com o papel. */
export function addChild(
  p: Project,
  id: string,
  ownerId: string,
  role: string | null,
  typeId = 'onClick',
): Project {
  return addTypedAnnotation(p, {
    id,
    markingId: 'M1',
    layerId: layerOf(p, 's', 'eventos'),
    type: { specId: 's', typeId },
    parentAnnotationId: ownerId,
    parentRole: role,
  });
}

/** Força `parentRole` sem a validação do modelo (papel que o dono deixou de oferecer). */
export function forceRole(p: Project, id: string, role: string | null): Project {
  return {
    ...p,
    annotations: p.annotations.map((a) => (a.id === id ? { ...a, parentRole: role } : a)),
  };
}

/** Declara os repositórios de documentos `design-docs` (com `ref`) e `wiki`. */
export const withDocRepos = (s: Json): void => {
  s.docRepos = [
    { id: 'design-docs', url: 'https://gitlab.example.com/g/design-docs', ref: 'main' },
    { id: 'wiki', url: 'https://gitlab.example.com/g/wiki' },
  ];
};

/** Projeto com a especialização `s` declarando `design-docs` (com `ref`) e `wiki`. */
export function docReposProject(): Project {
  return roleProject(withDocRepos);
}
