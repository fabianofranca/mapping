import { t } from '../i18n';
import { dismissProjectNotice, projectNotice } from '../store/banners';
import { Banner } from './Banner';

/** Notice of an opening (e.g. a folder that already had a project): stays at the top, on the home screen and in the editor, until dismissed. */
export function ProjectNoticeBanner() {
  const key = projectNotice.value;
  if (!key) return null;
  return (
    <Banner tone="info" role="status" onDismiss={dismissProjectNotice}>
      {t(key)}
    </Banner>
  );
}
