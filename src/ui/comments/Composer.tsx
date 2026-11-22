import type { RefObject } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { ThreadAnchor } from '../../model';
import {
  draftOf,
  newDraftKey,
  replyDraftKey,
  selectThread,
  setDraft,
} from '../../store/threadUi';
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { CitationEditor } from './CitationEditor';
import { threadErrorText, useThreadAccess } from './threadAccess';

export type ComposerTarget =
  | { readonly kind: 'new'; readonly anchor: ThreadAnchor }
  | { readonly kind: 'reply'; readonly threadId: string };

interface ComposerProps {
  readonly target: ComposerTarget;
  /** Opens Settings (the notice with no identity leads there). */
  readonly onOpenSettings?: () => void;
  /** Focuses the field (or, with no identity, the notice button) on each new-thread request. */
  readonly autoFocus?: boolean;
  /** Discards the draft of a new thread not yet sent. */
  readonly onCancel?: () => void;
}

/** The anchor of the thread the composer belongs to (new draft or reply). */
function useReplyAnchor(target: ComposerTarget): ThreadAnchor | null {
  const { session } = useEditor();
  const threads = session.threads.list.value;
  if (target.kind === 'new') return target.anchor;
  return threads.find((th) => th.id === target.threadId)?.anchor ?? null;
}

/**
 * Focuses the field on each new-thread request or, with no identity (the notice replaces the
 * field), its button. Each request creates a new `ui.conversation` object, so asking again on the
 * same anchor focuses again.
 */
function useRequestFocus(
  autoFocus: boolean | undefined,
  key: string,
  field: RefObject<HTMLElement>,
  button: RefObject<HTMLElement>,
): void {
  const { ui } = useEditor();
  const request = autoFocus ? ui.conversation.value : null;
  useEffect(() => {
    if (autoFocus) (field.current ?? button.current)?.focus();
  }, [autoFocus, key, request, field, button]);
}

/**
 * Composer of the threads: the citation editor (several lines, chips and `@`) with the draft kept
 * per thread (`ui.threadDrafts`, always a markdown string), Enter breaks the line and
 * Ctrl/Cmd+Enter sends. With no identity it shows the notice with the shortcut to Settings;
 * read-only and review show nothing.
 */
export function Composer({ target, onOpenSettings, autoFocus, onCancel }: ComposerProps) {
  const { ui, session, review } = useEditor();
  const { writable, me } = useThreadAccess();
  const key =
    target.kind === 'new' ? newDraftKey(target.anchor) : replyDraftKey(target.threadId);
  const text = draftOf(ui, key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const noticeId = useId();
  useRequestFocus(autoFocus, key, field, buttonRef);
  // The anchor of the `@` ("here"): the draft's or that of the thread being replied to.
  const replyAnchor = useReplyAnchor(target);

  if (!writable) return null;
  if (me === null) {
    return (
      <div class="thread-no-identity">
        <p id={noticeId}>{t('thread.noIdentity')}</p>
        {onOpenSettings && (
          <Button
            buttonRef={buttonRef}
            aria-describedby={noticeId}
            onClick={onOpenSettings}
          >
            {t('thread.openSettings')}
          </Button>
        )}
      </div>
    );
  }

  const send = async () => {
    const project = review.derived.shownProject.peek();
    // The current draft (the shortcut can arrive before the last key's render).
    const draft = draftOf(ui, key);
    if (busy || draft.trim() === '' || !project) return;
    setBusy(true);
    setError(null);
    const actions = session.threadActions;
    const result =
      target.kind === 'new'
        ? await actions.open(target.anchor, draft)
        : await actions.post(target.threadId, draft);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDraft(ui, key, '');
    if (target.kind === 'new') selectThread(ui, project, result.thread);
  };

  return (
    <div class="thread-composer">
      <CitationEditor
        label={t(target.kind === 'new' ? 'thread.composeAs' : 'thread.replyAs', {
          name: me.name,
        })}
        editorRef={field}
        composerField
        value={text}
        anchor={replyAnchor}
        excludeThreadId={target.kind === 'reply' ? target.threadId : undefined}
        onInput={(value) => {
          setError(null);
          setDraft(ui, key, value);
        }}
        onSubmit={() => void send()}
      />
      {error !== null && (
        <p class="field-error" role="alert">
          {threadErrorText(error)}
        </p>
      )}
      <div class="thread-composer-actions">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button
          variant="primary"
          title={t('thread.sendHint')}
          disabled={busy || text.trim() === ''}
          onClick={() => void send()}
        >
          {t('thread.send')}
        </Button>
      </div>
    </div>
  );
}
