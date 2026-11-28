import { creationParents } from './creationRule';
import { descendantsOf } from './hierarchy';
import { fail } from './errors';
import { containsRect, imagePixelRect, translateRect } from './geometry';
import { settleFrom, type SettleOptions } from './hierarchySettle';
import type { ItemKind } from './itemRef';
import { materializedIds } from './nature';
import { projectIndex } from './projectIndex';
import { withoutSlot } from './settleStructure';
import { firstPageId } from './spaces';
import type { NatureOptions } from './structure';
import type {
  Annotation,
  Arrow,
  JsonValue,
  Marking,
  Project,
  ProjectContainer,
  TypedValues,
} from './types';

// Data that Ctrl+C writes to the clipboard besides the reference text, in an app-specific format
// (custom web format, ignored by other programs; the data travels with the text only when the
// `clipboard-read` permission is already granted, otherwise only the text). For now it only
// travels: the idea is, in the future, to duplicate items with Ctrl+C / Ctrl+V inside the app.
// Pure functions.

/** MIME type of the app-specific format; in the `ClipboardItem` it goes with the `web ` prefix. */
export const ITEM_CLIPBOARD_MIME = 'application/x-mapping-item+json';

/** Format identifier, so that whoever reads the pasted data can recognize it. */
export const ITEM_CLIPBOARD_FORMAT = 'mapping-item';

export interface ItemClipboardData {
  readonly format: typeof ITEM_CLIPBOARD_FORMAT;
  readonly version: 1;
  /** Name of the project folder the item came from. */
  readonly project: string;
  /** The `mapping://…` reference copied along. */
  readonly ref: string;
  readonly kind: ItemKind;
  /** The copied item. */
  readonly item: ProjectContainer | Marking | Arrow | Annotation;
  /** Container: all its markings. Marking: its descendants. */
  readonly markings: readonly Marking[];
  /** Annotations of the copied item and of everything it carries with it. */
  readonly annotations: readonly Annotation[];
}

/**
 * The item and what it carries: a container carries its markings and annotations; a marking,
 * its descendants and the annotations of all; an arrow (it shares the `kind` `m` with the
 * markings), itself and its annotations; an annotation, only itself.
 */
export function itemClipboardData(
  p: Project,
  kind: ItemKind,
  id: string,
  extra: { readonly project: string; readonly ref: string },
): ItemClipboardData {
  const base = { format: ITEM_CLIPBOARD_FORMAT, version: 1, kind, ...extra } as const;
  if (kind === 'a') {
    const item = p.annotations.find((a) => a.id === id) ?? fail('not-found', id);
    return { ...base, item, markings: [], annotations: [] };
  }
  if (kind === 'i') {
    const item = p.containers.find((i) => i.id === id) ?? fail('not-found', id);
    const markings = p.markings.filter((m) => m.containerId === id);
    return { ...base, item, markings, annotations: annotationsOf(p, markings) };
  }
  const arrow = p.arrows.find((a) => a.id === id);
  if (arrow) {
    return {
      ...base,
      item: arrow,
      markings: [],
      annotations: p.annotations.filter((a) => a.markingId === id),
    };
  }
  const item = p.markings.find((m) => m.id === id) ?? fail('not-found', id);
  const markings = descendantsOf(p, id);
  return { ...base, item, markings, annotations: annotationsOf(p, [item, ...markings]) };
}

function annotationsOf(p: Project, markings: readonly Marking[]): Annotation[] {
  const ids = new Set(markings.map((m) => m.id));
  return p.annotations.filter((a) => ids.has(a.markingId));
}

// ---------------------------------------------------------------------------
// Duplicate and paste (stage #3087, decision 10): what a copy does with the structure

/** Makes the ids of the copies: markings, annotations, tuples and table rows. */
export interface CopyIds {
  readonly newId: () => string;
}

/** Where a paste lands: the space, the page of a canvas, and the top-left corner of the pasted marking. */
export interface PasteTarget {
  readonly containerId: string | null;
  /** Page of a canvas paste (default: the copied marking's, else the first). Ignored in a container. */
  readonly pageId?: string | null;
  readonly at: { readonly x: number; readonly y: number };
}

export type CopyOptions = SettleOptions & NatureOptions;

/** The table rows of typed values get new ids (references to the originals stay as they are). */
function withNewRowIds(values: TypedValues | null, ids: CopyIds): TypedValues | null {
  if (values === null) return null;
  const fresh = (v: JsonValue): JsonValue => {
    if (
      !Array.isArray(v) ||
      !v.every((r) => typeof r === 'object' && r !== null && '_id' in r)
    ) {
      return v;
    }
    return v.map((row) => ({
      ...(row as { readonly [k: string]: JsonValue }),
      _id: ids.newId(),
    }));
  };
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, fresh(v)]));
}

/** The copies of the marking `root`, its subtree and the annotations of all, with new ids. */
function copiesOf(
  root: Marking,
  subtree: readonly Marking[],
  annotations: readonly Annotation[],
  ids: CopyIds,
): { readonly markings: Marking[]; readonly annotations: Annotation[] } {
  const marking = new Map([root, ...subtree].map((m) => [m.id, ids.newId()] as const));
  const annotation = new Map(annotations.map((a) => [a.id, ids.newId()] as const));
  return {
    markings: [root, ...subtree].map((m) => {
      const { anchor, ...rest } = m;
      void anchor;
      const parent =
        m.id === root.id ? m.parentId : (marking.get(m.parentId ?? '') ?? null);
      return { ...rest, id: marking.get(m.id) as string, parentId: parent, source: null };
    }),
    annotations: annotations.map((a) => ({
      ...a,
      id: annotation.get(a.id) as string,
      markingId: marking.get(a.markingId) as string,
      parentAnnotationId: annotation.get(a.parentAnnotationId ?? '') ?? null,
      entries: a.entries.map((e) => ({ ...e, id: ids.newId() })),
      values: withNewRowIds(a.values, ids),
    })),
  };
}

/** The copies moved to `space` and by `(dx, dy)`; a container space must hold them all. */
function placedCopies(
  p: Project,
  markings: readonly Marking[],
  space: Pick<Marking, 'containerId' | 'pageId'>,
  dx: number,
  dy: number,
): Marking[] {
  const container =
    space.containerId === null
      ? undefined
      : projectIndex(p).containers.get(space.containerId);
  return markings.map((m) => {
    const rect = translateRect(m.rect, dx, dy);
    if (container && !containsRect(imagePixelRect(container), rect))
      fail('rect-out-of-image', m.id);
    return { ...m, containerId: space.containerId, pageId: space.pageId, rect };
  });
}

/**
 * The new marking (the first of `copies`) takes a parent: the original's, stored and with its slot, when `keep`;
 * otherwise a materialized one takes once what the geometry gives (the creation rule) and an observation one is
 * left to the settle.
 */
function structuredCopy(
  next: Project,
  rootId: string,
  keep: Marking | null,
  options: CopyOptions,
): Project {
  const root = projectIndex(next).markings.get(rootId) as Marking;
  if (!materializedIds(next).has(rootId)) return next;
  const parentId =
    keep === null ? (creationParents(next, [rootId]).get(rootId) ?? null) : keep.parentId;
  const slot =
    keep !== null
      ? keep.slot
      : parentId === null
        ? undefined
        : options.slotOf?.(
            {
              ...next,
              markings: next.markings.map((m) =>
                m.id === rootId ? { ...m, parentId } : m,
              ),
            },
            parentId,
            rootId,
          );
  const stored =
    slot === undefined ? withoutSlot({ ...root, parentId }) : { ...root, parentId, slot };
  return { ...next, markings: next.markings.map((m) => (m.id === rootId ? stored : m)) };
}

/** The copy of `item` and its subtree inserted at `index` of the array, structured, and settled. */
function insertCopy(
  p: Project,
  data: Pick<ItemClipboardData, 'markings' | 'annotations'> & { readonly item: Marking },
  ids: CopyIds,
  where: {
    readonly space: Pick<Marking, 'containerId' | 'pageId'>;
    readonly dx: number;
    readonly dy: number;
    readonly keep: Marking | null;
    readonly after: number | null;
  },
  options: CopyOptions,
): Project {
  const copy = copiesOf(data.item, data.markings, data.annotations, ids);
  const markings = placedCopies(p, copy.markings, where.space, where.dx, where.dy);
  const list = [...p.markings];
  list.splice(where.after === null ? list.length : where.after + 1, 0, ...markings);
  const next = structuredCopy(
    { ...p, markings: list, annotations: [...p.annotations, ...copy.annotations] },
    (markings[0] as Marking).id,
    where.keep,
    options,
  );
  return settleFrom(p, next, options);
}

/** The marking with its subtree and their annotations, as the clipboard data carries them. */
function subtreeData(p: Project, markingId: string): Parameters<typeof insertCopy>[1] {
  const index = projectIndex(p);
  const item = index.markings.get(markingId) ?? fail('not-found', markingId);
  const markings = descendantsOf(p, markingId);
  const owners = new Set([markingId, ...markings.map((m) => m.id)]);
  return {
    item,
    markings,
    annotations: p.annotations.filter((a) => owners.has(a.markingId)),
  };
}

/**
 * Duplicates the marking and its subtree (decision 10) in the same space, moved by `offset`. The copy keeps the
 * parent and the slot of the original (a materialized one stores them; an observation one gets its parent from
 * the geometry) and sits right after it among its siblings. The annotations are copied with new ids.
 */
export function duplicateMarking(
  p: Project,
  markingId: string,
  ids: CopyIds,
  offset: { readonly dx: number; readonly dy: number },
  options: CopyOptions = {},
): Project {
  const data = subtreeData(p, markingId);
  const original = data.item;
  return insertCopy(
    p,
    data,
    ids,
    {
      space: original,
      dx: offset.dx,
      dy: offset.dy,
      keep: original,
      after: p.markings.findIndex((m) => m.id === markingId),
    },
    options,
  );
}

/** The marking the clipboard data carries (a marking, not a container, an arrow or an annotation). */
function copiedMarking(data: ItemClipboardData): Marking {
  const item = data.item;
  if (data.kind !== 'm' || !('rect' in item) || !('containerId' in item))
    fail('not-found', data.ref);
  return item as Marking;
}

/** The space the paste lands in: the target container, or the canvas page. */
function pasteSpace(
  p: Project,
  origin: Marking,
  target: PasteTarget,
): Pick<Marking, 'containerId' | 'pageId'> {
  if (target.containerId !== null)
    return { containerId: target.containerId, pageId: null };
  return { containerId: null, pageId: target.pageId ?? origin.pageId ?? firstPageId(p) };
}

/**
 * Pastes the copied marking and its subtree (`data` of `itemClipboardData`) at `target`. It keeps the parent and the
 * slot when it lands in the same space and the parent exists; otherwise a materialized marking takes the parent the
 * geometry gives once (the creation rule) and an observation marking, the one from the geometry. It goes after the
 * last marking of the array, so after its siblings.
 */
export function pasteMarking(
  p: Project,
  data: ItemClipboardData,
  target: PasteTarget,
  ids: CopyIds,
  options: CopyOptions = {},
): Project {
  const origin = copiedMarking(data);
  const space = pasteSpace(p, origin, target);
  const parent =
    origin.parentId === null ? undefined : projectIndex(p).markings.get(origin.parentId);
  const sameSpace =
    origin.containerId === space.containerId && origin.pageId === space.pageId;
  return insertCopy(
    p,
    { item: origin, markings: data.markings, annotations: data.annotations },
    ids,
    {
      space,
      dx: target.at.x - origin.rect.x,
      dy: target.at.y - origin.rect.y,
      keep: sameSpace && parent !== undefined ? origin : null,
      after: null,
    },
    options,
  );
}
