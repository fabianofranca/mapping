import { Fragment, type ComponentChildren } from 'preact';
import { t } from '../i18n';
import { imageDeletionImpact, markingDeletionImpact } from '../model';
import { Dialog } from '../ui/Dialog';
import { DiagnosticsDialog } from '../ui/DiagnosticsDialog';
import { useEditor, type EditorContextValue } from '../ui/EditorContext';
import { markingLabel } from '../ui/labels';
import { LayersDialog } from '../ui/LayersDialog';
import { SettingsBar } from '../ui/SettingsBar';
import { SpecHelpDialog } from '../ui/SpecHelpDialog';
import { SpecsDialog } from '../ui/SpecsDialog';
import { closeProject } from './controller';
import { ExportDialog } from './ExportDialog';
import type { EditorDialog, EditorDialogs as Dialogs } from './useEditorDialogs';
import type { ImageIntake } from './useImageIntake';
import type { ProjectCommands } from './useProjectCommands';

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
          <button type="button" class="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" class={`button button-${tone}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

function CloseOnlyDialog({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ComponentChildren;
}) {
  return (
    <Dialog
      title={title}
      onCancel={onClose}
      actions={
        <button type="button" class="button" onClick={onClose}>
          {t('common.close')}
        </button>
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
      actions={
        <button type="button" class="button" onClick={dialogs.close}>
          {t('common.cancel')}
        </button>
      }
    >
      <div class="dialog-stack">
        <button type="button" class="button" onClick={intake.pickFromDevice}>
          {t('editor.addFromDevice')}
        </button>
        <button type="button" class="button" onClick={() => void intake.pasteImage()}>
          {t('editor.pasteImage')}
        </button>
      </div>
    </Dialog>
  );
}

function MenuDialog({
  dialogs,
  busy,
  commands,
}: {
  readonly dialogs: Dialogs;
  readonly busy: boolean;
  readonly commands: ProjectCommands;
}) {
  const open = (kind: 'specs' | 'help' | 'diagnostics') => () => dialogs.show({ kind });
  return (
    <CloseOnlyDialog title={t('editor.menu')} onClose={dialogs.close}>
      <div class="menu-actions">
        <button
          type="button"
          class="button"
          disabled={busy}
          onClick={() => void commands.exportProject()}
        >
          {t('editor.export')}
        </button>
        <button type="button" class="button" onClick={open('specs')}>
          {t('spec.menu')}
        </button>
        <button type="button" class="button" onClick={open('help')}>
          {t('help.open')}
        </button>
        <button type="button" class="button" onClick={open('diagnostics')}>
          {t('diagnostics.open')}
        </button>
        <button type="button" class="button" onClick={() => void commands.closeProject()}>
          {t('editor.closeProject')}
        </button>
      </div>
      <SettingsBar />
    </CloseOnlyDialog>
  );
}

function renderDialog(
  dialog: EditorDialog,
  { dialogs, busy, intake, commands }: EditorDialogsProps,
  ctx: EditorContextValue,
) {
  const { store, actions, ui } = ctx;
  const project = store.project.value;
  if (!project) return null;
  const readOnly = store.readOnly.value;
  const { close } = dialogs;

  switch (dialog.kind) {
    case 'addMenu':
      return <AddMenuDialog dialogs={dialogs} intake={intake} />;
    case 'menu':
      return <MenuDialog dialogs={dialogs} busy={busy} commands={commands} />;
    case 'specs':
      return <SpecsDialog project={project} readOnly={readOnly} onClose={close} />;
    case 'help':
      return <SpecHelpDialog onClose={close} />;
    case 'diagnostics':
      return <DiagnosticsDialog onClose={close} />;
    case 'layers':
      return <LayersDialog project={project} readOnly={readOnly} onClose={close} />;
    case 'deleteImage': {
      const { image } = dialog;
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
              ...imageDeletionImpact(project, image.id),
            })}
          </p>
        </ConfirmDialog>
      );
    }
    case 'deleteMarking': {
      const { marking } = dialog;
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
              ...markingDeletionImpact(project, marking.id),
            })}
          </p>
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
