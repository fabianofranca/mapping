import { Fragment, type ComponentChildren } from 'preact';
import { t } from '../i18n';
import { imageDeletionImpact, markingDeletionImpact } from '../model';
import { Dialog } from '../ui/Dialog';
import { useEditor, type EditorContextValue } from '../ui/EditorContext';
import { markingLabel } from '../ui/labels';
import { HELP_SHORTCUTS, HelpDialog } from '../ui/HelpDialog';
import { SettingsDialog } from '../ui/SettingsDialog';
import { SpecsDialog } from '../ui/SpecsDialog';
import { closeProject } from './controller';
import { ExportDialog } from './ExportDialog';
import { PanelsMenu } from './PanelsMenu';
import type { EditorDialog, EditorDialogs as Dialogs } from './useEditorDialogs';
import type { ImageIntake } from './useImageIntake';
import type { ProjectCommands } from './useProjectCommands';
import { Button } from '../ui/controls';

interface EditorDialogsProps {
  readonly dialogs: Dialogs;
  readonly busy: boolean;
  readonly intake: ImageIntake;
  readonly commands: ProjectCommands;
}

const formatSize = (s: { width: number; height: number }) =>
  t('image.dimensions', { width: s.width, height: s.height });

/** Diálogo de confirmação: Cancelar + uma ação (destrutiva ou principal). */
function ConfirmDialog({
  title,
  confirmLabel,
  tone,
  onCancel,
  onConfirm,
  children,
}: {
  readonly title: string;
  readonly confirmLabel: string;
  readonly tone: 'danger' | 'primary';
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly children: ComponentChildren;
}) {
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

function AddMenuDialog({
  dialogs,
  intake,
}: {
  readonly dialogs: Dialogs;
  readonly intake: ImageIntake;
}) {
  return (
    <Dialog
      title={t('editor.addImages')}
      onCancel={dialogs.close}
      actions={<Button onClick={dialogs.close}>{t('common.cancel')}</Button>}
    >
      <div class="dialog-stack">
        <Button onClick={intake.pickFromDevice}>{t('editor.addFromDevice')}</Button>
        <Button onClick={() => void intake.pasteImage()}>{t('editor.pasteImage')}</Button>
      </div>
    </Dialog>
  );
}

function renderDialog(
  dialog: EditorDialog,
  { dialogs, busy, intake, commands }: EditorDialogsProps,
  ctx: EditorContextValue,
) {
  const { store, actions, ui } = ctx;
  const project = store.committed.value;
  if (!project) return null;
  const readOnly = store.readOnly.value;
  const { close } = dialogs;

  switch (dialog.kind) {
    case 'addMenu':
      return <AddMenuDialog dialogs={dialogs} intake={intake} />;
    case 'panels':
      return <PanelsMenu dialogs={dialogs} busy={busy} commands={commands} />;
    case 'specs':
      return <SpecsDialog project={project} readOnly={readOnly} onClose={close} />;
    case 'settings':
      return (
        <SettingsDialog
          onClose={close}
          onShowShortcuts={() => dialogs.show({ kind: 'help', section: HELP_SHORTCUTS })}
        />
      );
    case 'help':
      return <HelpDialog onClose={close} section={dialog.section} />;
    case 'deleteImage': {
      const { image } = dialog;
      const impact = imageDeletionImpact(project, image.id);
      return (
        <ConfirmDialog
          title={t('image.deleteTitle')}
          confirmLabel={t('common.delete')}
          tone="danger"
          onCancel={close}
          onConfirm={() => {
            close();
            if (actions.removeImage(image.id).ok) ui.selection.value = null;
          }}
        >
          <p>
            {t('image.deleteMessage', {
              file: image.file,
              ...impact,
            })}
          </p>
          {impact.lockedMarkings > 0 && (
            <p role="alert">
              <strong>
                {t('lock.deleteWarning', { locked: impact.lockedMarkings })}
              </strong>
            </p>
          )}
        </ConfirmDialog>
      );
    }
    case 'deleteMarking': {
      const { marking } = dialog;
      const impact = markingDeletionImpact(project, marking.id);
      return (
        <ConfirmDialog
          title={t('marking.deleteTitle')}
          confirmLabel={t('common.delete')}
          tone="danger"
          onCancel={close}
          onConfirm={() => {
            close();
            if (actions.removeMarking(marking.id).ok) ui.selection.value = null;
          }}
        >
          <p>
            {t('marking.deleteMessage', {
              name: markingLabel(marking),
              ...impact,
            })}
          </p>
          {impact.lockedDescendants > 0 && (
            <p role="alert">
              <strong>
                {t('lock.deleteWarning', { locked: impact.lockedDescendants })}
              </strong>
            </p>
          )}
        </ConfirmDialog>
      );
    }
    case 'aspect': {
      const answer = (confirmed: boolean) => {
        dialog.resolve(confirmed);
        close();
      };
      return (
        <ConfirmDialog
          title={t('image.aspectTitle')}
          confirmLabel={t('image.aspectConfirm')}
          tone="primary"
          onCancel={() => answer(false)}
          onConfirm={() => answer(true)}
        >
          <p>
            {t('image.aspectMessage', {
              from: formatSize(dialog.change.from),
              to: formatSize(dialog.change.to),
            })}
          </p>
        </ConfirmDialog>
      );
    }
    case 'export':
      return <ExportDialog file={dialog.file} onDone={close} />;
    case 'confirmClose':
      return (
        <ConfirmDialog
          title={t('editor.closeUnsavedTitle')}
          confirmLabel={t('editor.closeAnyway')}
          tone="danger"
          onCancel={close}
          onConfirm={() => void closeProject()}
        >
          <p>{t('editor.closeUnsavedMessage')}</p>
        </ConfirmDialog>
      );
  }
}

/** O diálogo aberto no editor (`dialogs.current`), se houver. */
export function EditorDialogs(props: EditorDialogsProps) {
  const ctx = useEditor();
  const { current } = props.dialogs;
  if (!current) return null;
  return <Fragment key={current.kind}>{renderDialog(current, props, ctx)}</Fragment>;
}
