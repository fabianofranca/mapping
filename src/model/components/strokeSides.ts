import type { CornerRadius, Stroke } from './scene';

/** Um segmento reto de traço, no espaço local da caixa. */
export interface SideSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * O raio de um canto afastado `by` px (`stroke.offset`, como o `outline-offset` do CSS): o canto
 * reto continua reto; o arredondado cresce `by`.
 */
export function growRadius(radius: CornerRadius, by: number): CornerRadius {
  if (by === 0) return radius;
  const grow = (r: number): number => (r > 0 ? r + by : 0);
  return typeof radius === 'number'
    ? grow(radius)
    : [grow(radius[0]), grow(radius[1]), grow(radius[2]), grow(radius[3])];
}

/**
 * Os segmentos do traço de `stroke.sides` numa caixa `width` × `height`: um por lado pedido, reto
 * de ponta a ponta (sem arco no canto, mesmo com `cornerRadius`), com a linha deslocada pelo
 * `align` (por dentro, a metade da largura para dentro; por fora, para fora) e afastada para fora
 * pelo `offset`. Sem `sides`, devolve lista vazia: o traço é o contorno.
 */
export function sideSegments(
  stroke: Stroke,
  width: number,
  height: number,
): SideSegment[] {
  const { sides } = stroke;
  if (!sides) return [];
  const half = stroke.width / 2;
  const aligned =
    stroke.align === 'inside' ? half : stroke.align === 'outside' ? -half : 0;
  const inset = aligned - (stroke.offset ?? 0);
  return sides.map((side) => {
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
