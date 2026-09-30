import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasController } from '../canvas/CanvasController';
import { CanvasHost } from '../canvas/CanvasHost';
import { t } from '../i18n';
import {
  imageDeletionImpact,
  markingDeletionImpact,
  type Marking,
  type ProjectImage,
} from '../model';
import type { AspectChange } from '../store/session';
import {
  createEditorUi,
  resolveActiveLayerId,
  resolveSelection,
  visibleLayers,
  type Selection,
} from '../store/ui';
import { BottomSheet } from '../ui/BottomSheet';
import { Dialog } from '../ui/Dialog';
import { LayersDialog } from '../ui/LayersDialog';
import {
  AddImageIcon,
  DrawIcon,
  FitIcon,
  HandIcon,
  MenuIcon,
  RedoIcon,
  UndoIcon,
} from '../ui/icons';
import { markingLabel, markingPath } from '../ui/labels';
import { MarkingPanel } from '../ui/MarkingPanel';
import { MarkingTree } from '../ui/MarkingTree';
import { PanelTabs, type PanelTab } from '../ui/PanelTabs';
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
  const [deleteMarking, setDeleteMarking] = useState<Marking | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('details');
  const [aspectPrompt, setAspectPrompt] = useState<AspectPrompt | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);

  const project = store.project.value;
  const readOnly = store.readOnly.value;
  const selection = ui.selection.value;
  const mode = ui.mode.value;
  const selected = resolveSelection(project, selection);
  const selectedImage = selected?.kind === 'image' ? selected.image : null;
  const activeLayerId = resolveActiveLayerId(project, ui.activeLayer.value);
  const activeLayer = project?.layers.find((l) => l.id === activeLayerId) ?? null;
  const shownLayers = visibleLayers(project, ui.hiddenLayers.value, activeLayerId);
  const busy = progress !== null;
  const requestMarkingDelete = useRef<(marking: Marking) => void>(() => undefined);

  /** Exclusão de marcação: em cascata pede confirmação; simples, não (o desfazer cobre). */
  const onMarkingDelete = (marking: Marking) => {
    const current = store.project.peek();
    if (!current) return;
    const impact = markingDeletionImpact(current, marking.id);
    if (impact.descendants > 0 || impact.annotations > 0) setDeleteMarking(marking);
    else if (actions.removeMarking(marking.id).ok) ui.selection.value = null;
  };

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
        const current = resolveSelection(store.project.peek(), ui.selection.peek());
        if (current?.kind === 'image') setDeleteTarget(current.image);
        if (current?.kind === 'marking') requestMarkingDelete.current(current.marking);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store, ui]);

  requestMarkingDelete.current = onMarkingDelete;

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

  const onMarkingDeleteConfirmed = (marking: Marking) => {
    setDeleteMarking(null);
    if (actions.removeMarking(marking.id).ok) ui.selection.value = null;
  };

  const onTreeSelect = (next: NonNullable<Selection>) => {
    ui.selection.value = next;
    controller.current?.focusSelection();
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

  const modeButtons = (
    <div class="segmented" role="group">
      <ToolButton
        icon={<HandIcon />}
        label={t('editor.modeNavigate')}
        pressed={mode === 'navigate'}
        onClick={() => (ui.mode.value = 'navigate')}
      />
      <ToolButton
        icon={<DrawIcon />}
        label={t('editor.modeDraw')}
        pressed={mode === 'draw'}
        disabled={readOnly}
        onClick={() => (ui.mode.value = 'draw')}
      />
    </div>
  );
  const addButton = (
    <ToolButton
      icon={<AddImageIcon />}
      label={t('editor.addImages')}
      text={desktop ? t('editor.addImages') : undefined}
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
  const details =
    selected?.kind === 'marking' ? (
      <MarkingPanel
        key={selected.marking.id}
        project={project}
        marking={selected.marking}
        image={selected.image}
        visibleLayers={shownLayers}
        activeLayer={activeLayer}
        actions={actions}
        readOnly={readOnly || busy}
        onDelete={onMarkingDelete}
      />
    ) : (
      <SelectionPanel
        image={selectedImage}
        display={selectedImage ? display.images.value.get(selectedImage.file) : undefined}
        readOnly={readOnly}
        busy={busy}
        onReplace={onReplace}
        onDelete={setDeleteTarget}
      />
    );
  const panel = (
    <>
      <PanelTabs tab={panelTab} onChange={setPanelTab} />
      <div role="tabpanel" class="tab-panel">
        {panelTab === 'details' ? (
          details
        ) : (
          <MarkingTree project={project} selection={selection} onSelect={onTreeSelect} />
        )}
      </div>
    </>
  );
  const sheetTitle =
    selected?.kind === 'marking'
      ? markingPath(project, selected.marking)
      : (selectedImage?.file ?? t('panel.nothingSelected'));

  return (
    <div class={desktop ? 'editor editor-desktop' : 'editor editor-mobile'}>
      <header class="topbar editor-bar">
        {desktop && (
          <button type="button" class="button" onClick={() => void onClose()}>
            {t('common.close')}
          </button>
        )}
        <h1 class="project-title">{project.project.name}</h1>
        {activeLayer && (
          <button
            type="button"
            class="button layer-chip"
            style={{ '--layer-color': activeLayer.color }}
            aria-label={t('layer.chipLabel', { name: activeLayer.name })}
            title={t('layer.chipLabel', { name: activeLayer.name })}
            onClick={() => setLayersOpen(true)}
          >
            <span class="layer-dot" aria-hidden="true" />
            <span class="layer-chip-name">{activeLayer.name}</span>
          </button>
        )}
        <SaveStatus open={open} />
        {desktop && (
          <div class="toolbar">
            {modeButtons}
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
            {mode === 'draw' && !readOnly && project.images.length > 0 && (
              <p class="notice notice-info canvas-hint">{t('editor.drawHint')}</p>
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
        {desktop && <aside class="side-panel">{panel}</aside>}
      </div>

      {!desktop && (
        <>
          <BottomSheet
            title={sheetTitle}
            expanded={sheetExpanded}
            onToggle={() => setSheetExpanded(!sheetExpanded)}
          >
            {panel}
          </BottomSheet>
          <nav class="bottombar">
            {modeButtons}
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

      {layersOpen && (
        <LayersDialog
          project={project}
          ui={ui}
          actions={actions}
          readOnly={readOnly}
          onClose={() => setLayersOpen(false)}
        />
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

      {deleteMarking && (
        <Dialog
          title={t('marking.deleteTitle')}
          onCancel={() => setDeleteMarking(null)}
          actions={
            <>
              <button type="button" class="button" onClick={() => setDeleteMarking(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-danger"
                onClick={() => onMarkingDeleteConfirmed(deleteMarking)}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>
            {t('marking.deleteMessage', {
              name: markingLabel(deleteMarking),
              ...markingDeletionImpact(project, deleteMarking.id),
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
