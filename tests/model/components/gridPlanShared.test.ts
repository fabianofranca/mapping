// CL1 (P3): the computation of the flow lines extents and the reading of the track keys are one single
// (`gridPlan.ts`); `layout.ts`, `arrange.ts` and `componentMarkings.ts` import it instead of repeating it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { placeCells } from '../../../src/model/components/gridLayout';
import {
  TRACK_KEYS,
  lineExtents,
  validTrack,
} from '../../../src/model/components/gridPlan';

const SRC = join(__dirname, '../../../src/model');
const source = (file: string): string => readFileSync(join(SRC, file), 'utf8');

describe('lineExtents (gridPlan)', () => {
  it('the extent of each line is that of its largest child', () => {
    const { cells, lines } = placeCells([1, 1, 1, 1, 1], 2);
    expect(lineExtents(cells, lines, [10, 30, 5, 5, 7])).toEqual([30, 5, 7]);
  });

  it('without children there is no line', () => {
    expect(lineExtents([], 0, [])).toEqual([]);
  });
});

describe('a single implementation', () => {
  it.each(['components/layout.ts', 'components/arrange.ts', 'componentMarkings.ts'])(
    '%s does not repeat the computation of the flow lines nor the validation of the tracks',
    (file) => {
      const text = source(file);
      expect(text).not.toMatch(/function lineExtents\b/);
      expect(text).not.toMatch(/Array\.from\(\{ length: lines \}/);
      expect(text).not.toMatch(/function trackNumber\b/);
    },
  );

  it('arrange.ts reads the track keys from gridPlan', () => {
    expect(source('components/arrange.ts')).toMatch(
      /TRACK_KEYS[\s\S]*from '\.\/gridPlan'/,
    );
    expect(TRACK_KEYS.map((entry) => entry.key)).toEqual([
      'columns',
      'minColumnWidth',
      'rows',
      'minRowHeight',
    ]);
    expect(validTrack('count', 2.5)).toBeUndefined();
    expect(validTrack('min', '80')).toBe(80);
  });
});
