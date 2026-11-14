import { useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { CanvasHost } from '../canvas/CanvasHost';
import { t } from '../i18n';
import { BREAKPOINTS } from '../theme/breakpoints';
import { collapseDetailsOnCompact } from '../store/toolWindows';
import { goToAnnotation, type Selection } from '../store/ui';
import type { AnnotationLocation } from '../store/ui';
import { EditorProvider, useEditor } from '../ui/EditorContext';
import { CanvasContextMenu } from '../ui/CanvasContextMenu';
import { Minimap } from '../ui/Minimap';
import { PerspectiveNotices } from '../ui/PerspectiveNotices';
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
import { useComponentDrop } from './useComponentDrop';
import { ImageInputs, useImageIntake } from './useImageIntake';
import { useProjectCommands } from './useProjectCommands';
import { useReviewSync } from './useReviewSync';
import { ReviewBar } from '../ui/review/ReviewBar';
import { CompareDialog, ReviewLegend } from '../ui/review/ReviewCanvasControls';
import { useExitReview } from './useExitReview';
import { Button } from '../ui/controls';

export function Editor({ open }: { readonly open: OpenProject }) {
  // A new context (and UI state) per open project: the Editor is not remounted on switching.
  return (
    <EditorProvider open={open}>
      <EditorScreen />
    </EditorProvider>
  );
}

/**
 * Exported for the render-count tests (tests/components/editorRenders.test.tsx)
 * and the narrow window ones (tests/components/narrowWindow.test.tsx).
 *
 * A single shell (desktop only): main bar, windows with the canvas and status bar.
 * Below the minimum width it stays hidden behind the notice, without unmounting: the canvas is
 * mounted once and the selection and viewport continue when the window widens.
 */
export function EditorScreen() {
  const { store, ui, canvas, review, layers } = useEditor();
  const narrow = useNarrowWindow();
  // Compact desktop band (900 to 1199px): below it the window is narrow.
  const compact = useMediaQuery(
    `(min-width: ${BREAKPOINTS.appMin}px) and (max-width: ${BREAKPOINTS.compact}px)`,
  );
  const dialogs = useEditorDialogs();
  const notices = useEditorNotices();
  const intake = useImageIntake({ dialogs, notices });
  const componentDrop = useComponentDrop(notices);
  const commands = useProjectCommands(dialogs, notices);
  // With the editor hidden behind the notice, the keyboard does not act on what is not seen.
  useEditorShortcuts(dialogs, commands, !narrow, notices.busy);
  useExternalChanges();
  useReviewSync();
  const reviewing = review.proposalId.value !== null;
  const exitReview = useExitReview(dialogs);

  // Only slices of the committed project (see `ProjectStore.committed`): the screen does not
  // render again on every gesture preview, nor on every edit that does not change them.
  const hasProject = useComputed(() => store.committed.value !== null);
  // The empty state belongs to the project in view: in the review's Proposed view, the "how it would look"
  // (a new import only has images in the preview; the notice cannot cover them).
  const noImages = useComputed(
    () => (review.derived.shownProject.value?.containers.length ?? 0) === 0,
  );
  const { busy } = notices;

  // Compact desktop (below 1200px): Details starts collapsed (B2). Only when opening the
  // editor: narrowing the window later shrinks the side windows (`fitSideWidths`), it does not close them.
  const openedCompact = useRef(compact);
  useEffect(() => {
    if (openedCompact.current) collapseDetailsOnCompact();
  }, []);

  if (!hasProject.value) return null;

  /** Backlinks, "Go to target", linked and Incomplete: on any marking. */
  const onGoToAnnotation = (annotation: AnnotationLocation) => {
    const selection = ui.selection.peek();
    // The annotation's owner is a marking or an arrow (v13): `goToAnnotation` chooses by project.
    const sameMarking =
      (selection?.kind === 'marking' || selection?.kind === 'arrow') &&
      selection.id === annotation.markingId;
    goToAnnotation(ui, annotation, null, store.committed.peek(), layers.show);
    if (!sameMarking) canvas.current?.centerSelection();
  };

  /** Choosing in the tree, the list or the breadcrumbs selects and centers the canvas. */
  const onSelect = (next: NonNullable<Selection>) => {
    ui.selection.value = next;
    canvas.current?.centerSelection();
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
              data-canvas-area
              tabIndex={-1}
              onDragOver={(e) => {
                intake.dropHandlers.onDragOver(e);
                componentDrop.onDragOver(e);
              }}
              onDragLeave={(e) => {
                intake.dropHandlers.onDragLeave(e);
                componentDrop.onDragLeave(e);
              }}
              onDrop={(e) => {
                intake.dropHandlers.onDrop(e);
                componentDrop.onDrop(e);
              }}
            >
              <CanvasHost />
              <CanvasNotices notices={notices} />
              <CanvasContextMenu />
              <Minimap />
              {/* The open legend sits above the minimap by z-index (--z-popover above --z-canvas-overlay), not by DOM order. */}
              <ReviewLegend />
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
                  <Button
                    disabled={store.locked.value}
                    onClick={() => dialogs.show({ kind: 'container' })}
                  >
                    {t('container.new')}
                  </Button>
                </div>
              )}
            </main>
          }
        />
        <PerspectiveNotices />
        <StatusBar />
        <CompareDialog />
        <ImageInputs intake={intake} />
        <EditorDialogs dialogs={dialogs} />
      </div>
      {narrow && <NarrowWindowNotice />}
    </>
  );
}
