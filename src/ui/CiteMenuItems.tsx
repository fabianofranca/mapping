import { t } from '../i18n';
import type { CitationTarget, ThreadAnchor } from '../model';
import {
  canCopyItems,
  citationTargetOf,
  copyReference,
  type CopyTarget,
} from '../app/itemClipboard';
import { composerOpen, insertCitation } from '../store/composerBridge';
import { startComposing } from '../store/threadUi';
import type { ActionMenuItem } from './ActionMenu';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { openToolWindow } from './toolWindowLayout';

// "Cite in the conversation", "Comment" and "Copy reference" in the menus of a target (Comments stage,
// CM5, decision 32): field, pair, row, annotation, item, layer and thread. A single definition of
// each action serves the app's two menu designs: the `Popover` buttons (`CiteItem`,
// `CommentItem`, `CopyReferenceItem`) and the `ActionMenu` list (`useCiteMenuItems`).

/** A menu action: the label, whether it applies now, the hint for when it does not and what it does. */
interface MenuAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly title?: string;
  readonly run: () => void;
}

interface CiteActions {
  /** Folder project: only there does the reference have a `<project>` that the MCP finds. */
  readonly copyable: boolean;
  /** Inserts the target in the open composer; disabled without one (or without saving: it does not depend on a folder). */
  cite(target: CitationTarget): MenuAction;
  /** Opens the draft of a thread anchored at `anchor`; disabled in read-only mode and in review. */
  comment(anchor: ThreadAnchor): MenuAction;
  /** Copies the target's URL (only in a folder project). */
  copy(target: CopyTarget): MenuAction;
}

/** The menu actions, read from the current state (re-renders when the composer opens or closes). */
export function useCiteActions(): CiteActions {
  const editor = useEditor();
  const { ui, store, review } = editor;
  const composer = composerOpen.value;
  const locked = store.locked.value;
  return {
    copyable: canCopyItems(editor),
    cite: (target) => ({
      label: t('cite.insert'),
      disabled: !composer,
      title: composer ? undefined : t('cite.needComposer'),
      run: () => void insertCitation(target),
    }),
    comment: (anchor) => ({
      label: t('comments.comment'),
      disabled: locked,
      run: () => {
        const project = review.derived.shownProject.peek();
        if (!project) return;
        startComposing(ui, project, anchor);
        openToolWindow('details');
      },
    }),
    copy: (target) => ({
      label: t('copy.reference'),
      disabled: false,
      run: () => void copyReference(editor, target),
    }),
  };
}

function ActionItem({
  action,
  close,
}: {
  readonly action: MenuAction;
  readonly close: () => void;
}) {
  return (
    <Button
      role="menuitem"
      disabled={action.disabled}
      title={action.title}
      onClick={() => {
        close();
        action.run();
      }}
    >
      {action.label}
    </Button>
  );
}

/** "Cite in the conversation": enabled only with an open composer; also applies outside a folder. */
export function CiteItem({
  target,
  close,
}: {
  readonly target: CopyTarget | CitationTarget;
  readonly close: () => void;
}) {
  const actions = useCiteActions();
  return <ActionItem action={actions.cite(citationTargetOf(target))} close={close} />;
}

/** "Comment" on the target; disabled in read-only mode and in review. */
export function CommentItem({
  anchor,
  close,
}: {
  readonly anchor: ThreadAnchor;
  readonly close: () => void;
}) {
  const actions = useCiteActions();
  return <ActionItem action={actions.comment(anchor)} close={close} />;
}

/** "Copy reference" of the layer, the thread or any target; disappears outside a folder. */
export function CopyReferenceItem({
  target,
  close,
}: {
  readonly target: CopyTarget;
  readonly close: () => void;
}) {
  const actions = useCiteActions();
  if (!actions.copyable) return null;
  return <ActionItem action={actions.copy(target)} close={close} />;
}

function asMenuItem(action: MenuAction): ActionMenuItem {
  return {
    label: action.label,
    disabled: action.disabled,
    title: action.title,
    onSelect: action.run,
  };
}

/**
 * The items of a property's `ActionMenu`: Copy reference (only in a folder), Cite in the
 * conversation and, with `anchor`, Comment. Call the returned function once per row.
 */
export function useCiteMenuItems(): (
  target: CopyTarget,
  anchor: ThreadAnchor | null,
) => readonly ActionMenuItem[] {
  const actions = useCiteActions();
  return (target, anchor) => [
    ...(actions.copyable ? [asMenuItem(actions.copy(target))] : []),
    asMenuItem(actions.cite(citationTargetOf(target))),
    ...(anchor === null ? [] : [asMenuItem(actions.comment(anchor))]),
  ];
}
