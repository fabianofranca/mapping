import { useComputed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { useEditor } from './EditorContext';
import { addLabel, componentTarget } from './componentTarget';
import { libraryErrorMessage } from './labels';

// "Add" of a library component, common to the palette and the Catalog: the target is
// that of `componentTarget` (selection first, otherwise the container in view, otherwise the canvas), the creation is the action
// `addComponent` and the created marking becomes selected.

export interface AddComponent {
  /** Adds the type; returns `true` if it created. The translated error stays in `error`. */
  readonly add: (specId: string, typeId: string) => boolean;
  /** Button label with the destination: "Add inside X", "Add on screen X", "Add on the canvas". */
  readonly label: string;
  /**
   * The label for a type: a floating type is always "Add on the canvas" and one that declares
   * `anchor` at the root, with a marking selected, "Add anchored to X".
   */
  readonly labelFor: (type: AddableType) => string;
  /** Why Add is disabled; `undefined` if it can. */
  readonly disabledReason: string | undefined;
  readonly error: string | null;
}

/** What the label needs to know about the type: whether it is floating and whether the component declares `anchor` at the root. */
interface AddableType {
  readonly floating: boolean;
  readonly component?: { readonly anchor?: unknown };
}

const declaresAnchor = (type: AddableType): boolean =>
  type.component?.anchor !== undefined;

export function useAddComponent(): AddComponent {
  const editor = useEditor();
  const { actions, store, ui } = editor;
  const [error, setError] = useState<string | null>(null);
  const readOnly = store.locked.value;
  // Only the "a screen is possible" matters: the component does not render on every pan.
  const label = useComputed(() => {
    const target = componentTarget(editor);
    return target ? addLabel(target) : null;
  }).value;
  const hasTarget = label !== null;
  // The label of the types with `anchor`: it only exists with a marking selected.
  const anchoredLabel = useComputed(() => {
    const target = componentTarget(editor, { anchored: true });
    return target?.anchorTo === undefined ? null : addLabel(target);
  }).value;

  const add = (specId: string, typeId: string): boolean => {
    const type = editor.derived.componentTypes
      .peek()
      .find((c) => c.specId === specId && c.typeId === typeId);
    const floating = type?.floating === true;
    const target = componentTarget(editor, {
      floating,
      anchored: type !== undefined && declaresAnchor(type),
    });
    if (!target) return false;
    const result = actions.addComponent({
      containerId: target.containerId,
      parentId: target.parentId,
      specId,
      typeId,
      ...(target.center ? { center: target.center } : {}),
      ...(target.near ? { near: target.near } : {}),
      ...(target.anchorTo === undefined ? {} : { anchorTo: target.anchorTo }),
    });
    if (!result.ok) {
      setError(libraryErrorMessage(result.error));
      return false;
    }
    setError(null);
    ui.selection.value = { kind: 'marking', id: result.value };
    // New marking outside the visible area: minimal pan to it (already in view, the view does not move).
    editor.canvas.current?.revealSelection();
    return true;
  };

  const disabledReason = readOnly
    ? t('library.readOnly')
    : hasTarget
      ? undefined
      : t('library.noScreen');
  const generic = label ?? t('library.add');
  const labelFor = (type: AddableType) => {
    if (type.floating) return t('library.addToCanvas');
    return declaresAnchor(type) && anchoredLabel !== null ? anchoredLabel : generic;
  };
  return { add, label: generic, labelFor, disabledReason, error };
}
