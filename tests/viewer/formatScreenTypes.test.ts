// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type {
  FormatScreenCode as ModelCode,
  FormatScreenResult as ModelResult,
} from '../../src/model/formatScreen';
import type { FormatScreenCode, FormatScreenResult } from '../../viewer/formats';

// The entry's public types are written in `viewer/formats.ts` (the model's would drag `zod` into the
// package's declarations, `tests/viewer/declarations.test.ts`). They must stay the model's.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe('the public types of mapping-viewer/formats', () => {
  it('stay the types of the model', () => {
    const code: Same<ModelCode, FormatScreenCode> = true;
    const result: Same<ModelResult, FormatScreenResult> = true;
    expect([code, result]).toEqual([true, true]);
  });
});
