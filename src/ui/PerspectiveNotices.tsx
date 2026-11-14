import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { showToast } from '../store/ui';
import { useEditor } from './EditorContext';

// Warnings of a forced switch to Main (stage #659, PE3): the open perspective disappeared or the
// review of a proposal opened Main. The warning goes out as the canvas's short warning
// (`showToast`) and the store signal is cleared, so it does not repeat.

export function PerspectiveNotices() {
  const { session, ui } = useEditor();
  const notice = session.perspective.notice.value;
  useEffect(() => {
    if (notice === null) return;
    showToast(
      ui,
      notice.kind === 'removed'
        ? t('perspective.notice.removed', { name: notice.name })
        : t('perspective.notice.review'),
    );
    session.perspective.notice.value = null;
  }, [notice, session, ui]);
  return null;
}
