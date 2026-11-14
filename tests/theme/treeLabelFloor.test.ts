import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CL1 (finding 5.1 of #1533): at 900×720 with Tree, Proposals and Details open the Tree ended up with
// 156 px and the `.tree-label` of Form, Age and Register had width 0, with no ellipsis. jsdom
// does not measure layout; the test checks the rule: the name has a floor (and still cuts with an ellipsis).
const css = readFileSync('src/theme/panels.css', 'utf8');
const start = css.indexOf('\n.tree-label {');
const rule = css.slice(start, css.indexOf('}', start));

describe('name in the narrow tree', () => {
  it('has a width floor by the column token, instead of being able to reach 0', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(rule).toMatch(/min-width:\s*calc\(var\(--size-grid-col-min\)\s*\*\s*0\.5\)/);
    expect(rule).not.toMatch(/min-width:\s*0\s*;/);
  });

  it('what goes past the floor is still cut with an ellipsis', () => {
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });
});
