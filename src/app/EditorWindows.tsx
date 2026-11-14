import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import {
  openWindowOf,
  openWindowsOf,
  setPaneWidth,
  sideWidth,
  type ToolWindowId,
} from '../store/toolWindows';
import type { Selection } from '../store/ui';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { CatalogWindow } from '../ui/CatalogWindow';
import {
  DiagnosticsActions,
  DiagnosticsView,
  useCopyErrors,
} from '../ui/DiagnosticsView';
import { CommentsHeaderActions, CommentsWindow } from '../ui/comments/CommentsWindow';
import { IncompleteView } from '../ui/IncompleteView';
import { NoticesView } from '../ui/NoticesView';
import { ListView } from '../ui/ListView';
import { LayersWindow } from '../ui/LayersWindow';
import { ToolStrip } from '../ui/ToolStrip';
import { ToolWindow } from '../ui/ToolWindow';
import { TreeWindow } from '../ui/TreeWindow';
import { PANES_CLASS, openToolWindow } from '../ui/toolWindowLayout';
import { ZoomField } from '../ui/ZoomField';
import { HELP_PROPOSALS } from '../ui/HelpDialog';
import { ProposalsHeaderActions, ProposalsWindow } from '../ui/review/ProposalsWindow';
import { ReviewCanvasControls } from '../ui/review/ReviewCanvasControls';
import {
  FitButton,
  FitSelectionButton,
  OverflowMenu,
  PinsButton,
  ViewModeButton,
} from './EditorTools';
import { ViewModePanel } from '../ui/ViewModePanel';
import { EditorPanel, type EditorPanelProps } from './EditorPanel';

// Desktop editor structure (R4): strips, tool windows, breadcrumbs and the
// canvas in the middle. The main bar and the status bar stay outside, in `Editor.tsx`.

interface EditorWindowsProps {
  readonly panel: EditorPanelProps;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
  /** The canvas (with the notices, the minimap and the empty state), mounted by the `Editor`. */
  readonly canvas: ComponentChildren;
}

/**
 * Each window, with its own header.
 * `stacked`: the window shares the column with another (Layers below the Tree).
 */
function Window({
  id,
  stacked,
  panel,
  onSelect,
}: {
  readonly id: ToolWindowId;
  readonly stacked: boolean;
  readonly panel: EditorPanelProps;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  switch (id) {
    case 'tree':
      return <TreeWindow onSelect={onSelect} />;
    case 'layers':
      return <LayersWindow stacked={stacked} />;
    case 'catalog':
      return <CatalogWindow onOpenSpecs={() => panel.dialogs.show({ kind: 'specs' })} />;
    case 'details':
      return (
        <ToolWindow id={id}>
          <EditorPanel {...panel} />
        </ToolWindow>
      );
    case 'list':
      return (
        <ToolWindow id={id}>
          <ListView onSelect={onSelect} />
        </ToolWindow>
      );
    case 'incomplete': {
      const goTo = goToAnnotationIn(panel);
      return (
        <ToolWindow id={id}>
          <IncompleteView onGoToAnnotation={goTo} />
        </ToolWindow>
      );
    }
    default:
      return <MoreWindow id={id} panel={panel} />;
  }
}

/** Go to the annotation needs the Details panel in view (Incomplete and Warnings). */
function goToAnnotationIn(panel: EditorPanelProps): EditorPanelProps['onGoToAnnotation'] {
  return (annotation) => {
    openToolWindow('details');
    panel.onGoToAnnotation(annotation);
  };
}

/** The bottom windows that are neither the List nor Incomplete (`Window` delegates to them). */
function MoreWindow({
  id,
  panel,
}: {
  readonly id: 'notices' | 'diagnostics' | 'proposals' | 'comments';
  readonly panel: EditorPanelProps;
}) {
  switch (id) {
    case 'notices': {
      const goTo = goToAnnotationIn(panel);
      return (
        <ToolWindow id={id}>
          <NoticesView onGoToAnnotation={goTo} />
        </ToolWindow>
      );
    }
    case 'diagnostics':
      return (
        <ToolWindow id={id} actions={<DiagnosticsHeaderActions />}>
          <DiagnosticsView />
        </ToolWindow>
      );
    case 'comments':
      return (
        <ToolWindow id={id} actions={<CommentsHeaderActions />}>
          <CommentsWindow />
        </ToolWindow>
      );
    case 'proposals':
      return (
        <ToolWindow id={id} actions={<ProposalsHeaderActions />}>
          <ProposalsWindow
            onHelp={() => panel.dialogs.show({ kind: 'help', section: HELP_PROPOSALS })}
          />
        </ToolWindow>
      );
  }
}

/** Copy and Clear stay in the Diagnostics window header (B4). */
function DiagnosticsHeaderActions() {
  return <DiagnosticsActions {...useCopyErrors()} />;
}

export function EditorWindows({ panel, onSelect, canvas }: EditorWindowsProps) {
  const left = openWindowsOf('left');
  const right = openWindowOf('right');
  const bottom = openWindowOf('bottom');
  const toolWindow = (id: ToolWindowId, stacked = false) => (
    <Window key={id} id={id} stacked={stacked} panel={panel} onSelect={onSelect} />
  );

  // Measures the windows area: the side ones shrink so the canvas does not go under the minimum.
  const panes = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panes.current;
    if (!el) return;
    const measure = () => setPaneWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div class="editor-body">
      <ToolStrip side="left" />
      <div class={PANES_CLASS} data-panes ref={panes}>
        {left.length > 0 && (
          // The width belongs to the column: stacked Tree and Layers share the same one.
          <div
            class="tool-column"
            data-tool-column
            style={{ width: `${sideWidth('left')}px` }}
          >
            {left.map((id, i) => toolWindow(id, i > 0))}
          </div>
        )}
        <div class="editor-center">
          <div class="canvas-bar">
            <Breadcrumbs onSelect={onSelect} />
            <div class="canvas-bar-end">
              <ReviewCanvasControls />
              <span class="canvas-bar-low">
                <PinsButton />
              </span>
              <span class="canvas-bar-low" data-canvas-low>
                <ViewModeButton />
              </span>
              <ViewModePanel />
              <span class="canvas-bar-low">
                <FitButton />
                <FitSelectionButton />
              </span>
              <OverflowMenu />
              <ZoomField />
            </div>
          </div>
          {canvas}
          {bottom && toolWindow(bottom)}
        </div>
        {right && toolWindow(right)}
      </div>
      <ToolStrip side="right" />
    </div>
  );
}
