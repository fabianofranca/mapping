// Opaque color of the disabled state of Material 3 (Compose): `top` at `alpha` composited over `base` (`compositeOver`).
import { expect } from 'vitest';

const channels = (hex: string): number[] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `top` with opacity `alpha` over `base` (both `#rrggbb`), as `#rrggbb`. */
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

/** The opaque color (`#rrggbb` or `#rrggbbff`) matches the expected one within ±1 per channel. */
export function isComposite(actual: string | undefined, expected: string): boolean {
  if (actual === undefined || !/^#[0-9a-f]{6}(ff)?$/i.test(actual)) return false;
  const want = channels(expected);
  return channels(actual).every((v, i) => Math.abs(v - want[i]!) <= 1);
}

/**
 * The color that comes out of the engine is opaque (`#rrggbb` or `#rrggbbff`) and equal to the expected one within ±1 per channel
 * (the engine rounds the composition differently from the test's `Math.round`).
 */
export function expectComposite(actual: string | undefined, expected: string): void {
  expect(actual, 'cor opaca').toMatch(/^#[0-9a-f]{6}(ff)?$/i);
  const got = channels(actual!);
  const want = channels(expected);
  got.forEach((v, i) =>
    expect(Math.abs(v - want[i]!), `${actual} ~ ${expected}`).toBeLessThanOrEqual(1),
  );
}
