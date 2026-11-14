// Arrow level of detail by its size and that of the ends on screen (canvas-performance stage, decision 7).
import { levelOfDetail } from './levelOfDetail';

export type ArrowDetail = 'full' | 'thin' | 'hidden';

/** An arrow end: the linked marking, with its size on screen (px). */
export interface ArrowEnd {
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Selected (including in multi-select), under the mouse or with a review mark. */
  readonly always: boolean;
}

export interface ArrowDetailInput {
  /** Length of the stroke on screen (px): sum of the `path` segments × zoom. */
  readonly screenLength: number;
  /** The arrow is selected. */
  readonly always: boolean;
  readonly from: ArrowEnd;
  readonly to: ArrowEnd;
  /** `size-lod-min-marking`: below this the length only gives the stroke. */
  readonly minFull: number;
  /** `size-lod-hide-marking`: below this, in both measures, the end is invisible. */
  readonly hide: number;
}

/** The end is invisible by size (the same rule as the markings, `levelOfDetail`). */
function endHidden(end: ArrowEnd, input: ArrowDetailInput): boolean {
  return (
    levelOfDetail({
      screenWidth: end.screenWidth,
      screenHeight: end.screenHeight,
      always: end.always,
      minFull: input.minFull,
      hide: input.hide,
    }) === 'hidden'
  );
}

/**
 * Whole if the arrow is selected or links a selected marking, under the mouse (or with a review
 * mark); gone if both ends are invisible; only the stroke (no halo, tip or label) if the
 * length on screen is less than `minFull`.
 */
export function arrowDetail(input: ArrowDetailInput): ArrowDetail {
  if (input.always || input.from.always || input.to.always) return 'full';
  if (endHidden(input.from, input) && endHidden(input.to, input)) return 'hidden';
  return input.screenLength < input.minFull ? 'thin' : 'full';
}
