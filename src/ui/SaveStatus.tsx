import { t } from '../i18n';
import type { OpenProject } from '../app/controller';

/** "Salvo" / "Salvando…" / "Erro ao salvar" (com tentar de novo) e "não exportado". */
export function SaveStatus({ open }: { readonly open: OpenProject }) {
  const { session } = open;
  if (session.store.readOnly.value) {
    return <span class="status">{t('status.readOnly')}</span>;
  }
  const status = session.saveStatus.value;
  return (
    <span class="status-group">
      {status === 'error' ? (
        <span class="status status-error" role="alert">
          {t('status.error')}
          <button type="button" class="link" onClick={() => void session.flush()}>
            {t('status.retry')}
          </button>
        </span>
      ) : (
        <span class="status" aria-live="polite">
          {t(status === 'saving' ? 'status.saving' : 'status.saved')}
        </span>
      )}
      {open.kind === 'local' && open.unexported.value && (
        <span class="status status-warning">{t('status.unexported')}</span>
      )}
    </span>
  );
}
