import type { Perspective, Project, Rect } from './types';

export interface RootPlacement {
  readonly x: number;
  readonly y: number;
  readonly kind: 'near' | 'occupied' | 'arrival-area';
  readonly referenceId: string | null;
}

export function placeRootIn(
  _target: Project,
  _source: Project,
  _rootId: string,
  _options?: { readonly arrivalsFrom?: string },
): RootPlacement {
  throw new Error('not implemented');
}
export function arriveInPrincipal(
  _p: Project,
  _rootId: string,
  _from: Perspective,
): { project: Project; kind: RootPlacement['kind']; referenceId: string | null } {
  throw new Error('not implemented');
}
export function dismissArrival(_p: Project, _rootId: string): Project {
  throw new Error('not implemented');
}
export function arrivalArea(_p: Project): Rect | null {
  throw new Error('not implemented');
}
