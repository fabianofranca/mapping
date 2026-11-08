/**
 * Recorte ampliado de um quadro (A3 da etapa "componentes fiéis"): o traço `outside` (e metade do
 * `center`) e a sombra do próprio quadro, e de filhos que passam da caixa só por traço ou sombra,
 * entram no recorte. O conteúdo (formas e texto) continua recortado na caixa: um filho que passa
 * da caixa pelo conteúdo não alarga o recorte além do que o traço e a sombra dele alcançam.
 */
import type { ClipBox, FrameNode, SceneNode, Stroke } from './scene';

interface Extent {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const NONE: Extent = { left: 0, top: 0, right: 0, bottom: 0 };

function maxExtent(a: Extent, b: Extent): Extent {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/** Quanto o traço sai da caixa: `outside` o traço todo, `center` metade, `inside` nada. */
function strokeExtent(stroke: Stroke | undefined): Extent {
  if (!stroke || stroke.width <= 0 || stroke.align === 'inside') return NONE;
  const out = stroke.align === 'outside' ? stroke.width : stroke.width / 2;
  const has = (side: 'top' | 'right' | 'bottom' | 'left'): boolean =>
    !stroke.sides || stroke.sides.includes(side);
  return {
    left: has('left') ? out : 0,
    top: has('top') ? out : 0,
    right: has('right') ? out : 0,
    bottom: has('bottom') ? out : 0,
  };
}

/** Quanto a primeira sombra externa sai da caixa, por lado (blur e deslocamento). */
function shadowExtent(node: SceneNode): Extent {
  const shadow = node.effects.find((e) => !e.inner);
  if (!shadow || (shadow.blur <= 0 && shadow.offset.x === 0 && shadow.offset.y === 0))
    return NONE;
  const { blur, offset } = shadow;
  return {
    left: Math.max(0, blur - offset.x),
    right: Math.max(0, blur + offset.x),
    top: Math.max(0, blur - offset.y),
    bottom: Math.max(0, blur + offset.y),
  };
}

function extentOf(node: SceneNode): Extent {
  return maxExtent(strokeExtent(node.stroke), shadowExtent(node));
}

function isNone(e: Extent): boolean {
  return e.left <= 0 && e.top <= 0 && e.right <= 0 && e.bottom <= 0;
}

/** Retângulo do nó no espaço do quadro que recorta, sem rotação (translação e escala). */
function rectOf(node: SceneNode, ox: number, oy: number): ClipBox {
  const m = node.transform;
  return {
    x: ox + m[4],
    y: oy + m[5],
    width: node.width * Math.abs(m[0]),
    height: node.height * Math.abs(m[3]),
  };
}

function grow(box: ClipBox, e: Extent): ClipBox {
  return {
    x: box.x - e.left,
    y: box.y - e.top,
    width: box.width + e.left + e.right,
    height: box.height + e.top + e.bottom,
  };
}

function intersect(a: ClipBox, b: ClipBox): ClipBox | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

function union(a: ClipBox, b: ClipBox): ClipBox {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** A região que um descendente alcança no espaço do quadro e até onde ela pode crescer. */
function reach(
  child: SceneNode,
  ox: number,
  oy: number,
): { region: ClipBox; limit: Extent } | null {
  const rect = rectOf(child, ox, oy);
  if (child.type === 'frame' && child.clip && child.clipBox) {
    const c = child.clipBox;
    const region = { x: rect.x + c.x, y: rect.y + c.y, width: c.width, height: c.height };
    const limit = {
      left: Math.max(0, -c.x),
      top: Math.max(0, -c.y),
      right: Math.max(0, c.x + c.width - child.width),
      bottom: Math.max(0, c.y + c.height - child.height),
    };
    return { region, limit };
  }
  const e = extentOf(child);
  return isNone(e) ? null : { region: grow(rect, e), limit: e };
}

/**
 * Soma ao recorte o que os descendentes alcançam só por traço ou sombra: a região deles
 * (caixa + extensão) limitada à caixa do quadro + a mesma extensão. Não desce em quadro que já
 * recorta: o recorte ampliado dele (ou a caixa) conta como o próprio descendente.
 */
function addDescendants(
  node: FrameNode,
  box: ClipBox,
  ox: number,
  oy: number,
  acc: ClipBox,
): ClipBox {
  let out = acc;
  for (const child of node.children) {
    if (!child.visible) continue;
    if (child.type === 'frame' && !child.clip) {
      const at = rectOf(child, ox, oy);
      out = addDescendants(child, box, at.x, at.y, out);
    }
    const hit = reach(child, ox, oy);
    const part = hit && intersect(hit.region, grow(box, hit.limit));
    if (part) out = union(out, part);
  }
  return out;
}

/**
 * O recorte ampliado de um quadro com `clip`, ou `undefined` quando o recorte é a própria
 * caixa (nada sai dela por traço ou sombra).
 */
export function clipBoxOf(frame: FrameNode): ClipBox | undefined {
  const box: ClipBox = { x: 0, y: 0, width: frame.width, height: frame.height };
  const own = grow(box, extentOf(frame));
  const total = addDescendants(frame, box, 0, 0, own);
  const same =
    total.x === box.x &&
    total.y === box.y &&
    total.width === box.width &&
    total.height === box.height;
  return same ? undefined : total;
}
