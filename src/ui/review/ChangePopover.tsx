import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ariaKeys } from '../../app/shortcuts';
import { t } from '../../i18n';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  changeType,
  type Change,
  type ChangeType,
  type JsonValue,
} from '../../model';
import type { ChangeSituation, ReviewView } from '../../store/derived';
import { locale } from '../../store/settings';
import { Button, IconButton } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon, type IconName } from '../icons';
import { CHANGE_KIND_ICONS, ChangeKind } from './ChangeKind';
import { ChangeNotices } from './ChangeNotices';
import {
  changeTitle,
  partsText,
  tableLines,
  valueParts,
  type ReviewNames,
  type ValuePart,
} from './changeText';
import { useClickSource } from './clickSource';
import { REVIEW_KEYS, type DecisionValue } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { DiffValue, type DiffRow } from './DiffValue';
import { Flag } from './Flag';
import { formatFullDate } from './format';
import { NoteField, useHasNote } from './NoteField';
import { RevisedBefore } from './RevisedBefore';
import { replaceChangeOf } from './ReviewCanvasControls';
import { useDecide, useReviewNames } from './useReview';

// Content of a marker's popover (HANDOFF-REVIEW-DETAILS 2.1 and 5.3, phases 9.5 and 9.6):
// title with the kind and the field, the values (the other side first; in conflict, Current,
// Before and After), the effect help and the footer with the field's decision (Accept, Reject,
// Clear; in conflict, Overwrite and Keep current), the change note and Compare. It only
// exists open: the panel draws the markers, never closed popovers.

/** What a marker represents: a change, or a field of the created or removed entity. */
export interface MarkSubject {
  readonly change: Change;
  /** Field shown: the change's, a field of the entity (part) or `''` (the entity). */
  readonly field: string;
  /** Field of a created or removed entity: no decision of its own. */
  readonly part: boolean;
  /** In the part: the field's value in the entity shown, in the form of `from`/`to`. */
  readonly value?: JsonValue;
}

/** Body rows in conflict: Current, Before and After (the last two only when they exist). */
export function diffRows(
  names: ReviewNames,
  c: Change,
  situation: ChangeSituation | undefined,
): DiffRow[] {
  const rows: DiffRow[] = [];
  if (situation?.conflict) {
    rows.push({
      kind: 'current',
      label: t('review.diff.current'),
      parts: valueParts(names, c, situation.current, c.to),
    });
  }
  if (c.kind !== 'create') {
    rows.push({
      kind: 'before',
      label: t('review.diff.before'),
      parts: valueParts(names, c, c.from, c.to),
    });
  }
  if (c.kind !== 'remove') {
    rows.push({
      kind: 'after',
      label: t('review.diff.after'),
      parts: valueParts(names, c, c.to, c.from),
    });
  }
  return rows;
}

/** Up to how many characters (or lines) a value shows in full before "Show all". */
const LONG_TEXT = 240;
const LONG_LINES = 6;
/** Up to how many rows of a table show before "Show all". */
const TABLE_ROWS = 5;

/** Marker kind: the change's; in a free pair, new or removed by the empty side. */
export function markType(subject: MarkSubject): ChangeType {
  const c = subject.change;
  if (c.kind === 'update' && c.field?.startsWith(ENTRIES_FIELD_PREFIX)) {
    if (c.from === null) return 'created';
    if (c.to === null) return 'removed';
  }
  return changeType(c);
}

/** Glyph of the kind (the same as `ChangeKind`). */
export function markGlyph(type: ChangeType): IconName {
  return CHANGE_KIND_ICONS[type];
}

/** The change seen as the alteration of a field (for the titles and values of a part). */
function asField(subject: MarkSubject): Change {
  const { change, field, value } = subject;
  if (!subject.part) return change;
  return { ...change, kind: 'update', field, from: null, to: value ?? null };
}

/** Field name ("Name", "Position", "style · Button"); `''`: the change's title. */
export function markFieldLabel(names: ReviewNames, subject: MarkSubject): string {
  return changeTitle(names, asField(subject));
}

/** The two sides of a marker: the current and the proposed value, in parts. */
export function markSides(
  names: ReviewNames,
  subject: MarkSubject,
  situation: ChangeSituation | undefined,
): { readonly current: readonly ValuePart[]; readonly proposed: readonly ValuePart[] } {
  const c = subject.change;
  if (subject.part) {
    const own = valueParts(names, asField(subject), subject.value ?? null);
    return c.kind === 'create'
      ? { current: [{ text: t('review.pop.notThere') }], proposed: own }
      : { current: own, proposed: [{ text: t('review.pop.notThere') }] };
  }
  if (c.kind === 'create') {
    return {
      current: [{ text: t('review.pop.notThere') }],
      proposed: valueParts(names, c, c.to),
    };
  }
  if (c.kind === 'remove') {
    return {
      current: valueParts(names, c, c.from),
      proposed: [{ text: t('review.pop.notThere') }],
    };
  }
  const entry = c.field?.startsWith(ENTRIES_FIELD_PREFIX) === true;
  const now = situation?.current !== undefined ? situation.current : c.from;
  return {
    current:
      entry && now === null
        ? [{ text: t('review.pop.notThere') }]
        : valueParts(names, c, now, c.to),
    proposed:
      entry && c.to === null
        ? [{ text: t('review.pop.notThere') }]
        : valueParts(names, c, c.to, c.from),
  };
}

/** Table of the two sides: the rows that leave are struck through in the current, new ones bold. */
function TableSides({
  current,
  proposed,
  all,
  order,
}: {
  readonly current: readonly { id: string; text: string }[];
  readonly proposed: readonly { id: string; text: string }[];
  readonly all: boolean;
  readonly order: 'current-first' | 'proposed-first';
}) {
  const inProposed = new Set(proposed.map((r) => r.id));
  const inCurrent = new Set(current.map((r) => r.id));
  const side = (kind: 'current' | 'proposed') => {
    const rows = kind === 'current' ? current : proposed;
    const shown = all ? rows : rows.slice(0, TABLE_ROWS);
    return (
      <div key={kind} class="diff-value-row">
        <dt class="diff-value-label">
          {kind === 'current' ? t('review.diff.current') : t('review.pop.proposed')}
        </dt>
        <dd
          class={`diff-value-value diff-value-${kind === 'current' ? 'before' : 'after'}`}
        >
          {rows.length === 0 ? (
            t('review.value.empty')
          ) : (
            <ol class="change-popover-rows">
              {shown.map((r) =>
                kind === 'current' && !inProposed.has(r.id) ? (
                  <li key={r.id}>
                    <del>{r.text}</del>
                  </li>
                ) : kind === 'proposed' && !inCurrent.has(r.id) ? (
                  <li key={r.id}>
                    <b>{r.text}</b>
                  </li>
                ) : (
                  <li key={r.id}>{r.text}</li>
                ),
              )}
            </ol>
          )}
        </dd>
      </div>
    );
  };
  return (
    <dl class="diff-value">
      {order === 'current-first'
        ? [side('current'), side('proposed')]
        : [side('proposed'), side('current')]}
    </dl>
  );
}

/** The text exceeds the closed popover's limit (the rest comes through "Show all"). */
function isLong(parts: readonly ValuePart[]): boolean {
  const value = partsText(parts);
  return value.length > LONG_TEXT || value.split('\n').length > LONG_LINES;
}

/** Where to decide a field that is part of the entity's creation or removal. */
function partHint(c: Change): string {
  const create = c.kind === 'create';
  if (c.entity === 'image') {
    return t(
      create ? 'review.pop.decideOnImage.create' : 'review.pop.decideOnImage.remove',
    );
  }
  if (c.entity === 'annotation') {
    return t(
      create
        ? 'review.pop.decideOnAnnotation.create'
        : 'review.pop.decideOnAnnotation.remove',
    );
  }
  return t(create ? 'review.pop.decideOnItem.create' : 'review.pop.decideOnItem.remove');
}

/** Effect help: the conflict, the position (decided together) or the table (a single field). */
function effectHint(
  names: ReviewNames,
  subject: MarkSubject,
  situation: ChangeSituation | undefined,
  table: boolean,
): string | null {
  const c = subject.change;
  if (!subject.part && situation?.conflict) {
    if (c.kind !== 'update') return t('review.hint.conflictEntity');
    const current = partsText(valueParts(names, c, situation.current, c.to));
    const after = partsText(valueParts(names, c, c.to, c.from));
    return t('review.hint.conflict', { current, after });
  }
  if (subject.field === 'rect') return t('review.pop.rectHint');
  if (table) return t('review.pop.tableHint');
  return null;
}

/** Popover title ("Name · changed"): the same name as the dialog. */
export function popoverTitle(names: ReviewNames, subject: MarkSubject): string {
  return t('review.pop.title', {
    field: markFieldLabel(names, subject),
    kind: t(`review.mark.kind.${markType(subject)}`),
  });
}

/** Footer actions: the field's decision. In conflict, the labels state the effect. */
function PopoverDecision({
  subject,
  names,
  situation,
  decision,
  disabled,
  reasonId,
  onRejectedByMouse,
}: {
  readonly subject: MarkSubject;
  readonly names: ReviewNames;
  readonly situation: ChangeSituation | undefined;
  readonly decision: DecisionValue;
  readonly disabled: boolean;
  readonly reasonId: string;
  /** Rejected with the mouse: the note is suggested (empty field with focus). */
  readonly onRejectedByMouse: () => void;
}) {
  const decide = useDecide();
  const { review } = useEditor();
  const accept = useRef<HTMLButtonElement>(null);
  const reject = useRef<HTMLButtonElement>(null);
  const acceptClick = useClickSource();
  const rejectClick = useClickSource();
  // Deciding by keyboard can remount the popover (the created annotation's card is swapped) and
  // take the focused button out of the DOM: the new pair regains focus on the equivalent, on mount.
  useLayoutEffect(() => {
    const which = review.takeControlFocus(subject.change.id, 'popover');
    if (!which) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    (which === 'accept' ? accept : reject).current?.focus();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = subject.change;
  const field = markFieldLabel(names, subject);
  const conflict = situation?.conflict === true;
  const apply = (state: DecisionValue) => decide({ level: 'change', id: c.id }, state);
  const conflictId = useId();
  // Name = "<visible text>: <field>" (WCAG 2.5.3); the state stays in `aria-pressed` and the
  // conflict's effect in the description, along with the reason it is disabled.
  const acceptShown = conflict ? t('review.pop.overwrite') : t('review.accept');
  const rejectShown = conflict ? t('review.pop.keepCurrent') : t('review.reject');
  const acceptLabel = t('review.decide.named', { text: acceptShown, name: field });
  const rejectLabel = t('review.decide.named', { text: rejectShown, name: field });
  let acceptHint = t('review.decide.acceptConflictHint');
  let rejectHint = t('review.decide.rejectConflictHint');
  if (conflict && c.kind === 'update') {
    const current = partsText(valueParts(names, c, situation.current, c.to));
    const after = partsText(valueParts(names, c, c.to, c.from));
    acceptHint = t('review.pop.acceptConflict', { current, after });
    rejectHint = t('review.pop.rejectConflict', { current });
  }
  const describedBy = (id: string) =>
    [disabled ? reasonId : undefined, conflict ? id : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div class="change-popover-actions" role="group" aria-label={field}>
      <Button
        size="sm"
        variant="accept"
        buttonRef={accept}
        aria-pressed={decision === 'accepted'}
        aria-label={acceptLabel}
        aria-keyshortcuts={ariaKeys(REVIEW_KEYS.accept)}
        aria-describedby={describedBy(`${conflictId}-accept`)}
        title={`${t('review.accept')}  ${REVIEW_KEYS.accept}`}
        disabled={disabled}
        {...acceptClick.handlers}
        onClick={() => {
          if (acceptClick.takeKeyboard()) {
            review.requestControlFocus(c.id, 'popover', 'accept');
          }
          apply(decision === 'accepted' ? null : 'accepted');
        }}
      >
        <Icon name="check" />
        {acceptShown}
      </Button>
      <Button
        size="sm"
        variant="reject"
        buttonRef={reject}
        aria-pressed={decision === 'rejected'}
        aria-label={rejectLabel}
        aria-keyshortcuts={ariaKeys(REVIEW_KEYS.reject)}
        aria-describedby={describedBy(`${conflictId}-reject`)}
        title={`${t('review.reject')}  ${REVIEW_KEYS.reject}`}
        disabled={disabled}
        {...rejectClick.handlers}
        onClick={() => {
          const next = decision === 'rejected' ? null : 'rejected';
          // Everything that did not come from the keyboard counts as mouse and suggests the note;
          // the keyboard does not open the note (the note button does) and keeps focus on Reject.
          const byKeyboard = rejectClick.takeKeyboard();
          if (byKeyboard) review.requestControlFocus(c.id, 'popover', 'reject');
          apply(next);
          if (next === 'rejected' && !byKeyboard) onRejectedByMouse();
        }}
      >
        <Icon name="close" />
        {rejectShown}
      </Button>
      {conflict && (
        <>
          <span class="visually-hidden" id={`${conflictId}-accept`}>
            {acceptHint}
          </span>
          <span class="visually-hidden" id={`${conflictId}-reject`}>
            {rejectHint}
          </span>
        </>
      )}
      {decision !== null && !disabled && (
        <Button
          size="sm"
          variant="ghost"
          aria-keyshortcuts={ariaKeys(REVIEW_KEYS.clear)}
          onClick={() => {
            // The button leaves the DOM on clear: focus goes to Accept, which stays (never body).
            accept.current?.focus();
            apply(null);
          }}
        >
          {t('review.pop.clear')}
        </Button>
      )}
    </div>
  );
}

export function ChangePopover({
  subject,
  close,
}: {
  readonly subject: MarkSubject;
  /** Closes the popover returning focus to the marker (the `Popover` passes it). */
  readonly close: () => void;
}) {
  const { review, ui } = useEditor();
  const names = useReviewNames();
  const [all, setAll] = useState(false);
  const [noteShown, setNoteShown] = useState(false);
  const [noteFocus, setNoteFocus] = useState(0);
  const reasonId = useId();
  const hasNote = useHasNote({ level: 'change', id: subject.change.id });
  // Rejecting with the mouse asks for the note suggested by the store (`review.requestNote`): the
  // decision can swap the created annotation's card and remount the marker, and the new popover
  // (which reopens through `OpenMarkContext`) fulfils the request in the commit that draws it,
  // with focus on the field. Each instance hands the request to its own state; what erases it
  // is the popover's close, a note that leaves empty, another selection or leaving the review.
  const noteAsk = review.noteRequest.value;
  const asked = noteAsk?.changeId === subject.change.id ? noteAsk.seq : 0;
  useLayoutEffect(() => {
    if (asked === 0) return;
    setNoteShown(true);
    setNoteFocus((n) => n + 1);
  }, [asked]);
  // The "changed decision" state is announced (`status` region), wherever it comes from.
  const decisionNow = names?.proposal.decisions[subject.change.id]?.state ?? null;
  const lastDecision = useRef(decisionNow);
  const [announce, setAnnounce] = useState('');
  const fieldName = names ? markFieldLabel(names, subject) : '';
  useEffect(() => {
    if (lastDecision.current === decisionNow) return;
    lastDecision.current = decisionNow;
    setAnnounce(
      t(`review.pop.announce.${decisionNow ?? 'cleared'}`, { field: fieldName }),
    );
  }, [decisionNow, fieldName]);
  if (!names) return null;
  const c = subject.change;
  const p = names.proposal;
  const d = review.derived;
  const view: ReviewView = review.view.value;
  const situation = d.situation.value.get(c.id);
  const conflict = !subject.part && situation?.conflict === true;
  const type = markType(subject);
  const decision = p.decisions[c.id] ?? null;
  const state = decision?.state ?? 'undecided';
  const invalid = !subject.part && d.invalid.value.changeIds.has(c.id);
  const together =
    !subject.part && review.undoable.value?.cascaded.includes(c.id) === true;
  const comparison = subject.part
    ? null
    : (d.supersession.value?.comparison?.get(c.id) ?? null);
  const applied = situation?.applied === true;
  const replaced =
    !subject.part &&
    c.entity === 'image' &&
    c.field === 'file' &&
    replaceChangeOf(p, c.entityId);

  // Table: the rows of both sides (a table is a single field, decided whole).
  const tableValue = c.kind === 'update' && c.field?.startsWith(VALUES_FIELD_PREFIX);
  const fromRows = !subject.part && tableValue ? tableLines(names, c.from) : null;
  const toRows = !subject.part && tableValue ? tableLines(names, c.to) : null;
  const table = fromRows !== null && toRows !== null;

  const sides = markSides(names, subject, situation);
  const order = view === 'proposed' ? 'current-first' : 'proposed-first';
  const rows: DiffRow[] = conflict
    ? diffRows(names, c, situation)
    : order === 'current-first'
      ? [
          { kind: 'before', label: t('review.diff.current'), parts: sides.current },
          { kind: 'after', label: t('review.pop.proposed'), parts: sides.proposed },
        ]
      : [
          { kind: 'after', label: t('review.pop.proposed'), parts: sides.proposed },
          { kind: 'before', label: t('review.diff.current'), parts: sides.current },
        ];
  const long = table
    ? Math.max(fromRows.length, toRows.length) > TABLE_ROWS
    : rows.some((row) => isLong(row.parts));
  const hint = effectHint(names, subject, situation, table);

  // Decide only in an open proposal and on a change not yet applied (the reason goes in the
  // `aria-describedby` of the disabled buttons).
  const open = p.status === 'open';
  const disabled = !open || applied;
  const reason = applied
    ? t('review.appliedReason')
    : p.status === 'superseded' && decision === null
      ? t('review.pop.supersededPending')
      : t('review.closedReason');
  // Applied or withdrawn: the popover only shows the decision and the dates, without buttons.
  const closedForGood = p.status === 'applied' || p.status === 'withdrawn';
  const appliedAt = p.applied[c.id]?.at;
  const when = (iso: string) => formatFullDate(iso, locale.value);

  return (
    <div class={all ? 'change-popover-content is-expanded' : 'change-popover-content'}>
      <header class="change-popover-head">
        <ChangeKind type={type} size="sm" />
        <strong class="change-popover-title">{popoverTitle(names, subject)}</strong>
        {conflict && (
          <Flag tone="warn" icon="warning">
            {review.newConflicts.value.has(c.id)
              ? t('review.flag.newConflict')
              : t('review.flag.conflict')}
          </Flag>
        )}
        {invalid && <Flag tone="danger">{t('review.flag.involved')}</Flag>}
        {together && (
          <Flag icon="link" title={t('review.flag.togetherHint')}>
            {t('review.flag.together')}
          </Flag>
        )}
        {applied && <Flag tone="ok">{t('review.flag.applied')}</Flag>}
        {comparison && (
          <Flag tone={comparison === 'missing' ? 'danger' : 'neutral'}>
            {t(`review.compare.${comparison}`)}
          </Flag>
        )}
      </header>
      <div class="change-popover-body">
        {table ? (
          <TableSides current={fromRows} proposed={toRows} all={all} order={order} />
        ) : (
          <DiffValue rows={rows} />
        )}
      </div>
      <ChangeNotices change={c} field={subject.field} />
      {!subject.part && <RevisedBefore change={c} />}
      {long && !all && (
        <Button size="sm" class="button-link" onClick={() => setAll(true)}>
          {t('review.pop.showAll')}
        </Button>
      )}
      {hint && <p class="review-hint">{hint}</p>}
      <footer class="change-popover-foot">
        {subject.part ? (
          <p class="muted">{partHint(c)}</p>
        ) : (
          <>
            <span class="change-popover-state">
              <DecisionMark state={state} decorative />
              {t('review.pop.decision', { state: t(`review.details.state.${state}`) })}
            </span>
            {decision && appliedAt && (
              <p class="muted">
                {t('review.pop.closed', {
                  accepted: when(decision.at),
                  applied: when(appliedAt),
                })}
              </p>
            )}
            {disabled && (
              <p class="muted" id={reasonId}>
                {reason}
              </p>
            )}
            {!closedForGood && (
              <PopoverDecision
                subject={subject}
                names={names}
                situation={situation}
                decision={decision?.state ?? null}
                disabled={disabled}
                reasonId={reasonId}
                onRejectedByMouse={() => review.requestNote(c.id)}
              />
            )}
            <div class="change-popover-more">
              {open && (
                <IconButton
                  icon="note"
                  size="sm"
                  label={t('review.note.add')}
                  pressed={noteShown || hasNote}
                  onClick={() => {
                    setNoteShown(true);
                    setNoteFocus((n) => n + 1);
                  }}
                />
              )}
              {replaced && (
                <Button
                  size="sm"
                  onClick={() => {
                    close();
                    ui.compareImage.value = c.entityId;
                  }}
                >
                  <Icon name="compare" />
                  {t('review.compare.button')}
                </Button>
              )}
            </div>
            <NoteField
              target={{ level: 'change', id: c.id }}
              show={noteShown}
              focusSeq={noteFocus}
              onHide={() => {
                setNoteShown(false);
                review.clearNoteRequest();
              }}
            />
            <span class="visually-hidden" role="status">
              {announce}
            </span>
          </>
        )}
      </footer>
    </div>
  );
}
