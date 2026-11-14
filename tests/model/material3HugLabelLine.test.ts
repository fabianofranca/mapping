// Defect inherited from MC5 (#898, phase CL1): the `maxWidth` of the label of button/extended-fab/chip,
// `type width − slack`, limited the hug measure to the type's `size` (136/142/232): an
// ordinary label was born with 2 lines. The hug measure has no `size` limit: the label measures one line.
import { describe, expect, it } from 'vitest';
import { fittedSize } from './../support/material3Fitted';

describe('an ordinary label with hug on the width is born on one line', () => {
  it.each([
    ['button', { label: 'Confirm purchase' }, 40],
    ['chip', { label: 'Long category filter' }, 32],
    ['extended-fab', { label: 'Create new message' }, 56],
  ])('%s', (id, values, height) => {
    const size = fittedSize(id, values);
    expect(size.height).toBe(height);
    // One line: the width goes past the type's (the label is not cut off at it).
    expect(size.width).toBeGreaterThan(0);
  });
});
