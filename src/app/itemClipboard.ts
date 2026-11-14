// "Copy reference" and "Copy crop": what Ctrl+C, Ctrl+Alt+C and the menus do.
// The reference (`mapping://<folder>/<m|i|a>/<code>`, just the URL) is what the dev pastes in the
// chat for the agent (MCP) to find the item; it only exists in projects opened from a folder.
import { t } from '../i18n';
import {
  ITEM_CLIPBOARD_MIME,
  citationUrl,
  formatRef,
  isBackgroundContainer,
  itemClipboardData,
  shortCodes,
  type CitationTarget,
  type ItemKind,
  type Project,
  type Thread,
} from '../model';
import { cropToPng } from '../storage/imageCrop';
import { resolveSelection, showToast, type Selection } from '../store/ui';
import type { EditorContextValue } from '../ui/EditorContext';
import { writeClipboardPng, writeClipboardText } from '../utils/clipboard';
import { reportError } from '../utils/report';

/**
 * Marking (`m`), container (`i`) or annotation (`a`): the targets with their own data in the copy.
 */
export interface ItemCopyTarget {
  readonly kind: ItemKind;
  readonly id: string;
}

/** Typed field, pair or table row of an annotation (CM5, decision 32). */
export type PropertyCopyTarget = Extract<
  CitationTarget,
  { readonly kind: 'field' | 'entry' | 'row' }
>;

/** Layer (`l/`) or thread (`c/`): just the URL, without the item's data. */
export type NodeCopyTarget = Extract<
  CitationTarget,
  { readonly kind: 'layer' | 'thread' }
>;

export type CopyTarget = ItemCopyTarget | PropertyCopyTarget | NodeCopyTarget;

/** Is the target an item (marking, container or annotation)? */
export function isItemTarget(
  target: CopyTarget | CitationTarget,
): target is ItemCopyTarget {
  return target.kind === 'm' || target.kind === 'i' || target.kind === 'a';
}

const ITEM_CITATION_KIND = {
  m: 'marking',
  i: 'container',
  a: 'annotation',
} as const satisfies Record<ItemKind, 'marking' | 'container' | 'annotation'>;

/** The copy target as a citation target (what `insertCitation` and `citationUrl` understand). */
export function citationTargetOf(target: CopyTarget | CitationTarget): CitationTarget {
  return isItemTarget(target)
    ? { kind: ITEM_CITATION_KIND[target.kind], id: target.id }
    : target;
}

/** Only folder projects have a `<project>` that the MCP finds. */
export function canCopyItems(editor: Pick<EditorContextValue, 'session'>): boolean {
  return editor.session.storage.folderName !== undefined;
}

export function targetOfSelection(selection: Selection): ItemCopyTarget | null {
  if (!selection) return null;
  return { kind: selection.kind === 'image' ? 'i' : 'm', id: selection.id };
}

/** Annotation in focus: the focus is inside its card (outside the fields, handled before). */
export function focusedAnnotationTarget(): ItemCopyTarget | null {
  const card = document.activeElement?.closest('[data-annotation]');
  const id = card?.getAttribute('data-annotation');
  return id ? { kind: 'a', id } : null;
}

/** The value of the attribute on the element or on the nearest ancestor that has it. */
function attributeAbove(el: Element | null, attribute: string): string | null {
  return el?.closest(`[${attribute}]`)?.getAttribute(attribute) ?? null;
}

/**
 * Property in focus, the most specific: a table row (`data-row-id`) outweighs the
 * field (`data-field`) it is in, and the pair (`data-entry`) takes precedence over the field. All
 * inside the annotation card (`data-annotation`); outside it, or with no focus, there is no target.
 */
export function focusedPropertyTarget(): PropertyCopyTarget | null {
  const active = document.activeElement;
  const annotationId = attributeAbove(active, 'data-annotation');
  if (!annotationId) return null;
  const key = attributeAbove(active, 'data-field');
  const rowId = attributeAbove(active, 'data-row-id');
  if (key && rowId) return { kind: 'row', annotationId, key, rowId };
  const entryId = attributeAbove(active, 'data-entry');
  if (entryId) return { kind: 'entry', annotationId, entryId };
  return key ? { kind: 'field', annotationId, key } : null;
}

/**
 * The Ctrl+C of a property with the focus in a text field: only with no text selected in it
 * (with a selection, it belongs to the field) and never in the rich text editor
 * (`contentEditable`).
 */
export function copyKeyBelongsToProperty(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.isContentEditable) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.selectionStart === target.selectionEnd;
  }
  return true;
}

/**
 * "Copy crop" only exists for an image marking with a file (not for a container without a file).
 */
export function canCopyCrop(project: Project | null, markingId: string): boolean {
  const marking = project?.markings.find((m) => m.id === markingId);
  // Canvas marking (`containerId` null): there is no image to crop.
  if (!marking || marking.containerId === null) return false;
  const image = project?.containers.find((i) => i.id === marking.containerId);
  return image !== undefined && !isBackgroundContainer(image);
}

/**
 * Text of the reference and the item's data in the app's own format; `null` if the target vanished.
 * The property, the layer and the thread carry only the URL (`data` empty): there is no item to
 * paste.
 */
export function buildReference(
  project: Project,
  folderName: string,
  target: CopyTarget,
  threads: readonly Thread[] = [],
): { readonly text: string; readonly data: string | null } | null {
  if (!isItemTarget(target)) {
    const url = citationUrl(folderName, project, threads, target);
    return url === null ? null : { text: url, data: null };
  }
  const code = shortCodes(project, target.kind).get(target.id);
  if (code === undefined) return null;
  const text = formatRef({ project: folderName, kind: target.kind, code });
  const data = itemClipboardData(project, target.kind, target.id, {
    project: folderName,
    ref: text,
  });
  return { text, data: JSON.stringify(data) };
}

/**
 * Copies the item's reference (and, with it, its data) and notifies. `false` if it did not copy.
 */
export async function copyReference(
  editor: EditorContextValue,
  target: CopyTarget,
): Promise<boolean> {
  const { store, session, ui } = editor;
  const project = store.committed.peek();
  const folderName = session.storage.folderName;
  if (!project || folderName === undefined) return false;
  const reference = buildReference(
    project,
    folderName,
    target,
    session.threads.list.peek(),
  );
  const ok =
    reference !== null &&
    (await writeClipboardText(
      reference.text,
      reference.data === null
        ? undefined
        : { mime: ITEM_CLIPBOARD_MIME, data: reference.data },
    ));
  showToast(ui, t(ok ? 'copy.referenceDone' : 'copy.failed'));
  return ok;
}

/**
 * Copies the marking's crop as a PNG (pixels of the original image, up to 2048 px) and notifies.
 */
export async function copyCrop(
  editor: EditorContextValue,
  markingId: string,
): Promise<boolean> {
  const { store, session, ui } = editor;
  const project = store.committed.peek();
  const marking = project?.markings.find((m) => m.id === markingId);
  const image = marking && project?.containers.find((i) => i.id === marking.containerId);
  // A container without a file has no file to crop.
  if (!marking || !image || image.file === null) return false;
  const file = image.file;
  const png = (async () => {
    const data = await session.readImage(file);
    if (!data) throw new Error(`image file missing: ${file}`);
    return cropToPng(data, marking.rect);
  })();
  // The error is handled below; without this a refusal of `write` would leave the promise dangling.
  png.catch((e: unknown) => reportError('copy.crop', e));
  const ok = await writeClipboardPng(png);
  showToast(ui, t(ok ? 'copy.cropDone' : 'copy.cropFailed'));
  return ok;
}

/**
 * What Ctrl+C would copy now: the property in focus (row, pair or field), the annotation in focus
 * or, otherwise, the selection.
 */
export function copyShortcutTarget(editor: EditorContextValue): CopyTarget | null {
  const property = focusedPropertyTarget();
  if (property) return property;
  const annotation = focusedAnnotationTarget();
  if (annotation) return annotation;
  const selection = editor.ui.selection.peek();
  const exists = resolveSelection(editor.store.committed.peek(), selection) !== null;
  return exists ? targetOfSelection(selection) : null;
}
