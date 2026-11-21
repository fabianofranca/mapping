import {
  containerClassSets,
  isComputedSet,
  setContainerClass,
  type Project,
  type SpecContainerClassSet,
  projectIndex,
} from '../src/model';
import { ToolError } from './errors';

// `classes` of `add_container` and `update_container` (stage #1901, decision 14): the agent names
// the CHOSEN sets and their classes; a computed set, a set nobody declares and a class the set does
// not have are `invalid-arguments`, with the chosen sets and their classes in `chosenSets`.

/** What a refusal lists: the chosen sets of the applied specializations and their classes. */
function chosenSets(p: Project): Record<string, unknown>[] {
  return containerClassSets(p)
    .filter((s) => !isComputedSet(s))
    .map((s) => ({
      id: s.id,
      name: s.name,
      classes: s.classes.map((c) => ({ id: c.id, name: c.name })),
    }));
}

function refuse(p: Project, set: string, why: string): never {
  throw new ToolError('invalid-arguments', `classes.${set}: ${why}`, {
    chosenSets: chosenSets(p),
  });
}

function checkChoice(p: Project, set: string, classId: string): void {
  const known: SpecContainerClassSet | undefined = containerClassSets(p).find(
    (s) => s.id === set,
  );
  if (known === undefined) {
    refuse(p, set, `the set "${set}" is not declared by any applied specialization`);
  } else if (isComputedSet(known)) {
    refuse(
      p,
      set,
      `the set "${set}" is computed by ${known.by}: it follows the container's size and is not chosen`,
    );
  } else if (!known.classes.some((c) => c.id === classId)) {
    refuse(p, set, `"${classId}" is not a class of the set "${set}"`);
  }
}

/** The sets the call changes: a map names them (`null` removes one), `null` removes every stored one. */
function wanted(
  p: Project,
  containerId: string,
  classes: Readonly<Record<string, string | null>> | null,
): [string, string | null][] {
  if (classes !== null) return Object.entries(classes);
  const stored = projectIndex(p).containers.get(containerId)?.classes ?? {};
  return Object.keys(stored).map((set) => [set, null]);
}

/**
 * Applies the choices of `classes` to the container, one set at a time. Returns the project and the
 * lines for the step description (`class platform=android`, `class window removed`).
 */
export function applyClassChoices(
  p: Project,
  containerId: string,
  classes: Readonly<Record<string, string | null>> | null,
): { project: Project; changes: string[] } {
  let project = p;
  const changes: string[] = [];
  for (const [set, classId] of wanted(p, containerId, classes)) {
    if (classId !== null) checkChoice(p, set, classId);
    const next = setContainerClass(project, containerId, set, classId);
    if (next === project) continue;
    project = next;
    changes.push(classId === null ? `class ${set} removed` : `class ${set}=${classId}`);
  }
  return { project, changes };
}
