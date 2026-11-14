import { batch, effect, signal, type Signal } from '@preact/signals';
import {
  projectIndex,
  spaceOf,
  type Annotation,
  type Arrow,
  type Layer,
  type Marking,
  type Project,
  type ProjectContainer,
  type Space,
  type SpecNoticeKind,
  type ThreadAnchor,
  type ThreadStatusFilter,
} from '../model';
import { VIEW_SHOW_START, type ViewShow } from './viewMode';

/**
 * **Primary** item of the selection (the last one clicked): what Details, the breadcrumb, the
 * handles and the single-item shortcuts use. `null` = nothing selected. The whole selection (ME2)
 * is `selectedItems(ui)`: the primary plus the others in `selectionGroup`.
 */
export type Selection =
  | { readonly kind: 'image'; readonly id: string }
  | { readonly kind: 'marking'; readonly id: string }
  | { readonly kind: 'arrow'; readonly id: string }
  | null;

/** A selection item: a container (`image`), a marking or an arrow (v13). */
export type SelectionItem = NonNullable<Selection>;

/**
 * The other items of the multiple selection, tied to the primary they were gathered with. Only
 * valid while `primary` is **the same object** as `selection`: any direct write to
 * `ui.selection` (plain click, create, go to an annotation) undoes the group by itself, without
 * every writer needing to know about multiple selection.
 */
export interface SelectionGroup {
  readonly primary: SelectionItem;
  /** In the order they joined; never contains the primary. */
  readonly others: readonly SelectionItem[];
}

/** Navigate: touch selects, drag moves or pans. Draw: drag creates markings. */
export type EditorMode = 'navigate' | 'draw';

/**
 * Editor UI state: it does not go into the JSON or the undo.
 * The viewport stays with the `CanvasController`, which is what changes it.
 */
export interface EditorUi {
  readonly selection: Signal<Selection>;
  /** Multiple selection: the other items besides the primary (see `SelectionGroup`). */
  readonly selectionGroup: Signal<SelectionGroup | null>;
  readonly mode: Signal<EditorMode>;
  /**
   * View mode (Alt+H): the canvas is only for viewing and shows what `viewShow` chooses. It is not
   * a preference: it is born off with each project's editor and is not saved.
   */
  readonly viewMode: Signal<boolean>;
  /** What view mode shows (`store/viewMode.ts`); kept per project copy. */
  readonly viewShow: Signal<ViewShow>;
  /** The "Show on canvas" panel is open (opens on entering the mode, closes on leaving). */
  readonly viewPanel: Signal<boolean>;
  /**
   * Hidden layers. Storing the hidden ones (and not the visible ones) makes new layers,
   * or ones restored by undo, appear visible by default.
   */
  readonly hiddenLayers: Signal<ReadonlySet<string>>;
  /** List view: also show markings with no annotation in the visible layers. */
  readonly listShowEmpty: Signal<boolean>;
  /**
   * List view: only incomplete annotations (docs/ARCHITECTURE.md, "Specializations in the project
   * and typed annotations").
   */
  readonly listIncompleteOnly: Signal<boolean>;
  /** Incomplete window: only the pending items of the visible layers (B5). */
  readonly incompleteVisibleOnly: Signal<boolean>;
  /** Warnings window: only the warnings of one `kind` (`null` = all). */
  readonly noticeKind: Signal<SpecNoticeKind | null>;
  /** Warnings window: only the warnings some annotation uses (unchecked shows the unused ones). */
  readonly noticesInUseOnly: Signal<boolean>;
  /** Warnings window: only the annotations of the visible layers. */
  readonly noticesVisibleOnly: Signal<boolean>;
  /** Annotation to scroll to (and focus) in the panel as soon as it appears. */
  readonly focusAnnotation: Signal<string | null>;
  /** Collapsed nodes of the Tree window (`treeKey`); empty = all open. */
  readonly collapsedTree: Signal<ReadonlySet<string>>;
  /**
   * Field of the annotation in `focusAnnotation` that receives focus (link from a pending item):
   * the field's `data-focus` (`owner`, the field key or `key:row:column`).
   */
  readonly focusField: Signal<string | null>;
  /**
   * Collapsed sections of Details (B15): the marking's, the annotations', each layer
   * and each annotation (`sectionKey`). Holds for the session: collapsing a layer holds in
   * all markings.
   */
  readonly collapsed: Signal<ReadonlySet<string>>;
  /** Short notice over the canvas ("Reference copied"); disappears by itself (`showToast`). */
  readonly toast: Signal<string | null>;
  /** Canvas context menu (right click): where to open (screen) and the item under the cursor. */
  readonly canvasMenu: Signal<CanvasMenu | null>;
  /** Proposal review: legend of the canvas marks open (shortcut L). */
  readonly reviewLegend: Signal<boolean>;
  /** Review: before/after comparison of the replaced image open (image id). */
  readonly compareImage: Signal<string | null>;
  /**
   * Selected thread (Comments stage, decision 19), tied to the selection it was chosen in:
   * only valid while `selection` is the same object (`selectedThreadId`), like the multiple
   * selection group. Never saved.
   */
  readonly thread: Signal<SelectedThread | null>;
  /** Message drafts by key (`threadDraftKey`), in memory: they survive a selection change. */
  readonly threadDrafts: Signal<ReadonlyMap<string, string>>;
  /** New thread in draft (nothing saved until the first Send) and where it will go. */
  readonly composing: Signal<ComposingThread | null>;
  /** Comments window: status, user and search filters (decision 21). */
  readonly commentsStatus: Signal<ThreadStatusFilter>;
  readonly commentsUser: Signal<string>;
  readonly commentsText: Signal<string>;
  /**
   * "Only those citing the selection" filter (decision 34): with an item selected, the window shows
   * the threads anchored to it or that cite it. UI state: born off and not saved.
   */
  readonly commentsCiteSelection: Signal<boolean>;
  /**
   * Thread pins on the canvas (decision 24): born off on each editor open and never
   * saved. Only the Threads button turns it off; Comment, Comment here and New thread turn it on.
   */
  readonly commentPins: Signal<boolean>;
  /**
   * Comment button armed (decision 25): the next click on the canvas opens the draft. It keeps the
   * previous tool, to return to it after the click or Esc.
   */
  readonly commentArm: Signal<ArmedComment | null>;
}

/** The placement of a Comment button click and the tool that returns after it. */
export interface ArmedComment {
  readonly mode: EditorMode;
}

/** The new thread draft and the selection it is valid for. */
export interface ComposingThread {
  readonly anchor: ThreadAnchor;
  readonly selection: Selection;
}

/** The chosen thread and the selection it is valid for. */
export interface SelectedThread {
  readonly id: string;
  readonly selection: Selection;
}

export interface CanvasMenu {
  /** Cursor position in the window (`clientX`/`clientY`). */
  readonly x: number;
  readonly y: number;
  /** `i` = container, `m` = marking, `arrow` = arrow (v13); `null` in an empty place. */
  readonly target: { readonly kind: 'i' | 'm' | 'arrow'; readonly id: string } | null;
  /** Anchor of the item under the cursor, for the menu's Comment (decision 25); `null` in the empty. */
  readonly comment?: ThreadAnchor | null;
  /** The point under the cursor, for Comment here (container or canvas); `null` over a marking/arrow. */
  readonly here?: Extract<ThreadAnchor, { kind: 'point' }> | null;
}

export function createEditorUi(): EditorUi {
  const ui = buildEditorUi();
  // Changing the selection forgets the chosen thread and the new-thread draft (stage #940,
  // decision 3): without that, the empty selection that comes back would make the comparison valid
  // again. The draft text stays in `threadDrafts`. The instance lives as long as the app, never
  // unsubscribed.
  effect(() => {
    const selection = ui.selection.value;
    const chosen = ui.thread.peek();
    if (chosen !== null && chosen.selection !== selection) ui.thread.value = null;
    const draft = ui.composing.peek();
    if (draft !== null && draft.selection !== selection) ui.composing.value = null;
  });
  return ui;
}

function buildEditorUi(): EditorUi {
  return {
    selection: signal<Selection>(null),
    selectionGroup: signal<SelectionGroup | null>(null),
    mode: signal<EditorMode>('navigate'),
    viewMode: signal<boolean>(false),
    viewShow: signal<ViewShow>(VIEW_SHOW_START),
    viewPanel: signal<boolean>(false),
    hiddenLayers: signal<ReadonlySet<string>>(new Set()),
    listShowEmpty: signal<boolean>(false),
    listIncompleteOnly: signal<boolean>(false),
    incompleteVisibleOnly: signal<boolean>(false),
    noticeKind: signal<SpecNoticeKind | null>(null),
    noticesInUseOnly: signal<boolean>(true),
    noticesVisibleOnly: signal<boolean>(false),
    focusAnnotation: signal<string | null>(null),
    collapsedTree: signal<ReadonlySet<string>>(new Set()),
    focusField: signal<string | null>(null),
    collapsed: signal<ReadonlySet<string>>(new Set()),
    toast: signal<string | null>(null),
    canvasMenu: signal<CanvasMenu | null>(null),
    reviewLegend: signal<boolean>(false),
    compareImage: signal<string | null>(null),
    thread: signal<SelectedThread | null>(null),
    threadDrafts: signal<ReadonlyMap<string, string>>(new Map()),
    composing: signal<ComposingThread | null>(null),
    commentsStatus: signal<ThreadStatusFilter>('open'),
    commentsUser: signal<string>(''),
    commentsText: signal<string>(''),
    commentsCiteSelection: signal<boolean>(false),
    commentPins: signal<boolean>(false),
    commentArm: signal<ArmedComment | null>(null),
  };
}

// ---------------------------------------------------------------------------
// Multiple selection (ME2): an ordered set of items with a primary, the last one clicked.

/** Same item (same kind and id). */
export function sameItem(a: SelectionItem | null, b: SelectionItem | null): boolean {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id;
}

/** Key of an item for `Set`/`Map` (`kind:id`). */
const itemKey = (item: SelectionItem): string => `${item.kind}:${item.id}`;

/** The whole selection from the primary and the group: the others first, the primary last. */
export function itemsOf(
  selection: Selection,
  group: SelectionGroup | null,
): readonly SelectionItem[] {
  if (!selection) return [];
  if (group === null || group.primary !== selection) return [selection];
  return [...group.others, selection];
}

/** Selected items, with the primary last. Reads the signals with `.value` (reactive). */
export function selectedItems(ui: EditorUi): readonly SelectionItem[] {
  return itemsOf(ui.selection.value, ui.selectionGroup.value);
}

/** Like `selectedItems`, without subscribing (event handlers). */
export function peekSelectedItems(ui: EditorUi): readonly SelectionItem[] {
  return itemsOf(ui.selection.peek(), ui.selectionGroup.peek());
}

/** Is the item in the selection? */
export function isItemSelected(
  items: readonly SelectionItem[],
  item: SelectionItem,
): boolean {
  return items.some((i) => sameItem(i, item));
}

/**
 * Replaces the whole selection: the **last** item is the primary. Repeats appear only once (at the
 * last position where they appear). Empty list = nothing selected.
 */
export function selectItems(ui: EditorUi, items: readonly SelectionItem[]): void {
  const unique: SelectionItem[] = [];
  const keys = new Set<string>();
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as SelectionItem;
    if (keys.has(itemKey(item))) continue;
    keys.add(itemKey(item));
    unique.unshift(item);
  }
  const primary = unique.at(-1);
  batch(() => {
    if (!primary) {
      ui.selection.value = null;
      ui.selectionGroup.value = null;
      return;
    }
    // A new object: the group is tied to it, and a later direct write undoes it.
    const fresh: SelectionItem = { kind: primary.kind, id: primary.id };
    ui.selection.value = fresh;
    ui.selectionGroup.value =
      unique.length > 1 ? { primary: fresh, others: unique.slice(0, -1) } : null;
  });
}

/**
 * Shift+click: removes the item from the selection if it is in it (the primary becomes the last of
 * those that remain) or adds it as the primary.
 */
export function toggleSelectedItem(ui: EditorUi, item: SelectionItem): void {
  const items = peekSelectedItems(ui);
  if (isItemSelected(items, item)) {
    selectItems(
      ui,
      items.filter((i) => !sameItem(i, item)),
    );
  } else {
    selectItems(ui, [...items, item]);
  }
}

/**
 * Rectangle selection (Shift+drag): adds `items` to the selection without removing anything. The
 * current primary stays; with no prior selection, the primary is the first of the new ones. Those
 * already selected are ignored and, with nothing new, nothing is written.
 */
export function addSelectedItems(ui: EditorUi, items: readonly SelectionItem[]): void {
  const current = peekSelectedItems(ui);
  const known = new Set(current.map(itemKey));
  const fresh = items.filter((item) => {
    const key = itemKey(item);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  const [first, ...rest] = fresh;
  if (!first) return;
  selectItems(ui, current.length > 0 ? [...fresh, ...current] : [...rest, first]);
}

/** Esc with several items: only the primary remains. Returns `true` if there were other items. */
export function collapseToPrimary(ui: EditorUi): boolean {
  if (peekSelectedItems(ui).length < 2) return false;
  ui.selectionGroup.value = null;
  return true;
}

/** The items that still exist in the project (after undo, one may be gone). */
export function existingItems(
  project: Project | null,
  items: readonly SelectionItem[],
): readonly SelectionItem[] {
  if (!project) return [];
  const index = projectIndex(project);
  return items.filter((i) =>
    i.kind === 'image'
      ? index.containers.has(i.id)
      : i.kind === 'arrow'
        ? index.arrows.has(i.id)
        : index.markings.has(i.id),
  );
}

/**
 * Turns view mode on or off. Turning on goes back to Navigate and opens the "Show on
 * canvas" panel; turning off closes it and does not touch the mode.
 */
export function setViewMode(ui: EditorUi, on: boolean): void {
  if (on && ui.mode.peek() === 'draw') ui.mode.value = 'navigate';
  ui.viewMode.value = on;
  ui.viewPanel.value = on;
}

/** How long the short notice stays on screen. */
export const TOAST_MS = 2500;

const toastTimers = new WeakMap<EditorUi, ReturnType<typeof setTimeout>>();

/** Shows a short notice over the canvas; a new notice replaces the previous one. */
export function showToast(ui: EditorUi, text: string, duration = TOAST_MS): void {
  clearTimeout(toastTimers.get(ui));
  ui.toast.value = text;
  toastTimers.set(
    ui,
    setTimeout(() => {
      ui.toast.value = null;
      toastTimers.delete(ui);
    }, duration),
  );
}

/** Collapsible sections of Details. */
export type DetailsSection =
  | {
      readonly kind:
        | 'marking'
        | 'anchor'
        | 'image'
        | 'arrow'
        | 'arrowLinks'
        | 'perspectives'
        | 'annotations'
        | 'others'
        | 'images'
        | 'comments';
    }
  | { readonly kind: 'layer' | 'annotation'; readonly id: string };

/** Key of the section in the `collapsed` set. */
export function sectionKey(section: DetailsSection): string {
  return 'id' in section ? `${section.kind}:${section.id}` : section.kind;
}

export function isSectionCollapsed(ui: EditorUi, section: DetailsSection): boolean {
  return ui.collapsed.value.has(sectionKey(section));
}

/** Collapses or opens the section. */
export function toggleSection(ui: EditorUi, section: DetailsSection): void {
  const next = new Set(ui.collapsed.peek());
  const key = sectionKey(section);
  if (!next.delete(key)) next.add(key);
  ui.collapsed.value = next;
}

/** Opens the sections (e.g. to show an annotation requested by a link). */
export function expandSections(ui: EditorUi, sections: readonly DetailsSection[]): void {
  const current = ui.collapsed.peek();
  const keys = sections.map(sectionKey).filter((key) => current.has(key));
  if (keys.length === 0) return;
  const next = new Set(current);
  for (const key of keys) next.delete(key);
  ui.collapsed.value = next;
}

/** Collapses the sections (e.g. a large group that the review shows only by headers). */
export function collapseSections(
  ui: EditorUi,
  sections: readonly DetailsSection[],
): void {
  const current = ui.collapsed.peek();
  const keys = sections.map(sectionKey).filter((key) => !current.has(key));
  if (keys.length === 0) return;
  const next = new Set(current);
  for (const key of keys) next.add(key);
  ui.collapsed.value = next;
}

/** Visible layers, in project order. Any of them can be hidden, even all. */
export function visibleLayers(
  project: Project | null,
  hidden: ReadonlySet<string>,
): Layer[] {
  return (project?.layers ?? []).filter((l) => !hidden.has(l.id));
}

/** Turns a layer's visibility on/off. */
export function toggleLayerVisible(ui: EditorUi, layerId: string): void {
  const hidden = new Set(ui.hiddenLayers.peek());
  if (!hidden.delete(layerId)) hidden.add(layerId);
  ui.hiddenLayers.value = hidden;
}

/** Makes the layer visible. */
export function showLayer(ui: EditorUi, layerId: string): void {
  if (!ui.hiddenLayers.peek().has(layerId)) return;
  const hidden = new Set(ui.hiddenLayers.peek());
  hidden.delete(layerId);
  ui.hiddenLayers.value = hidden;
}

/** Enough to go to an annotation. */
export type AnnotationLocation = Pick<Annotation, 'id' | 'markingId' | 'layerId'>;

/**
 * Goes to the annotation (backlinks, "Go to target", linked, pending items): shows its
 * layer, opens the collapsed sections that hide it, selects the marking (or the arrow, if the
 * owner is an arrow of the given `project`) and asks the panel to scroll to it (and focus `field`, if
 * any). `show`: how the layer is shown (with a perspective open, the editor's `layers.show`
 * writes to its hidden ones; the default is the Main one).
 */
export function goToAnnotation(
  ui: EditorUi,
  annotation: AnnotationLocation,
  field: string | null = null,
  project: Project | null = null,
  show: (layerId: string) => void = (layerId) => showLayer(ui, layerId),
): void {
  show(annotation.layerId);
  expandSections(ui, [
    { kind: 'annotations' },
    { kind: 'layer', id: annotation.layerId },
    { kind: 'annotation', id: annotation.id },
  ]);
  const onArrow =
    project !== null && projectIndex(project).arrows.has(annotation.markingId);
  ui.selection.value = { kind: onArrow ? 'arrow' : 'marking', id: annotation.markingId };
  ui.focusField.value = field;
  ui.focusAnnotation.value = annotation.id;
}

export function showAllLayers(ui: EditorUi): void {
  ui.hiddenLayers.value = new Set();
}

export type ResolvedSelection =
  | { readonly kind: 'image'; readonly image: ProjectContainer }
  | {
      readonly kind: 'marking';
      readonly marking: Marking;
      /** The marking's container; `null` on the canvas marking (v13). */
      readonly image: ProjectContainer | null;
      /** Space of the `rect`: the container (its pixels) or the canvas (identity `placement`). */
      readonly space: Space;
    }
  | { readonly kind: 'arrow'; readonly arrow: Arrow }
  | null;

/** Selected item in the current project (`null` if it no longer exists, e.g. after undo). */
export function resolveSelection(
  project: Project | null,
  selection: Selection,
): ResolvedSelection {
  if (!project || !selection) return null;
  if (selection.kind === 'image') {
    const image = projectIndex(project).containers.get(selection.id);
    return image ? { kind: 'image', image } : null;
  }
  const index = projectIndex(project);
  if (selection.kind === 'arrow') {
    const arrow = index.arrows.get(selection.id);
    return arrow ? { kind: 'arrow', arrow } : null;
  }
  const marking = index.markings.get(selection.id);
  if (!marking) return null;
  if (marking.containerId === null) {
    return { kind: 'marking', marking, image: null, space: spaceOf(project, marking) };
  }
  const image = index.containers.get(marking.containerId);
  return image
    ? { kind: 'marking', marking, image, space: spaceOf(project, marking) }
    : null;
}

// Marking tree: which nodes are collapsed. UI state, outside the project and the
// undo. The keys carry the node kind because image and marking ids come from
// different generators. The Canvas root (v13) is `treeKey('canvas', '')`.

export function treeKey(
  kind: 'image' | 'marking' | 'arrow' | 'canvas',
  id: string,
): string {
  return `${kind}:${id}`;
}

/** Collapses or opens a tree node. */
export function toggleTreeNode(ui: EditorUi, key: string): void {
  const next = new Set(ui.collapsedTree.peek());
  if (!next.delete(key)) next.add(key);
  ui.collapsedTree.value = next;
}

/**
 * Collapses all the nodes that have children: the Canvas root, the containers with markings and the
 * markings with children or with member containers.
 */
export function collapseTree(ui: EditorUi, project: Project | null): void {
  if (!project) return;
  const next = new Set<string>();
  const parents = new Set<string>();
  const floating = new Set(project.markings.filter((m) => m.floating).map((m) => m.id));
  for (const m of project.markings) {
    next.add(
      m.containerId === null ? treeKey('canvas', '') : treeKey('image', m.containerId),
    );
    if (m.parentId !== null) parents.add(m.parentId);
  }
  // A floating one has no children in the tree: there is nothing to collapse in it.
  for (const c of project.containers) {
    if (c.parentId !== null && !floating.has(c.parentId)) parents.add(c.parentId);
  }
  // Arrows appear under the origin marking.
  for (const a of project.arrows) parents.add(a.from);
  for (const id of parents) next.add(treeKey('marking', id));
  ui.collapsedTree.value = next;
}

/**
 * Opens the item's ancestors so it shows up in the tree: the whole chain (container
 * marking → container → canvas markings that contain it → Canvas). Returns whether anything
 * changed, to avoid rewriting the signal needlessly.
 */
export function revealInTree(
  ui: EditorUi,
  project: Project | null,
  selection: Selection,
): boolean {
  const collapsed = ui.collapsedTree.peek();
  if (collapsed.size === 0 || !project || !selection) return false;
  const index = projectIndex(project);
  const byId = index.markings;
  const next = new Set(collapsed);

  /** Opens marking `startId` and the markings above it (the limit avoids a loop on corrupted data). */
  const openMarkings = (startId: string | null): void => {
    let current = startId === null ? undefined : byId.get(startId);
    for (let guard = byId.size; current && guard > 0; guard--) {
      next.delete(treeKey('marking', current.id));
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  };
  /** Opens the container and, if a canvas marking contains it, its chain up to the Canvas. */
  const openContainer = (container: ProjectContainer): void => {
    next.delete(treeKey('image', container.id));
    if (container.parentId !== null) {
      openMarkings(container.parentId);
      next.delete(treeKey('canvas', ''));
    }
  };

  if (selection.kind === 'image') {
    const container = index.containers.get(selection.id);
    if (!container) return false;
    if (container.parentId !== null) {
      openMarkings(container.parentId);
      next.delete(treeKey('canvas', ''));
    }
  } else {
    // The arrow appears under the origin marking (ME4: the Tree is another agent's): opens the origin.
    const arrow = selection.kind === 'arrow' ? index.arrows.get(selection.id) : undefined;
    if (selection.kind === 'arrow' && !arrow) return false;
    const marking = byId.get(arrow ? arrow.from : selection.id);
    if (!marking) return false;
    if (arrow) next.delete(treeKey('marking', marking.id));
    openMarkings(marking.parentId);
    if (marking.containerId === null) {
      next.delete(treeKey('canvas', ''));
    } else {
      const container = index.containers.get(marking.containerId);
      if (container) openContainer(container);
    }
  }
  if (next.size === collapsed.size) return false;
  ui.collapsedTree.value = next;
  return true;
}
