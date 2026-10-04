import type { ComponentChildren } from 'preact';
import { openWindowOf, showToolWindow, type ToolWindowId } from '../store/toolWindows';
import type { Selection } from '../store/ui';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import {
  DiagnosticsActions,
  DiagnosticsView,
  useCopyErrors,
} from '../ui/DiagnosticsView';
import { IncompleteView } from '../ui/IncompleteView';
import { ListView } from '../ui/ListView';
import { MarkingTree } from '../ui/MarkingTree';
import { ToolStrip } from '../ui/ToolStrip';
import { ToolWindow } from '../ui/ToolWindow';
import { useEditor } from '../ui/EditorContext';
import { PANES_CLASS } from '../ui/toolWindowLayout';
import { ZoomField } from '../ui/ZoomField';
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

/** Conteúdo de cada janela. Camadas entra na R6. */
function WindowContent({
  id,
  panel,
  onSelect,
}: {
  readonly id: ToolWindowId;
  readonly panel: EditorPanelProps;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { store, ui } = useEditor();
  if (id === 'details') return <EditorPanel {...panel} />;
  if (id === 'list') return <ListView onSelect={onSelect} />;
  if (id === 'incomplete') {
    // Ir até a anotação precisa do painel de Detalhes à vista.
    const goTo: EditorPanelProps['onGoToAnnotation'] = (annotation) => {
      showToolWindow('details');
      panel.onGoToAnnotation(annotation);
    };
    return <IncompleteView onGoToAnnotation={goTo} />;
  }
  if (id === 'diagnostics') return <DiagnosticsView />;
  const project = store.committed.value;
  if (!project) return null;
  return (
    <MarkingTree project={project} selection={ui.selection.value} onSelect={onSelect} />
  );
}

/** Copiar e Limpar ficam no cabeçalho da janela Diagnóstico (B4). */
function DiagnosticsHeaderActions() {
  return <DiagnosticsActions {...useCopyErrors()} />;
}

export function EditorWindows({ panel, onSelect, canvas }: EditorWindowsProps) {
  const left = openWindowOf('left');
  const right = openWindowOf('right');
  const bottom = openWindowOf('bottom');
  const window = (id: ToolWindowId) => (
    <ToolWindow
      id={id}
      actions={id === 'diagnostics' ? <DiagnosticsHeaderActions /> : undefined}
    >
      <WindowContent id={id} panel={panel} onSelect={onSelect} />
    </ToolWindow>
  );

  return (
    <div class="editor-body">
      <ToolStrip side="left" />
      <div class={PANES_CLASS}>
        {left && window(left)}
        <div class="editor-center">
          <div class="canvas-bar">
            <Breadcrumbs onSelect={onSelect} />
            <div class="canvas-bar-end">
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
