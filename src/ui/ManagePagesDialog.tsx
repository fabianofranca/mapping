import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { Page } from '../model';
import { Button, IconButton, TextField } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { pageItemsText } from './pageItemsText';
import { pageErrorMessage } from './pageNameMessage';

// Manage pages (stage #883, PG2, decision 9): create, rename, reorder (Move up / Move down, no
// drag) and delete. The name rules are the model's: the action refuses (`page-name-empty`,
// `page-name-taken`) and the message appears under the field until the next keystroke.

/** Where the focus opens: the create field (default), or back from a delete confirmation. */
export type ManagePagesFocus =
  | { readonly kind: 'create' }
  | { readonly kind: 'delete'; readonly id: string }
  | { readonly kind: 'close' };

interface ManageProps {
  readonly onClose: () => void;
  readonly focus?: ManagePagesFocus;
  /** Opens the delete confirmation of the page. */
  readonly onDelete: (id: string) => void;
}

function CreateForm() {
  const { actions } = useEditor();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const result = actions.addPage(draft);
    if (result.ok) {
      setDraft('');
      setError(null);
    } else {
      setError(pageErrorMessage(result, draft));
    }
  };
  return (
    <form
      class="page-create"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField
        aria-label={t('page.manage.createField')}
        value={draft}
        invalid={error !== null}
        onInput={(e) => {
          setDraft(e.currentTarget.value);
          setError(null);
        }}
      />
      <Button type="submit" variant="primary">
        {t('page.manage.create')}
      </Button>
      {error !== null && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** The rename form; exists only while editing, so the draft is born from the current name. */
function RenameForm({
  page,
  onDone,
}: {
  readonly page: Page;
  readonly onDone: () => void;
}) {
  const { actions } = useEditor();
  const [draft, setDraft] = useState(page.name);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const result = actions.renamePage(page.id, draft);
    if (result.ok) onDone();
    else setError(pageErrorMessage(result, draft));
  };
  return (
    <form
      class="page-rename"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <TextField
        size="sm"
        aria-label={t('page.manage.renameField', { name: page.name })}
        value={draft}
        invalid={error !== null}
        onInput={(e) => {
          setDraft(e.currentTarget.value);
          setError(null);
        }}
      />
      <IconButton
        icon="check"
        type="submit"
        size="sm"
        label={t('page.manage.renameSave')}
      />
      <IconButton
        icon="close"
        size="sm"
        label={t('page.manage.renameCancel')}
        onClick={onDone}
      />
      {error !== null && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

interface RowProps {
  readonly page: Page;
  readonly index: number;
  readonly total: number;
  readonly onDelete: (id: string) => void;
}

function PageRow({ page, index, total, onDelete }: RowProps) {
  const { actions, session } = useEditor();
  const { name } = page;
  const [editing, setEditing] = useState(false);
  const open = session.page.id.value === page.id;
  const count = session.page.rootCounts.value.get(page.id) ?? 0;
  return (
    <tr>
      <th scope="row" class="page-name">
        {editing ? (
          <RenameForm key={name} page={page} onDone={() => setEditing(false)} />
        ) : (
          <>
            {name}
            {open && <span class="page-open-mark">{t('page.manage.open')}</span>}
          </>
        )}
      </th>
      <td class="muted">{pageItemsText(count)}</td>
      <td class="page-actions-cell">
        <IconButton
          icon="arrowUp"
          size="sm"
          label={t('page.manage.moveUp', { name })}
          disabled={index === 0}
          onClick={() => actions.movePage(page.id, index - 1)}
        />
        <IconButton
          icon="arrowDown"
          size="sm"
          label={t('page.manage.moveDown', { name })}
          disabled={index === total - 1}
          onClick={() => actions.movePage(page.id, index + 1)}
        />
        <IconButton
          icon="edit"
          size="sm"
          label={t('page.manage.rename', { name })}
          onClick={() => setEditing(true)}
        />
        <IconButton
          icon="trash"
          size="sm"
          variant="danger"
          label={t('page.manage.delete', { name })}
          tooltip={total === 1 ? t('page.manage.deleteLast') : undefined}
          disabled={total === 1}
          data-delete-for={page.id}
          onClick={() => onDelete(page.id)}
        />
      </td>
    </tr>
  );
}

/** Manage pages: create field, then a table with reorder, rename and delete per row. */
export function ManagePagesDialog({ onClose, focus, onDelete }: ManageProps) {
  const { store } = useEditor();
  const root = useRef<HTMLDivElement>(null);
  const project = store.committed.value;
  // After the initial focus of the `Dialog` (which lands on the create field).
  useLayoutEffect(() => {
    if (!focus || focus.kind === 'create') return;
    const dialog = root.current?.closest('dialog');
    const target =
      focus.kind === 'close'
        ? dialog?.querySelector<HTMLElement>('[data-dialog-actions] button')
        : [...(dialog?.querySelectorAll<HTMLElement>('[data-delete-for]') ?? [])].find(
            (el) => el.dataset.deleteFor === focus.id,
          );
    target?.focus();
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!project) return null;
  return (
    <Dialog
      title={t('page.manage.title')}
      size="lg"
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <div ref={root}>
        <CreateForm />
      </div>
      <table class="page-table" aria-label={t('page.manage.table')}>
        <thead>
          <tr>
            <th scope="col">{t('page.manage.colName')}</th>
            <th scope="col">{t('page.manage.colContent')}</th>
            <th scope="col">{t('page.manage.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {project.pages.map((page, index) => (
            <PageRow
              key={page.id}
              page={page}
              index={index}
              total={project.pages.length}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
      <p class="muted">{t('page.manage.note')}</p>
    </Dialog>
  );
}
