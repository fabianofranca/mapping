import { t } from '../i18n';
import { Dialog } from './Dialog';
import { Button } from './controls';
import { DiagnosticsActions, DiagnosticsTable, useCopyErrors } from './DiagnosticsView';

/**
 * Menu → Diagnóstico, no celular (no desktop é a janela inferior, `DiagnosticsView`):
 * últimos erros tratados pela app, para copiar e colar numa conversa.
 */
export function DiagnosticsDialog({ onClose }: { readonly onClose: () => void }) {
  const copying = useCopyErrors();

  return (
    <Dialog
      title={t('diagnostics.title')}
      onCancel={onClose}
      actions={
        <>
          <DiagnosticsActions {...copying} />
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      <DiagnosticsTable />
    </Dialog>
  );
}
