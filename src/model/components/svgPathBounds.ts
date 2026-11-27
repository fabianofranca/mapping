import type { Point } from './svgTransform';

/**
 * The tight box of the fill geometry of an SVG path (`d`), without the stroke: what a gradient in
 * `objectBoundingBox` is measured against (stage #2847, decision 6).
 *
 * It reads `M L H V C S Q T A Z`, absolute and relative. The extremes of a cubic and of a quadratic
 * come from the roots of the derivative, and an arc from SVG's endpoint-to-center conversion
 * (appendix B.2.4, with the radius correction) with the extremes at the axis angles inside the sweep.
 *
 * Pure functions, no DOM.
 */

export interface PathBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------------------------
// The extent being grown

interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function grow(extent: Extent, [x, y]: Point): void {
  extent.minX = Math.min(extent.minX, x);
  extent.maxX = Math.max(extent.maxX, x);
  extent.minY = Math.min(extent.minY, y);
  extent.maxY = Math.max(extent.maxY, y);
}

// ---------------------------------------------------------------------------------------------
// The scanner

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;
const SEPARATOR = /^[\s,]*/;

class Scanner {
  pos = 0;
  constructor(private readonly text: string) {}

  skip(): void {
    this.pos += SEPARATOR.exec(this.text.slice(this.pos))?.[0].length ?? 0;
  }

  atEnd(): boolean {
    this.skip();
    return this.pos >= this.text.length;
  }

  peek(): string {
    return this.text.charAt(this.pos);
  }

  next(): string {
    return this.text.charAt(this.pos++);
  }

  number(): number | undefined {
    this.skip();
    const match = NUMBER.exec(this.text.slice(this.pos));
    if (match === null) return undefined;
    this.pos += match[0].length;
    return Number(match[0]);
  }

  /** An arc flag: one `0` or `1`, which may be glued to what follows. */
  flag(): number | undefined {
    this.skip();
    const ch = this.peek();
    if (ch !== '0' && ch !== '1') return undefined;
    this.pos += 1;
    return Number(ch);
  }
}

// ---------------------------------------------------------------------------------------------
// The state of the walk

interface State {
  readonly extent: Extent;
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** The last control point of a cubic or quadratic, to reflect for `S` and `T`. */
  control: Point | undefined;
  /** What `control` is the control point of. */
  controlKind: 'cubic' | 'quad' | undefined;
}

function moveTo(state: State, point: Point): void {
  [state.x, state.y] = point;
  grow(state.extent, point);
}

const here = (state: State): Point => [state.x, state.y];

// ---------------------------------------------------------------------------------------------
// Curves

const EPSILON = 1e-12;

/** The `t` in (0, 1) where a cubic with these four coordinates has a zero derivative. */
function cubicRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = p1 - p0;
  const b = p2 - p1;
  const c = p3 - p2;
  const qa = a - 2 * b + c;
  const qb = 2 * (b - a);
  const roots: number[] = [];
  if (Math.abs(qa) < EPSILON) {
    if (Math.abs(qb) >= EPSILON) roots.push(-a / qb);
  } else {
    const disc = qb * qb - 4 * qa * a;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      roots.push((-qb + root) / (2 * qa), (-qb - root) / (2 * qa));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

const cubicAt = (t: number, p0: number, p1: number, p2: number, p3: number): number =>
  (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;

function cubic(state: State, c1: Point, c2: Point, end: Point): void {
  const [x0, y0] = here(state);
  const xs: [number, number, number, number] = [x0, c1[0], c2[0], end[0]];
  const ys: [number, number, number, number] = [y0, c1[1], c2[1], end[1]];
  const ts = [...cubicRoots(...xs), ...cubicRoots(...ys)];
  for (const t of ts) grow(state.extent, [cubicAt(t, ...xs), cubicAt(t, ...ys)]);
  state.control = c2;
  state.controlKind = 'cubic';
  moveTo(state, end);
}

const quadAt = (t: number, p0: number, p1: number, p2: number): number =>
  (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

/** The `t` in (0, 1) where a quadratic has a zero derivative, as a list of zero or one. */
function quadRoot(p0: number, p1: number, p2: number): number[] {
  const denominator = p0 - 2 * p1 + p2;
  if (Math.abs(denominator) < EPSILON) return [];
  const t = (p0 - p1) / denominator;
  return t > 0 && t < 1 ? [t] : [];
}

function quad(state: State, control: Point, end: Point): void {
  const [x0, y0] = here(state);
  for (const t of quadRoot(x0, control[0], end[0]))
    grow(state.extent, [
      quadAt(t, x0, control[0], end[0]),
      quadAt(t, y0, control[1], end[1]),
    ]);
  for (const t of quadRoot(y0, control[1], end[1]))
    grow(state.extent, [
      quadAt(t, x0, control[0], end[0]),
      quadAt(t, y0, control[1], end[1]),
    ]);
  state.control = control;
  state.controlKind = 'quad';
  moveTo(state, end);
}

/** The control point `S` and `T` reflect: the previous one of the same kind, else the current point. */
function reflected(state: State, kind: 'cubic' | 'quad'): Point {
  if (state.control === undefined || state.controlKind !== kind) return here(state);
  return [2 * state.x - state.control[0], 2 * state.y - state.control[1]];
}

// ---------------------------------------------------------------------------------------------
// Arcs

interface Arc {
  readonly rx: number;
  readonly ry: number;
  readonly phi: number;
  readonly large: boolean;
  readonly sweep: boolean;
}

interface Ellipse {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly phi: number;
  readonly start: number;
  readonly delta: number;
}

const angleOf = (ux: number, uy: number, vx: number, vy: number): number =>
  Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/** The center parametrization of the arc from `from` to `to` (SVG, appendix B.2.4). */
function centerOf(arc: Arc, from: Point, to: Point): Ellipse {
  const { phi } = arc;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  // Radii too small are enlarged until the arc fits.
  const lambda = (x1 * x1) / (arc.rx * arc.rx) + (y1 * y1) / (arc.ry * arc.ry);
  const scale = lambda > 1 ? Math.sqrt(lambda) : 1;
  const [rx, ry] = [arc.rx * scale, arc.ry * scale];
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const sign = arc.large === arc.sweep ? -1 : 1;
  const k = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (k * rx * y1) / ry;
  const cyp = (-k * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (from[0] + to[0]) / 2;
  const cy = sin * cxp + cos * cyp + (from[1] + to[1]) / 2;
  const start = angleOf(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let delta = angleOf(
    (x1 - cxp) / rx,
    (y1 - cyp) / ry,
    (-x1 - cxp) / rx,
    (-y1 - cyp) / ry,
  );
  if (!arc.sweep && delta > 0) delta -= 2 * Math.PI;
  if (arc.sweep && delta < 0) delta += 2 * Math.PI;
  return { cx, cy, rx, ry, phi, start, delta };
}

/** Whether the angle `theta` is inside the sweep that starts at `start` and runs `delta`. */
function inSweep(theta: number, start: number, delta: number): boolean {
  const turn = 2 * Math.PI;
  const offset = (((delta >= 0 ? theta - start : start - theta) % turn) + turn) % turn;
  return offset <= Math.abs(delta);
}

const pointAt = (e: Ellipse, theta: number): Point => [
  e.cx +
    e.rx * Math.cos(e.phi) * Math.cos(theta) -
    e.ry * Math.sin(e.phi) * Math.sin(theta),
  e.cy +
    e.rx * Math.sin(e.phi) * Math.cos(theta) +
    e.ry * Math.cos(e.phi) * Math.sin(theta),
];

function arcExtremes(extent: Extent, e: Ellipse): void {
  const base = [
    Math.atan2(-e.ry * Math.sin(e.phi), e.rx * Math.cos(e.phi)),
    Math.atan2(e.ry * Math.cos(e.phi), e.rx * Math.sin(e.phi)),
  ];
  for (const theta of base.flatMap((a) => [a, a + Math.PI]))
    if (inSweep(theta, e.start, e.delta)) grow(extent, pointAt(e, theta));
}

function arc(state: State, shape: Arc, end: Point): void {
  const from = here(state);
  const same = from[0] === end[0] && from[1] === end[1];
  // A zero radius is a straight line, and the same end point draws nothing (SVG).
  if (!same && shape.rx !== 0 && shape.ry !== 0)
    arcExtremes(
      state.extent,
      centerOf({ ...shape, rx: Math.abs(shape.rx), ry: Math.abs(shape.ry) }, from, end),
    );
  state.control = undefined;
  moveTo(state, end);
}

// ---------------------------------------------------------------------------------------------
// The commands

type Handler = (state: State, args: readonly number[], relative: boolean) => void;

/** `args` are the numbers of the command; a point in them is moved by the current point when relative. */
const place = (state: State, x: number, y: number, relative: boolean): Point =>
  relative ? [state.x + x, state.y + y] : [x, y];

const HANDLERS: Readonly<Record<string, Handler>> = {
  m: (s, [x = 0, y = 0], r) => {
    const point = place(s, x, y, r);
    [s.startX, s.startY] = point;
    moveTo(s, point);
  },
  l: (s, [x = 0, y = 0], r) => moveTo(s, place(s, x, y, r)),
  h: (s, [x = 0], r) => moveTo(s, [r ? s.x + x : x, s.y]),
  v: (s, [y = 0], r) => moveTo(s, [s.x, r ? s.y + y : y]),
  c: (s, [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0], r) =>
    cubic(s, place(s, a, b, r), place(s, c, d, r), place(s, x, y, r)),
  s: (s, [c = 0, d = 0, x = 0, y = 0], r) =>
    cubic(s, reflected(s, 'cubic'), place(s, c, d, r), place(s, x, y, r)),
  q: (s, [a = 0, b = 0, x = 0, y = 0], r) =>
    quad(s, place(s, a, b, r), place(s, x, y, r)),
  t: (s, [x = 0, y = 0], r) => {
    const control = reflected(s, 'quad');
    quad(s, control, place(s, x, y, r));
  },
  a: (s, [rx = 0, ry = 0, deg = 0, large = 0, sweep = 0, x = 0, y = 0], r) =>
    arc(
      s,
      { rx, ry, phi: (deg * Math.PI) / 180, large: large === 1, sweep: sweep === 1 },
      place(s, x, y, r),
    ),
  z: (s) => {
    s.control = undefined;
    moveTo(s, [s.startX, s.startY]);
  },
};

/** How many numbers each command takes (the arc's two flags count as numbers). */
const ARGUMENTS: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/** The numbers of one command, or `undefined` when the text has fewer than it needs. */
function readArguments(scanner: Scanner, lower: string): number[] | undefined {
  const count = ARGUMENTS[lower] ?? 0;
  const args: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const isFlag = lower === 'a' && (i === 3 || i === 4);
    const value = isFlag ? scanner.flag() : scanner.number();
    if (value === undefined) return undefined;
    args.push(value);
  }
  return args;
}

/** The control point of a `C`/`S` or `Q`/`T` survives only into the next command of its kind. */
function forget(state: State, lower: string): void {
  if (lower !== 'c' && lower !== 's' && lower !== 'q' && lower !== 't') {
    state.control = undefined;
    state.controlKind = undefined;
  }
}

/** After a command's numbers: `M` repeats as `L`, `m` as `l`, and `Z` takes none. */
const repeatOf = (command: string): string =>
  command === 'M' ? 'L' : command === 'm' ? 'l' : command;

/** Runs one command of the text (and the implicit repeats of its numbers); `false` when it is invalid. */
function run(state: State, scanner: Scanner, first: string): boolean {
  let command = first;
  for (;;) {
    const lower = command.toLowerCase();
    const handler = HANDLERS[lower];
    const args = handler === undefined ? undefined : readArguments(scanner, lower);
    if (handler === undefined || args === undefined) return false;
    handler(state, args, command !== command.toUpperCase());
    forget(state, lower);
    command = repeatOf(command);
    scanner.skip();
    if (lower === 'z' || !/[-+.\d]/.test(scanner.peek())) return true;
  }
}

// ---------------------------------------------------------------------------------------------
// The entry

/**
 * The tight box of the path data `d`, or `undefined` when it is not valid path data (it must start
 * with `M`/`m`, use only the commands above and give each one all its numbers).
 */
export function pathBounds(d: string): PathBounds | undefined {
  const scanner = new Scanner(d);
  const state: State = {
    extent: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    control: undefined,
    controlKind: undefined,
  };
  if (scanner.atEnd() || !/^[Mm]$/.test(scanner.peek())) return undefined;
  while (!scanner.atEnd()) {
    if (!run(state, scanner, scanner.next())) return undefined;
  }
  const { minX, minY, maxX, maxY } = state.extent;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
