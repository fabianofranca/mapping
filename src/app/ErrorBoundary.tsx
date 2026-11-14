import type { ComponentChildren } from 'preact';
import { useErrorBoundary } from 'preact/hooks';
import { t } from '../i18n';
import { openProject } from './controller';
import { reportError } from '../utils/report';
import { Button } from '../ui/controls';

/** Last resort: instead of a blank screen, warns and offers to reload. */
export function ErrorBoundary({ children }: { readonly children: ComponentChildren }) {
  const [error] = useErrorBoundary((caught) => {
    reportError('crash', caught);
    // Tries to write what was already in the project before the user reloads.
    void openProject.value?.session
      .flush()
      .catch((e: unknown) => reportError('crash.flush', e));
  });
  if (!error) return <>{children}</>;
  return (
    <main class="notice notice-error crash" role="alert">
      <h1>{t('error.crashed')}</h1>
      <p>{t('error.crashedHint')}</p>
      <Button onClick={() => location.reload()}>{t('error.reload')}</Button>
    </main>
  );
}
