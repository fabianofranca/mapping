import type { ComponentFile, ComponentNodeTemplate } from './components/componentFormat';
import { componentNodes, findComponentCycles } from './components/nesting';
import { componentSlots } from './components/slots';
import type { LibraryIssue } from './library';
import { libraryIssue } from './libraryIssue';
import type { Spec, SpecAnnotationType, SpecField } from './spec';

// Level 2 of the `component` node (formatVersion 4, `components/nesting.ts`): the inner type
// exists and has a component that can be drawn from a node, `values` match the inner type's
// fields and the nodes do not draw each other in a cycle. Pure; `library.ts` calls it per type.
//
// Where each problem is (inside the component file that holds the node, `<node>` being the node's
// path): problems of the type and the cycles at `<node>.id`; those of one key at
// `<node>.values.<key>`; the missing required field at `<node>.values` (where it should be given).

/** What the check needs from the package: the types, their valid components and the cycles. */
export interface NestingEnv {
  readonly types: ReadonlyMap<string, SpecAnnotationType>;
  /** The valid parsed component of a type, if it has one. */
  readonly componentOf: (typeId: string) => ComponentFile | undefined;
  /** The cycles of the nesting graph (`findComponentCycles`), each starting at its smallest id. */
  readonly cycles: readonly (readonly string[])[];
}

/** The nesting environment of a specialization: its types and the cycles between their components. */
export function nestingEnv(
  spec: Spec,
  validComponent: (type: SpecAnnotationType) => ComponentFile | undefined,
): NestingEnv {
  const types = new Map<string, SpecAnnotationType>();
  for (const layer of spec.layers)
    for (const type of layer.annotationTypes) types.set(type.id, type);
  const componentOf = (typeId: string): ComponentFile | undefined => {
    const type = types.get(typeId);
    return type === undefined ? undefined : validComponent(type);
  };
  const graph = new Map<string, string[]>();
  for (const id of types.keys()) {
    const component = componentOf(id);
    if (component === undefined) continue;
    graph.set(
      id,
      componentNodes(component.template).map((ref) => ref.node.id),
    );
  }
  return { types, componentOf, cycles: findComponentCycles(graph) };
}

/** The level 2 problems of every `component` node of `component` (the component of the type `type`, in `file`). */
export function componentNodeIssues(
  env: NestingEnv,
  type: SpecAnnotationType,
  file: string,
  component: ComponentFile,
): LibraryIssue[] {
  const out: LibraryIssue[] = [];
  const nodes = componentNodes(component.template);
  for (const { path, node } of nodes) {
    const inner = env.types.get(node.id);
    if (inner === undefined) {
      out.push(
        libraryIssue('error', file, `${path}.id`, 'library.componentNodeTypeMissing', {
          typeId: node.id,
        }),
      );
      continue;
    }
    const rootCause = innerTypeIssues(env, inner, file, path);
    out.push(...rootCause);
    // A type that cannot be drawn is the whole problem: its fields would only add noise.
    if (rootCause.length === 0) out.push(...valuesIssues(type, inner, node, file, path));
  }
  out.push(...cycleIssues(env, type, file, nodes));
  return out;
}

/** The inner type has a component and it is one a node can draw (no slot, no `screen`). */
function innerTypeIssues(
  env: NestingEnv,
  inner: SpecAnnotationType,
  file: string,
  path: string,
): LibraryIssue[] {
  const at = `${path}.id`;
  const params = { typeId: inner.id };
  if (inner.component === undefined)
    return [libraryIssue('error', file, at, 'library.componentNodeNoComponent', params)];
  const drawn = env.componentOf(inner.id);
  // A component that is missing or invalid is already a level 1 problem of its own file.
  if (drawn === undefined) return [];
  if (componentSlots(drawn).length > 0)
    return [libraryIssue('error', file, at, 'library.componentNodeSlot', params)];
  if (drawn.screen !== undefined)
    return [libraryIssue('error', file, at, 'library.componentNodeScreen', params)];
  return [];
}

/** `values` against the inner type's fields: known keys, the required ones, enum options, `table` and `ref`. */
function valuesIssues(
  outer: SpecAnnotationType,
  inner: SpecAnnotationType,
  node: ComponentNodeTemplate,
  file: string,
  path: string,
): LibraryIssue[] {
  const out: LibraryIssue[] = [];
  const values = node.values ?? {};
  const fields = new Map(inner.fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(values)) {
    const at = `${path}.values.${key}`;
    const field = fields.get(key);
    if (field === undefined) {
      out.push(
        libraryIssue('error', file, at, 'library.componentNodeNoField', {
          typeId: inner.id,
          key,
        }),
      );
      continue;
    }
    const problem = valueIssue(outer, field, value, file, at);
    if (problem !== undefined) out.push(problem);
  }
  for (const field of inner.fields) {
    // A `ref` field cannot be given, so its absence is not an error.
    if (
      field.required === true &&
      field.type !== 'ref' &&
      !Object.hasOwn(values, field.key)
    )
      out.push(
        libraryIssue('error', file, `${path}.values`, 'library.componentNodeRequired', {
          key: field.key,
        }),
      );
  }
  return out;
}

/** The problem of one value for its field, if any. */
function valueIssue(
  outer: SpecAnnotationType,
  field: SpecField,
  value: unknown,
  file: string,
  at: string,
): LibraryIssue | undefined {
  if (field.type === 'ref')
    return libraryIssue('error', file, at, 'library.componentNodeRef', {
      key: field.key,
    });
  if (field.type === 'table')
    return tableValueOk(outer, value)
      ? undefined
      : libraryIssue('error', file, at, 'library.componentNodeTable', { key: field.key });
  if (field.type === 'enum' && isLiteral(value) && !field.options.includes(String(value)))
    return libraryIssue('error', file, at, 'library.componentNodeNotOption', {
      value: String(value),
      key: field.key,
    });
  return undefined;
}

function isLiteral(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

/** A `table` field takes exactly `{ "$field": "<table field of the outer type>" }`. */
function tableValueOk(outer: SpecAnnotationType, value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const ref = (value as Record<string, unknown>).$field;
  if (keys.length !== 1 || typeof ref !== 'string') return false;
  return outer.fields.some((field) => field.key === ref && field.type === 'table');
}

/** The cycles that start at this type, each once, at the node that draws the cycle's next type. */
function cycleIssues(
  env: NestingEnv,
  type: SpecAnnotationType,
  file: string,
  nodes: readonly { path: string; node: ComponentNodeTemplate }[],
): LibraryIssue[] {
  const out: LibraryIssue[] = [];
  for (const cycle of env.cycles) {
    if (cycle[0] !== type.id) continue;
    const next = cycle[1];
    const at = nodes.find((ref) => ref.node.id === next);
    if (at === undefined) continue;
    out.push(
      libraryIssue('error', file, `${at.path}.id`, 'library.componentNodeCycle', {
        cycle: cycle.join(' → '),
      }),
    );
  }
  return out;
}
