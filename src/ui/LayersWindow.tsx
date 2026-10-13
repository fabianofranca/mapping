import { useEditor } from './EditorContext';
import { LayerActions, LayersPanel } from './LayersPanel';
import { ToolWindow } from './ToolWindow';

/**
 * Janela Camadas (B3), à esquerda embaixo da Árvore: renomear na linha, paleta em
 * popover, modo "sem anotação" no rodapé. Nova camada e Mostrar todas ficam no cabeçalho.
 */
export function LayersWindow({ stacked }: { readonly stacked: boolean }) {
  const { store, review } = useEditor();
  // O projeto à vista: na visão Proposto da revisão, a camada criada pela proposta
  // aparece aqui como na Árvore (fase 8.2, P1).
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const readOnly = store.locked.value;
  return (
    <ToolWindow
      id="layers"
      stacked={stacked}
      actions={<LayerActions project={project} readOnly={readOnly} />}
    >
      <LayersPanel project={project} readOnly={readOnly} />
    </ToolWindow>
  );
}
