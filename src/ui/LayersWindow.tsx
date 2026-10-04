import { useEditor } from './EditorContext';
import { LayerActions, LayersPanel } from './LayersPanel';
import { ToolWindow } from './ToolWindow';

/**
 * Janela Camadas (B3), à esquerda embaixo da Árvore: renomear na linha, paleta em
 * popover, modo "sem anotação" no rodapé. Nova camada e Mostrar todas ficam no cabeçalho.
 */
export function LayersWindow({ stacked }: { readonly stacked: boolean }) {
  const { store } = useEditor();
  const project = store.committed.value;
  if (!project) return null;
  const readOnly = store.readOnly.value;
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
