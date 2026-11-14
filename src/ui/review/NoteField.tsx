import { Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import {
  droppedNoteOrigin,
  reviewKey,
  type ProposalNote,
  type ReviewTarget,
} from '../../model';
import { TextArea } from '../controls';
import { useEditor } from '../EditorContext';
import { droppedChangeSummary } from './changeText';
import { useReviewNames } from './useReview';
import { useReviewCommands } from './useReviewCommands';

// Note for the agent (HANDOFF-REVIEW-DETAILS 5.5, phase 9.6): a text field that saves on
// leaving it, in the item header (the item note) and in a change's popover (the change
// note). Empty text deletes the note; a new field that stays empty disappears. The
// decisions and notes live in the proposal: nothing here keeps state outside it.

interface NoteAreaProps {
  readonly target: ReviewTarget;
  readonly note: ProposalNote | null;
  readonly readOnly: boolean;
  /** Each new value takes the focus to the field (the note button, rejection by mouse). */
  readonly focusSeq: number;
  /** O campo foi gravado e saiu: `empty` quando ficou sem texto. */
  readonly onSettled: (empty: boolean) => void;
}

function NoteArea({ target, note, readOnly, focusSeq, onSettled }: NoteAreaProps) {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  const [text, setText] = useState(note?.text ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  // The field leaves the DOM with the focus inside it (the decision swaps the card and remounts
  // the popover): the
  // browser fires `blur` on removal, and that is not "the person left the field". Saving the
  // text is fine; hiding the field and clearing the suggested-note request is not, otherwise
  // the new field (which fulfils the request on mount) is born without a request. The cleanup
  // runs before the DOM goes away.
  const leaving = useRef(false);
  useLayoutEffect(
    () => () => {
      leaving.current = true;
    },
    [],
  );
  // The focus goes to the field in the commit that draws it, never later (stage 8 focus model).
  useLayoutEffect(() => {
    if (focusSeq > 0) area.current?.focus();
  }, [focusSeq]);
  const check = (result: { ok: boolean; error?: unknown } | null) => {
    if (result && !result.ok && typeof result.error === 'string') {
      report(result.error as Parameters<typeof report>[0]);
    }
  };
  const commit = (value: string) => {
    if (readOnly) return;
    const empty = value.trim() === '';
    if (note) {
      if (empty) void review.removeNote(note.id).then(check);
      else if (value !== note.text) void review.editNote(note.id, value).then(check);
    } else if (!empty) {
      void review.addNote(target, value).then(check);
    }
    if (!leaving.current) onSettled(empty);
  };
  return (
    <TextArea
      aria-label={t('review.note.edit')}
      placeholder={t('review.note.placeholder')}
      textAreaRef={area}
      rows={2}
      value={text}
      readOnly={readOnly}
      onInput={setText}
      onCommit={commit}
    />
  );
}

/** "From the withdrawn change: <summary>" on a note carried up from a change the agent withdrew. */
function DroppedOrigin({ noteId }: { readonly noteId: string }) {
  const names = useReviewNames();
  const origin = names ? droppedNoteOrigin(names.proposal, noteId) : null;
  if (!names || !origin) return null;
  const summary = droppedChangeSummary(names, origin);
  return <p class="muted">{t('review.revised.droppedNote', { summary })}</p>;
}

interface NoteFieldProps {
  readonly target: ReviewTarget;
  /** The field was opened by the note button (even without a note yet). */
  readonly show: boolean;
  readonly focusSeq: number;
  /** A new field that stayed empty, or a deleted note: whoever opened it hides it. */
  readonly onHide: () => void;
}

/** The target's notes (and a new field, if `show`); nothing if there is nothing to show. */
export function NoteField({ target, show, focusSeq, onHide }: NoteFieldProps) {
  const { review } = useEditor();
  const notes = review.derived.notes.value.get(reviewKey(target)) ?? [];
  const open = review.derived.proposal.value?.status === 'open';
  if (notes.length === 0 && !(show && open)) return null;
  const list: readonly (ProposalNote | null)[] = notes.length > 0 ? notes : [null];
  return (
    <div class="review-note-field">
      {list.map((note, i) => (
        <Fragment key={note?.id ?? 'new'}>
          {note && <DroppedOrigin noteId={note.id} />}
          <NoteArea
            target={target}
            note={note}
            readOnly={!open}
            focusSeq={i === 0 ? focusSeq : 0}
            onSettled={(empty) => {
              if (empty) onHide();
            }}
          />
        </Fragment>
      ))}
      {open && <small class="muted">{t('review.note.saveHint')}</small>}
    </div>
  );
}

/** Does the change or level have a note? (the note button is marked) */
export function useHasNote(target: ReviewTarget): boolean {
  const { review } = useEditor();
  return (review.derived.notes.value.get(reviewKey(target))?.length ?? 0) > 0;
}
