import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { PageNotice } from '../store/pages';
import { Button } from './controls';
import { useEditor } from './EditorContext';

// Notices of the pages (stage #883, PG2): the open page disappeared, roots moved to another page
// ("Moved to X" with "Open the page"), an undo or redo whose change is on another page, and the open
// perspective having nothing on this page. The store signal is taken and cleared (so it does not
// repeat); the notice stays on screen a few seconds. `removed` and `moved` sit in the foot of the
// canvas (`CanvasNotices`), where the short notices already are, because "Moved" has a button.
// `undone` and `redone` (decision 12) are text in the status bar (`usePageStepNotice`): they only
// say where the undo or redo happened and the open page did not change.

/** How long a page notice stays (ms). */
const NOTICE_MS = 8000;

export type StepNotice = Extract<PageNotice, { kind: 'undone' | 'redone' }>;

const isStep = (notice: PageNotice): notice is StepNotice =>
  notice.kind === 'undone' || notice.kind === 'redone';

function noticeText(notice: Exclude<PageNotice, StepNotice>): string {
  return notice.kind === 'removed'
    ? t('page.notice.removed', { name: notice.name })
    : t('page.move.done', { name: notice.name });
}

/** The status bar text of an undo or redo on another page. */
export function stepNoticeText(notice: StepNotice): string {
  return t(notice.kind === 'undone' ? 'page.notice.undone' : 'page.notice.redone', {
    name: notice.name,
  });
}

/**
 * Takes the store's notice that `wanted` accepts (clearing it) and keeps it for `NOTICE_MS`. The
 * ones it does not accept stay in the signal for whoever shows them.
 */
function useTakenNotice<N extends PageNotice>(
  wanted: (notice: PageNotice) => notice is N,
): { readonly shown: N | null; readonly dismiss: () => void } {
  const { session } = useEditor();
  const [shown, setShown] = useState<N | null>(null);
  const notice = session.page.notice.value;

  useEffect(() => {
    if (notice === null || !wanted(notice)) return;
    setShown(notice);
    session.page.notice.value = null;
  }, [notice, session, wanted]);

  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => setShown(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return { shown, dismiss: () => setShown(null) };
}

const isCanvasNotice = (notice: PageNotice): notice is Exclude<PageNotice, StepNotice> =>
  !isStep(notice);

/** What the page notices show now: the taken notice and whether the perspective is empty here. */
export interface PageNoticeState {
  readonly shown: Exclude<PageNotice, StepNotice> | null;
  readonly emptyPerspective: boolean;
  /** Opens the destination of a `moved` notice and dismisses it. */
  readonly openMoved: (pageId: string) => void;
}

/** Takes the store's `removed` and `moved` notices (clearing them) and keeps them on screen for `NOTICE_MS`. */
export function usePageNotices(): PageNoticeState {
  const { session } = useEditor();
  const { shown, dismiss } = useTakenNotice(isCanvasNotice);
  return {
    shown,
    emptyPerspective: session.page.perspectiveEmpty.value,
    openMoved: (pageId) => {
      session.page.open(pageId);
      dismiss();
    },
  };
}

/** The "Undone on <page>" / "Redone on <page>" notice of the status bar, or `null` (decision 12). */
export function usePageStepNotice(): StepNotice | null {
  return useTakenNotice(isStep).shown;
}

/** The notices as paragraphs (the host decides where they sit). */
export function PageNoticeList({ shown, emptyPerspective, openMoved }: PageNoticeState) {
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
                onClick={() => openMoved(shown.pageId)}
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

/** Standalone: the hook and the list together. `CanvasNotices` uses them apart (the foot needs to know). */
export function PageNotices() {
  return <PageNoticeList {...usePageNotices()} />;
}
