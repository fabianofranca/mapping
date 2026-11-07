import type { Perspective, Project } from './types';

export type NameIssue = 'empty' | 'taken';
export type PerspectiveStart = null | 'empty' | Perspective;
export interface RootMove {
  readonly root: string;
  readonly dx: number;
  readonly dy: number;
}

export function perspectiveNameIssue(
  _names: readonly string[],
  _name: string,
  _exceptName?: string,
): NameIssue | null {
  throw new Error('not implemented');
}
export function projectPerspectiveNameIssue(
  _p: Project,
  _name: string,
  _exceptName?: string,
  _extraNames?: readonly string[],
): NameIssue | null {
  throw new Error('not implemented');
}
export function buildPerspective(
  _p: Project,
  _args: {
    readonly id: string;
    readonly name: string;
    readonly startFrom: PerspectiveStart;
    readonly hiddenLayers?: readonly string[];
  },
): Perspective {
  throw new Error('not implemented');
}
export function addPerspective(
  _p: Project,
  _perspective: Perspective,
  _extraNames?: readonly string[],
): Project {
  throw new Error('not implemented');
}
export function renamePerspective(
  _p: Project,
  _id: string,
  _name: string,
  _extraNames?: readonly string[],
): Project {
  throw new Error('not implemented');
}
export function duplicatePerspective(
  _p: Project,
  _id: string,
  _newId: string,
  _name: string,
  _extraNames?: readonly string[],
): Project {
  throw new Error('not implemented');
}
export function removePerspective(_p: Project, _id: string): Project {
  throw new Error('not implemented');
}
export function sendRoots(
  _p: Project,
  _target: Perspective,
  _rootIds: readonly string[],
  _source: Perspective | null,
): Perspective {
  throw new Error('not implemented');
}
export function sendRootsToPerspective(
  _p: Project,
  _targetId: string,
  _rootIds: readonly string[],
  _source: Perspective | null,
): Project {
  throw new Error('not implemented');
}
export function removeRoots(
  _target: Perspective,
  _rootIds: readonly string[],
): Perspective {
  throw new Error('not implemented');
}
export function removeRootsFromPerspective(
  _p: Project,
  _id: string,
  _rootIds: readonly string[],
): Project {
  throw new Error('not implemented');
}
export function moveRoots(
  _p: Project,
  _target: Perspective,
  _moves: readonly RootMove[],
): Perspective {
  throw new Error('not implemented');
}
export function moveRootsInPerspective(
  _p: Project,
  _id: string,
  _moves: readonly RootMove[],
): Project {
  throw new Error('not implemented');
}
export function setHiddenLayers(
  _p: Project,
  _target: Perspective,
  _layerIds: readonly string[],
): Perspective {
  throw new Error('not implemented');
}
export function setPerspectiveHiddenLayers(
  _p: Project,
  _id: string,
  _layerIds: readonly string[],
): Project {
  throw new Error('not implemented');
}
