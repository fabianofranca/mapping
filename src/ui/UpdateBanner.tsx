import { useState } from 'preact/hooks';
import { applyUpdate, updateReady } from '../app/pwa';
import { openProject } from '../app/controller';
import { t } from '../i18n';
import { Banner } from './Banner';
import { Button } from './controls';

/**
 * "Nova versão disponível — atualizar". Grava o projeto aberto antes de recarregar; se a
 * gravação falha, não recarrega (o aviso continua e diz que não salvou, e clicar de novo
 * tenta gravar outra vez).
 */
export function UpdateBanner() {
  const [saveFailed, setSaveFailed] = useState(false);
  if (!updateReady.value) return null;
  const update = async () => {
    const result = await openProject.value?.session.flush();
    if (result && !result.ok) {
      setSaveFailed(true);
      return;
    }
    setSaveFailed(false);
    applyUpdate();
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
      {saveFailed && ` ${t('status.error')}.`}
    </Banner>
  );
}
