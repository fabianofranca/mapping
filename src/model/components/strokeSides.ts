import type { Stroke } from './scene';

/** Um segmento reto de traço, no espaço local da caixa. */
export interface SideSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Os segmentos do traço de `stroke.sides` numa caixa `width` × `height`: um por lado pedido, reto
 * de ponta a ponta (sem arco no canto, mesmo com `cornerRadius`), com a linha deslocada pelo
 * `align` (por dentro, a metade da largura para dentro; por fora, para fora). Sem `sides`,
 * devolve lista vazia: o traço é o contorno.
 */
export function sideSegments(
  stroke: Stroke,
  width: number,
  height: number,
): SideSegment[] {
  if (!stroke.sides) return [];
  const half = stroke.width / 2;
  const inset = stroke.align === 'inside' ? half : stroke.align === 'outside' ? -half : 0;
  return stroke.sides.map((side) => {
    switch (side) {
      case 'top':
        return { x1: 0, y1: inset, x2: width, y2: inset };
      case 'bottom':
        return { x1: 0, y1: height - inset, x2: width, y2: height - inset };
      case 'left':
        return { x1: inset, y1: 0, x2: inset, y2: height };
      case 'right':
        return { x1: width - inset, y1: 0, x2: width - inset, y2: height };
    }
  });
}
