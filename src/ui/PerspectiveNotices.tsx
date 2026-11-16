import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import type { PerspectiveNotice } from '../store/perspectives';
import { showToast } from '../store/ui';
import { useEditor } from './EditorContext';

// Warnings of a forced switch to Main (stage #659, PE3): the open perspective disappeared, the
// review of a proposal opened Main, or going to an item the perspective does not show opened it
// (stage #883, `outside`). The warning goes out as the canvas's short warning
// (`showToast`) and the store signal is cleared, so it does not repeat.

function noticeText(notice: PerspectiveNotice): string {
  switch (notice.kind) {
    case 'removed':
      return t('perspective.notice.removed', { name: notice.name });
    case 'outside':
      return t('page.notice.outside', { name: notice.name });
    case 'review':
      return t('perspective.notice.review');
  }
}

export function PerspectiveNotices() {
  const { session, ui } = useEditor();
  const notice = session.perspective.notice.value;
  useEffect(() => {
    if (notice === null) return;
    showToast(ui, noticeText(notice));
    session.perspective.notice.value = null;
  }, [notice, session, ui]);
  return null;
}
