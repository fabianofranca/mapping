import { applyUpdate, updateReady } from '../app/pwa';
import { openProject } from '../app/controller';
import { t } from '../i18n';
import { Button } from './controls';

/** "Nova versão disponível — atualizar". Grava o projeto aberto antes de recarregar. */
export function UpdateBanner() {
  if (!updateReady.value) return null;
  const update = async () => {
    try {
      await openProject.value?.session.flush();
    } finally {
      applyUpdate();
    }
  };
  return (
    <div class="notice notice-info update-banner" role="status">
      <span>{t('pwa.updateAvailable')}</span>
      <Button variant="primary" onClick={() => void update()}>
        {t('pwa.update')}
      </Button>
    </div>
  );
}
