import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { PageNotice } from '../store/pages';
import { Button } from './controls';
import { useEditor } from './EditorContext';

// Notices of the pages (stage #883, PG2): the open page disappeared, roots moved to another page
// ("Moved to X" with "Open the page"), an undo or redo whose change is on another page, and the open
// perspective having nothing on this page. The store signal is taken and cleared (so it does not
// repeat); the notice stays on screen a few seconds. It sits in the foot of the canvas
// (`CanvasNotices`), where the short notices already are.

/** How long a page notice stays (ms). */
const NOTICE_MS = 8000;

function noticeText(notice: PageNotice): string {
  switch (notice.kind) {
    case 'removed':
      return t('page.notice.removed', { name: notice.name });
    case 'moved':
      return t('page.move.done', { name: notice.name });
    case 'undone':
      return t('page.notice.undone', { name: notice.name });
    case 'redone':
      return t('page.notice.redone', { name: notice.name });
  }
}

export function PageNotices() {
  const { session } = useEditor();
  const [shown, setShown] = useState<PageNotice | null>(null);
  const notice = session.page.notice.value;
  const emptyPerspective = session.page.perspectiveEmpty.value;

  useEffect(() => {
    if (notice === null) return;
    setShown(notice);
    session.page.notice.value = null;
  }, [notice, session]);

  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => setShown(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <>
      {shown !== null && (
        <p class="notice notice-info" role="status">
          {noticeText(shown)}
          {shown.kind === 'moved' && (
            <>
              {' '}
              <Button
                size="sm"
                class="button-link"
                onClick={() => {
                  session.page.open(shown.pageId);
                  setShown(null);
                }}
              >
                {t('page.move.open')}
              </Button>
            </>
          )}
        </p>
      )}
      {emptyPerspective && (
        <p class="notice notice-info" role="status">
          {t('page.notice.emptyPerspective')}
        </p>
      )}
    </>
  );
}
