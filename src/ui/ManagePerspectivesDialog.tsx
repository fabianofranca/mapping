import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { perspectiveNameIssue, type Perspective, type Project } from '../model';
import { Button, IconButton, Select, TextField } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { perspectiveContentText } from './perspectiveContentText';
import { perspectiveNameMessage } from './perspectiveNameMessage';

/** Onde o foco abre quando o Gerenciar volta de uma confirmação de apagar (etapa #764, AP1). */
export type ManageFocus =
  { readonly kind: 'delete'; readonly id: string } | { readonly kind: 'close' };

interface ManageProps {
  readonly onClose: () => void;
  /** Foco inicial; sem ele vale o de sempre (o primeiro controle do corpo). */
  readonly focus?: ManageFocus;
  /** Abre "Nova perspectiva". */
  readonly onNew: () => void;
  /** Abre a confirmação de apagar. */
  readonly onDelete: (id: string) => void;
}

/** Um nome de cópia que ainda não existe: "X (cópia)", "X (cópia) 2"… */
function copyName(project: Project, source: string): string {
  const base = t('perspective.manage.copyName', { name: source });
  const names = project.perspectives.map((p) => p.name);
  let candidate = base;
  for (let n = 2; perspectiveNameIssue(names, candidate) !== null; n++) {
    candidate = `${base} ${n}`;
  }
  return candidate;
}

function MainRow() {
  const name = t('perspective.principal');
  return (
    <tr>
      <th scope="row" class="perspective-name">
        {name}
      </th>
      <td>{t('perspective.manage.fixed')}</td>
      <td class="muted">{t('perspective.principalNote')}</td>
      <td class="perspective-actions">
        <IconButton
          icon="edit"
          label={t('perspective.manage.rename', { name })}
          size="sm"
          disabled
        />
        <IconButton
          icon="trash"
          label={t('perspective.manage.delete', { name })}
          size="sm"
          disabled
        />
      </td>
    </tr>
  );
}

interface RowProps {
  readonly project: Project;
  readonly perspective: Perspective;
  readonly onDelete: (id: string) => void;
  readonly onError: () => void;
  /** Uma operação deu certo: o erro da tabela some. */
  readonly onOk: () => void;
}

function WhoSelect({
  perspective,
  onError,
  onOk,
}: Pick<RowProps, 'perspective' | 'onError' | 'onOk'>) {
  const { session } = useEditor();
  // Muda quando a gravação falha: remonta o <select> para ele voltar ao valor da perspectiva.
  const [revert, setRevert] = useState(0);
  const local = session.perspective.localIds.value.has(perspective.id);
  return (
    <Select
      key={revert}
      size="sm"
      aria-label={t('perspective.manage.who', { name: perspective.name })}
      value={local ? 'mine' : 'all'}
      onChange={(e) => {
        const toLocal = e.currentTarget.value === 'mine';
        void session.perspectiveActions
          .setPerspectiveLocal(perspective.id, toLocal)
          .then((r) => {
            if (r.ok) {
              onOk();
            } else {
              setRevert((n) => n + 1);
              onError();
            }
          });
      }}
    >
      <option value="all">{t('perspective.new.whoAll')}</option>
      <option value="mine" disabled={!local && !session.perspective.localAvailable}>
        {t('perspective.new.whoMine')}
      </option>
    </Select>
  );
}

function NameCell({
  project,
  perspective,
  editing,
  onDone,
  onError,
}: Pick<RowProps, 'project' | 'perspective' | 'onError'> & {
  readonly editing: boolean;
  readonly onDone: () => void;
}) {
  if (!editing) return <>{perspective.name}</>;
  // `key` pelo nome: se ele muda por fora (desfazer, recarga), o rascunho recomeça dele.
  return (
    <RenameForm
      key={perspective.name}
      project={project}
      perspective={perspective}
      onDone={onDone}
      onError={onError}
    />
  );
}

/** O formulário de renomear; existe só enquanto edita, então o rascunho nasce do nome atual. */
function RenameForm({
  project,
  perspective,
  onDone,
  onError,
}: Pick<RowProps, 'project' | 'perspective' | 'onError'> & {
  readonly onDone: () => void;
}) {
  const { session } = useEditor();
  const [draft, setDraft] = useState(perspective.name);
  const issue = perspectiveNameIssue(
    project.perspectives.map((p) => p.name),
    draft,
    perspective.name,
  );
  const save = () => {
    if (issue !== null) return;
    if (!session.perspectiveActions.renamePerspective(perspective.id, draft.trim()).ok) {
      onError();
    }
    onDone();
  };
  return (
    <form
      class="perspective-rename"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <TextField
        size="sm"
        aria-label={t('perspective.manage.renameField', { name: perspective.name })}
        value={draft}
        invalid={issue !== null}
        onInput={(e) => setDraft(e.currentTarget.value)}
      />
      <IconButton
        icon="check"
        type="submit"
        size="sm"
        label={t('perspective.manage.renameSave')}
        disabled={issue !== null}
      />
      <IconButton
        icon="close"
        size="sm"
        label={t('perspective.manage.renameCancel')}
        onClick={onDone}
      />
      {issue !== null && (
        <p class="field-error" role="alert">
          {perspectiveNameMessage(issue, draft)}
        </p>
      )}
    </form>
  );
}

function PerspectiveRow(props: RowProps) {
  const { project, perspective, onDelete, onError, onOk } = props;
  const { session } = useEditor();
  const [editing, setEditing] = useState(false);
  const { name } = perspective;
  const duplicate = () => {
    const r = session.perspectiveActions.duplicatePerspective(
      perspective.id,
      copyName(project, name),
    );
    if (!r.ok) onError();
  };
  return (
    <tr>
      <th scope="row" class="perspective-name">
        <NameCell
          project={project}
          perspective={perspective}
          editing={editing}
          onDone={() => setEditing(false)}
          onError={onError}
        />
      </th>
      <td>
        <WhoSelect perspective={perspective} onError={onError} onOk={onOk} />
      </td>
      <td class="muted">{perspectiveContentText(project, perspective)}</td>
      <td class="perspective-actions">
        <IconButton
          icon="edit"
          size="sm"
          label={t('perspective.manage.rename', { name })}
          onClick={() => setEditing(true)}
        />
        <IconButton
          icon="copy"
          size="sm"
          label={t('perspective.manage.duplicate', { name })}
          onClick={duplicate}
        />
        <IconButton
          icon="trash"
          size="sm"
          variant="danger"
          label={t('perspective.manage.delete', { name })}
          data-delete-for={perspective.id}
          onClick={() => onDelete(perspective.id)}
        />
      </td>
    </tr>
  );
}

/** Gerenciar perspectivas: tabela com Quem vê trocável na linha, renomear, duplicar e apagar. */
export function ManagePerspectivesDialog({
  onClose,
  focus,
  onNew,
  onDelete,
}: ManageProps) {
  const { store } = useEditor();
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const project = store.project.value;
  // Depois do foco inicial do `Dialog` (efeito do filho, que roda antes deste).
  useLayoutEffect(() => {
    if (!focus) return;
    const dialog = root.current?.closest('dialog');
    const target =
      focus.kind === 'close'
        ? dialog?.querySelector<HTMLElement>('[data-dialog-actions] button')
        : [...(dialog?.querySelectorAll<HTMLElement>('[data-delete-for]') ?? [])].find(
            (el) => el.dataset.deleteFor === focus.id,
          );
    target?.focus();
    // Uma vez, ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!project) return null;
  return (
    <Dialog
      title={t('perspective.manage.title')}
      size="lg"
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <div class="perspective-manage-bar" ref={root}>
        <Button variant="primary" onClick={onNew}>
          {t('perspective.manage.new')}
        </Button>
      </div>
      <table class="perspective-table" aria-label={t('perspective.manage.table')}>
        <thead>
          <tr>
            <th scope="col">{t('perspective.manage.colName')}</th>
            <th scope="col">{t('perspective.manage.colWho')}</th>
            <th scope="col">{t('perspective.manage.colContent')}</th>
            <th scope="col">{t('perspective.manage.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          <MainRow />
          {project.perspectives.map((perspective) => (
            <PerspectiveRow
              key={perspective.id}
              project={project}
              perspective={perspective}
              onDelete={onDelete}
              onError={() => setFailed(true)}
              onOk={() => setFailed(false)}
            />
          ))}
        </tbody>
      </table>
      {failed && (
        <p class="field-error" role="alert">
          {t('perspective.error')}
        </p>
      )}
      <p class="muted">{t('perspective.manage.note')}</p>
    </Dialog>
  );
}
