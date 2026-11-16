import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { pageContent, type PageContent, type Project } from '../model';
import type { ProjectSession } from '../store/session';
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

/**
 * The deliberate delete of the OPEN page: the store took the app to the first page with the
 * "no longer exists" notice, which reads odd after the user asked for it. The notice goes away and,
 * when the content moved, the destination page opens (so the user sees where it went). An undo or
 * an external reload that removes the open page keeps the notice (those do not come through here).
 */
function settleOpenPage(
  session: ProjectSession,
  deleted: { readonly name: string },
  how: { readonly moveTo: string } | { readonly discard: true },
): void {
  if ('moveTo' in how) session.page.open(how.moveTo);
  const notice = session.page.notice.peek();
  if (notice?.kind === 'removed' && notice.name === deleted.name) {
    session.page.notice.value = null;
  }
}

export function DeletePageDialog({ id, onClose, onDeleted }: DeleteProps) {
  const { actions, session, store } = useEditor();
  const project = store.committed.value;
  const page = project?.pages.find((p) => p.id === id);
  const first = project?.pages.find((p) => p.id !== id)?.id ?? '';
  const [target, setTarget] = useState(first);
  const [failed, setFailed] = useState(false);
  if (!project || !page) return null;

  const content = pageContent(project, id);
  const empty = isEmpty(content);
  const run = (how: { readonly moveTo: string } | { readonly discard: true }) => {
    const wasOpen = session.page.openId() === id;
    if (!actions.deletePage(id, how).ok) {
      setFailed(true);
      return;
    }
    if (wasOpen) settleOpenPage(session, page, how);
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
      {failed && (
        <p class="field-error" role="alert">
          {t('page.error.generic')}
        </p>
      )}
    </Dialog>
  );
}
