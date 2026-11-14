import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokenValue } from '../../src/theme/tokens';

const CSS = ['src/theme/panels.css', 'src/theme/threads.css']
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** The body of the rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.]/g, '\\.');
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS);
  if (!m) throw new Error(`rule ${selector} not found`);
  return m[1]!;
}

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r!, g!, b!);
  const d = max - Math.min(r!, g!, b!);
  const h =
    max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Angular distance between two hues, in degrees. */
function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

const STATES = ['human', 'agent', 'resolved'] as const;
// Hue tolerance (decision 3 of #925): 8° — the rounding of the hex in bluish grays
// (resolved) moves the hue by a few degrees; below that it still reads as the same color.
const HUE_TOLERANCE = 8;

describe.each(STATES)('%s state badge', (state) => {
  it.each([`.comments-badge-${state}`, `.thread-state-${state}`])(
    '%s reads only the color-thread-* roles',
    (selector) => {
      const body = ruleBody(selector);
      expect(body).toContain(`color: var(--color-thread-${state})`);
      expect(body).toContain(`background: var(--color-thread-${state}-bg)`);
      expect(body).not.toMatch(/--color-(warning|accent|selection|success)/);
    },
  );

  describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
    const pin = tokenValue(`cv-pin-${state}`, theme);
    it.each([`color-thread-${state}`, `color-thread-${state}-bg`])(
      '%s is of the cv-pin hue',
      (name) => {
        expect(hueGap(tokenValue(name, theme), pin)).toBeLessThanOrEqual(HUE_TOLERANCE);
      },
    );
  });
});

it('o selo "aberta" sem mensagem segue neutro', () => {
  expect(ruleBody('.comments-badge')).toContain('var(--color-text-muted)');
});
