import { fail } from './errors';
import { updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Project, ReadingDirection } from './types';

// Direção de leitura do projeto e do container (schema v20, etapa "direção e âncora"): `ltr` ou
// `rtl`. É do projeto (ausente = `ltr`); o container pode fixar a sua. O motor dos componentes
// (`components/direction.ts`) recebe a efetiva e espelha fileiras, grades, `start`/`end` e `mirror`.
// Funções puras, sem DOM.

/** As direções de leitura que o arquivo aceita. */
export const READING_DIRECTIONS: readonly ReadingDirection[] = ['ltr', 'rtl'];

/** Troca a direção do projeto; `null` a remove (volta a `ltr`). */
export function setProjectDirection(
  p: Project,
  direction: ReadingDirection | null,
): Project {
  if (direction === null) {
    if (p.direction === undefined) return p;
    return Object.fromEntries(
      Object.entries(p).filter(([key]) => key !== 'direction'),
    ) as unknown as Project;
  }
  return p.direction === direction ? p : { ...p, direction };
}

/** Fixa a direção do container; `null` volta a seguir a do projeto. */
export function setContainerDirection(
  p: Project,
  containerId: string,
  direction: ReadingDirection | null,
): Project {
  const container = projectIndex(p).containers.get(containerId);
  if (container === undefined) return fail('not-found', containerId);
  if ((container.direction ?? null) === direction) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (c) => ({ ...c, direction })),
  };
}

/**
 * Direção efetiva de um espaço: a que o container fixa, senão a do projeto, senão `ltr`.
 * `containerId` nulo (o canvas e as flutuantes) e um id desconhecido seguem o projeto.
 */
export function effectiveDirection(
  p: Pick<Project, 'containers' | 'direction'>,
  containerId: string | null,
): ReadingDirection {
  if (containerId !== null) {
    const fixed = projectIndex(p as Project).containers.get(containerId)?.direction;
    if (fixed != null) return fixed;
  }
  return p.direction ?? 'ltr';
}
