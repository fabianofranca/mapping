import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { markDiagnosticsSeen } from '../store/diagnostics';
import { locale } from '../store/settings';
import {
  clearReportedErrors,
  formatReportedErrors,
  reportedErrors,
} from '../utils/report';
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

/** Copiar o registro como texto; `copied` guarda o resultado para o aviso. */
export function useCopyErrors() {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatReportedErrors(reportedErrors.peek()));
      setCopied('ok');
    } catch {
      // Sem a API (ou sem permissão): a tabela continua na tela para copiar à mão.
      setCopied('failed');
    }
  };
  return { copied, copy };
}

/** Copiar e Limpar (e o resultado da cópia): vão no cabeçalho da janela ou no rodapé do diálogo. */
export function DiagnosticsActions({ copied, copy }: ReturnType<typeof useCopyErrors>) {
  const empty = reportedErrors.value.length === 0;
  return (
    <>
      <span class="muted diagnostics-status" role="status">
        {copied === 'ok'
          ? t('diagnostics.copied')
          : copied === 'failed'
            ? t('common.copyFailed')
            : ''}
      </span>
      <Button size="sm" disabled={empty} onClick={clearReportedErrors}>
        {t('diagnostics.clear')}
      </Button>
      <Button size="sm" disabled={empty} onClick={() => void copy()}>
        {t('diagnostics.copy')}
      </Button>
    </>
  );
}

/** Registro de erros em tabela (Hora | Contexto | Mensagem), do mais recente ao mais antigo. */
export function DiagnosticsTable() {
  const errors = reportedErrors.value;
  return (
    <>
      <p class="muted diagnostics-intro">{t('diagnostics.intro')}</p>
      {errors.length === 0 ? (
        <p class="diagnostics-empty">{t('diagnostics.empty')}</p>
      ) : (
        <div class="list-scroll">
          <table class="list-table diagnostics-table" aria-label={t('diagnostics.title')}>
            <thead>
              <tr>
                <th scope="col">{t('diagnostics.col.time')}</th>
                <th scope="col">{t('diagnostics.col.context')}</th>
                <th scope="col">{t('diagnostics.col.message')}</th>
              </tr>
            </thead>
            <tbody>
              {[...errors].reverse().map((error) => (
                <tr
                  key={`${error.at}|${error.context}|${error.message}`}
                  class="list-row"
                >
                  <td class="list-cell" data-label={t('diagnostics.col.time')}>
                    <time class="muted" dateTime={error.at}>
                      {formatTime(error.at)}
                    </time>
                  </td>
                  <td class="list-cell" data-label={t('diagnostics.col.context')}>
                    <code>{error.context}</code>
                  </td>
                  <td
                    class="list-cell diagnostics-message"
                    data-label={t('diagnostics.col.message')}
                  >
                    {error.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * Conteúdo da janela Diagnóstico (B4). Enquanto está à vista, os erros novos contam
 * como vistos: o ponto de alerta da faixa só acende com a janela fechada.
 */
export function DiagnosticsView() {
  const last = reportedErrors.value.at(-1);
  useEffect(markDiagnosticsSeen, [last]);
  return (
    <div class="diagnostics-view">
      <DiagnosticsTable />
    </div>
  );
}
