import type { ComponentChildren } from 'preact';
import {
  openWindowOf,
  openWindowsOf,
  showToolWindow,
  toolWindowSizes,
  type ToolWindowId,
} from '../store/toolWindows';
import type { Selection } from '../store/ui';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import {
  DiagnosticsActions,
  DiagnosticsView,
  useCopyErrors,
} from '../ui/DiagnosticsView';
import { IncompleteView } from '../ui/IncompleteView';
import { ListView } from '../ui/ListView';
import { LayersWindow } from '../ui/LayersWindow';
import { ToolStrip } from '../ui/ToolStrip';
import { ToolWindow } from '../ui/ToolWindow';
import { TreeWindow } from '../ui/TreeWindow';
import { PANES_CLASS } from '../ui/toolWindowLayout';
import { ZoomField } from '../ui/ZoomField';
import { HELP_PROPOSALS } from '../ui/HelpDialog';
import { ProposalsHeaderActions, ProposalsWindow } from '../ui/review/ProposalsWindow';
import { ReviewCanvasControls } from '../ui/review/ReviewCanvasControls';
import { FitButton, SemanticTextButton } from './EditorTools';
import { EditorPanel, type EditorPanelProps } from './EditorPanel';

// Estrutura do editor no desktop (R4): faixas, janelas de ferramenta, breadcrumbs e o
// canvas no meio. A barra principal e a barra de status ficam fora, em `Editor.tsx`.

interface EditorWindowsProps {
  readonly panel: EditorPanelProps;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
  /** O canvas (com os avisos, o minimapa e o estado vazio), montado pelo `Editor`. */
  readonly canvas: ComponentChildren;
}

/**
 * Cada janela, com o próprio cabeçalho.
 * `stacked`: a janela divide a coluna com outra (Camadas embaixo da Árvore).
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
      // Ir até a anotação precisa do painel de Detalhes à vista.
      const goTo: EditorPanelProps['onGoToAnnotation'] = (annotation) => {
        showToolWindow('details');
        panel.onGoToAnnotation(annotation);
      };
      return (
        <ToolWindow id={id}>
          <IncompleteView onGoToAnnotation={goTo} />
        </ToolWindow>
      );
    }
    case 'diagnostics':
      return (
        <ToolWindow id={id} actions={<DiagnosticsHeaderActions />}>
          <DiagnosticsView />
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

/** Copiar e Limpar ficam no cabeçalho da janela Diagnóstico (B4). */
function DiagnosticsHeaderActions() {
  return <DiagnosticsActions {...useCopyErrors()} />;
}

export function EditorWindows({ panel, onSelect, canvas }: EditorWindowsProps) {
  const left = openWindowsOf('left');
  const right = openWindowOf('right');
  const bottom = openWindowOf('bottom');
  const window = (id: ToolWindowId, stacked = false) => (
    <Window key={id} id={id} stacked={stacked} panel={panel} onSelect={onSelect} />
  );

  return (
    <div class="editor-body">
      <ToolStrip side="left" />
      <div class={PANES_CLASS}>
        {left.length > 0 && (
          // A largura é da coluna: Árvore e Camadas empilhadas dividem a mesma.
          <div class="tool-column" style={{ width: `${toolWindowSizes.value.left}px` }}>
            {left.map((id, i) => window(id, i > 0))}
          </div>
        )}
        <div class="editor-center">
          <div class="canvas-bar">
            <Breadcrumbs onSelect={onSelect} />
            <div class="canvas-bar-end">
              <ReviewCanvasControls />
              <SemanticTextButton />
              <FitButton />
              <ZoomField />
            </div>
          </div>
          {canvas}
          {bottom && window(bottom)}
        </div>
        {right && window(right)}
      </div>
      <ToolStrip side="right" />
    </div>
  );
}
