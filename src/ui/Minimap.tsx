import { useEditor } from './EditorContext';
import { t } from '../i18n';
import {
  fromMinimap,
  minimapLayout,
  toMinimap,
  visibleRect,
  type MinimapLayout,
} from '../canvas/minimap';
import { imageCanvasRect, type Rect } from '../model';

// Minimapa (proposta P3): visão geral das imagens no canto do canvas; clicar move a
// vista. Desenhado em DOM (sem Konva): as contas ficam em `canvas/minimap.ts`.

/** Caixa máxima do minimapa, em pixels. */
const BOX = { width: 132, height: 96 };

function style(rect: Rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${Math.max(1, rect.width)}px`,
    height: `${Math.max(1, rect.height)}px`,
  };
}

export function Minimap() {
  const { store, view, canvas } = useEditor();
  const bounds = view.bounds.value;
  const viewport = view.viewport.value;
  const size = view.size.value;
  if (!bounds || size.width === 0) return null;
  const visible = visibleRect(viewport, size);
  const layout = minimapLayout(bounds, visible, BOX);
  if (!layout) return null;
  // Projeto confirmado: um gesto em andamento não redesenha o minimapa a cada quadro.
  const images = store.committed.value?.images ?? [];

  const goTo = (e: MouseEvent, l: MinimapLayout) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    canvas.current?.centerOnPoint(
      fromMinimap(l, { x: e.clientX - box.left, y: e.clientY - box.top }),
    );
  };

  return (
    <button
      type="button"
      class="minimap"
      style={{ width: `${layout.size.width}px`, height: `${layout.size.height}px` }}
      aria-label={t('minimap.label')}
      title={t('minimap.goTo')}
      onClick={(e) => goTo(e, layout)}
    >
      {images.map((image) => (
        <span
          key={image.id}
          class="minimap-image"
          style={style(toMinimap(layout, imageCanvasRect(image, image.placement)))}
        />
      ))}
      <span class="minimap-view" style={style(toMinimap(layout, visible))} />
    </button>
  );
}
