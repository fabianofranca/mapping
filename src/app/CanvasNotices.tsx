import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { Button } from '../ui/controls';
import { useEditor } from '../ui/EditorContext';
import { ProposalNotices } from '../ui/review/ProposalNotices';
import type { EditorNotices } from './useEditorNotices';

/**
 * Notices over the canvas: read-only, repair on open and migration backup, save error (B13),
 * operation errors (at the top) and, at the bottom, the short notice and the progress (the Draw hint lives in the canvas bar).
 */
export function CanvasNotices({ notices }: { readonly notices: EditorNotices }) {
  const { open, session, store, ui } = useEditor();
  // With the external-change dialog open, the write error is already explained in it.
  const saveFailed =
    session.saveStatus.value === 'error' && session.conflict.value === null;
  const [backupDismissed, setBackupDismissed] = useState(false);
  const backupSaved = session.backupSaved.value;
  // Project repaired on open: the repair notice already mentions the backup (it is not a migration).
  const repairs = open.repaired?.length ?? 0;
  const readOnly = store.readOnly.value;
  const { message, progress } = notices;
  const toast = ui.toast.value;

  return (
    <>
      <ProposalNotices />
      <div class="canvas-overlay">
        {readOnly && <p class="notice">{t('editor.readOnlyNotice')}</p>}
        {repairs > 0 && !backupDismissed && (
          <p class="notice notice-info" role="status">
            {t('editor.repairNotice', { count: repairs })}{' '}
            {backupSaved === null
              ? t('editor.repairBackupPending')
              : t('editor.repairBackupSaved')}{' '}
            <Button
              size="sm"
              class="button-link"
              onClick={() => setBackupDismissed(true)}
            >
              {t('editor.dismiss')}
            </Button>
          </p>
        )}
        {repairs === 0 && backupSaved !== null && !backupDismissed && (
          <p class="notice notice-info" role="status">
            {t('editor.migrationBackup', { version: backupSaved })}{' '}
            <Button
              size="sm"
              class="button-link"
              onClick={() => setBackupDismissed(true)}
            >
              {t('editor.dismiss')}
            </Button>
          </p>
        )}
        {saveFailed && (
          <p class="notice notice-error" role="alert">
            {t('status.error')}{' '}
            <Button size="sm" class="button-link" onClick={() => void session.flush()}>
              {t('status.retry')}
            </Button>
          </p>
        )}
        {message && (
          <p class="notice notice-error" role="alert">
            {message}{' '}
            <Button
              size="sm"
              class="button-link"
              onClick={() => notices.setMessage(null)}
            >
              {t('editor.dismiss')}
            </Button>
          </p>
        )}
      </div>
      {(toast || progress) && (
        // Short notices at the bottom of the canvas (PV2): small, on the left, without covering the top of the image.
        <div class="canvas-overlay-foot">
          {toast && (
            <p class="notice notice-info" role="status">
              {toast}
            </p>
          )}
          {progress && (
            <p class="notice notice-info" aria-live="polite">
              {progress}
            </p>
          )}
        </div>
      )}
    </>
  );
}
