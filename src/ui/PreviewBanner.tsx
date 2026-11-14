import { t } from '../i18n';
import { dismissPreviewBanner, previewBannerDismissed } from '../store/banners';
import { isPreview } from '../utils/channel';
import { Banner } from './Banner';

/** Permanent PREVIEW badge (main bar, home screen): the preview build never goes unnoticed. */
export function PreviewBadge() {
  if (!isPreview) return null;
  return (
    <span class="badge badge-warning" title={t('pwa.previewBanner')}>
      {t('pwa.previewBadge')}
    </span>
  );
}

/**
 * Preview build strip: makes clear that the data is different. It can be dismissed
 * for the session (P8); the badge and the channel in the status bar remain.
 */
export function PreviewBanner() {
  if (!isPreview || previewBannerDismissed.value) return null;
  return (
    <Banner tone="warning" class="preview-banner" onDismiss={dismissPreviewBanner}>
      {t('pwa.previewBanner')}
    </Banner>
  );
}
