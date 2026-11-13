import { bottom, clamp, right } from './geometry';
import type {
  AnchorAlign,
  AnchorSide,
  MarkingAnchor,
  ReadingDirection,
  Rect,
} from './types';

// Geometria do encosto da âncora (R3, decisão 12). Pura: recebe os retângulos e devolve o
// retângulo; quem grava (`snapToAnchor`, a criação da instância) fica nos outros módulos.

/** Padrões da âncora vindos do componente: o `offset` está em UNIDADES (× densidade ao usar). */
export interface AnchorDefaults {
  readonly side?: AnchorSide;
  readonly align?: AnchorAlign;
  readonly offset?: { readonly main: number; readonly cross: number };
}

/** Os padrões do componente de uma marcação: um objeto ou uma função de quem os sabe ler. */
export type AnchorDefaultsSource<M> =
  AnchorDefaults | ((marking: M) => AnchorDefaults | undefined);

/** A âncora completa: lado, alinhamento e deslocamento em pixels do espaço. */
export interface ResolvedMarkingAnchor {
  readonly side: AnchorSide;
  readonly align: AnchorAlign;
  readonly offset: { readonly main: number; readonly cross: number };
}

/** O que a âncora não informa vem dos padrões (offset em unidades × `density`), e então de `top`/`center`/0. */
export function resolveMarkingAnchor(
  anchor: MarkingAnchor,
  defaults: AnchorDefaults | undefined,
  density: number,
): ResolvedMarkingAnchor {
  const fallback = defaults?.offset;
  return {
    side: anchor.side ?? defaults?.side ?? 'top',
    align: anchor.align ?? defaults?.align ?? 'center',
    offset:
      anchor.offset ??
      (fallback === undefined
        ? { main: 0, cross: 0 }
        : { main: fallback.main * density, cross: fallback.cross * density }),
  };
}

/** A posição ao longo do lado (`start`/`center`/`end` da âncora) com a marcação de `size` nesse eixo. */
function along(
  align: AnchorAlign,
  from: number,
  extent: number,
  size: number,
  reversed: boolean,
): number {
  const logical = reversed
    ? { start: 'end', center: 'center', end: 'start' }[align]
    : align;
  if (logical === 'start') return from;
  return logical === 'center' ? from + (extent - size) / 2 : from + extent - size;
}

/**
 * O retângulo da marcação de tamanho `width`×`height` encostada em `target` (mesmo espaço), sem
 * limite. A marcação fica FORA da âncora, do lado `side` (`start`/`end` seguem `direction`: em
 * `rtl`, `start` é o lado direito); `align` posiciona ao longo desse lado (em `top`/`bottom` o
 * `start` é o da leitura; nos lados, `start` é o topo); `offset.main` é a distância da borda (negativo
 * sobrepõe) e `offset.cross` anda ao longo do lado: no sentido da leitura em `top`/`bottom` e para
 * baixo nos lados. Inteiro (arredonda).
 */
export function anchoredRect(
  target: Rect,
  size: { readonly width: number; readonly height: number },
  anchor: ResolvedMarkingAnchor,
  direction: ReadingDirection,
): Rect {
  const { side, align, offset } = anchor;
  const rtl = direction === 'rtl';
  const { width, height } = size;
  let x: number;
  let y: number;
  if (side === 'top' || side === 'bottom') {
    y = side === 'top' ? target.y - height - offset.main : bottom(target) + offset.main;
    x =
      along(align, target.x, target.width, width, rtl) +
      (rtl ? -offset.cross : offset.cross);
  } else {
    const left = (side === 'start') !== rtl;
    x = left ? target.x - width - offset.main : right(target) + offset.main;
    y = along(align, target.y, target.height, height, false) + offset.cross;
  }
  return { x: Math.round(x), y: Math.round(y), width, height };
}

/** O retângulo preso dentro de `bounds` (o tamanho não muda); `clamped` diz se foi preciso. */
export function clampedInto(rect: Rect, bounds: Rect): { rect: Rect; clamped: boolean } {
  const x = clamp(rect.x, bounds.x, Math.max(bounds.x, right(bounds) - rect.width));
  const y = clamp(rect.y, bounds.y, Math.max(bounds.y, bottom(bounds) - rect.height));
  return { rect: { ...rect, x, y }, clamped: x !== rect.x || y !== rect.y };
}
