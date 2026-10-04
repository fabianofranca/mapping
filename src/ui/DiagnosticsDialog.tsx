import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { locale } from '../store/settings';
import {
  clearReportedErrors,
  formatReportedErrors,
  reportedErrors,
  type ReportedError,
} from '../utils/report';
import { Dialog } from './Dialog';
import { Button } from './controls';

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { timeStyle: 'medium' }).format(
      new Date(iso),
    );
  } catch {
    // Data ilegível: mostra o texto como está.
    return iso;
  }
}

function ErrorItem({ error }: { readonly error: ReportedError }) {
  return (
    <li class="diagnostics-item">
      <div class="diagnostics-head">
        <code>{error.context}</code>
        <time class="muted" dateTime={error.at}>
          {formatTime(error.at)}
        </time>
      </div>
      <div class="diagnostics-message">{error.message}</div>
    </li>
  );
}

/** Menu → Diagnóstico: últimos erros tratados pela app, para copiar e colar numa conversa. */
export function DiagnosticsDialog({ onClose }: { readonly onClose: () => void }) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const errors = reportedErrors.value;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatReportedErrors(errors));
      setCopied('ok');
    } catch {
      // Sem a API (ou sem permissão): a lista continua na tela para copiar à mão.
      setCopied('failed');
    }
  };

  return (
    <Dialog
      title={t('diagnostics.title')}
      onCancel={onClose}
      actions={
        <>
          <Button disabled={errors.length === 0} onClick={clearReportedErrors}>
            {t('diagnostics.clear')}
          </Button>
          <Button disabled={errors.length === 0} onClick={() => void copy()}>
            {t('diagnostics.copy')}
          </Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      <p class="muted">{t('diagnostics.intro')}</p>
      {errors.length === 0 ? (
        <p>{t('diagnostics.empty')}</p>
      ) : (
        <ul class="diagnostics-list">
          {[...errors].reverse().map((error) => (
            <ErrorItem
              key={`${error.at}|${error.context}|${error.message}`}
              error={error}
            />
          ))}
        </ul>
      )}
      <span class="muted" role="status">
        {copied === 'ok'
          ? t('diagnostics.copied')
          : copied === 'failed'
            ? t('common.copyFailed')
            : ''}
      </span>
    </Dialog>
  );
}
