/**
 * The SVG transform list (stage #2847, decision 7): `matrix`, `translate`, `scale`, `rotate`,
 * `skewX` and `skewY`, separated by spaces and/or commas, as one 2×3 matrix. Only
 * `gradientTransform` is read with it; `transform` on shapes stays refused.
 *
 * A matrix is `[a, b, c, d, e, f]`: `x' = a·x + c·y + e` and `y' = b·x + d·y + f`, as SVG writes
 * it. Pure functions, no DOM.
 */

export type Matrix = readonly [number, number, number, number, number, number];
export type Point = readonly [number, number];
/** The linear part of a matrix, `[a, b, c, d]`, in the same order. */
export type Linear = readonly [number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `first` then `second` applied to a point means `multiply(second, first)`: the SVG order. */
export function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyToPoint(m: Matrix, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** The inverse of the linear part (the translation does not count); `undefined` when singular. */
export function invertLinear(m: Matrix): Linear | undefined {
  const [a, b, c, d] = m;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return undefined;
  // `+ 0` turns a `-0` into `0`.
  return [d / det + 0, -b / det + 0, -c / det + 0, a / det + 0];
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

const rotation = (angle: number): Matrix => {
  const cos = Math.cos(radians(angle));
  const sin = Math.sin(radians(angle));
  return [cos, sin, -sin, cos, 0, 0];
};

type Builder = (args: readonly number[]) => Matrix | undefined;

/** Each function: the accepted argument counts and the matrix it makes. */
const FUNCTIONS: Readonly<Record<string, Builder>> = {
  matrix: (a) => (a.length === 6 ? (a as unknown as Matrix) : undefined),
  translate: (a) =>
    a.length === 1 || a.length === 2 ? [1, 0, 0, 1, a[0]!, a[1] ?? 0] : undefined,
  scale: (a) =>
    a.length === 1 || a.length === 2 ? [a[0]!, 0, 0, a[1] ?? a[0]!, 0, 0] : undefined,
  rotate: (a) => {
    if (a.length === 1) return rotation(a[0]!);
    if (a.length !== 3) return undefined;
    const [angle, cx, cy] = a as [number, number, number];
    const around = multiply([1, 0, 0, 1, cx, cy], rotation(angle));
    return multiply(around, [1, 0, 0, 1, -cx, -cy]);
  },
  skewX: (a) => (a.length === 1 ? [1, 0, Math.tan(radians(a[0]!)), 1, 0, 0] : undefined),
  skewY: (a) => (a.length === 1 ? [1, Math.tan(radians(a[0]!)), 0, 1, 0, 0] : undefined),
};

/** The numbers of an argument list; `undefined` when one is not a finite number. */
function numbers(text: string): number[] | undefined {
  const inner = text.trim();
  const parts = inner === '' ? [] : inner.split(/[\s,]+/);
  const values = parts.map((part) => (NUMBER.test(part) ? Number(part) : NaN));
  return values.every(Number.isFinite) ? values : undefined;
}

const CALL = /^\s*([A-Za-z]+)\s*\(([^()]*)\)\s*,?/;

/**
 * The matrix of a transform list; the functions compose left to right (the last one applies
 * first to a point). `undefined` for an empty list, an unknown function, a wrong argument count
 * or anything that is not a transform.
 */
export function parseTransform(text: string): Matrix | undefined {
  let matrix = IDENTITY;
  let rest = text;
  let count = 0;
  for (let call = CALL.exec(rest); call !== null; call = CALL.exec(rest)) {
    const build = Object.hasOwn(FUNCTIONS, call[1]!) ? FUNCTIONS[call[1]!] : undefined;
    const args = numbers(call[2]!);
    const next = build === undefined || args === undefined ? undefined : build(args);
    if (next === undefined) return undefined;
    matrix = multiply(matrix, next);
    rest = rest.slice(call[0].length);
    count++;
  }
  return count > 0 && rest.trim() === '' && matrix.every(Number.isFinite)
    ? matrix
    : undefined;
}
