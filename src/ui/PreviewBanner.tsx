import { t } from '../i18n';
import { isPreview } from '../utils/channel';

/** Faixa fixa do build de preview: deixa claro que os dados são outros. */
export function PreviewBanner() {
  if (!isPreview) return null;
  return (
    <div class="preview-banner" role="note">
      {t('pwa.previewBanner')}
    </div>
  );
}
