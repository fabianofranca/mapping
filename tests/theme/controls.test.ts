import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// R2 (docs/redesign/HANDOFF.md): foco visível em tudo e alvos de 44px no celular.

const DIR = 'src/theme';
const css = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => [f, readFileSync(`${DIR}/${f}`, 'utf8')]),
);

describe('foco visível', () => {
  it('nenhum CSS remove o contorno de foco', () => {
    for (const [file, text] of Object.entries(css)) {
      expect(text, file).not.toMatch(/outline\s*:\s*(none|0)\b/);
      expect(text, file).not.toMatch(/outline-style\s*:\s*none/);
    }
  });

  it('há um anel global em :focus-visible com o token de foco', () => {
    expect(css['base.css']).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/,
    );
  });
});

describe('alvos de toque', () => {
  it.each(['.button', '.icon-button', '.segmented-item', '.input', '.tab'])(
    '%s usa a altura de densidade (44px no celular)',
    (selector) => {
      const rule = new RegExp(
        `(?:^|[\\s,])${selector.replace('.', '\\.')}[^{]*\\{[^}]*min-height:\\s*var\\(--control-height\\)`,
        'm',
      );
      expect(css['controls.css']).toMatch(rule);
    },
  );
});
