/**
 * Measured layout (Faithful components stage, CF11, decision 29): a tree of rectangles from an
 * external system (a web app's page measured in a browser, the dump of a native app's visual
 * component hierarchy) becomes markings, matching each node to an annotation type by its `sources`.
 *
 * Node: `{ type, id?, classes?, rect: { x, y, width, height }, props?, children? }`. The type comes
 * from the type's `source` in the system (`origins[].kind: "measured"`): the node's `id` against
 * the source's `id`, then each class against the `name` and finally the `type` against the `name`.
 * Each field comes from its `path` in the `props` (with `values` for `enum`), as in the executable
 * origin.
 *
 * Ownership never comes from the tree: the result is a flat list of markings in pre-order and
 * whoever creates them (the MCP batch) lets the geometry decide who contains whom
 * (`settleHierarchy`). Pure, no browser API, and never throws: what did not work becomes `error`
 * or a warning.
 */
import { textsOf } from '../messages/collector';
import { templateMessage } from '../messages';
import type { ModelMessage } from '../modelMessage';
import type { FieldValue } from './componentFormat';
import {
  readPath,
  translateFieldValue,
  type FieldLike,
  type FieldSource,
  type Origin,
} from './origin';
import type { Spec, SpecAnnotationType, SpecField } from '../spec';
import type { Box } from './box';
import { isRecord } from '../isRecord';

export interface MeasuredInput {
  /** The `system` of a `measured` origin declared by the specialization. */
  readonly system: string;
  /** The measured tree (JSON read from a file or inline). */
  readonly tree: unknown;
  /** Offset added after the scale (default 0, 0). */
  readonly offset?: { readonly x: number; readonly y: number };
  /** Multiplier of the rectangles (default 1). */
  readonly scale?: number;
}

/** A marking to create: the type, the rectangle already scaled and offset, and the values read. */
export interface MeasuredMarking {
  readonly specId: string;
  readonly typeId: string;
  readonly rect: Box;
  /** Only the fields the node brought (the others keep the component's `preview`). */
  readonly values: Readonly<Record<string, FieldValue>>;
  /** Where the node is in the tree (`root.children[0]`), for the messages. */
  readonly path: string;
}

export interface MeasuredImport {
  readonly markings: readonly MeasuredMarking[];
  readonly warnings: readonly string[];
  /** The same warnings with code and parameters (`warnings` = the texts of these, in the same order). */
  readonly messages: readonly ModelMessage[];
  readonly error?: string;
}

interface Candidate {
  readonly spec: Spec;
  readonly type: SpecAnnotationType;
  /** The `booleans` of the `measured` origin of the type's specialization (each one has its own). */
  readonly booleans: Origin['booleans'];
}

/** Id and name indexes of the `system`'s `sources`; the first candidate wins (like the in-order scan). */
interface CandidateIndex {
  readonly byId: ReadonlyMap<string, Candidate>;
  readonly byName: ReadonlyMap<string, Candidate>;
}

interface Run {
  readonly system: string;
  readonly index: CandidateIndex;
  readonly scale: number;
  readonly offset: { readonly x: number; readonly y: number };
  readonly markings: MeasuredMarking[];
  readonly messages: ModelMessage[];
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The specialization's types with a `source` in the `system`. */
function typesWithSource(
  spec: Spec,
  system: string,
  booleans: Origin['booleans'],
): Candidate[] {
  return spec.layers
    .flatMap((layer) => layer.annotationTypes)
    .filter((type) => (type.sources ?? []).some((s) => s.system === system))
    .map((type) => ({ spec, type, booleans }));
}

/** The specializations that declare `system` as a `measured` origin and their types with a `source` in it. */
function candidatesOf(
  specs: readonly Spec[],
  system: string,
): { candidates: Candidate[]; origin?: NonNullable<Spec['origins']>[number] } {
  const candidates: Candidate[] = [];
  let origin: NonNullable<Spec['origins']>[number] | undefined;
  for (const spec of specs) {
    const declared = spec.origins?.find((o) => o.system === system);
    if (declared?.kind !== 'measured') continue;
    origin ??= declared;
    candidates.push(...typesWithSource(spec, system, declared.booleans));
  }
  return { candidates, ...(origin ? { origin } : {}) };
}

/** Builds once the id → candidate and name → candidate maps, in the order of the candidates. */
function indexCandidates(
  candidates: readonly Candidate[],
  system: string,
): CandidateIndex {
  const byId = new Map<string, Candidate>();
  const byName = new Map<string, Candidate>();
  for (const candidate of candidates) {
    for (const source of candidate.type.sources ?? []) {
      if (source.system !== system) continue;
      if (source.id !== undefined && !byId.has(source.id)) byId.set(source.id, candidate);
      if (source.name !== undefined && !byName.has(source.name)) {
        byName.set(source.name, candidate);
      }
    }
  }
  return { byId, byName };
}

/** The node's `id` against the source's `id`; then each class against the `name`; finally the `type`. */
function findCandidate(run: Run, node: Record<string, unknown>): Candidate | undefined {
  const { byId, byName } = run.index;
  const id = typeof node.id === 'string' ? node.id : undefined;
  const classes = Array.isArray(node.classes)
    ? node.classes.filter((c): c is string => typeof c === 'string')
    : [];
  const type = typeof node.type === 'string' ? node.type : undefined;
  const fromId = id === undefined ? undefined : byId.get(id);
  if (fromId) return fromId;
  for (const name of classes) {
    const fromClass = byName.get(name);
    if (fromClass) return fromClass;
  }
  return type === undefined ? undefined : byName.get(type);
}

function rectOf(raw: unknown, run: Run): Box | undefined {
  if (!isRecord(raw)) return undefined;
  const { x, y, width, height } = raw;
  if (![x, y, width, height].every(isNumber)) return undefined;
  const { scale, offset } = run;
  return {
    x: Math.round((x as number) * scale + offset.x),
    y: Math.round((y as number) * scale + offset.y),
    width: Math.round((width as number) * scale),
    height: Math.round((height as number) * scale),
  };
}

function fieldLike(field: SpecField): FieldLike {
  return {
    key: field.key,
    type: field.type,
    options: field.type === 'enum' ? field.options : undefined,
    default: 'default' in field ? field.default : undefined,
    sources: (field.sources ?? []) as readonly FieldSource[],
  };
}

function valuesOf(
  candidate: Candidate,
  props: Record<string, unknown>,
  path: string,
  run: Run,
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  const ctx = {
    origin: {
      system: run.system,
      booleans: candidate.booleans,
      node: { props: 'props' },
    },
    messages: run.messages,
  };
  for (const field of candidate.type.fields) {
    if (field.type === 'table' || field.type === 'ref') continue;
    const like = fieldLike(field);
    const source = like.sources.find((s) => s.system === run.system);
    if (source?.path === undefined || !readPath(props, source.path).found) continue;
    values[field.key] = translateFieldValue(like, props, path, ctx);
  }
  return values;
}

function visit(raw: unknown, path: string, run: Run): void {
  if (!isRecord(raw)) {
    run.messages.push(templateMessage('origins.draw.nodeInvalid', { path }));
    return;
  }
  const rect = rectOf(raw.rect, run);
  if (rect === undefined) {
    run.messages.push(
      templateMessage('origins.draw.rectInvalid', { path: `${path}.rect` }),
    );
  } else {
    place(raw, rect, path, run);
  }
  if (Array.isArray(raw.children)) {
    raw.children.forEach((child, i) => visit(child, `${path}.children[${i}]`, run));
  } else if (raw.children !== undefined && raw.children !== null) {
    run.messages.push(
      templateMessage('origins.draw.expectedList', { path: `${path}.children` }),
    );
  }
}

function place(raw: Record<string, unknown>, rect: Box, path: string, run: Run): void {
  const found = findCandidate(run, raw);
  if (found === undefined) {
    const label = describe(raw);
    run.messages.push(
      label === undefined
        ? templateMessage('origins.draw.nodeUntypedBare', { path })
        : templateMessage('origins.draw.nodeUntyped', { path, label }),
    );
    return;
  }
  if (rect.width < 1 || rect.height < 1) {
    run.messages.push(
      templateMessage('origins.draw.emptyRect', {
        path,
        width: rect.width,
        height: rect.height,
      }),
    );
    return;
  }
  const props = isRecord(raw.props) ? raw.props : {};
  run.markings.push({
    specId: found.spec.id,
    typeId: found.type.id,
    rect,
    values: valuesOf(found, props, path, run),
    path,
  });
}

/** The node's `type`, `id` and classes, for the warning message; `undefined` when the node has none. */
function describe(node: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  if (typeof node.type === 'string') parts.push(node.type);
  if (typeof node.id === 'string') parts.push(`#${node.id}`);
  if (Array.isArray(node.classes)) {
    for (const c of node.classes) if (typeof c === 'string') parts.push(`.${c}`);
  }
  return parts.join(' ') || undefined;
}

/** The measured tree → the markings (pre-order), by the `sources` of the specializations' types. Never throws. */
export function importMeasured(
  specs: readonly Spec[],
  input: MeasuredInput,
): MeasuredImport {
  const { candidates, origin } = candidatesOf(specs, input.system);
  if (origin === undefined) {
    const declared = specs.some((s) => s.origins?.some((o) => o.system === input.system));
    return fail(
      declared
        ? `origin "${input.system}" is not of type measured (origins[].kind)`
        : `origin "${input.system}" not declared as measured in any applied specialization`,
    );
  }
  if (!isRecord(input.tree))
    return fail('the measured tree must be an object (the root node)');
  if (!isRecord(input.tree.rect)) {
    return fail('the root node has no rect: expected { x, y, width, height }');
  }
  const run: Run = {
    system: input.system,
    index: indexCandidates(candidates, input.system),
    scale: input.scale ?? 1,
    offset: input.offset ?? { x: 0, y: 0 },
    markings: [],
    messages: [],
  };
  visit(input.tree, 'root', run);
  return {
    markings: run.markings,
    warnings: textsOf(run.messages),
    messages: run.messages,
  };
}

function fail(error: string): MeasuredImport {
  return { markings: [], warnings: [], messages: [], error };
}
