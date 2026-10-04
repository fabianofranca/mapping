import { applyUpdate, updateReady } from '../app/pwa';
import { openProject } from '../app/controller';
import { t } from '../i18n';
import { Banner } from './Banner';
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
    <Banner
      tone="info"
      role="status"
      class="update-banner"
      action={
        <Button variant="primary" size="sm" onClick={() => void update()}>
          {t('pwa.update')}
        </Button>
      }
    >
      {t('pwa.updateAvailable')}
    </Banner>
  );
}
