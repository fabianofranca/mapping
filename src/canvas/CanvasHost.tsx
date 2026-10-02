import { useEffect, useRef } from 'preact/hooks';
import type { DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import type { EditorUi } from '../store/ui';
import { CanvasController } from './CanvasController';

interface CanvasHostProps {
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
  /** Recebe o controller montado (e `null` ao desmontar), para comandos como "enquadrar". */
  readonly onReady: (controller: CanvasController | null) => void;
}

/** Monta o `CanvasController` num <div>. Único componente que conhece o Konva. */
export function CanvasHost({ store, actions, display, ui, onReady }: CanvasHostProps) {
  const ref = useRef<HTMLDivElement>(null);
  // O controller vive enquanto o projeto estiver aberto; `onReady` pode mudar sem recriá-lo.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const controller = new CanvasController({ container, store, actions, display, ui });
    onReadyRef.current(controller);
    return () => {
      onReadyRef.current(null);
      controller.destroy();
    };
  }, [store, actions, display, ui]);

  return <div ref={ref} class="canvas-host" />;
}
