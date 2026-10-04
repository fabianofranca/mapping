// Contas do minimapa (proposta P3): área das imagens → caixa do minimapa e de volta.
// Funções puras, testadas em `tests/canvas/minimap.test.ts`.
import type { Rect } from '../model';
import type { Point, Size, Viewport } from './viewport';

export interface MinimapLayout {
  /** Escala do minimapa: pixels do minimapa por unidade do canvas. */
  readonly scale: number;
  /** Área do minimapa, em pixels (cabe dentro de `box`, na proporção do conteúdo). */
  readonly size: Size;
  /** Conteúdo desenhado (as imagens mais a parte visível). */
  readonly content: Rect;
}

/** Retângulo que contém `a` e `b`. */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Parte visível do canvas (unidades do canvas) para um viewport e um tamanho de tela. */
export function visibleRect(viewport: Viewport, size: Size): Rect {
  return {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: size.width / viewport.scale,
    height: size.height / viewport.scale,
  };
}

/**
 * Enquadra as imagens (e a parte visível, para a moldura nunca sair do mapa) numa
 * caixa de no máximo `box` pixels, mantendo a proporção.
 */
export function minimapLayout(
  bounds: Rect,
  visible: Rect,
  box: Size,
): MinimapLayout | null {
  const content = unionRect(bounds, visible);
  if (content.width <= 0 || content.height <= 0) return null;
  const scale = Math.min(box.width / content.width, box.height / content.height);
  return {
    scale,
    size: { width: content.width * scale, height: content.height * scale },
    content,
  };
}

/** Retângulo do canvas em pixels do minimapa. */
export function toMinimap(layout: MinimapLayout, rect: Rect): Rect {
  const { scale, content } = layout;
  return {
    x: (rect.x - content.x) * scale,
    y: (rect.y - content.y) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** Ponto clicado no minimapa (pixels, relativo a ele) → ponto do canvas. */
export function fromMinimap(layout: MinimapLayout, p: Point): Point {
  return {
    x: layout.content.x + p.x / layout.scale,
    y: layout.content.y + p.y / layout.scale,
  };
}
