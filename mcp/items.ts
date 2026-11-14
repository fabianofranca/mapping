import {
  ancestorsOf,
  annotationShortLabel,
  formatRef,
  markingTypeName,
  matchShortCode,
  parseAnyRef,
  parseRef,
  projectIndex,
  refImageLabel,
  resolveCitation,
  shortCode,
  type ItemKind,
  type Project,
  type SubRef,
} from '../src/model';
import { ToolError } from './errors';
import {
  discoverProjects,
  findProject,
  loadProject,
  type LoadedProject,
  type ProjectLocation,
} from './projects';
import type { Roots } from './paths';

/** Name of an unnamed container (the MCP does not use `t()`). */
export const CONTAINER_LABEL = 'Container';
export const CANVAS_LABEL = 'Canvas';
/** First segment of an arrow's readable path. */
export const ARROW_LABEL = 'Arrow';

/** Names of the item kinds. The `i` letter of references is the container (unchanged for compatibility). */
export const KIND_NAMES: Record<ItemKind, string> = {
  m: 'marking',
  i: 'container',
  a: 'annotation',
};

/** The kind with an indefinite article (`a marking`, `a container`), for messages. */
export const KIND_WITH_ARTICLE: Record<ItemKind, string> = {
  m: 'a marking',
  i: 'a container',
  a: 'an annotation',
};

/** `marking not found`, `container not found`: the message names the kind. */
export const KIND_NOT_FOUND: Record<ItemKind, string> = {
  m: 'marking not found',
  i: 'container not found',
  a: 'annotation not found',
};

const PATH_SEPARATOR = ' › ';

/** `mapping://` references and readable labels of the items of a loaded project. */
export class Refs {
  readonly project: Project;

  constructor(readonly loaded: LoadedProject) {
    this.project = loaded.project;
  }

  get projectName(): string {
    return this.loaded.location.name;
  }

  /** Label of the container; a canvas marking (`null`) is "Canvas". */
  imageLabel(containerId: string | null): string {
    if (containerId === null) return CANVAS_LABEL;
    const image = projectIndex(this.project).containers.get(containerId);
    if (!image) return containerId;
    return refImageLabel(image) ?? CONTAINER_LABEL;
  }

  /** `imageLabel` without the project index (the MCP batch labels the marking it just created without rebuilding it). */
  imageLabelNoIndex(containerId: string | null): string {
    if (containerId === null) return CANVAS_LABEL;
    const image = this.project.containers.find((c) => c.id === containerId);
    if (!image) return containerId;
    return refImageLabel(image) ?? CONTAINER_LABEL;
  }

  /** Arrow text: its name or "From → To" ("Arrow <code>" if an end is gone). */
  arrowName(arrowId: string): string {
    const arrow = projectIndex(this.project).arrows.get(arrowId);
    if (!arrow) return arrowId;
    if (arrow.name !== null) return arrow.name;
    const markings = projectIndex(this.project).markings;
    if (!markings.has(arrow.from) || !markings.has(arrow.to)) {
      return `Arrow ${shortCode(this.project, 'm', arrowId)}`;
    }
    return `${this.markingName(arrow.from)} → ${this.markingName(arrow.to)}`;
  }

  /**
   * Name of the marking; unnamed, "<Type> <code>" if it draws a component type (an instance is
   * born unnamed), otherwise "Marking <code>". The code keeps the name unique.
   */
  markingName(markingId: string): string {
    if (projectIndex(this.project).arrows.has(markingId))
      return this.arrowName(markingId);
    const marking = projectIndex(this.project).markings.get(markingId);
    if (!marking) return markingId;
    if (marking.name !== null) return marking.name;
    const code = shortCode(this.project, 'm', markingId);
    return `${markingTypeName(this.project, markingId) ?? 'Marking'} ${code}`;
  }

  /** `Container › Parent › Marking` (`Canvas › Parent › Marking` on the canvas). */
  markingPath(markingId: string): string[] {
    // The arrow (ME4) shares the marking id space and has no container or parent.
    if (projectIndex(this.project).arrows.has(markingId)) {
      return [ARROW_LABEL, this.arrowName(markingId)];
    }
    const marking = projectIndex(this.project).markings.get(markingId);
    if (!marking) return [markingId];
    const chain = [...ancestorsOf(this.project, markingId).reverse(), marking];
    return [
      this.imageLabel(marking.containerId),
      ...chain.map((m) => this.markingName(m.id)),
    ];
  }

  label(kind: ItemKind, id: string): string {
    const index = projectIndex(this.project);
    if (kind === 'i') return this.imageLabel(id);
    if (kind === 'm') return this.markingPath(id).join(PATH_SEPARATOR);
    const annotation = index.annotations.get(id);
    if (!annotation) return id;
    return [
      ...this.markingPath(annotation.markingId),
      annotationShortLabel(this.project, annotation),
    ].join(PATH_SEPARATOR);
  }

  /** Reference `mapping://<project>/<m|i|a>/<code>`: only the URL, with no readable path. */
  ref(kind: ItemKind, id: string): string {
    return formatRef({
      project: this.projectName,
      kind,
      code: shortCode(this.project, kind, id),
    });
  }
}

export interface ResolvedItem {
  readonly loaded: LoadedProject;
  readonly refs: Refs;
  readonly kind: ItemKind;
  /** With a sub-reference (field, pair or row), the id is that of the annotation that contains it. */
  readonly id: string;
  /** The part of the annotation the reference designates (`/f/`, `/e/` or `/r/`); absent in an item reference. */
  readonly sub?: SubRef;
}

/** Hint of `invalid-ref`: the strict format and what to do with the old one. */
export const INVALID_REF_HINT =
  'use the reference mapping://<project>/<m|i|a|p>/<code>, the URL only, with the project encoded (e.g. mapping://My%20Project/m/3f2a9c1e); references with the path in parentheses are of the old format: copy again from the app';

const ACCEPTED_FORMATS = [
  'mapping://project/m/3f2a9c1e',
  'm/3f2a9c1e (with the project given separately)',
  'the full id of the item (with the project given separately)',
];

/**
 * The projects to search: the reference's, the `project` argument's (the same, if both are
 * given) or all of those in the roots. Different projects in the reference and in the argument: `project-mismatch`.
 */
export async function candidateLocations(
  roots: Roots,
  refProject: string | null,
  projectArg: string | undefined,
): Promise<ProjectLocation[]> {
  if (refProject !== null && projectArg !== undefined) {
    const [fromRef, fromArg] = [
      await findProject(roots, refProject),
      await findProject(roots, projectArg),
    ];
    if (fromRef.dir !== fromArg.dir) {
      throw new ToolError(
        'project-mismatch',
        `the reference is from project "${fromRef.name}", but \`project\` indicates "${fromArg.name}"`,
      );
    }
    return [fromRef];
  }
  const named = refProject ?? projectArg;
  if (named !== undefined) return [await findProject(roots, named)];
  const all = await discoverProjects(roots);
  if (all.length === 0) {
    throw new ToolError('project-not-found', 'no project in the configured roots');
  }
  return all;
}

const WHAT_IS: Record<string, string> = {
  l: 'a layer',
  c: 'a conversation',
  part: 'an annotation part (field, pair or row)',
};

/**
 * The full grammar (decision 27): field, pair and row count as the annotation that contains them
 * (with the part in `sub`); layer (`l`) and conversation (`c`) are not items, and the item tools
 * refuse them with `wrong-kind`.
 */
function readExtended(
  refText: string,
  expected: ItemKind | undefined,
): { project: string | null; code: string; sub: SubRef | null } | null {
  const any = parseAnyRef(refText);
  if (!any) return null;
  const { ref } = any;
  if (ref.type === 'item') {
    if (ref.kind !== 'l' && ref.kind !== 'c') return null;
    throw new ToolError(
      'wrong-kind',
      `the reference is to ${WHAT_IS[ref.kind]}, not ${expected ? KIND_WITH_ARTICLE[expected] : 'an item'}`,
      { kind: ref.kind },
    );
  }
  if (expected && expected !== 'a') {
    throw new ToolError(
      'wrong-kind',
      `the reference is to ${WHAT_IS.part}, not ${KIND_WITH_ARTICLE[expected]}`,
      { kind: 'a' },
    );
  }
  return { project: any.project, code: ref.annotation, sub: ref };
}

/** The part (field, pair or row) must exist in the annotation; otherwise `not-found`. */
function checkSub(project: Project, sub: SubRef, refText: string): void {
  const resolution = resolveCitation({ project, threads: [], proposals: [] }, sub);
  if (resolution.found) return;
  throw new ToolError(
    resolution.reason === 'ambiguous' ? 'ambiguous-ref' : 'not-found',
    resolution.reason === 'ambiguous'
      ? 'the short code matches more than one pair or row: use a longer code'
      : `the annotation has no field, pair or row of ${refText}`,
    { ref: refText },
  );
}

/**
 * Interprets what the agent pasted (`ref`) and finds the item. Accepts the full reference, just
 * `m/code` with `project`, or the full id. With no project in the reference or in `project`, it searches
 * all those in the roots. Ambiguity (short code, homonymous projects) returns the candidates.
 * Field, pair and row (`…/a/<code>/f/<field>`, `/e/`, `/r/`) count as the annotation that contains them.
 */
export async function resolveItem(
  roots: Roots,
  refText: string,
  projectArg?: string,
  expected?: ItemKind,
): Promise<ResolvedItem> {
  const extended = readExtended(refText, expected);
  const parsed = extended
    ? { project: extended.project, kind: 'a' as const, code: extended.code }
    : parseRef(refText);
  const sub = extended?.sub ?? null;
  if (!parsed) {
    throw new ToolError('invalid-ref', `invalid reference: ${refText}`, {
      accepted: ACCEPTED_FORMATS,
      hint: INVALID_REF_HINT,
    });
  }
  if (expected && parsed.kind && parsed.kind !== expected) {
    throw new ToolError(
      'wrong-kind',
      `the reference is to ${KIND_WITH_ARTICLE[parsed.kind]}, not ${KIND_WITH_ARTICLE[expected]}`,
      { kind: parsed.kind },
    );
  }
  const kind = parsed.kind ?? expected ?? null;

  const named = parsed.project ?? projectArg;
  const locations = await candidateLocations(roots, parsed.project, projectArg);

  const searchingAll = named === undefined;
  const found: { loaded: LoadedProject; kind: ItemKind; id: string }[] = [];
  const unreadable: string[] = [];
  for (const location of locations) {
    let loaded: LoadedProject;
    try {
      loaded = await loadProject(roots, location);
    } catch (error) {
      if (!searchingAll || !(error instanceof ToolError)) throw error;
      unreadable.push(location.path);
      continue;
    }
    for (const match of matchShortCode(loaded.project, kind, parsed.code)) {
      found.push({ loaded, ...match });
    }
  }

  if (found.length === 1) {
    const [only] = found;
    const refs = new Refs(only!.loaded);
    if (sub) checkSub(refs.project, sub, refText);
    return { ...only!, refs, ...(sub ? { sub } : {}) };
  }
  if (found.length === 0) {
    throw new ToolError('not-found', `no item matches ${refText}`, {
      ref: refText,
      searched: locations.map((l) => l.path),
      ...(unreadable.length > 0 ? { unreadable } : {}),
    });
  }
  throw new ToolError(
    'ambiguous-ref',
    `${found.length} items start with that code: use the full reference of one of them`,
    {
      ref: refText,
      candidates: found.slice(0, 20).map((c) => {
        const refs = new Refs(c.loaded);
        return { ref: refs.ref(c.kind, c.id), dir: c.loaded.location.dir };
      }),
    },
  );
}
