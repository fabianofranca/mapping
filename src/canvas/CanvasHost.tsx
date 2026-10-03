import { useEffect, useRef } from 'preact/hooks';
import { useEditor } from '../ui/EditorContext';
import { CanvasController } from './CanvasController';

/**
 * Monta o `CanvasController` num <div> e o publica em `canvas.current` do contexto
 * (comandos como "enquadrar"). Único componente que conhece o Konva.
 */
export function CanvasHost() {
  const { store, actions, display, ui, derived, canvas } = useEditor();
  const ref = useRef<HTMLDivElement>(null);

  // O controller vive enquanto o projeto estiver aberto.
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const controller = new CanvasController({
      container,
      store,
      actions,
      display,
      ui,
      derived,
    });
    canvas.current = controller;
    return () => {
      canvas.current = null;
      controller.destroy();
    };
  }, [store, actions, display, ui, derived, canvas]);

  return <div ref={ref} class="canvas-host" />;
}
