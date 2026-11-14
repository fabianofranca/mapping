/**
 * Component engine: checking of the layout values that arrive through expressions
 * (`formatVersion` 4). Pure functions: the already evaluated value goes in, the valid value (or
 * none) comes out.
 */
import type {
  IntrinsicSize,
  LayoutAlign,
  LayoutJustify,
  LayoutType,
  LayoutWrap,
  SizeSpec,
} from './componentFormat';

export const LAYOUT_TYPES: readonly LayoutType[] = ['none', 'row', 'column', 'grid'];
export const LAYOUT_ALIGNS: readonly LayoutAlign[] = [
  'start',
  'center',
  'end',
  'stretch',
  'baseline',
];
export const LAYOUT_JUSTIFIES: readonly LayoutJustify[] = [
  'start',
  'center',
  'end',
  'space-between',
  'space-around',
  'space-evenly',
];
/** `align` (vertical axis) of a `none` frame: without `baseline`. */
export const NONE_ALIGNS: readonly LayoutAlign[] = ['start', 'center', 'end', 'stretch'];
/** `justify` (horizontal axis) of a `none` frame (v4): only the four, `stretch` included. */
export const NONE_JUSTIFIES: readonly LayoutJustify[] = [
  'start',
  'center',
  'end',
  'stretch',
];
export const LAYOUT_WRAPS: readonly LayoutWrap[] = ['none', 'wrap', 'wrap-reverse'];

/**
 * Where the first child starts (`offset`) and the extra gap between children (`extra`) on the
 * main axis, given the slack `free` (>= 0) and the number of children, like flexbox's
 * `justify-content`. With a single child: `space-around` and `space-evenly` center it,
 * `space-between` leaves it at the start.
 */
export function justifySpacing(
  justify: LayoutJustify,
  free: number,
  count: number,
): { offset: number; extra: number } {
  if (count <= 0) return { offset: 0, extra: 0 };
  switch (justify) {
    case 'center':
      return { offset: free / 2, extra: 0 };
    case 'end':
      return { offset: free, extra: 0 };
    case 'space-between':
      return { offset: 0, extra: count > 1 ? free / (count - 1) : 0 };
    case 'space-around':
      return { offset: free / (2 * count), extra: free / count };
    case 'space-evenly':
      return { offset: free / (count + 1), extra: free / (count + 1) };
    default:
      return { offset: 0, extra: 0 };
  }
}

/**
 * Mirrors a child's position on the main axis for `reverse` (`row-reverse`/`column-reverse`):
 * within `[start, start + content]`, the child of size `size` at `position` ends up at the
 * same distance from the other end.
 */
export function mirrorMain(
  position: number,
  size: number,
  start: number,
  content: number,
): number {
  return 2 * start + content - position - size;
}

const PERCENT = /^\d+(\.\d+)?%$/;
const PLAIN_NUMBER = /^\s*\d+(\.\d+)?\s*$/;

/** `"min-content"` or `"max-content"` (v4). */
export function isIntrinsicSize(value: unknown): value is IntrinsicSize {
  return value === 'min-content' || value === 'max-content';
}

/** The intrinsic measure a size asks for (`min-content`/`max-content`); any other size = none. */
export function intrinsicModeOf(spec: unknown): IntrinsicSize | null {
  return isIntrinsicSize(spec) ? spec : null;
}

/**
 * Checks a size: finite number >= 0, plain numeric text (`"120"` -> 120), `"fill"`,
 * `"hug"`, `"min-content"`, `"max-content"` or `"N%"`. Anything else is not a size
 * (`undefined`). The caller checks the format version.
 */
export function parseSizeSpec(value: unknown): SizeSpec | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  if (value === 'fill' || value === 'hug' || isIntrinsicSize(value)) return value;
  if (PERCENT.test(value)) return value as `${number}%`;
  return PLAIN_NUMBER.test(value) ? Number(value) : undefined;
}

/** The value if it is in the allowed set; otherwise none. */
export function allowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** The value as it appears in warning messages (an object becomes JSON). */
export function describeValue(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value);
}
