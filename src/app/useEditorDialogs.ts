import {
  canDeleteImage,
  canDeleteItems,
  canDeleteMarking,
  arrowDeletionImpact,
  canEditArrow,
  type Arrow,
  type ItemRef,
  markingDeletionImpact,
  type Marking,
  type ProjectContainer,
} from '../model';
import type { AspectChange } from '../store/session';
import type { RefObject } from 'preact';
import { useRef } from 'preact/hooks';
import { useEditor } from '../ui/EditorContext';
import type { ManageFocus } from '../ui/ManagePerspectivesDialog';
import { useDialogSlot, type DialogSlot } from '../ui/focus';

/** The dialog open in the editor (only one at a time), with the data it needs. */
export type EditorDialog =
  /** `section`: id of the section where Help opens (e.g. the shortcuts, from Settings). */
  | { readonly kind: 'help'; readonly section?: string }
  | { readonly kind: 'specs' }
  /** New container (Library stage, B3). */
  | { readonly kind: 'container' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'deleteImage'; readonly image: ProjectContainer }
  | { readonly kind: 'deleteMarking'; readonly marking: Marking }
  | { readonly kind: 'deleteArrow'; readonly arrow: Arrow }
  /** Delete the whole selection (several items). */
  | { readonly kind: 'deleteItems'; readonly items: readonly ItemRef[] }
  | {
      readonly kind: 'aspect';
      readonly change: AspectChange;
      readonly resolve: (confirmed: boolean) => void;
    }
  | { readonly kind: 'export'; readonly file: File; readonly saved: boolean }
  | { readonly kind: 'confirmClose' }
  /** Leave the review with accepted changes not yet applied (stage 4). */
  | { readonly kind: 'exitReview' }
  /** Perspectives (stage #659, PE3). */
  | { readonly kind: 'newPerspective' }
  | { readonly kind: 'managePerspectives'; readonly focus?: ManageFocus }
  | { readonly kind: 'deletePerspective'; readonly id: string };

export interface EditorDialogs {
  readonly current: EditorDialog | null;
  /** The open dialog's slot (`DialogSlotContext`): who opened it, inherited on a switch. */
  readonly slot: DialogSlot | null;
  /** Opens; with a dialog open, switches to this one (focus returns to whoever opened the first). */
  show(dialog: EditorDialog): void;
  close(): void;
  /**
   * The bar's Export button (which fills it): the focus return of the export dialog,
   * opened after generating the zip with the button disabled.
   */
  readonly exportButton: RefObject<HTMLButtonElement>;
  requestDeleteImage(image: ProjectContainer): void;
  /** In cascade asks for confirmation; simple, does not (undo covers it). Locked item: does nothing. */
  requestDeleteMarking(marking: Marking): void;
  /**
   * With annotations asks for confirmation; without, deletes directly (undo covers it). Locked:
   * nothing.
   */
  requestDeleteArrow(arrow: Arrow): void;
  /** Several items: a single confirmation; if any locked one prevents it, does nothing. */
  requestDeleteItems(items: readonly ItemRef[]): void;
}

export function useEditorDialogs(): EditorDialogs {
  const { store, actions, ui } = useEditor();
  const dialogs = useDialogSlot<EditorDialog>();
  const exportButton = useRef<HTMLButtonElement>(null);
  const { show } = dialogs;

  return {
    current: dialogs.current,
    slot: dialogs.slot,
    show,
    close: dialogs.close,
    exportButton,
    requestDeleteImage: (image) => {
      const project = store.project.peek();
      // Locked (or with a locked marking): nothing to confirm, the model would refuse.
      if (!project || !canDeleteImage(project, image.id)) return;
      show({ kind: 'deleteImage', image });
    },
    requestDeleteMarking: (marking) => {
      const project = store.project.peek();
      if (!project || !canDeleteMarking(project, marking.id)) return;
      const impact = markingDeletionImpact(project, marking.id);
      if (
        impact.descendants > 0 ||
        impact.annotations > 0 ||
        impact.containers > 0 ||
        impact.arrows > 0
      ) {
        show({ kind: 'deleteMarking', marking });
      } else if (actions.removeMarking(marking.id).ok) {
        ui.selection.value = null;
      }
    },
    requestDeleteArrow: (arrow) => {
      const project = store.project.peek();
      if (!project || !canEditArrow(project, arrow.id)) return;
      if (arrowDeletionImpact(project, arrow.id).annotations > 0) {
        show({ kind: 'deleteArrow', arrow });
      } else if (actions.removeArrow(arrow.id).ok) {
        ui.selection.value = null;
      }
    },
    requestDeleteItems: (items) => {
      const project = store.project.peek();
      if (!project || !canDeleteItems(project, items)) return;
      show({ kind: 'deleteItems', items });
    },
  };
}
