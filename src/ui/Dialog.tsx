import type { ComponentChildren, Ref } from 'preact';
import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { IconButton } from './controls';
import {
  assignRef,
  FOCUSABLE,
  useFocusOrigin,
  useModal,
  type FocusReturn,
} from './focus';

export type { FocusOrigin, FocusReturn } from './focus';

/** Dialog width: 480px (default), 560px or 820px (Layouts section of DS 2.0). */
export type DialogSize = 'sm' | 'md' | 'lg';

/** Where the closing came from: Esc (`cancel` of the `<dialog>`), click on the backdrop or the X. */
export type DialogCancelCause = 'cancel' | 'backdrop' | 'close-button';

/**
 * Initial focus: the `autofocus`, otherwise the first control in the body, otherwise the first button in the
 * footer (in a confirmation, "Cancel"). Without this `showModal` would land on the header's close.
 */
function focusFirst(dialog: HTMLDialogElement): void {
  const target =
    dialog.querySelector<HTMLElement>('[autofocus]') ??
    dialog.querySelector('[data-dialog-body]')?.querySelector<HTMLElement>(FOCUSABLE) ??
    dialog.querySelector('[data-dialog-actions]')?.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
}

interface DialogBaseProps {
  readonly title: string;
  readonly children?: ComponentChildren;
  /** Footer buttons. */
  readonly actions: ComponentChildren;
  readonly size?: DialogSize;
  /** Body with no inner margin or own scrolling: the content handles both (e.g. Help). */
  readonly flush?: boolean;
  /** Focus target on close when whoever opened it is no longer in the DOM (`restoreFocus`). */
  readonly returnFocus?: FocusReturn;
  /**
   * Destructive confirmation (delete, remove): `role="alertdialog"`, described by the body,
   * which the screen reader reads on open. Only here: in a long dialog (Help) it would read the
   * whole body.
   */
  readonly alert?: boolean;
  /** The `<dialog>` for whoever needs to read its state (the trail of the folder Open). */
  readonly dialogRef?: Ref<HTMLDialogElement>;
}

/**
 * `closable={false}`: the choice in the footer is mandatory (e.g. "Project changed outside the app"),
 * so there is no close button in the header and Esc and a tap outside do nothing.
 */
type DialogProps = DialogBaseProps &
  (
    | {
        readonly closable?: true;
        /**
         * Esc, tap outside or the header's close button; `cause` says which (optional: only the
         * trail of the folder Open uses it, for Diagnostics).
         */
        readonly onCancel: (cause?: DialogCancelCause) => void;
      }
    | { readonly closable: false; readonly onCancel?: undefined }
  );

/**
 * Modal dialog with native `<dialog>` (trapped focus and Esc for free). 44px header with
 * title and close, scrolling body and footer with a border.
 */
export function Dialog({
  title,
  onCancel,
  closable = true,
  children,
  actions,
  size = 'sm',
  flush = false,
  returnFocus,
  alert = false,
  dialogRef,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  // Where the click started: only a whole click on the backdrop closes (a drag that starts on the
  // content and is released on the backdrop also generates `click` on the `<dialog>`).
  const pressedOnBackdrop = useRef(false);

  // Who had focus on open (the button that opened it, the dialog below, or whoever opened the
  // first dialog of the host's slot): on close, focus goes back to it instead of falling on
  // `body`. Saved at render time, before the dialog takes focus.
  const origin = useFocusOrigin();
  useModal(ref, origin, returnFocus, focusFirst);
  // After `showModal` (effect above): whoever reads the ref already sees the dialog open.
  useLayoutEffect(() => {
    assignRef(dialogRef, ref.current);
    return () => assignRef(dialogRef, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      class={size === 'sm' ? 'dialog' : `dialog dialog-${size}`}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={alert ? bodyId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel?.('cancel');
      }}
      onClose={() => {
        // Chrome stops accepting `preventDefault` on a repeated Esc without another gesture and closes
        // the `<dialog>` anyway: without closing, it reopens while it is mounted.
        const dialog = ref.current;
        if (closable || !dialog || !dialog.isConnected || dialog.open) return;
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        // Click on the backdrop (outside the content) closes, if it also started on it.
        const full = pressedOnBackdrop.current && e.target === ref.current;
        pressedOnBackdrop.current = false;
        if (full) onCancel?.('backdrop');
      }}
    >
      <header class="dialog-header">
        <h2 id={titleId} class="dialog-title">
          {title}
        </h2>
        {closable && (
          <IconButton
            icon="close"
            label={t('dialog.close')}
            onClick={() => onCancel?.('close-button')}
          />
        )}
      </header>
      <div
        class={flush ? 'dialog-body dialog-body-flush' : 'dialog-body'}
        id={bodyId}
        data-dialog-body=""
      >
        {children}
      </div>
      <footer class="dialog-actions" data-dialog-actions="">
        {actions}
      </footer>
    </dialog>
  );
}
