// Stage #2121 (HB3, decision 13): the cases the server and Chromium both measure (see `tests/fixtures/shaping-parity.json`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PARITY_STRINGS = [
  'fit',
  'ii',
  'fi ii',
  'AV To Ty',
  'Hamburgefonstiv',
] as const;
export const PARITY_SPACINGS = [0, 4] as const;
export const PARITY_SIZE = 100;
export const PARITY_FONTS = ['sans', 'calt'] as const;
export type ParityFont = (typeof PARITY_FONTS)[number];

export interface ParityCase {
  readonly font: ParityFont;
  readonly text: string;
  readonly letterSpacing: number;
  readonly width: number;
}

/** The bytes of each font: Mapping Sans, and the test font of `scripts/testing/gsub-font.mjs --calt`. */
export function parityFontBytes(): Record<ParityFont, Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'mapping-parity-'));
  try {
    execFileSync('node', [
      'scripts/testing/gsub-font.mjs',
      join(dir, 'calt.ttf'),
      '--calt',
    ]);
    return {
      sans: new Uint8Array(readFileSync('mcp/fonts/MappingSans-Regular.ttf')),
      calt: new Uint8Array(readFileSync(join(dir, 'calt.ttf'))),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const parityKey = (c: Pick<ParityCase, 'font' | 'text' | 'letterSpacing'>) =>
  `${c.font}|${c.letterSpacing}|${c.text}`;
