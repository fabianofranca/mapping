import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Findings 2 and 3 of round #2140 (fix CL1, stage #1971): the script gave premises the app does not
// create. R12.12a said a Box holding two Buttons has no room for a third (a 200 x 120 Box fits a 2 x 2 grid of
// 79 x 40 Buttons, the toast only comes on the 5th drop) and R12.60 said a Palette Text added with a plain
// marking selected is born inside it (Add targets the container; the parent comes from geometry).

const lines = readFileSync('docs/TESTING.md', 'utf8').split('\n');
const row = (id: string): string => {
  const found = lines.find((l) => l.startsWith(`| ${id} |`));
  if (!found) throw new Error(`row ${id} not found`);
  return found;
};

describe('R12.12a: the full-Box premise', () => {
  const r = row('R12.12a');
  it('does not claim that two Buttons already fill the Box', () => {
    expect(r).not.toContain(
      'which already holds the two Buttons of R12.12 and has no room for a third',
    );
  });
  it('drops on the Box until the 2 x 2 grid is full and expects the toast only on the overflowing drop', () => {
    expect(r).toContain('fifth');
    expect(r).toMatch(/third and (the )?fourth/);
  });
});

describe('R12.60: the Text child of a plain marking', () => {
  const r = row('R12.60');
  it('does not say that Add is born inside the plain marking', () => {
    expect(r).not.toContain('(it is born inside `Area`)');
  });
  it('builds the premise by dragging the Text inside Area and checks the Tree before the move', () => {
    expect(r).toContain('drag the text inside `Area`');
    expect(r).toMatch(/under `Area` in the Tree/);
  });
});
