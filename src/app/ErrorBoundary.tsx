import type { ComponentChildren } from 'preact';
import { useErrorBoundary } from 'preact/hooks';
import { t } from '../i18n';
import { openProject } from './controller';
import { reportError } from '../utils/report';

/** Último recurso: em vez de uma tela em branco, avisa e oferece recarregar. */
export function ErrorBoundary({ children }: { readonly children: ComponentChildren }) {
  const [error] = useErrorBoundary((caught) => {
    reportError('crash', caught);
    // Tenta gravar o que já estava no projeto antes de o usuário recarregar.
    void openProject.value?.session
      .flush()
      .catch((e: unknown) => reportError('crash.flush', e));
  });
  if (!error) return <>{children}</>;
  return (
    <main class="notice notice-error crash" role="alert">
      <h1>{t('error.crashed')}</h1>
      <p>{t('error.crashedHint')}</p>
      <button type="button" class="button" onClick={() => location.reload()}>
        {t('error.reload')}
      </button>
    </main>
  );
}
