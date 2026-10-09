import { useComputed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { ProposalNotices } from '../ui/review/ProposalNotices';
import type { EditorNotices } from './useEditorNotices';

/**
 * Avisos sobre o canvas: somente leitura, backup da migração, erro ao salvar (B13),
 * erros de operação, dica de desenho e progresso.
 */
export function CanvasNotices({ notices }: { readonly notices: EditorNotices }) {
  const { session, store, ui } = useEditor();
  // Com o diálogo de alteração externa aberto, o erro de gravação já está explicado nele.
  const saveFailed =
    session.saveStatus.value === 'error' && session.conflict.value === null;
  const [backupDismissed, setBackupDismissed] = useState(false);
  const backupSaved = session.backupSaved.value;
  const readOnly = store.readOnly.value;
  const hasImagesSignal = useComputed(
    () => (store.committed.value?.images.length ?? 0) > 0,
  );
  const hasImages = hasImagesSignal.value;
  const { message, progress } = notices;
  const toast = ui.toast.value;

  return (
    <>
      <ProposalNotices />
      <div class="canvas-overlay">
        {readOnly && <p class="notice">{t('editor.readOnlyNotice')}</p>}
        {backupSaved !== null && !backupDismissed && (
          <p class="notice notice-info" role="status">
            {t('editor.migrationBackup', { version: backupSaved })}{' '}
            <button type="button" class="link" onClick={() => setBackupDismissed(true)}>
              {t('editor.dismiss')}
            </button>
          </p>
        )}
        {saveFailed && (
          <p class="notice notice-error" role="alert">
            {t('status.error')}{' '}
            <button type="button" class="link" onClick={() => void session.flush()}>
              {t('status.retry')}
            </button>
          </p>
        )}
        {message && (
          <p class="notice notice-error" role="alert">
            {message}{' '}
            <button type="button" class="link" onClick={() => notices.setMessage(null)}>
              {t('editor.dismiss')}
            </button>
          </p>
        )}
        {ui.mode.value === 'draw' && !readOnly && hasImages && (
          <p class="notice notice-info canvas-hint">{t('editor.drawHint')}</p>
        )}
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
    </>
  );
}
