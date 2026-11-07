import { buildPerspective, type Perspective, type Project } from '../../src/model';

/** A perspectiva dos testes: só a raiz `root` (em `at`) e as camadas `hide` escondidas. */
export function viewOf(
  p: Project,
  args: {
    readonly id?: string;
    readonly root: string;
    readonly at: { readonly x: number; readonly y: number };
    readonly hide?: readonly string[];
  },
): Perspective {
  const built = buildPerspective(p, {
    id: args.id ?? 'V',
    name: 'Vista',
    startFrom: 'empty',
    hiddenLayers: args.hide ?? [],
  });
  return { ...built, items: [{ root: args.root, x: args.at.x, y: args.at.y }] };
}
