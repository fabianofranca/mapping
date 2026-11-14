import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { deleteImpact, type Thread } from '../../model';
import { identity } from '../../store/identity';
import { Button } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { actionErrorText } from './commentsText';
import { impactText } from './deleteText';

// Delete a thread (decision 23): directly when all the messages are the person's own; with the
// dialog (alert) when there is a message from someone else or from an agent. Whoever uses it
// puts `dialog` in the tree and calls `request(thread)` from the ⋯ menu. The focus returns to
// the control that opened (the `Dialog`). If the save fails (#959), the error shows: in the
// dialog, which stays open, or, on the direct path,
// as a notice in `dialog` itself. The dialog only closes on success.

export interface DeleteThread {
  readonly request: (thread: Thread) => void;
  readonly dialog: ComponentChildren;
}

export function useDeleteThread(): DeleteThread {
  const { session } = useEditor();
  const [pending, setPending] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Deletes and returns whether it worked; the error, if any, stays in `error`. */
  const run = async (thread: Thread): Promise<boolean> => {
    const result = await session.threadActions.remove(thread.id);
    setError(result.ok ? null : actionErrorText(result.error));
    return result.ok;
  };
  const request = (thread: Thread) => {
    setError(null);
    if (deleteImpact(thread, identity.peek()).direct) void run(thread);
    else setPending(thread);
  };
  const close = () => {
    setPending(null);
    setError(null);
  };
  const alert = error !== null && (
    <p class="field-error" role="alert">
      {error}
    </p>
  );
  const dialog = pending ? (
    <Dialog
      title={t('comments.delete.title')}
      alert
      onCancel={close}
      actions={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              void run(pending).then((ok) => {
                if (ok) close();
              });
            }}
          >
            {t('comments.delete.confirm')}
          </Button>
        </>
      }
    >
      <p>{impactText(deleteImpact(pending, identity.peek()))}</p>
      <p>{t('comments.delete.noUndo')}</p>
      {alert}
    </Dialog>
  ) : (
    alert
  );
  return { request, dialog };
}
