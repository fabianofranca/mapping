import { useEffect, useRef, useState } from 'preact/hooks';
import { CanvasHost } from '../canvas/CanvasHost';
import { t } from '../i18n';
import { goToAnnotation, resolveSelection, type Selection } from '../store/ui';
import type { AnnotationLocation } from '../store/ui';
import { EditorProvider, useEditor } from '../ui/EditorContext';
import { ListView } from '../ui/ListView';
import type { PanelTab } from '../ui/PanelTabs';
import { useMediaQuery } from '../ui/useMediaQuery';
import type { OpenProject } from './controller';
import { CanvasNotices } from './CanvasNotices';
import { SemanticTextButton } from './EditorTools';
import { EditorBottomBar, type EditorView } from './EditorBottomBar';
import { EditorDialogs } from './EditorDialogs';
import { EditorPanel, EditorSheet } from './EditorPanel';
import { EditorTopBar } from './EditorTopBar';
import { useEditorDialogs } from './useEditorDialogs';
import { useEditorNotices } from './useEditorNotices';
import { useEditorShortcuts } from './useEditorShortcuts';
import { ImageInputs, useImageIntake } from './useImageIntake';
import { useProjectCommands } from './useProjectCommands';

/** Largura a partir da qual o layout de desktop é usado (docs/history/PLAN-etapas-1-2.md, 7.1). */
const DESKTOP_QUERY = '(min-width: 900px)';

export function Editor({ open }: { readonly open: OpenProject }) {
  // Um contexto (e um estado de UI) novo por projeto aberto: o Editor não é remontado ao trocar.
  return (
    <EditorProvider open={open}>
      <EditorScreen />
    </EditorProvider>
  );
}

function EditorScreen() {
  const { store, ui, canvas } = useEditor();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const dialogs = useEditorDialogs();
  const notices = useEditorNotices();
  const intake = useImageIntake({ desktop, dialogs, notices });
  const commands = useProjectCommands(dialogs, notices);
  useEditorShortcuts(dialogs);

  const [panelTab, setPanelTab] = useState<PanelTab>('details');
  const [sheetExpanded, setSheetExpanded] = useState(false);
  /** Celular: aba ativa (Canvas | Lista). Desktop: lista lado a lado com o canvas. */
  const [view, setView] = useState<EditorView>('canvas');
  const [listOpen, setListOpen] = useState(false);
  const focusAfterView = useRef(false);

  const project = store.project.value;
  const selection = ui.selection.value;
  const hasSelection = resolveSelection(project, selection) !== null;
  const { busy } = notices;

  // Celular: sem seleção, a gaveta recolhe (ao selecionar algo ela abre recolhida).
  useEffect(() => {
    if (!hasSelection) setSheetExpanded(false);
  }, [hasSelection]);

  // Voltar da lista para o canvas (celular): centraliza depois que o canvas reaparece.
  useEffect(() => {
    if (view === 'canvas' && focusAfterView.current) {
      focusAfterView.current = false;
      canvas.current?.focusSelection();
    }
  }, [view, canvas]);

  if (!project) return null;

  /** Backlinks, "Ir para o alvo" e vinculadas: em qualquer marcação. */
  const onGoToAnnotation = (annotation: AnnotationLocation) => {
    const sameMarking =
      selection?.kind === 'marking' && selection.id === annotation.markingId;
    goToAnnotation(ui, annotation);
    if (!sameMarking) canvas.current?.focusSelection();
    if (!desktop) setSheetExpanded(true);
  };

  /** Tocar na lista seleciona a marcação e centraliza o canvas (no celular, muda para ele). */
  const onListSelect = (next: NonNullable<Selection>) => {
    ui.selection.value = next;
    if (desktop) {
      canvas.current?.focusSelection();
      return;
    }
    focusAfterView.current = true;
    setView('canvas');
  };

  const panelProps = {
    tab: panelTab,
    onTabChange: setPanelTab,
    busy,
    dialogs,
    onReplace: intake.requestReplace,
    onGoToAnnotation,
  };
  const list = (
    <ListView project={project} selection={selection} onSelect={onListSelect} />
  );
  const mobileList = !desktop && view === 'list';

  return (
    <div class={desktop ? 'editor editor-desktop' : 'editor editor-mobile'}>
      <EditorTopBar
        desktop={desktop}
        busy={busy}
        listOpen={listOpen}
        onToggleList={() => setListOpen(!listOpen)}
        onAdd={intake.onAddClick}
        dialogs={dialogs}
        commands={commands}
      />

      <div class="editor-body">
        <main
          class="canvas-area"
          aria-label={t('editor.canvasLabel')}
          hidden={mobileList}
          {...intake.dropHandlers}
        >
          <CanvasHost />
          <CanvasNotices notices={notices} />
          {!desktop && (
            <div class="canvas-float">
              <SemanticTextButton />
            </div>
          )}
          {project.images.length === 0 && (
            <div class="canvas-empty">
              <p class="muted">{t('editor.emptyCanvas')}</p>
              <button
                type="button"
                class="button button-primary"
                disabled={store.readOnly.value || busy}
                onClick={intake.onAddClick}
              >
                {t('editor.addImages')}
              </button>
            </div>
          )}
        </main>
        {mobileList && (
          <section class="list-screen" aria-label={t('list.title')}>
            {list}
          </section>
        )}
        {desktop && listOpen && (
          <aside class="list-pane" aria-label={t('list.title')}>
            {list}
          </aside>
        )}
        {desktop && (
          <aside class="side-panel">
            <EditorPanel {...panelProps} />
          </aside>
        )}
      </div>

      {!desktop && (
        <>
          {!mobileList && (
            <EditorSheet
              {...panelProps}
              expanded={sheetExpanded}
              onToggle={() => setSheetExpanded(!sheetExpanded)}
            />
          )}
          <EditorBottomBar
            view={view}
            onViewChange={setView}
            busy={busy}
            onAdd={intake.onAddClick}
          />
        </>
      )}

      <ImageInputs intake={intake} />
      <EditorDialogs dialogs={dialogs} busy={busy} intake={intake} commands={commands} />
    </div>
  );
}
