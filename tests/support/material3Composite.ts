// Cor opaca do desabilitado da Material 3 (Compose): `top` a `alpha` composta sobre `base` (`compositeOver`).
import { expect } from 'vitest';

const channels = (hex: string): number[] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `top` com opacidade `alpha` sobre `base` (ambas `#rrggbb`), em `#rrggbb`. */
export function compositeOver(top: string, alpha: number, base: string): string {
  const [a, b] = [channels(top), channels(base)];
  return `#${a
    .map((v, i) =>
      Math.round(v! * alpha + b[i]! * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * A cor que sai do motor é opaca (`#rrggbb` ou `#rrggbbff`) e igual à esperada a ±1 por canal
 * (o motor arredonda a composição de outro jeito que o `Math.round` do teste).
 */
export function expectComposite(actual: string | undefined, expected: string): void {
  expect(actual, 'cor opaca').toMatch(/^#[0-9a-f]{6}(ff)?$/i);
  const got = channels(actual!);
  const want = channels(expected);
  got.forEach((v, i) => expect(Math.abs(v - want[i]!), `${actual} ~ ${expected}`).toBeLessThanOrEqual(1));
}
