// Auxiliares da regressão da EX6 (#897): a fixture tests/fixtures/material3-ex6-v1.json guarda as
// cenas do slider, do progress-indicator, do carousel, da short-navigation-bar e do
// pull-to-refresh como a biblioteca material3-compose version 6 (com as tabelas) as desenhava.
// Cada nó é uma linha `tipo|nome|x,y,w,h|preenchimento|opacidade|texto|d`; as caixas são absolutas.
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode } from '../../src/model/components/scene';
import { drawIn, files, solid } from './material3Library';
import fixture from '../fixtures/material3-ex6-v1.json';

export type Mode = 'light' | 'dark';
export type Values = Parameters<typeof drawIn>[2];
export type Drawing = ReturnType<typeof drawIn>;

export interface OldNode {
  readonly t: string;
  readonly n: string;
  readonly r: number[];
  readonly f?: string;
  readonly o?: number;
  readonly x?: string;
  readonly d?: string;
}
export interface OldScene {
  readonly key: string;
  readonly id: string;
  readonly values: Values;
  readonly mode: Mode;
  readonly nodes: OldNode[];
}

export const catalog = buildCatalog(files);

function parseNode(line: string): OldNode {
  const [t = '', n = '', r = '', f = '', o = '', x = '', ...rest] = line.split('|');
  const d = rest.join('|');
  return {
    t,
    n,
    r: r.split(',').map(Number),
    ...(f === '' ? {} : { f }),
    ...(o === '' ? {} : { o: Number(o) }),
    ...(t === 'text' ? { x } : {}),
    ...(d === '' ? {} : { d }),
  };
}

const raw = (fixture as unknown as { scenes: Record<string, Record<string, unknown>> })
  .scenes;

/** As cenas gravadas cujo nome começa com `prefix` (ex.: `slider-single-`, `progress-linear-`). */
export function oldScenes(prefix: string): OldScene[] {
  return Object.entries(raw)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, s]) => ({
      key,
      id: s['id'] as string,
      values: s['values'] as Values,
      mode: s['mode'] as Mode,
      nodes: (s['nodes'] as string[]).map(parseNode),
    }));
}

export function draw(id: string, values: Values, mode: Mode = 'light'): Drawing {
  return drawIn(catalog, findEntry(catalog, id)!, values, mode);
}

export interface PathPoint {
  readonly x: number;
  readonly y: number;
  /** Flags do arco (`large sweep`), só nos pontos de um `A`. */
  readonly flags?: string;
}

/**
 * Os pontos finais de cada segmento de um `d` com comandos absolutos (M, L, H, V, C, A, Z);
 * `null` se houver outro comando (os ícones usam relativos: neles só a caixa e a cor contam).
 */
export function pathPoints(d: string): PathPoint[] | null {
  if (/[a-yA-Y]/.test(d.replace(/[MLHVCAZ]/g, '').replace(/e/g, ''))) return null;
  const tokens = d.match(/[MLHVCAZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: PathPoint[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (/[MLHVCAZ]/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z') continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      cx = next();
      cy = next();
      out.push({ x: cx, y: cy });
    } else if (cmd === 'H') {
      cx = next();
      out.push({ x: cx, y: cy });
    } else if (cmd === 'V') {
      cy = next();
      out.push({ x: cx, y: cy });
    } else if (cmd === 'C') {
      i += 4;
      cx = next();
      cy = next();
      out.push({ x: cx, y: cy });
    } else if (cmd === 'A') {
      i += 2; // raios
      i += 1; // rotação do eixo
      const large = tokens[i++];
      const sweep = tokens[i++];
      cx = next();
      cy = next();
      out.push({ x: cx, y: cy, flags: `${large}${sweep}` });
    } else {
      return null;
    }
  }
  return out;
}

/** Os pontos do path de um nó já desenhado, com a `rotation` do nó em volta do centro da caixa. */
export function drawnPathPoints(node: PathNode): PathPoint[] | null {
  const pts = pathPoints(node.d);
  if (pts === null) return null;
  const rotation = node.rotation ?? 0;
  if (rotation === 0) return pts;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = node.width / 2;
  const cy = node.height / 2;
  return pts.map((p) => ({
    ...p,
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }));
}

export interface CompareOptions {
  /** Tolerância em px (padrão 0,5, decisão 16). */
  readonly tol?: number;
  /** Nome de antes → nome de agora, quando a nova construção repartiu o nó. */
  readonly rename?: Record<string, string>;
  /** Nós de antes que não têm correspondente de propósito (ex.: a faixa de 4000 de largura). */
  readonly skip?: (old: OldNode) => boolean;
}

const close = (a: readonly number[], b: readonly number[], tol: number) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) <= tol);

/** Os nós de antes que não aparecem no desenho de agora (lista vazia = regressão cumprida). */
export function missingNodes(
  d: Drawing,
  old: readonly OldNode[],
  opts: CompareOptions = {},
) {
  const tol = opts.tol ?? 0.5;
  const boxes = absoluteBoxes(d.root);
  const now = [...walk(d.root)].filter((n: SceneNode) => n.visible);
  const missing: string[] = [];
  for (const o of old) {
    if (opts.skip?.(o) === true) continue;
    const name = opts.rename?.[o.n] ?? o.n;
    const found = now.some((n) => {
      if (n.type !== o.t) return false;
      if (o.t === 'text' ? (n as { text: string }).text !== o.x : n.name !== name)
        return false;
      const b = boxes.get(n.id)!;
      if (!close([b.x, b.y, b.width, b.height], o.r, tol)) return false;
      if (o.f !== undefined && solid(n.fills) !== o.f) return false;
      if (o.o !== undefined && Math.abs(n.opacity - o.o) > 0.01) return false;
      if (o.t === 'path' && o.d !== undefined) {
        const a = pathPoints(o.d);
        const c = drawnPathPoints(n as PathNode);
        if (a === null || c === null) return true;
        if (a.length !== c.length) return false;
        return a.every(
          (p, i) =>
            Math.abs(p.x - c[i]!.x) <= tol &&
            Math.abs(p.y - c[i]!.y) <= tol &&
            p.flags === c[i]!.flags,
        );
      }
      return true;
    });
    if (!found) missing.push(`${o.t} ${o.n} ${o.x ?? ''} ${o.r.join(',')}`);
  }
  return missing;
}
