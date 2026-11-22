import { BatchRuleError } from './batchMarkings';
import { ModelError } from './errors';
import { pageNameKey } from './invariants';
import { formatRef, matchShortCode, parseRef, shortCode, type ItemKind } from './itemRef';
import type { FloatingNearTarget } from './markings';
import { projectIndex } from './projectIndex';
import type { AnnotationTypeRef, Layer, Page, Project } from './types';

// How the MCP batch (and the plugin-result applier) turn what an operation cites into items: references
// (`mapping://<project>/<m|i|a>/<code>`), codes, ids, local aliases (`$name`), layers, types and pages.
// Pure over the project and a `RefContext` the caller provides for its aliases. What breaks throws a
// `BatchRuleError` with the batch's code and English message, which the batch rethrows unchanged.

/** The kind an alias can name. */
export type AliasKind = ItemKind | 'layer' | 'page' | 'row';

/** What the lookups need from the caller: its project's name and its aliases. */
export interface RefContext {
  readonly projectName: string;
  /** The item an alias (`$name`) names, of the kind asked; throws the caller's errors (unknown, other kind). */
  alias(name: string, kind: AliasKind): { readonly id: string };
  /** The container an alias names, or `undefined` (no error: `near`/`inside` fall back to a marking). */
  containerAlias(name: string): { readonly id: string } | undefined;
}

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

/** The kind an alias names, with its article, for the `wrong-kind` message. */
export function aliasKindLabel(kind: AliasKind): string {
  if (kind === 'row') return 'a table row';
  if (kind === 'layer') return 'a layer';
  if (kind === 'page') return 'a page';
  return KIND_WITH_ARTICLE[kind];
}

/** Hint of `invalid-ref`: the strict format and what to do with the old one. */
export const INVALID_REF_HINT =
  'use the reference mapping://<project>/<m|i|a|p>/<code>, the URL only, with the project encoded (e.g. mapping://My%20Project/m/3f2a9c1e); references with the path in parentheses are of the old format: copy again from the app';

/** Lowercase and without accents, to find layers and types by name. */
export function foldName(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Id of a marking, container or annotation of the project: alias, reference or id. */
export function resolveItem(
  rc: RefContext,
  p: Project,
  text: string,
  kind: ItemKind,
): string {
  const wanted = text.trim();
  if (wanted.startsWith('$')) return rc.alias(wanted, kind).id;
  const parsed = parseRef(wanted);
  if (!parsed) {
    throw new BatchRuleError('invalid-ref', `invalid reference: ${text}`, {
      hint: INVALID_REF_HINT,
    });
  }
  if (parsed.project !== null && parsed.project !== rc.projectName) {
    throw new BatchRuleError(
      'project-mismatch',
      `the reference is to project "${parsed.project}", not "${rc.projectName}"`,
    );
  }
  if (parsed.kind !== null && parsed.kind !== kind) {
    throw new BatchRuleError(
      'wrong-kind',
      `the reference is to ${KIND_WITH_ARTICLE[parsed.kind]}, not ${KIND_WITH_ARTICLE[kind]}`,
    );
  }
  const found = matchShortCode(p, kind, parsed.code);
  if (found.length === 1) return found[0]!.id;
  if (found.length === 0) {
    throw new BatchRuleError('not-found', `${KIND_NOT_FOUND[kind]}: ${text}`);
  }
  throw new BatchRuleError(
    'ambiguous-ref',
    `${found.length} items start with that code: use the full reference`,
    {
      candidates: found.slice(0, 20).map((f) =>
        formatRef({
          project: rc.projectName,
          kind: f.kind,
          code: shortCode(p, f.kind, f.id),
        }),
      ),
    },
  );
}

/** The layer by alias, id, `specId/layerId` of an applied specialization or name. */
export function resolveLayer(
  rc: RefContext,
  p: Project,
  text: string,
  fromSpec: (specId: string, layerId: string) => Layer | null,
): Layer {
  const wanted = text.trim();
  const index = projectIndex(p);
  if (wanted.startsWith('$')) {
    const layer = index.layers.get(rc.alias(wanted, 'layer').id);
    if (layer) return layer;
    throw new BatchRuleError('not-found', `the layer ${wanted} no longer exists`);
  }
  const byId = index.layers.get(wanted);
  if (byId) return byId;
  const slash = wanted.indexOf('/');
  if (slash > 0) {
    const found = fromSpec(wanted.slice(0, slash), wanted.slice(slash + 1));
    if (found) return found;
  }
  const byName = p.layers.filter((l) => foldName(l.name) === foldName(wanted));
  if (byName.length === 1) return byName[0]!;
  throw new BatchRuleError(
    byName.length > 1 ? 'ambiguous-layer' : 'not-found',
    byName.length > 1
      ? `there are ${byName.length} layers named "${text}": use the id`
      : `layer not found: ${text}`,
    { layers: p.layers.map((l) => ({ id: l.id, name: l.name })) },
  );
}

/** The annotation type by `specId/typeId`, then by type id, then by name. */
export function resolveType(p: Project, text: string): AnnotationTypeRef {
  const wanted = foldName(text);
  const matches = [...projectIndex(p).types.values()].filter(
    ({ spec, type }) =>
      foldName(`${spec.id}/${type.id}`) === wanted ||
      foldName(type.id) === wanted ||
      foldName(type.name) === wanted,
  );
  // Strongest first: `specId/typeId`, then the type `id`, then the name. A type named like the id of
  // another one (`notas/texto` is named "Text", `sdui/text` has the id `text`) does not make the id ambiguous.
  const tiers = [
    ({ spec, type }: (typeof matches)[number]) =>
      foldName(`${spec.id}/${type.id}`) === wanted,
    ({ type }: (typeof matches)[number]) => foldName(type.id) === wanted,
  ];
  const chosen =
    tiers.map((tier) => matches.filter(tier)).find((found) => found.length > 0) ??
    matches;
  if (chosen.length === 1) {
    return { specId: chosen[0]!.spec.id, typeId: chosen[0]!.type.id };
  }
  throw new BatchRuleError(
    chosen.length > 1 ? 'ambiguous-type' : 'unknown-type',
    chosen.length > 1
      ? `"${text}" exists in more than one specialization: use specId/typeId`
      : `annotation type not found: ${text} (see get_project and get_specialization)`,
    {
      types: [...projectIndex(p).types.values()]
        .slice(0, 50)
        .map(({ spec, type }) => `${spec.id}/${type.id}`),
    },
  );
}

/** Container or marking (or arrow, which is a marking for the reference), by alias, reference or id. */
export function resolveContainerOrMarking(
  rc: RefContext,
  p: Project,
  text: string,
): FloatingNearTarget {
  const wanted = text.trim();
  const index = projectIndex(p);
  if (wanted.startsWith('$')) {
    const target = rc.containerAlias(wanted);
    if (target) return { kind: 'container', id: target.id };
  } else {
    const parsed = parseRef(wanted);
    if (parsed?.kind === 'i') {
      return { kind: 'container', id: resolveItem(rc, p, wanted, 'i') };
    }
    if ((parsed === null || parsed.kind === null) && index.containers.has(wanted)) {
      return { kind: 'container', id: wanted };
    }
  }
  return { kind: 'marking', id: resolveItem(rc, p, wanted, 'm') };
}

/** Target of `near`: a container or a marking (never an arrow), by alias, reference or id. */
export function resolveNearTarget(
  rc: RefContext,
  p: Project,
  text: string,
): FloatingNearTarget {
  const target = resolveContainerOrMarking(rc, p, text);
  if (target.kind === 'marking' && projectIndex(p).arrows.has(target.id)) {
    throw new BatchRuleError('invalid-arguments', '`near` does not accept an arrow', {
      hint: 'provide a container or a marking',
    });
  }
  return target;
}

// ---------------------------------------------------------------------------
// pages

/** The page by id or, failing that, by name (case-insensitive); `page-not-found` lists the pages. */
export function findPageByIdOrName(p: Project, query: string): Page {
  const wanted = query.trim();
  const found =
    p.pages.find((g) => g.id === wanted) ??
    p.pages.find((g) => pageNameKey(g.name) === pageNameKey(wanted));
  if (found) return found;
  throw new BatchRuleError('page-not-found', `page not found: ${query}`, {
    pages: p.pages.map((g) => ({ id: g.id, name: g.name })),
    hint: 'pass the id or the name of a page; see `pages` in get_project',
  });
}

/** The page by alias (`$name` of an `add_page` in the batch), id or name. */
export function resolvePage(rc: RefContext, p: Project, text: string): Page {
  const wanted = text.trim();
  if (!wanted.startsWith('$')) return findPageByIdOrName(p, text);
  const id = rc.alias(wanted, 'page').id;
  const page = p.pages.find((g) => g.id === id);
  if (page) return page;
  throw new BatchRuleError('not-found', `the page ${wanted} no longer exists`);
}

/**
 * The page of a new root. `page` names it (and must agree with `implied`, the page that `container`, `near`,
 * `beside`, `inside` or an anchor already gave); without either, a project with more than one page
 * needs it (`page-required`) and with a single page the model takes that one (`undefined`).
 */
export function rootPageId(
  rc: RefContext,
  p: Project,
  pageText: string | undefined,
  implied: string | null,
): string | undefined {
  if (pageText === undefined) {
    if (implied !== null) return implied;
    if (p.pages.length > 1) throw new ModelError('page-required');
    return undefined;
  }
  const given = resolvePage(rc, p, pageText);
  if (implied !== null && implied !== given.id) {
    const other = p.pages.find((g) => g.id === implied);
    throw new BatchRuleError(
      'invalid-arguments',
      `\`page\` is "${given.name}", but \`container\`, \`near\`, \`beside\`, \`inside\` or \`anchor\` is on the page "${other?.name ?? implied}": drop \`page\` or name that page`,
      { hint: 'a new root goes to the page of what it is placed against' },
    );
  }
  return given.id;
}

/** `{ pageId }` of a new container (the reference container's page when `beside`); `{}` for the model's default. */
export function containerPageArg(
  rc: RefContext,
  p: Project,
  pageText: string | undefined,
  beside: string | undefined,
): { pageId?: string } {
  const implied =
    beside === undefined ? null : (projectIndex(p).pageOf.get(beside) ?? null);
  const pageId = rootPageId(rc, p, pageText, implied);
  return pageId === undefined ? {} : { pageId };
}

/** `page` of `create_marking`: only a canvas marking has one; the target of `near`, `inside` or the anchor gives it. */
export function markingRootPageId(
  rc: RefContext,
  p: Project,
  op: { readonly page: string | undefined; readonly near: string | undefined },
  containerId: string | null,
  reference: {
    readonly inside: string | null;
    readonly anchor: string | null;
    readonly nearUsed: boolean;
  },
): string | undefined {
  if (containerId !== null) {
    if (op.page !== undefined) {
      throw new BatchRuleError(
        'invalid-arguments',
        "`page` only applies to a canvas marking: a marking in a container has no page of its own (it is on its container's)",
      );
    }
    return undefined;
  }
  // An ignored `near` (non-floating type) stays a warning: it is not resolved here.
  const near =
    op.near === undefined || !reference.nearUsed
      ? null
      : resolveContainerOrMarking(rc, p, op.near).id;
  const ref = reference.inside ?? near ?? reference.anchor;
  const implied = ref === null ? null : (projectIndex(p).pageOf.get(ref) ?? null);
  return rootPageId(rc, p, op.page, implied);
}

// ---------------------------------------------------------------------------
// minimum size

/** Hint of `rect-too-small`: what to change. */
export const RECT_TOO_SMALL_HINT =
  "increase the `rect`'s `width` and `height` to at least the minimum (each side, in container pixels; on the canvas, in canvas units)";

function isSize(value: unknown): value is { width: number; height: number } {
  if (typeof value !== 'object' || value === null) return false;
  const { width, height } = value as Record<string, unknown>;
  return typeof width === 'number' && typeof height === 'number';
}

/** `received 5×3 px; minimum 8×8 px` from the `data` of a `rect-too-small`; `null` if it is missing. */
export function rectTooSmallDetail(
  data: Readonly<Record<string, unknown>> | undefined,
): string | null {
  if (!data || !isSize(data.received) || !isSize(data.min)) return null;
  const { received, min } = data;
  const origin = data.source === 'component' ? ' (from the component)' : '';
  return `received ${received.width}×${received.height} px; minimum ${min.width}×${min.height} px${origin}`;
}

/** Runs `run` and, when the rectangle ends below the component's minimum, reports what the minimum is. */
export function guardMinSize<T>(
  minSize: { readonly width: number; readonly height: number } | null,
  what: string,
  run: () => T,
): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ModelError && error.code === 'rect-too-small' && minSize) {
      const detail = rectTooSmallDetail(error.data);
      throw new BatchRuleError(
        error.code,
        `rectangle smaller than the minimum size of the component of ${what}: ${minSize.width}×${minSize.height} px`,
        {
          minSize: { width: minSize.width, height: minSize.height },
          ...(detail ? { detail } : {}),
          hint: RECT_TOO_SMALL_HINT,
        },
      );
    }
    throw error;
  }
}

/** `beside` of `add_container`: the id of the reference container; with `center` it is `invalid-arguments`. */
export function resolveBeside(
  op: { readonly beside?: string | undefined; readonly center?: unknown },
  container: (ref: string) => string,
): string | undefined {
  if (op.beside === undefined) return undefined;
  if (op.center !== undefined) {
    throw new BatchRuleError(
      'invalid-arguments',
      '`beside` and `center` are mutually exclusive: use `beside` to place the container next to another one, or `center` for a canvas point',
    );
  }
  return container(op.beside);
}

/** The id is an arrow's in a marking operation: the friendly error that points to the arrow's own operation. */
export function refuseArrowAsMarking(
  p: Project,
  id: string,
  tool: 'update_arrow' | 'delete_arrow',
): void {
  if (projectIndex(p).arrows.has(id)) {
    throw new BatchRuleError(
      'wrong-kind',
      'the reference is to an arrow, not to a marking',
      { hint: `use ${tool} for the arrow` },
    );
  }
}
