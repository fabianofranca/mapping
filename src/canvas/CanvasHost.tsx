import { useEffect, useRef } from 'preact/hooks';
import { useEditor } from '../ui/EditorContext';
import { CanvasController } from './CanvasController';

/**
 * Mounts the `CanvasController` in a <div> and publishes it in the context's `canvas.current`
 * (commands such as "fit"). The only component that knows Konva.
 */
export function CanvasHost() {
  const { store, actions, display, ui, derived, canvas, view, review, session } =
    useEditor();
  const { perspective } = session;
  const ref = useRef<HTMLDivElement>(null);

  // The controller lives while the project is open.
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
      view,
      review,
      perspective,
    });
    canvas.current = controller;
    return () => {
      canvas.current = null;
      controller.destroy();
    };
  }, [store, actions, display, ui, derived, canvas, view, review, perspective]);

  return <div ref={ref} class="canvas-host" />;
}
