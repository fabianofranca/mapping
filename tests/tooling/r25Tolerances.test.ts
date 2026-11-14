// R25.78 and R25.82 (findings 1.1 and 1.2 of round #1639): the script's expected result in the app must fit
// what the drawing gives at any scale (antialiasing and non-integer scale), with no exact value
// that only holds at `s` 1 and no probe on the edge of a stroke.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function row(id: string): string {
  const line = readFileSync('docs/TESTING.md', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`| ${id} |`));
  if (!line) throw new Error(`${id} is not in docs/TESTING.md`);
  return line;
}

describe('docs/TESTING.md: tolerances of R25.78 and R25.82', () => {
  it('R25.78: the rotated red one measures 55 to 58 (56.57 ± 1.5), measured with FUZZ=15', () => {
    const r = row('R25.78');
    expect(r).toContain("FUZZ=15 unid ra.png '#D32F2F'");
    expect(r).toContain('between 55 and 58');
    expect(r).not.toContain('between 56 and 59');
  });

  it('R25.82: the outline is probed inside the stroke and the grays follow the R25.81 criterion', () => {
    const r = row('R25.82');
    expect(r).not.toMatch(/353535|FDFDFD/);
    expect(r).toContain('(151, 60) in place of (150, 60)');
    expect(r).toContain('equal channels and below `80`');
    expect(r).toContain('equal channels and from `F0`');
  });
});
