import { useComputed } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CanvasHost } from '../canvas/CanvasHost';
import { t } from '../i18n';
import { BREAKPOINTS, DESKTOP_QUERY } from '../theme/breakpoints';
import { collapseDetailsOnCompact } from '../store/toolWindows';
import { goToAnnotation, resolveSelection, type Selection } from '../store/ui';
import type { AnnotationLocation } from '../store/ui';
import { EditorProvider, useEditor } from '../ui/EditorContext';
import { ListView } from '../ui/ListView';
import { Minimap } from '../ui/Minimap';
import type { PanelTab } from '../ui/PanelTabs';
import { StatusBar } from '../ui/StatusBar';
import { useMediaQuery } from '../ui/useMediaQuery';
import type { OpenProject } from './controller';
import { CanvasNotices } from './CanvasNotices';
import { SemanticTextButton } from './EditorTools';
import { EditorBottomBar, type EditorView } from './EditorBottomBar';
import { EditorDialogs } from './EditorDialogs';
import { EditorMainBar } from './EditorMainBar';
import { EditorSheet, type EditorPanelProps } from './EditorPanel';
import { EditorTopBar } from './EditorTopBar';
import { EditorWindows } from './EditorWindows';
import { useEditorDialogs } from './useEditorDialogs';
import { useEditorNotices } from './useEditorNotices';
import { useEditorShortcuts } from './useEditorShortcuts';
import { ImageInputs, useImageIntake } from './useImageIntake';
import { useProjectCommands } from './useProjectCommands';
import { Button } from '../ui/controls';

export function Editor({ open }: { readonly open: OpenProject }) {
  // Um contexto (e um estado de UI) novo por projeto aberto: o Editor não é remontado ao trocar.
  return (
    <EditorProvider open={open}>
      <EditorScreen />
    </EditorProvider>
  );
}

/** Exportado para o teste de contagem de renderizações (tests/components/editorRenders.test.tsx). */
export function EditorScreen() {
  const { store, ui, canvas } = useEditor();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const compact = useMediaQuery(`(max-width: ${BREAKPOINTS.compact}px)`);
  const dialogs = useEditorDialogs();
  const notices = useEditorNotices();
  const intake = useImageIntake({ desktop, dialogs, notices });
  const commands = useProjectCommands(dialogs, notices);
  useEditorShortcuts(dialogs, commands, desktop);

  const [panelTab, setPanelTab] = useState<PanelTab>('details');
  const [sheetExpanded, setSheetExpanded] = useState(false);
  /** Celular: aba ativa (Canvas | Lista). No desktop a Lista é a janela inferior. */
  const [view, setView] = useState<EditorView>('canvas');
  const focusAfterView = useRef(false);

  // Só fatias do projeto confirmado (ver `ProjectStore.committed`): a tela não
  // renderiza de novo a cada prévia de gesto, nem a cada edição que não as muda.
  const hasProject = useComputed(() => store.committed.value !== null);
  const hasSelection = useComputed(
    () => resolveSelection(store.committed.value, ui.selection.value) !== null,
  );
  const noImages = useComputed(() => (store.committed.value?.images.length ?? 0) === 0);
  const { busy } = notices;

  // Desktop compacto (abaixo de 1200px): Detalhes começa recolhido (B2).
  useEffect(() => {
    if (desktop && compact) collapseDetailsOnCompact();
  }, [desktop, compact]);

  // Celular: sem seleção, a gaveta recolhe (ao selecionar algo ela abre recolhida).
  useEffect(() => {
    if (!hasSelection.value) setSheetExpanded(false);
  }, [hasSelection.value]);

  // Voltar da lista para o canvas (celular): centraliza depois que o canvas reaparece.
  useEffect(() => {
    if (view === 'canvas' && focusAfterView.current) {
      focusAfterView.current = false;
      canvas.current?.focusSelection();
    }
  }, [view, canvas]);

  if (!hasProject.value) return null;

  /** Backlinks, "Ir para o alvo" e vinculadas: em qualquer marcação. */
  const onGoToAnnotation = (annotation: AnnotationLocation) => {
    const selection = ui.selection.peek();
    const sameMarking =
      selection?.kind === 'marking' && selection.id === annotation.markingId;
    goToAnnotation(ui, annotation);
    if (!sameMarking) canvas.current?.focusSelection();
    if (!desktop) setSheetExpanded(true);
  };

  /** Escolher na árvore, na lista ou nos breadcrumbs seleciona e centraliza o canvas. */
  const onSelect = (next: NonNullable<Selection>) => {
    ui.selection.value = next;
    if (desktop) {
      canvas.current?.focusSelection();
      return;
    }
    focusAfterView.current = true;
    setView('canvas');
  };

  const panel: EditorPanelProps = {
    busy,
    dialogs,
    onReplace: intake.requestReplace,
    onGoToAnnotation,
  };
  const mobileList = !desktop && view === 'list';

  const canvasArea = (
    <main
      class="canvas-area"
      aria-label={t('editor.canvasLabel')}
      hidden={mobileList}
      {...intake.dropHandlers}
    >
      <CanvasHost />
      <CanvasNotices notices={notices} />
      {desktop ? (
        <Minimap />
      ) : (
        <div class="canvas-float">
          <SemanticTextButton />
        </div>
      )}
      {noImages.value && (
        <div class="canvas-empty">
          <p class="muted">{t('editor.emptyCanvas')}</p>
          <Button
            variant="primary"
            disabled={store.readOnly.value || busy}
            onClick={intake.onAddClick}
          >
            {t('editor.addImages')}
          </Button>
        </div>
      )}
    </main>
  );

  if (desktop) {
    return (
      <div class="editor editor-desktop">
        <EditorMainBar
          busy={busy}
          onAdd={intake.onAddClick}
          dialogs={dialogs}
          commands={commands}
        />
        <EditorWindows panel={panel} onSelect={onSelect} canvas={canvasArea} />
        <StatusBar />
        <ImageInputs intake={intake} />
        <EditorDialogs
          dialogs={dialogs}
          busy={busy}
          intake={intake}
          commands={commands}
        />
      </div>
    );
  }

  return (
    <div class="editor editor-mobile">
      <EditorTopBar dialogs={dialogs} />

      <div class="editor-body">
        {canvasArea}
        {mobileList && (
          <section class="list-screen" aria-label={t('list.title')}>
            <ListView onSelect={onSelect} />
          </section>
        )}
      </div>

      {!mobileList && (
        <EditorSheet
          {...panel}
          tab={panelTab}
          onTabChange={setPanelTab}
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

      <ImageInputs intake={intake} />
      <EditorDialogs dialogs={dialogs} busy={busy} intake={intake} commands={commands} />
    </div>
  );
}
