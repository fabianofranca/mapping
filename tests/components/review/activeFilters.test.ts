import { describe, expect, it } from 'vitest';
import { NO_FILTERS, hasActiveFilters } from '../../../src/model/proposalView';
import {
  activeFilterConditions,
  activeFilterGroups,
} from '../../../src/ui/review/ReviewLevels';

describe('activeFilterConditions', () => {
  it('agrees with the model hasActiveFilters in each group', () => {
    expect(activeFilterGroups(NO_FILTERS)).toBe(0);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    const active = [
      { decision: 'accepted' as const },
      { types: ['created' as const] },
      { imageId: 'I1' },
      { layerId: 'L1' },
      { onlyConflicts: true },
      { onlyRevised: true },
    ];
    for (const patch of active) {
      const f = { ...NO_FILTERS, ...patch };
      expect(activeFilterConditions(f).filter(Boolean)).toHaveLength(1);
      expect(hasActiveFilters(f)).toBe(true);
    }
  });
});
