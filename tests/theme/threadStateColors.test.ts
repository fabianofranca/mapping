import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokenValue } from '../../src/theme/tokens';

const CSS = ['src/theme/panels.css', 'src/theme/threads.css']
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** O corpo da regra cujo seletor é exatamente `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.]/g, '\\.');
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS);
  if (!m) throw new Error(`regra ${selector} não encontrada`);
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

/** Distância angular entre dois matizes, em graus. */
function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

const STATES = ['human', 'agent', 'resolved'] as const;
// Tolerância do matiz (decisão 3 da #925): 8° — o arredondamento do hex em cinzas azulados
// (resolvida) move o matiz em alguns graus; abaixo disso ainda se lê como a mesma cor.
const HUE_TOLERANCE = 8;

describe.each(STATES)('selo do estado %s', (state) => {
  it.each([`.comments-badge-${state}`, `.thread-state-${state}`])(
    '%s lê só os papéis color-thread-*',
    (selector) => {
      const body = ruleBody(selector);
      expect(body).toContain(`color: var(--color-thread-${state})`);
      expect(body).toContain(`background: var(--color-thread-${state}-bg)`);
      expect(body).not.toMatch(/--color-(warning|accent|selection|success)/);
    },
  );

  describe.each(['light', 'dark'] as const)('tema %s', (theme) => {
    const pin = tokenValue(`cv-pin-${state}`, theme);
    it.each([`color-thread-${state}`, `color-thread-${state}-bg`])(
      '%s é do matiz do cv-pin',
      (name) => {
        expect(hueGap(tokenValue(name, theme), pin)).toBeLessThanOrEqual(HUE_TOLERANCE);
      },
    );
  });
});

it('o selo "aberta" sem mensagem segue neutro', () => {
  expect(ruleBody('.comments-badge')).toContain('var(--color-text-muted)');
});
