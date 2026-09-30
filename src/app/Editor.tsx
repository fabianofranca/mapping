import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasController } from '../canvas/CanvasController';
import { CanvasHost } from '../canvas/CanvasHost';
import { t } from '../i18n';
import { imageDeletionImpact, type ProjectImage } from '../model';
import type { AspectChange } from '../store/session';
import { createEditorUi } from '../store/ui';
import { BottomSheet } from '../ui/BottomSheet';
import { Dialog } from '../ui/Dialog';
import { AddImageIcon, FitIcon, MenuIcon, RedoIcon, UndoIcon } from '../ui/icons';
import { SaveStatus } from '../ui/SaveStatus';
import { SelectionPanel } from '../ui/SelectionPanel';
import { SettingsBar } from '../ui/SettingsBar';
import { ToolButton } from '../ui/ToolButton';
import { useMediaQuery } from '../ui/useMediaQuery';
import { buildExport, closeProject, type OpenProject } from './controller';
import { ExportDialog } from './ExportDialog';
import { isTextInput, shortcutFor } from './shortcuts';

/** Largura a partir da qual o layout de desktop é usado (PLAN.md, 7.1). */
const DESKTOP_QUERY = '(min-width: 900px)';

interface AspectPrompt {
  readonly change: AspectChange;
  readonly resolve: (confirmed: boolean) => void;
}

const formatSize = (s: { width: number; height: number }) =>
  t('image.dimensions', { width: s.width, height: s.height });

export function Editor({ open }: { readonly open: OpenProject }) {
  const { session, display } = open;
  const { store, actions } = session;
  const ui = useMemo(() => createEditorUi(), [session]);
  const controller = useRef<CanvasController | null>(null);
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const imageInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exportFile, setExportFile] = useState<File | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectImage | null>(null);
  const [aspectPrompt, setAspectPrompt] = useState<AspectPrompt | null>(null);

  const project = store.project.value;
  const readOnly = store.readOnly.value;
  const selection = ui.selection.value;
  const selectedImage =
    (selection?.kind === 'image' && project?.images.find((i) => i.id === selection.id)) ||
    null;
  const busy = progress !== null;

  // Atalhos de teclado. Diálogos abertos cuidam do próprio teclado (Esc).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextInput(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const shortcut = shortcutFor(e);
      if (!shortcut) return;
      e.preventDefault();
      if (shortcut === 'undo') store.undo();
      if (shortcut === 'redo') store.redo();
      if (shortcut === 'escape' && !controller.current?.cancelInteraction()) {
        ui.selection.value = null;
      }
      if (shortcut === 'delete' && !store.readOnly.peek()) {
        const current = ui.selection.peek();
        const image =
          current?.kind === 'image'
            ? store.project.peek()?.images.find((i) => i.id === current.id)
            : undefined;
        if (image) setDeleteTarget(image);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store, ui]);

  if (!project) return null;

  const onImagesChosen = async (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    setMessage(null);
    const failed: string[] = [];
    const added: string[] = [];
    // Uma chamada por arquivo para mostrar o progresso.
    for (const [index, file] of files.entries()) {
      setProgress(t('editor.importing', { current: index + 1, total: files.length }));
      const result = await session.addImages([file]);
      failed.push(...result.failed);
      added.push(...result.added);
    }
    setProgress(null);
    const last = store.project.peek()?.images.find((i) => i.file === added.at(-1));
    if (last) {
      ui.selection.value = { kind: 'image', id: last.id };
      controller.current?.fitAll();
    }
    if (failed.length > 0)
      setMessage(t('editor.importFailed', { names: failed.join(', ') }));
  };

  const askAspectChange = (change: AspectChange) =>
    new Promise<boolean>((resolve) => setAspectPrompt({ change, resolve }));

  const answerAspect = (confirmed: boolean) => {
    aspectPrompt?.resolve(confirmed);
    setAspectPrompt(null);
  };

  const onReplace = (image: ProjectImage) => {
    replaceTarget.current = image.id;
    replaceInput.current?.click();
  };

  const onReplaceChosen = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    const imageId = replaceTarget.current;
    replaceTarget.current = null;
    if (!file || !imageId) return;
    setMessage(null);
    setProgress(t('image.replacing'));
    const result = await session.replaceImage(imageId, file, askAspectChange);
    setProgress(null);
    if (result === 'failed') setMessage(t('image.replaceFailed'));
  };

  const onDeleteConfirmed = (image: ProjectImage) => {
    setDeleteTarget(null);
    if (actions.removeImage(image.id).ok) ui.selection.value = null;
  };

  const onExport = async () => {
    setMenuOpen(false);
    setMessage(null);
    setProgress(t('editor.exporting'));
    const result = await buildExport();
    setProgress(null);
    if (result.ok) setExportFile(result.value);
    else setMessage(t(`error.${result.error}`));
  };

  const onClose = async () => {
    setMenuOpen(false);
    await session.flush();
    if (session.saveStatus.value === 'error') setConfirmClose(true);
    else await closeProject();
  };

  const addButton = (
    <ToolButton
      icon={<AddImageIcon />}
      label={t('editor.addImages')}
      text={desktop ? t('editor.addImages') : t('editor.addImageShort')}
      disabled={readOnly || busy}
      onClick={() => imageInput.current?.click()}
    />
  );
  const historyButtons = (
    <>
      <ToolButton
        icon={<UndoIcon />}
        label={t('editor.undo')}
        disabled={!store.canUndo.value}
        onClick={() => store.undo()}
      />
      <ToolButton
        icon={<RedoIcon />}
        label={t('editor.redo')}
        disabled={!store.canRedo.value}
        onClick={() => store.redo()}
      />
      <ToolButton
        icon={<FitIcon />}
        label={t('editor.fitAll')}
        onClick={() => controller.current?.fitAll()}
      />
    </>
  );
  const panel = (
    <SelectionPanel
      image={selectedImage}
      display={selectedImage ? display.images.value.get(selectedImage.file) : undefined}
      readOnly={readOnly}
      busy={busy}
      onReplace={onReplace}
      onDelete={setDeleteTarget}
    />
  );

  return (
    <div class={desktop ? 'editor editor-desktop' : 'editor editor-mobile'}>
      <header class="topbar editor-bar">
        {desktop && (
          <button type="button" class="button" onClick={() => void onClose()}>
            {t('common.close')}
          </button>
        )}
        <h1 class="project-title">{project.project.name}</h1>
        <SaveStatus open={open} />
        {desktop && (
          <div class="toolbar">
            {addButton}
            {historyButtons}
            <button
              type="button"
              class="button"
              disabled={busy}
              onClick={() => void onExport()}
            >
              {t('editor.export')}
            </button>
          </div>
        )}
        <ToolButton
          icon={<MenuIcon />}
          label={t('editor.menu')}
          onClick={() => setMenuOpen(true)}
        />
      </header>

      <div class="editor-body">
        <main class="canvas-area" aria-label={t('editor.canvasLabel')}>
          <CanvasHost
            store={store}
            actions={actions}
            display={display}
            ui={ui}
            onReady={(c) => (controller.current = c)}
          />
          <div class="canvas-overlay">
            {readOnly && <p class="notice">{t('editor.readOnlyNotice')}</p>}
            {message && (
              <p class="notice notice-error" role="alert">
                {message}{' '}
                <button type="button" class="link" onClick={() => setMessage(null)}>
                  {t('editor.dismiss')}
                </button>
              </p>
            )}
            {progress && (
              <p class="notice notice-info" aria-live="polite">
                {progress}
              </p>
            )}
          </div>
          {project.images.length === 0 && (
            <div class="canvas-empty">
              <p class="muted">{t('editor.emptyCanvas')}</p>
              <button
                type="button"
                class="button button-primary"
                disabled={readOnly || busy}
                onClick={() => imageInput.current?.click()}
              >
                {t('editor.addImages')}
              </button>
            </div>
          )}
        </main>
        {desktop && (
          <aside class="side-panel">
            <h2>{t('panel.details')}</h2>
            {panel}
          </aside>
        )}
      </div>

      {!desktop && (
        <>
          <BottomSheet
            title={selectedImage?.file ?? t('panel.nothingSelected')}
            expanded={sheetExpanded}
            onToggle={() => setSheetExpanded(!sheetExpanded)}
          >
            {panel}
          </BottomSheet>
          <nav class="bottombar">
            {addButton}
            {historyButtons}
          </nav>
        </>
      )}

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void onImagesChosen(e.currentTarget)}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onReplaceChosen(e.currentTarget)}
      />

      {menuOpen && (
        <Dialog
          title={t('editor.menu')}
          onCancel={() => setMenuOpen(false)}
          actions={
            <button type="button" class="button" onClick={() => setMenuOpen(false)}>
              {t('common.close')}
            </button>
          }
        >
          <div class="menu-actions">
            <button
              type="button"
              class="button"
              disabled={busy}
              onClick={() => void onExport()}
            >
              {t('editor.export')}
            </button>
            <button type="button" class="button" onClick={() => void onClose()}>
              {t('editor.closeProject')}
            </button>
          </div>
          <SettingsBar />
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog
          title={t('image.deleteTitle')}
          onCancel={() => setDeleteTarget(null)}
          actions={
            <>
              <button type="button" class="button" onClick={() => setDeleteTarget(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-danger"
                onClick={() => onDeleteConfirmed(deleteTarget)}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>
            {t('image.deleteMessage', {
              file: deleteTarget.file,
              ...imageDeletionImpact(project, deleteTarget.id),
            })}
          </p>
        </Dialog>
      )}

      {aspectPrompt && (
        <Dialog
          title={t('image.aspectTitle')}
          onCancel={() => answerAspect(false)}
          actions={
            <>
              <button type="button" class="button" onClick={() => answerAspect(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-primary"
                onClick={() => answerAspect(true)}
              >
                {t('image.aspectConfirm')}
              </button>
            </>
          }
        >
          <p>
            {t('image.aspectMessage', {
              from: formatSize(aspectPrompt.change.from),
              to: formatSize(aspectPrompt.change.to),
            })}
          </p>
        </Dialog>
      )}

      {exportFile && (
        <ExportDialog file={exportFile} onDone={() => setExportFile(null)} />
      )}

      {confirmClose && (
        <Dialog
          title={t('editor.closeUnsavedTitle')}
          onCancel={() => setConfirmClose(false)}
          actions={
            <>
              <button type="button" class="button" onClick={() => setConfirmClose(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-danger"
                onClick={() => void closeProject()}
              >
                {t('editor.closeAnyway')}
              </button>
            </>
          }
        >
          <p>{t('editor.closeUnsavedMessage')}</p>
        </Dialog>
      )}
    </div>
  );
}
