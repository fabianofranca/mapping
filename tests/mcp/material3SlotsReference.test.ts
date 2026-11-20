// SL7 of #1080 (decision 17): without child markings the six types that gain named slots draw exactly as
// before. The reference was recorded from the library of the previous version (see
// `tests/support/material3SlotsReference.ts`) and is not updated: the `fallback` is today's drawing.
// One exception (stage #2121, HB2): the two hashes of `top-app-bar/small-empty` (the default title "Title") moved when the
// server began to shape with HarfBuzz, which applies the font's `Ti` pair kerning (-0.82 px at 22 px) that `opentype.js`
// 2.0.0 did not. The advance and the outline of every glyph are the same; only the position of what follows `T` changed,
// towards what Chromium draws.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CASES,
  SLOT_TYPES,
  rasterOfKey,
  referenceKeys,
} from '../support/material3SlotsReference';

const reference = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/material3-slots-before.json'), 'utf8'),
) as Record<string, string>;

describe('the six slot types without children draw as the previous version (raster, no reference update)', () => {
  it('the reference covers every case of the six types, in light and dark', () => {
    expect(Object.keys(reference).sort()).toEqual(referenceKeys().sort());
    for (const id of SLOT_TYPES) expect(Object.keys(CASES[id]).length).toBeGreaterThan(3);
  });

  for (const id of SLOT_TYPES) {
    it.each(Object.keys(CASES[id]))(`${id}: %s, light and dark`, (name) => {
      for (const mode of ['light', 'dark']) {
        const key = `${id}/${name}/${mode}`;
        expect(rasterOfKey(key), key).toBe(reference[key]);
      }
    });
  }
});
