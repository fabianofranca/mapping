import { useComputed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { CanvasHost } from '../canvas/CanvasHost';
import { t } from '../i18n';
import { BREAKPOINTS } from '../theme/breakpoints';
import { collapseDetailsOnCompact } from '../store/toolWindows';
import { goToAnnotation, type Selection } from '../store/ui';
import type { AnnotationLocation } from '../store/ui';
import { EditorProvider, useEditor } from '../ui/EditorContext';
import { CanvasContextMenu } from '../ui/CanvasContextMenu';
import { Minimap } from '../ui/Minimap';
import { StatusBar } from '../ui/StatusBar';
import { useMediaQuery } from '../ui/useMediaQuery';
import type { OpenProject } from './controller';
import { CanvasNotices } from './CanvasNotices';
import { EditorDialogs } from './EditorDialogs';
import { EditorMainBar } from './EditorMainBar';
import type { EditorPanelProps } from './EditorPanel';
import { EditorWindows } from './EditorWindows';
import { NarrowWindowNotice, useNarrowWindow } from './NarrowWindow';
import { useEditorDialogs } from './useEditorDialogs';
import { useEditorNotices } from './useEditorNotices';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useExternalChanges } from './useExternalChanges';
import { ImageInputs, useImageIntake } from './useImageIntake';
import { useProjectCommands } from './useProjectCommands';
import { useReviewSync } from './useReviewSync';
import { ReviewBar } from '../ui/review/ReviewBar';
import { CompareDialog, ReviewLegend } from '../ui/review/ReviewCanvasControls';
import { useExitReview } from './useExitReview';
import { Button } from '../ui/controls';

export function Editor({ open }: { readonly open: OpenProject }) {
  // Um contexto (e um estado de UI) novo por projeto aberto: o Editor não é remontado ao trocar.
  return (
    <EditorProvider open={open}>
      <EditorScreen />
    </EditorProvider>
  );
}

/**
 * Exportado para os testes de contagem de renderizações (tests/components/editorRenders.test.tsx)
 * e da janela estreita (tests/components/narrowWindow.test.tsx).
 *
 * Um shell só (só desktop): barra principal, janelas com o canvas e barra de status.
 * Abaixo da largura mínima ele fica escondido atrás do aviso, sem desmontar: o canvas é
 * montado uma vez e a seleção e o viewport continuam ao alargar a janela.
 */
export function EditorScreen() {
  const { store, ui, canvas, review } = useEditor();
  const narrow = useNarrowWindow();
  // Faixa do desktop compacto (900 a 1199px): abaixo dela a janela é estreita.
  const compact = useMediaQuery(
    `(min-width: ${BREAKPOINTS.appMin}px) and (max-width: ${BREAKPOINTS.compact}px)`,
  );
  const dialogs = useEditorDialogs();
  const notices = useEditorNotices();
  const intake = useImageIntake({ dialogs, notices });
  const commands = useProjectCommands(dialogs, notices);
  // Com o editor escondido atrás do aviso, o teclado não age sobre o que não se vê.
  useEditorShortcuts(dialogs, commands, !narrow);
  useExternalChanges();
  useReviewSync();
  const reviewing = review.proposalId.value !== null;
  const exitReview = useExitReview(dialogs);

  // Só fatias do projeto confirmado (ver `ProjectStore.committed`): a tela não
  // renderiza de novo a cada prévia de gesto, nem a cada edição que não as muda.
  const hasProject = useComputed(() => store.committed.value !== null);
  const noImages = useComputed(() => (store.committed.value?.images.length ?? 0) === 0);
  const { busy } = notices;

  // Desktop compacto (abaixo de 1200px): Detalhes começa recolhido (B2).
  useEffect(() => {
    if (compact) collapseDetailsOnCompact();
  }, [compact]);

  if (!hasProject.value) return null;

  /** Backlinks, "Ir para o alvo", vinculadas e Incompletas: em qualquer marcação. */
  const onGoToAnnotation = (annotation: AnnotationLocation) => {
    const selection = ui.selection.peek();
    const sameMarking =
      selection?.kind === 'marking' && selection.id === annotation.markingId;
    goToAnnotation(ui, annotation);
    if (!sameMarking) canvas.current?.focusSelection();
  };

  /** Escolher na árvore, na lista ou nos breadcrumbs seleciona e centraliza o canvas. */
  const onSelect = (next: NonNullable<Selection>) => {
    ui.selection.value = next;
    canvas.current?.focusSelection();
  };

  const panel: EditorPanelProps = {
    busy,
    dialogs,
    onReplace: intake.requestReplace,
    onGoToAnnotation,
  };

  return (
    <>
      <div class="editor editor-desktop" hidden={narrow}>
        <EditorMainBar
          busy={busy}
          onAdd={intake.onAddClick}
          dialogs={dialogs}
          commands={commands}
        />
        {reviewing && <ReviewBar onExit={exitReview} />}
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
              <ReviewLegend />
              <Minimap />
              {noImages.value && (
                <div class="canvas-empty">
                  <p class="muted">{t('editor.emptyCanvas')}</p>
                  <Button
                    variant="primary"
                    disabled={store.locked.value || busy}
                    onClick={intake.onAddClick}
                  >
                    {t('editor.addImages')}
                  </Button>
                </div>
              )}
            </main>
          }
        />
        <StatusBar />
        <CompareDialog />
        <ImageInputs intake={intake} />
        <EditorDialogs dialogs={dialogs} />
      </div>
      {narrow && <NarrowWindowNotice />}
    </>
  );
}
