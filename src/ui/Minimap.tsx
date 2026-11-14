import { useMemo } from 'preact/hooks';
import { useEditor } from './EditorContext';
import { t } from '../i18n';
import { tokenValue } from '../theme/tokens';
import {
  fromMinimap,
  minimapLayout,
  toMinimap,
  visibleRect,
  type MinimapLayout,
} from '../canvas/minimap';
import { imageCanvasRect, type Rect } from '../model';

// Minimap (proposal P3): overview of the images in the canvas corner; clicking moves the
// view. Drawn in DOM (no Konva): the math lives in `canvas/minimap.ts`.

/** Maximum minimap box, in pixels (tokens `size-minimap-*`, the same in both themes). */
const BOX = {
  width: Number.parseInt(tokenValue('size-minimap-width', 'light'), 10),
  height: Number.parseInt(tokenValue('size-minimap-height', 'light'), 10),
};

function style(rect: Rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${Math.max(1, rect.width)}px`,
    height: `${Math.max(1, rect.height)}px`,
  };
}

export function Minimap() {
  const { review, view, canvas } = useEditor();
  const bounds = view.bounds.value;
  const viewport = view.viewport.value;
  const size = view.size.value;
  // The project in view (without the gesture preview: a gesture in progress does not redraw the
  // minimap on every frame); in the Proposed view of the review, the preview's images.
  const containers = review.derived.shownProject.value?.containers;
  // What depends only on the project (each image's rectangle on the canvas) is computed once
  // per project; pan and zoom only redo the view and, if the framing changes, the mapping.
  const canvasRects = useMemo(
    () =>
      (containers ?? []).map((image) => ({
        id: image.id,
        rect: imageCanvasRect(image, image.placement),
      })),
    [containers],
  );
  const visible = visibleRect(viewport, size);
  const layout = bounds && size.width > 0 ? minimapLayout(bounds, visible, BOX) : null;
  const scale = layout?.scale;
  const originX = layout?.content.x;
  const originY = layout?.content.y;
  const images = useMemo(
    () =>
      layout
        ? canvasRects.map(({ id, rect }) => (
            <span key={id} class="minimap-image" style={style(toMinimap(layout, rect))} />
          ))
        : null,
    // `layout` is new on every frame; only the framing (scale and origin) changes the drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvasRects, scale, originX, originY],
  );
  if (!layout) return null;

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
      {images}
      <span class="minimap-view" style={style(toMinimap(layout, visible))} />
    </button>
  );
}
