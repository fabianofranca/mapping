// Marking level of detail by its size on screen (canvas-scale stage, decision 4).
export type LevelOfDetail = 'full' | 'border' | 'hidden';

export interface LevelOfDetailInput {
  /** Marking size on screen (px). */
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Selected (including in multi-select), under the mouse or with a review mark: always complete. */
  readonly always: boolean;
  /** `size-lod-min-marking`: below this (width or height) only the border. */
  readonly minFull: number;
  /** `size-lod-hide-marking`: below this in both measures, nothing. */
  readonly hide: number;
}

export function levelOfDetail(input: LevelOfDetailInput): LevelOfDetail {
  if (input.always) return 'full';
  const { screenWidth: w, screenHeight: h } = input;
  if (w < input.hide && h < input.hide) return 'hidden';
  return w < input.minFull || h < input.minFull ? 'border' : 'full';
}
