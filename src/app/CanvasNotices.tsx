import { useComputed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { Button } from '../ui/controls';
import { useEditor } from '../ui/EditorContext';
import { ProposalNotices } from '../ui/review/ProposalNotices';
import type { EditorNotices } from './useEditorNotices';

/**
 * Avisos sobre o canvas: somente leitura, reparo ao abrir e backup da migração, erro ao salvar (B13),
 * erros de operação, dica de desenho e progresso.
 */
export function CanvasNotices({ notices }: { readonly notices: EditorNotices }) {
  const { open, session, store, ui, review } = useEditor();
  // Com o diálogo de alteração externa aberto, o erro de gravação já está explicado nele.
  const saveFailed =
    session.saveStatus.value === 'error' && session.conflict.value === null;
  const [backupDismissed, setBackupDismissed] = useState(false);
  const backupSaved = session.backupSaved.value;
  // Projeto reparado ao abrir: o aviso do reparo já fala do backup (não é uma migração).
  const repairs = open.repaired?.length ?? 0;
  const readOnly = store.readOnly.value;
  const locked = store.locked.value;
  // O projeto à vista (na visão Proposto da revisão, o "como ficaria").
  const hasImagesSignal = useComputed(
    () => (review.derived.shownProject.value?.containers.length ?? 0) > 0,
  );
  const hasImages = hasImagesSignal.value;
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
        {ui.mode.value === 'draw' && !locked && hasImages && (
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
