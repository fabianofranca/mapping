import { computed, signal, type Signal } from '@preact/signals';
import { createContext } from 'preact';
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { ariaKeysAll } from '../../app/shortcuts';
import { t } from '../../i18n';
import { reviewKey } from '../../model';
import { tokenValue } from '../../theme/tokens';
import { classes } from '../controls/classes';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Popover } from '../Popover';
import {
  ChangePopover,
  markFieldLabel,
  markGlyph,
  markSides,
  markType,
  popoverTitle,
  type MarkSubject,
} from './ChangePopover';
import { entityName, partsText, type ReviewNames } from './changeText';
import { REVIEW_KEYS } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { belowReviewBar } from './reviewBarRef';
import { useReviewNames } from './useReview';

// Marker of the changed field (HANDOFF-REVIEW-DETAILS 2.1 and 4, phase 9.5): an 18 px piece
// with the kind on the left (the ChangeKind glyph) and the decision on the right (the shape of
// DecisionMark); conflict with ⚠ in amber; part of a creation or removal with the kind only,
// dashed. It is a button that opens the `ChangePopover` in the app's `Popover`: on hover, with
// `duration-hover-intent`; on focus, at once; click (or Enter) pins it. Esc and a click
// outside close it and give focus back to the marker; one open at a time (`OpenMarkContext`).
// Focusing the marker selects that change in the review (phase 9.6): A, R and Backspace decide
// the focused field, and the change's row lights up in the Proposals window.

/** Which marker is open (its key) in a panel; one at a time. */
export const OpenMarkContext = createContext<Signal<string | null> | null>(null);

/** The "which marker is open" state of a panel. */
export function createOpenMark(): Signal<string | null> {
  return signal<string | null>(null);
}

/** Milliseconds of a duration token (`300ms` → 300). */
function ms(token: string): number {
  return Number.parseInt(tokenValue(token, 'light'), 10);
}

/** How the popover opened: hover closes on leaving; focus, on losing focus; click pins it. */
type OpenMode = 'hover' | 'focus' | 'pinned';

/** Accessible name of the marker (HANDOFF-REVIEW-DETAILS 7). */
function markLabel(
  names: ReviewNames,
  subject: MarkSubject,
  extra: {
    readonly state: 'undecided' | 'accepted' | 'rejected';
    readonly conflict: boolean;
    readonly invalid: boolean;
    readonly together: boolean;
    readonly applied: boolean;
    readonly note: boolean;
    readonly current: string;
    readonly proposed: string;
  },
): string {
  const field = markFieldLabel(names, subject);
  if (subject.part) {
    const entity = entityName(names, subject.change.entityId) ?? '';
    const head = t(
      subject.change.kind === 'create'
        ? 'review.mark.part.create'
        : 'review.mark.part.remove',
      { field, entity },
    );
    const value = subject.change.kind === 'create' ? extra.proposed : extra.current;
    const side =
      subject.change.kind === 'create'
        ? t('review.pop.proposed')
        : t('review.diff.current');
    return `${head}. ${side}: ${value}`;
  }
  const facts = [
    t(`review.mark.state.${extra.state}`),
    extra.conflict ? t('review.mark.conflict') : null,
    extra.together ? t('review.mark.together') : null,
    extra.applied ? t('review.mark.applied') : null,
    extra.invalid ? t('review.mark.invalid') : null,
    extra.note ? t('review.mark.withNote') : null,
  ].filter((s) => s !== null);
  const head = t('review.mark.label', {
    field,
    kind: t(`review.mark.kind.${markType(subject)}`),
    state: facts.join(', '),
  });
  return `${head} ${t('review.mark.values', {
    current: extra.current,
    proposed: extra.proposed,
  })}`;
}

/** The shortcuts that act on the focused marker's change (accept, reject and clear). */
const MARK_KEYS = [REVIEW_KEYS.accept, REVIEW_KEYS.reject, REVIEW_KEYS.clear];

export function ChangeMark(subject: MarkSubject) {
  const { change, field, part } = subject;
  const { review } = useEditor();
  const names = useReviewNames();
  const openMark = useContext(OpenMarkContext);
  const [mode, setMode] = useState<OpenMode>('focus');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const host = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => () => clearTimeout(timer.current), []);

  // The change selected in the Proposals window: the marker scrolls itself into view and, on a click or Enter
  // in the list (`review.requestMark`), gets focus (the popover opens on focus). With the arrows it only
  // scrolls and highlights. In the commit that draws the marker, even if the section that hides it has
  // just opened (focus model of stage 8: the element's owner fulfils the request).
  // One computed per marker: changing the selection redoes only what leaves and what becomes the target.
  const targetSignal = useMemo(
    () =>
      computed(() => {
        const now = review.selected.value;
        return !part && now?.level === 'change' && now.id === change.id;
      }),
    [review, change.id, part],
  );
  const isTarget = targetSignal.value;
  const request = isTarget ? review.markRequest.value : null;
  const asked = request?.changeId === change.id ? request.seq : 0;
  useLayoutEffect(() => {
    if (!isTarget) return;
    button.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isTarget]);
  useLayoutEffect(() => {
    if (asked === 0) return;
    review.clearMarkRequest();
    button.current?.focus({ preventScroll: true });
    // Each request counts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);
  if (!names || !openMark) return null;

  const key = `${change.id}|${field}`;
  const open = openMark.value === key;
  const show = (next: OpenMode) => {
    clearTimeout(timer.current);
    if (openMark.peek() !== key) setMode(next);
    openMark.value = key;
  };
  const hide = () => {
    clearTimeout(timer.current);
    if (openMark.peek() === key) {
      openMark.value = null;
      // Closed, the request for the suggested note (rejecting with the mouse) no longer holds.
      review.clearNoteRequest();
    }
  };

  const d = review.derived;
  const situation = d.situation.value.get(change.id);
  const target = isTarget;
  const hasNote = d.notes.value.has(reviewKey({ level: 'change', id: change.id }));
  const decision = names.proposal.decisions[change.id]?.state ?? null;
  const conflict = !part && situation?.conflict === true;
  const invalid = !part && d.invalid.value.changeIds.has(change.id);
  const together = !part && review.undoable.value?.cascaded.includes(change.id) === true;
  const applied = situation?.applied === true;
  const type = markType(subject);
  const sides = markSides(names, subject, situation);
  const label = markLabel(names, subject, {
    state: decision ?? 'undecided',
    conflict,
    invalid,
    together,
    applied,
    note: hasNote,
    current: partsText(sides.current),
    proposed: partsText(sides.proposed),
  });
  const glyph = conflict ? 'warning' : together ? 'link' : markGlyph(type);

  return (
    <span
      class="change-mark-host"
      ref={host}
      onMouseEnter={() => {
        clearTimeout(timer.current);
        if (openMark.peek() === key) return;
        timer.current = setTimeout(() => show('hover'), ms('duration-hover-intent'));
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        if (openMark.peek() !== key || mode !== 'hover') return;
        timer.current = setTimeout(hide, ms('duration-base'));
      }}
      onFocusOut={(e) => {
        // Focus left the marker and the popover for somewhere else (Tab after the last one).
        const next = e.relatedTarget;
        if (next instanceof Node && !host.current?.contains(next)) hide();
      }}
    >
      <Popover
        open={open}
        onOpenChange={(next) => (next ? show('pinned') : hide())}
        id={panelId}
        panelClass="change-popover"
        scroll="follow"
        limit={belowReviewBar}
        label={popoverTitle(names, subject)}
        trigger={() => (
          /* Exception to Button: change marker (docs/DESIGN-SYSTEM.md, "Loose buttons") */
          <button
            ref={button}
            type="button"
            class={classes(
              'change-mark',
              part && 'is-part',
              conflict && 'is-conflict',
              invalid && 'is-invalid',
              open && 'is-open',
              target && 'is-target',
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={label}
            aria-current={target ? 'true' : undefined}
            aria-keyshortcuts={ariaKeysAll(MARK_KEYS)}
            data-change={change.id}
            data-part={part ? '' : undefined}
            data-state={part ? undefined : (decision ?? 'undecided')}
            onFocus={() => {
              if (openMark.peek() !== key) show('focus');
              // Focusing the marker selects the change: the shortcuts act on it.
              const now = review.selected.peek();
              if (!(now?.level === 'change' && now.id === change.id)) {
                review.select({ level: 'change', id: change.id });
              }
            }}
            onClick={() => {
              // Click or Enter pins the open popover; again, it closes.
              if (openMark.peek() === key && mode === 'pinned') hide();
              else {
                show('pinned');
                setMode('pinned');
              }
            }}
          >
            <Icon name={glyph} />
            {!part && <DecisionMark state={decision ?? 'undecided'} decorative />}
          </button>
        )}
      >
        {(close) => <ChangePopover subject={subject} close={close} />}
      </Popover>
    </span>
  );
}
