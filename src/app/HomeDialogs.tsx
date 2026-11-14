import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { Button, TextField } from '../ui/controls';
import { Dialog } from '../ui/Dialog';

interface ProjectNameDialogProps {
  readonly title: string;
  /** `id` of the form: the "Create" button sits in the dialog actions and submits it by this id. */
  readonly formId: string;
  readonly busy: boolean;
  readonly name: string;
  /** Empty uses the `placeholder` as the name (see controller). */
  readonly placeholder: string;
  readonly onName: (name: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  /** Text before the field (the chosen folder and how many images it already has). */
  readonly children?: ComponentChildren;
}

/** "New project" and "configure folder" dialog: a name field, Cancel and Create. */
export function ProjectNameDialog({
  title,
  formId,
  busy,
  name,
  placeholder,
  onName,
  onCancel,
  onSubmit,
  children,
}: ProjectNameDialogProps) {
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={busy}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        {/* No focus of its own: the dialog gives the initial focus to the first body control (F9). */}
        <TextField
          label={t('project.name')}
          type="text"
          value={name}
          placeholder={placeholder}
          onInput={(e) => onName(e.currentTarget.value)}
        />
      </form>
    </Dialog>
  );
}
