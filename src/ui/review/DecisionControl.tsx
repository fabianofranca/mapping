import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { ariaKeys } from '../../app/shortcuts';
import { Button, IconButton } from '../controls';
import { Icon } from '../icons';
import { useClickSource } from './clickSource';

// ✓ ✕ pair that decides a level (HANDOFF-PROPOSALS 2.1): none checked means "no decision";
// pressing the checked one clears the decision. Deciding saves immediately, without confirmation (it is
// reversible). Icon version (rows and cards, 24px) and a version with
// text ("Accept item" / "Reject item", in the Details).

export type DecisionValue = 'accepted' | 'rejected' | null;

/** Review shortcuts shown in the hints (HANDOFF-PROPOSALS 6). */
export const REVIEW_KEYS = {
  accept: 'A',
  reject: 'R',
  clear: 'Backspace',
  nextPending: 'N',
  previousPending: 'Shift+N',
  nextConflict: 'C',
  previousConflict: 'Shift+C',
  toggleView: 'P',
  legend: 'L',
  apply: 'Ctrl+Enter',
} as const;

interface DecisionControlProps {
  /** Checked state (`null`: none; on a "partial" level also none). */
  readonly value: DecisionValue;
  /** Name of the target, for the accessible name ("Accept Pay Button"). */
  readonly name: string;
  readonly onDecide: (next: DecisionValue) => void;
  /** Rejected with the mouse (icon version): the caller suggests the note for the agent. */
  readonly onRejectedByMouse?: () => void;
  /**
   * Decided by keyboard (icon version): the pair may be swapped by the decision and the focused
   * button leaves the DOM; the caller keeps track of which it was so the new pair takes focus.
   */
  readonly onDecidedByKeyboard?: (control: 'accept' | 'reject') => void;
  /** Called on mount: the control that should receive focus (the previous pair lost its own). */
  readonly takeFocus?: () => 'accept' | 'reject' | null;
  readonly disabled?: boolean;
  /** Conflict: the labels state the effect (overwrites / keeps the current value). */
  readonly conflict?: boolean;
  /** `text`: buttons with a label (`acceptText`, `rejectText`). */
  readonly variant?: 'icon' | 'text';
  readonly acceptText?: string;
  readonly rejectText?: string;
  /** Hint explaining why it is disabled. */
  readonly disabledReason?: string;
  /** Id of the text that explains the reason (`aria-describedby` of the disabled buttons). */
  readonly describedBy?: string;
}

export function DecisionControl({
  value,
  name,
  onDecide,
  onRejectedByMouse,
  onDecidedByKeyboard,
  takeFocus,
  disabled,
  conflict = false,
  variant = 'icon',
  acceptText,
  rejectText,
  disabledReason,
  describedBy,
}: DecisionControlProps) {
  const reason = disabled ? describedBy : undefined;
  const rejectClick = useClickSource();
  const acceptClick = useClickSource();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  // The pair mounted because the previous one left the DOM with focus (decision by keyboard): focus
  // returns to the equivalent control, in the commit that draws it, never to `body`.
  useLayoutEffect(() => {
    const which = takeFocus?.();
    if (!which) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    (which === 'accept' ? acceptRef : rejectRef).current?.focus();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = (state: 'accepted' | 'rejected') =>
    onDecide(value === state ? null : state);
  // Icon version: the name states the action and the state. Text version: the name is "<visible
  // text>: <target>" (WCAG 2.5.3), the state stays in `aria-pressed` and the conflict in the description.
  const acceptLabel = conflict
    ? t('review.decide.acceptConflict', { name })
    : value === 'accepted'
      ? t('review.decide.accepted', { name })
      : t('review.decide.accept', { name });
  const rejectLabel = conflict
    ? t('review.decide.rejectConflict', { name })
    : value === 'rejected'
      ? t('review.decide.rejected', { name })
      : t('review.decide.reject', { name });
  const conflictId = useId();
  const acceptShown = acceptText ?? t('review.accept');
  const rejectShown = rejectText ?? t('review.reject');
  const textDescribed = (hint: string) =>
    [reason, conflict ? `${conflictId}-${hint}` : undefined].filter(Boolean).join(' ') ||
    undefined;
  const acceptTip = disabled && disabledReason ? disabledReason : t('review.accept');
  const rejectTip = disabled && disabledReason ? disabledReason : t('review.reject');

  if (variant === 'text') {
    return (
      <div class="decision-control decision-control-text" role="group" aria-label={name}>
        <Button
          variant="accept"
          aria-pressed={value === 'accepted'}
          aria-label={t('review.decide.named', { text: acceptShown, name })}
          aria-keyshortcuts={ariaKeys(REVIEW_KEYS.accept)}
          aria-describedby={textDescribed('accept')}
          title={`${acceptTip}  ${REVIEW_KEYS.accept}`}
          disabled={disabled}
          onClick={() => toggle('accepted')}
        >
          <Icon name="check" />
          {acceptShown}
        </Button>
        <Button
          variant="reject"
          aria-pressed={value === 'rejected'}
          aria-label={t('review.decide.named', { text: rejectShown, name })}
          aria-keyshortcuts={ariaKeys(REVIEW_KEYS.reject)}
          aria-describedby={textDescribed('reject')}
          title={`${rejectTip}  ${REVIEW_KEYS.reject}`}
          disabled={disabled}
          onClick={() => toggle('rejected')}
        >
          <Icon name="close" />
          {rejectShown}
        </Button>
        {conflict && (
          <>
            <span class="visually-hidden" id={`${conflictId}-accept`}>
              {t('review.decide.acceptConflictHint')}
            </span>
            <span class="visually-hidden" id={`${conflictId}-reject`}>
              {t('review.decide.rejectConflictHint')}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <span class="decision-control" role="group" aria-label={name}>
      <IconButton
        icon="check"
        size="sm"
        variant="accept"
        label={acceptLabel}
        tooltip={acceptTip}
        shortcut={REVIEW_KEYS.accept}
        pressed={value === 'accepted'}
        disabled={disabled}
        aria-describedby={reason}
        buttonRef={acceptRef}
        {...acceptClick.handlers}
        onClick={() => {
          if (acceptClick.takeKeyboard()) onDecidedByKeyboard?.('accept');
          toggle('accepted');
        }}
      />
      <IconButton
        icon="close"
        size="sm"
        variant="reject"
        label={rejectLabel}
        tooltip={rejectTip}
        shortcut={REVIEW_KEYS.reject}
        pressed={value === 'rejected'}
        disabled={disabled}
        aria-describedby={reason}
        buttonRef={rejectRef}
        {...rejectClick.handlers}
        onClick={() => {
          // Everything that did not come from the keyboard counts as the mouse and suggests the note; the keyboard
          // does not open the note and keeps focus on the control (even if the pair is remounted).
          const byKeyboard = rejectClick.takeKeyboard();
          if (byKeyboard) onDecidedByKeyboard?.('reject');
          toggle('rejected');
          if (value !== 'rejected' && !byKeyboard) onRejectedByMouse?.();
        }}
      />
    </span>
  );
}
