/**
 * Recorte ampliado de um quadro (A3 da etapa "componentes fiéis"): o traço `outside` (e metade do
 * `center`) e a sombra do próprio quadro, e de filhos que passam da caixa só por traço ou sombra,
 * entram no recorte. O conteúdo (formas e texto) continua recortado na caixa: um filho que passa
 * da caixa pelo conteúdo não alarga o recorte além do que o traço e a sombra dele alcançam.
 */
import {
  type ClipBox,
  type FrameNode,
  type SceneNode,
  type Stroke,
  nodeMatrix,
} from './scene';

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

/** Quanto a largura do traço passa do contorno: `outside` toda, `center` metade, `inside` nada. */
function bandOf(stroke: Stroke): number {
  if (stroke.align === 'outside') return stroke.width;
  return stroke.align === 'center' ? stroke.width / 2 : 0;
}

/**
 * Quanto o traço sai da caixa: o `offset` (o contorno afastado da forma) mais `outside` o traço
 * todo, `center` metade, `inside` nada.
 */
function strokeExtent(stroke: Stroke | undefined): Extent {
  if (!stroke || stroke.width <= 0) return NONE;
  const out = (stroke.offset ?? 0) + bandOf(stroke);
  if (out <= 0) return NONE;
  const has = (side: 'top' | 'right' | 'bottom' | 'left'): boolean =>
    !stroke.sides || stroke.sides.includes(side);
  return {
    left: has('left') ? out : 0,
    top: has('top') ? out : 0,
    right: has('right') ? out : 0,
    bottom: has('bottom') ? out : 0,
  };
}

/**
 * Quanto as sombras externas saem da caixa, por lado: o `blur`, o `spread` (cresce a forma, ou
 * encolhe, se negativo) e o deslocamento de cada uma; vale a que passa mais.
 */
function shadowExtent(node: SceneNode): Extent {
  let out = NONE;
  for (const shadow of node.effects) {
    if (shadow.inner) continue;
    const reach = shadow.blur + (shadow.spread ?? 0);
    const { offset } = shadow;
    out = maxExtent(out, {
      left: Math.max(0, reach - offset.x),
      right: Math.max(0, reach + offset.x),
      top: Math.max(0, reach - offset.y),
      bottom: Math.max(0, reach + offset.y),
    });
  }
  return out;
}

function extentOf(node: SceneNode): Extent {
  return maxExtent(strokeExtent(node.stroke), shadowExtent(node));
}

function isNone(e: Extent): boolean {
  return e.left <= 0 && e.top <= 0 && e.right <= 0 && e.bottom <= 0;
}

/** A caixa que contém o retângulo `local` do nó depois da `rotation` (e da escala e translação). */
function boxOfLocal(node: SceneNode, local: ClipBox, ox: number, oy: number): ClipBox {
  const [a, b, c, d, e, f] = nodeMatrix(node);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x + local.width, local.y + local.height],
    [local.x, local.y + local.height],
  ] as const) {
    xs.push(ox + a * x + c * y + e);
    ys.push(oy + b * x + d * y + f);
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}

/** O mesmo afastamento nos quatro lados (o maior): a extensão de um nó girado, sem lado certo. */
function isotropic(e: Extent): Extent {
  const all = Math.max(e.left, e.top, e.right, e.bottom);
  return { left: all, top: all, right: all, bottom: all };
}

/**
 * O que os descendentes de um quadro girado alcançam só por traço ou sombra, sem lado: o maior
 * afastamento da subárvore (quadros com recorte entram pelo próprio recorte ampliado).
 */
function deepExtent(node: SceneNode): Extent {
  if (node.type !== 'frame' && node.type !== 'group') return NONE;
  let out = NONE;
  for (const child of node.children) {
    if (!child.visible) continue;
    let own = extentOf(child);
    if (child.type === 'frame' && child.clip && child.clipBox) {
      const c = child.clipBox;
      own = maxExtent(own, {
        left: Math.max(0, -c.x),
        top: Math.max(0, -c.y),
        right: Math.max(0, c.x + c.width - child.width),
        bottom: Math.max(0, c.y + c.height - child.height),
      });
    } else if (!(child.type === 'frame' && child.clip)) {
      own = maxExtent(own, deepExtent(child));
    }
    out = maxExtent(out, own);
  }
  return out;
}

/** Retângulo do nó no espaço do quadro que recorta; com `rotation`, a caixa do retângulo girado. */
function rectOf(node: SceneNode, ox: number, oy: number): ClipBox {
  if (node.rotation)
    return boxOfLocal(
      node,
      { x: 0, y: 0, width: node.width, height: node.height },
      ox,
      oy,
    );
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
    const overhang = {
      left: Math.max(0, -c.x),
      top: Math.max(0, -c.y),
      right: Math.max(0, c.x + c.width - child.width),
      bottom: Math.max(0, c.y + c.height - child.height),
    };
    // Girado, o recorte ampliado (no espaço local do quadro) vira a caixa dele depois do giro.
    if (child.rotation)
      return { region: boxOfLocal(child, c, ox, oy), limit: isotropic(overhang) };
    return {
      region: { x: rect.x + c.x, y: rect.y + c.y, width: c.width, height: c.height },
      limit: overhang,
    };
  }
  const own = extentOf(child);
  // Girado, os lados do traço e da sombra giram: vale o maior em volta, com o que há dentro dele.
  const e = child.rotation ? isotropic(maxExtent(own, rotatedInside(child))) : own;
  return isNone(e) ? null : { region: grow(rect, e), limit: e };
}

/** O que há dentro de um filho girado (quadro que recorta não conta: o recorte vale por ele). */
function rotatedInside(child: SceneNode): Extent {
  return child.type === 'frame' && child.clip ? NONE : deepExtent(child);
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
    // Quadro girado sem recorte: o que há dentro dele gira e não é seguido (só a caixa dele conta).
    if (child.type === 'frame' && !child.clip && !child.rotation) {
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
