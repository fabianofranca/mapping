import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the text of the test script rows fixed by the CL1 round of stage #2825 (docs/TESTING.md).
const read = (p: string): string => readFileSync(p, 'utf8');
const testing = read('docs/TESTING.md');
const row = (id: string): string => {
  const line = testing.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (line === undefined) throw new Error(`row ${id} not found`);
  return line;
};

describe('docs/TESTING.md rows fixed by the CL1 round', () => {
  it('R25.23 does not cite errorCount, which validate_library does not return', () => {
    expect(row('R25.23')).not.toContain('`errorCount`');
    expect(row('R25.23')).toContain('`moreErrors` `211`');
  });

  it('R49.9 lists the notes with canvas true', () => {
    expect(row('R49.9')).toMatch(/`list_markings` of `nv6` with `canvas` `true`/);
  });

  it('R49.12 expects a null drawingMode echo and the pinned mode elsewhere', () => {
    expect(row('R49.12')).not.toContain('`drawingMode` says `dark`');
    expect(row('R49.12')).toContain('`drawingMode` is `null`');
    expect(row('R49.12')).toContain('`effectiveDrawingMode`');
  });

  it('R49.13 does not expect the Mono ink about 99 wide', () => {
    expect(row('R49.13')).not.toContain('about 99');
    expect(row('R49.13')).toContain('about 118 wide');
  });

  it('R9.30 divides by the container placement scale too', () => {
    expect(row('R9.30')).toContain('placement scale');
  });

  it('MCP.md and AGENT-GUIDE.md say the default list leaves the canvas markings out', () => {
    const mcp = read('docs/MCP.md')
      .split('\n')
      .find((l) => l.includes('`list_markings(project, filters)`'));
    expect(mcp).toContain('are not listed');
    expect(read('docs/AGENT-GUIDE.md')).toContain(
      'lists only the markings inside containers',
    );
  });
});
