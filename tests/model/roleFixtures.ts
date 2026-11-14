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

/** The owner type (`button`) of the test specialization `s`. */
const owner = (s: Json) => s.layers[0].annotationTypes[0] as Json;

// pt-BR kept: shared fixture data asserted by tests/mcp (role names, layer ids)
/** Edits the specialization: `button` gains roles (Clique and Pressionar, label "Trigger"). */
export const withRoles = (s: Json): void => {
  owner(s).childRoles = [
    { id: 'click', name: 'Clique' },
    { id: 'hold', name: 'Pressionar' },
  ];
  owner(s).childRolesLabel = 'Trigger';
};

/** And declares a document repository. */
export const withDocRepo = (s: Json): void => {
  s.docRepos = [{ id: 'design-docs', url: 'https://gitlab.example.com/g/design-docs' }];
};

/**
 * Project with the specialization `s`, the marking `M1` and two owners (`A1`, `A2`, type `button`) in it.
 * Without `edit`, `button` has no roles.
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

/** Creates the child `typeId` (layer `eventos`) linked to `ownerId`, with the role. */
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

/** Forces `parentRole` without the model validation (a role the owner no longer offers). */
export function forceRole(p: Project, id: string, role: string | null): Project {
  return {
    ...p,
    annotations: p.annotations.map((a) => (a.id === id ? { ...a, parentRole: role } : a)),
  };
}

/** Declares the document repositories `design-docs` (with `ref`) and `wiki`. */
export const withDocRepos = (s: Json): void => {
  s.docRepos = [
    { id: 'design-docs', url: 'https://gitlab.example.com/g/design-docs', ref: 'main' },
    { id: 'wiki', url: 'https://gitlab.example.com/g/wiki' },
  ];
};

/** Project with the specialization `s` declaring `design-docs` (with `ref`) and `wiki`. */
export function docReposProject(): Project {
  return roleProject(withDocRepos);
}
