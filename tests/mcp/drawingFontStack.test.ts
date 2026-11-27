import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFontBook } from '../../mcp/image/textMeasurer';

// The drawing font ends a stack: `"Mapping Sans", Gsub` draws Mapping Sans in the browser, so the server measures with it.
let dir: string;
let bytes: ArrayBuffer;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mapping-drawfont-'));
  execFileSync('node', ['scripts/testing/gsub-font.mjs', join(dir, 'gsub.ttf')]);
  const file = new Uint8Array(readFileSync(join(dir, 'gsub.ttf')));
  bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('a stack that starts with the drawing font', () => {
  it('measures with the embedded face, not a later library family', () => {
    const book = createFontBook([
      { family: 'Gsub', weight: '400', style: 'normal', path: 'fonts/Gsub.ttf', bytes },
    ]);
    expect(book.fontFor('"Mapping Sans", Gsub', 400, false)).toBe(
      book.fontFor('"Mapping Sans"', 400, false),
    );
    expect(book.fontFor('Gsub', 400, false)).not.toBe(
      book.fontFor('"Mapping Sans"', 400, false),
    );
  });
});
