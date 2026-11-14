import { buildPerspective, type Perspective, type Project } from '../../src/model';

/** The perspective of the tests: only the root `root` (at `at`) and the layers `hide` hidden. */
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
    name: 'View',
    startFrom: 'empty',
    hiddenLayers: args.hide ?? [],
  });
  return { ...built, items: [{ root: args.root, x: args.at.x, y: args.at.y }] };
}
