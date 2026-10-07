import { useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { CanvasHost } from '../canvas/CanvasHost';
import { t } from '../i18n';
import { BREAKPOINTS, DESKTOP_QUERY } from '../theme/breakpoints';
import { collapseDetailsOnCompact } from '../store/toolWindows';
import { goToAnnotation, resolveSelection, type Selection } from '../store/ui';
import type { AnnotationLocation } from '../store/ui';
import { EditorProvider, useEditor } from '../ui/EditorContext';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { CanvasContextMenu } from '../ui/CanvasContextMenu';
import { Minimap } from '../ui/Minimap';
import { StatusBar } from '../ui/StatusBar';
import { useMediaQuery } from '../ui/useMediaQuery';
import { ZoomField } from '../ui/ZoomField';
import type { OpenProject } from './controller';
import { CanvasNotices } from './CanvasNotices';
import { SemanticTextButton } from './EditorTools';
import { EditorBottomBar } from './EditorBottomBar';
import { EditorDialogs } from './EditorDialogs';
import { EditorMainBar } from './EditorMainBar';
import { EditorSheet, type EditorPanelProps } from './EditorPanel';
import { EditorTopBar } from './EditorTopBar';
import { EditorWindows } from './EditorWindows';
import { MobileWindow } from './MobileWindow';
import { useEditorDialogs } from './useEditorDialogs';
import { useEditorNotices } from './useEditorNotices';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useExternalChanges } from './useExternalChanges';
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
  useExternalChanges();

  /** Celular: centralizar a seleção quando o canvas voltar a aparecer. */
  const focusAfterView = useRef(false);
  const mobileWindow = ui.mobileWindow.value;

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
    if (!hasSelection.value) ui.sheet.value = 'peek';
  }, [hasSelection.value, ui]);

  // Voltar de uma tela cheia para o canvas (celular): centraliza depois que o canvas
  // reaparece.
  useEffect(() => {
    if (mobileWindow === null && focusAfterView.current) {
      focusAfterView.current = false;
      canvas.current?.focusSelection();
    }
  }, [mobileWindow, canvas]);

  if (!hasProject.value) return null;

  /** Volta ao canvas (celular), centralizando a seleção. */
  const backToCanvas = () => {
    focusAfterView.current = true;
    ui.mobileWindow.value = null;
  };

  /** Backlinks, "Ir para o alvo", vinculadas e Incompletas: em qualquer marcação. */
  const onGoToAnnotation = (annotation: AnnotationLocation) => {
    const selection = ui.selection.peek();
    const sameMarking =
      selection?.kind === 'marking' && selection.id === annotation.markingId;
    goToAnnotation(ui, annotation);
    const screen = ui.mobileWindow.peek();
    // Celular: Detalhes em tela cheia continua nela; nas outras telas, a anotação
    // aparece na gaveta aberta, com a marcação no canvas.
    if (!desktop && screen !== 'details') {
      ui.sheet.value = 'open';
      if (screen !== null) {
        backToCanvas();
        return;
      }
    }
    if (!sameMarking) canvas.current?.focusSelection();
  };

  /** Escolher na árvore, na lista ou nos breadcrumbs seleciona e centraliza o canvas. */
  const onSelect = (next: NonNullable<Selection>) => {
    ui.selection.value = next;
    if (desktop || ui.mobileWindow.peek() === null) {
      canvas.current?.focusSelection();
      return;
    }
    backToCanvas();
  };

  const panel: EditorPanelProps = {
    busy,
    dialogs,
    onReplace: intake.requestReplace,
    onGoToAnnotation,
  };

  const emptyCanvas = noImages.value && (
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
        <EditorWindows
          panel={panel}
          onSelect={onSelect}
          canvas={
            <main
              class="canvas-area"
              aria-label={t('editor.canvasLabel')}
              {...intake.dropHandlers}
            >
              <CanvasHost />
              <CanvasNotices notices={notices} />
              <CanvasContextMenu />
              <Minimap />
              {emptyCanvas}
            </main>
          }
        />
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

  // Celular: barra de cima, breadcrumbs, canvas com a gaveta e barra de baixo; uma
  // janela aberta ocupa a tela toda (o canvas continua montado, escondido).
  const full = mobileWindow !== null;
  return (
    <div class="editor editor-mobile">
      {full ? (
        <MobileWindow
          id={mobileWindow}
          panel={panel}
          onSelect={onSelect}
          onBack={backToCanvas}
        />
      ) : (
        <>
          <EditorTopBar dialogs={dialogs} commands={commands} busy={busy} />
          <div class="mobile-crumbs">
            <Breadcrumbs onSelect={onSelect} />
          </div>
        </>
      )}

      <div class="editor-body" hidden={full}>
        <main
          class="canvas-area"
          aria-label={t('editor.canvasLabel')}
          hidden={full}
          {...intake.dropHandlers}
        >
          <CanvasHost />
          <CanvasNotices notices={notices} />
          <CanvasContextMenu />
          <div class="canvas-float canvas-float-start">
            <ZoomField />
          </div>
          <div class="canvas-float">
            <SemanticTextButton />
          </div>
          {emptyCanvas}
        </main>
        {!full && <EditorSheet {...panel} />}
      </div>
      {!full && (
        <EditorBottomBar
          busy={busy}
          onAdd={intake.onAddClick}
          onPanels={() => dialogs.show({ kind: 'panels' })}
        />
      )}

      <ImageInputs intake={intake} />
      <EditorDialogs dialogs={dialogs} busy={busy} intake={intake} commands={commands} />
    </div>
  );
}
