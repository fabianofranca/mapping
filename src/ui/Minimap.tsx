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

// Minimapa (proposta P3): visão geral das imagens no canto do canvas; clicar move a
// vista. Desenhado em DOM (sem Konva): as contas ficam em `canvas/minimap.ts`.

/** Caixa máxima do minimapa, em pixels (tokens `size-minimap-*`, a mesma nos dois temas). */
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
  // O projeto à vista (sem a prévia do gesto: um gesto em andamento não redesenha o
  // minimapa a cada quadro); na visão Proposto da revisão, as imagens da prévia.
  const containers = review.derived.shownProject.value?.containers;
  // O que depende só do projeto (o retângulo de cada imagem no canvas) é calculado uma vez
  // por projeto; pan e zoom só refazem a vista e, se o enquadramento mudar, o mapeamento.
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
    // `layout` é novo a cada quadro; só o enquadramento (escala e origem) muda o desenho.
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
