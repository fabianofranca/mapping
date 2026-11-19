import { useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  pageContent,
  pageDeletionBrokenRefs,
  pointThreadsOnPage,
  type PageContent,
  type Project,
} from '../model';
import { Button, Select } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';

// Delete page (stage #883, PG2, decision 10). An empty page gets the simple confirmation. A page
// with content says how many items, markings, arrows and annotations it has and has two exits:
// move the content to another page, or delete the page and everything in it. Each exit is ONE
// store action (one undo entry). "Cancel" has the focus (`autofocus`: the Select is first in the body).

interface DeleteProps {
  readonly id: string;
  /** Cancel, Esc or the X: nothing was deleted. */
  readonly onClose: () => void;
  /** After deleting; without it `onClose` applies. */
  readonly onDeleted?: () => void;
}

const isEmpty = (c: PageContent) => c.roots === 0 && c.arrows === 0;

function Counts({ content }: { readonly content: PageContent }) {
  return (
    <ul class="page-delete-counts">
      <li>{t('page.delete.roots', { count: content.roots })}</li>
      <li>{t('page.delete.markings', { count: content.markings })}</li>
      <li>{t('page.delete.arrows', { count: content.arrows })}</li>
      <li>{t('page.delete.annotations', { count: content.annotations })}</li>
    </ul>
  );
}

interface BodyProps {
  readonly project: Project;
  readonly id: string;
  readonly content: PageContent;
  readonly target: string;
  readonly onTarget: (id: string) => void;
}

function ContentBody({ project, id, content, target, onTarget }: BodyProps) {
  const others = project.pages.filter((p) => p.id !== id);
  return (
    <>
      <p>{t('page.delete.hasContent')}</p>
      <Counts content={content} />
      <Select
        label={t('page.delete.moveTo')}
        value={target}
        onChange={(e) => onTarget(e.currentTarget.value)}
      >
        {others.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <p class="muted">{t('page.delete.moveHint')}</p>
      <p>{t('page.delete.discardWarning')}</p>
    </>
  );
}

/** The conversations on empty spots of the page lose their place (their files are not rewritten). */
function ThreadsWarning({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return (
    <p class="muted">
      {count === 1
        ? t('page.delete.threadsOne')
        : t('page.delete.threadsMany', { count })}
    </p>
  );
}

/** The references from annotations that stay that "delete the page and everything in it" breaks. */
function BrokenRefsWarning({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return <p role="status">{t('page.delete.brokenRefs', { count })}</p>;
}

export function DeletePageDialog({ id, onClose, onDeleted }: DeleteProps) {
  const { actions, session, store } = useEditor();
  const project = store.committed.value;
  const page = project?.pages.find((p) => p.id === id);
  const threads = session.threads.list.value;
  const first = project?.pages.find((p) => p.id !== id)?.id ?? '';
  const [target, setTarget] = useState(first);
  const [failed, setFailed] = useState(false);
  if (!project || !page) return null;

  const content = pageContent(project, id);
  const lost = pointThreadsOnPage(project, threads, id);
  const empty = isEmpty(content);
  const broken = pageDeletionBrokenRefs(project, id, { discard: true });
  const run = (how: { readonly moveTo: string } | { readonly discard: true }) => {
    // The store takes the app to the first page when the open one goes; announcing it first means
    // that the "no longer exists" notice (for an undo or an external reload) is not shown.
    const wasOpen = session.page.openId() === id;
    session.page.expectRemoval(id);
    if (!actions.deletePage(id, how).ok) {
      session.page.expectRemoval(null);
      setFailed(true);
      return;
    }
    // The content moved: the destination page opens, so the user sees where it went.
    if (wasOpen && 'moveTo' in how) session.page.open(how.moveTo);
    (onDeleted ?? onClose)();
  };

  return (
    <Dialog
      title={t('page.delete.title', { name: page.name })}
      alert
      onCancel={onClose}
      actions={
        <>
          <Button autofocus onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {empty ? (
            <Button variant="danger" onClick={() => run({ discard: true })}>
              {t('page.delete.confirmEmpty')}
            </Button>
          ) : (
            <>
              <Button onClick={() => run({ moveTo: target })}>
                {t('page.delete.moveConfirm')}
              </Button>
              <Button variant="danger" onClick={() => run({ discard: true })}>
                {t('page.delete.discard')}
              </Button>
            </>
          )}
        </>
      }
    >
      {empty ? (
        <p>{t('page.delete.empty')}</p>
      ) : (
        <ContentBody
          project={project}
          id={id}
          content={content}
          target={target}
          onTarget={setTarget}
        />
      )}
      <BrokenRefsWarning count={broken} />
      <ThreadsWarning count={lost} />
      {failed && (
        <p class="field-error" role="alert">
          {t('page.error.generic')}
        </p>
      )}
    </Dialog>
  );
}
