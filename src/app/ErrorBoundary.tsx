import type { ComponentChildren } from 'preact';
import { useErrorBoundary } from 'preact/hooks';
import { t } from '../i18n';
import { openProject } from './controller';

/** Último recurso: em vez de uma tela em branco, avisa e oferece recarregar. */
export function ErrorBoundary({ children }: { readonly children: ComponentChildren }) {
  const [error] = useErrorBoundary((caught) => {
    console.error(caught);
    // Tenta gravar o que já estava no projeto antes de o usuário recarregar.
    void openProject.value?.session.flush().catch(() => undefined);
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
