import { t } from '../i18n';
import { dismissProjectNotice, projectNotice } from '../store/banners';
import { Banner } from './Banner';

/** Aviso de uma abertura (ex.: pasta que já tinha projeto): fica no topo, na tela inicial e no editor, até ser dispensado. */
export function ProjectNoticeBanner() {
  const key = projectNotice.value;
  if (!key) return null;
  return (
    <Banner tone="info" role="status" onDismiss={dismissProjectNotice}>
      {t(key)}
    </Banner>
  );
}
