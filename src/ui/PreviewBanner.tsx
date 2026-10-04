import { t } from '../i18n';
import { dismissPreviewBanner, previewBannerDismissed } from '../store/banners';
import { isPreview } from '../utils/channel';
import { Banner } from './Banner';

/** Selo PREVIEW permanente (barra principal, tela inicial): o build de preview nunca passa despercebido. */
export function PreviewBadge() {
  if (!isPreview) return null;
  return (
    <span class="badge badge-warning" title={t('pwa.previewBanner')}>
      {t('pwa.previewBadge')}
    </span>
  );
}

/**
 * Faixa do build de preview: deixa claro que os dados são outros. Pode ser dispensada
 * na sessão (P8); o selo e o canal na barra de status continuam.
 */
export function PreviewBanner() {
  if (!isPreview || previewBannerDismissed.value) return null;
  return (
    <Banner tone="warning" class="preview-banner" onDismiss={dismissPreviewBanner}>
      {t('pwa.previewBanner')}
    </Banner>
  );
}
