import { descendantsOf } from './hierarchy';
import { fail } from './errors';
import type { ItemKind } from './itemRef';
import type { Annotation, Arrow, Marking, Project, ProjectContainer } from './types';

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
