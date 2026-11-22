// Stage #2121 (HB3, decision 13): Chromium measures the parity cases within 0.1 px of the widths the MCP server gives
// (`tests/fixtures/shaping-parity.json`, checked by `tests/mcp/shapingParity.test.ts`). It does not open the app: it
// loads the same fonts with `FontFace` from the bytes on a blank page and reads the width of a one-line `<span>`
// (Chromium's own text layout, with the CSS `letter-spacing` rules: no `liga`/`clig`/`calt` when spaced). The span uses
// `text-rendering: geometricPrecision`: without it a Linux Chromium rounds each advance to a whole pixel (CI, #2420).
//
// Stage #2448 (BD1, decision 10): the extra cases set `dir` on the span and read, for each code point, the left edge of
// its `Range` rectangle against the span's: Chromium's own bidi reordering, within the same 0.1 px of the server.
//
// The app's `konvaMeasurer` is reported next to it, not asserted: it reads `measureText` without the canvas
// `letterSpacing` and adds `spacing × length`, so it keeps `liga` when spaced (`ii` → `m`), and the canvas measures
// the pairs around a space without kerning (`AV To Ty` is 3.6 px wider than in the DOM at size 100).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import {
  PARITY_SIZE,
  INK_TOLERANCE,
  parityFaces,
  parityKey,
  type ParityCase,
} from '../support/shapingParity';

const ENTRY = `
import { konvaMeasurer } from './src/canvas/components/konvaMeasurer';
window.measureParity = async (fonts, cases, size) => {
  for (const { family, weight, base64 } of fonts) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const face = new FontFace('Parity' + family, bytes.buffer, { weight });
    document.fonts.add(await face.load());
  }
  // The ink of a case (stage #2448, BD2): from the origin and the baseline.
  // The ink is read from the pixels: the text is drawn at 8 times the size and the box of the lit pixels divided by 8
  // (the bounds of measureText are rounded and conservative; the fake bold, with a constant ratio from 36 px, and the
  // slant are linear, so the scale keeps the shape and brings the rounding to 1/8 px).
  const SCALE = 8;
  const ink = (c) => {
    const pad = 20 * SCALE;
    const font = (c.italic ? 'italic ' : '') + (c.weight ?? 400) + ' ' + size * SCALE + 'px Parity' + c.font;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const width = Math.ceil(probe.measureText(c.text).width) + 2 * pad;
    const height = Math.ceil(size * SCALE * 1.6);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    const baseline = Math.ceil(size * SCALE * 1.1);
    ctx.fillText(c.text, pad, baseline);
    const data = ctx.getImageData(0, 0, width, height).data;
    let left = width, right = -1, top = height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 127) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
        }
      }
    }
    return {
      left: (left - pad) / SCALE,
      right: (right + 1 - pad) / SCALE,
      top: (top - baseline) / SCALE,
    };
  };
  const dom = (c) => {
    const span = document.body.appendChild(document.createElement('span'));
    span.style.cssText = 'position:absolute;white-space:pre;text-rendering:geometricPrecision;font:' + (c.italic ? 'italic ' : '') + (c.weight ?? 400) + ' ' + size + 'px Parity' + c.font + ';letter-spacing:' + c.letterSpacing + 'px';
    if (c.direction) span.dir = c.direction;
    span.textContent = c.text;
    const left = span.getBoundingClientRect().left;
    const width = span.getBoundingClientRect().width;
    // The left edge of each code point (stage #2448): Chromium's own reordering of the runs.
    const starts = [];
    const node = span.firstChild;
    if (c.starts && node) {
      let at = 0;
      for (const ch of c.text) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + ch.length);
        starts.push(range.getBoundingClientRect().left - left);
        at += ch.length;
      }
    }
    span.remove();
    return { width, starts };
  };
  const konva = (c) => konvaMeasurer(c.text, {
    family: 'Parity' + c.font, size, weight: c.weight ?? 400, italic: c.italic ?? false, lineHeight: size * 1.2,
    letterSpacing: c.letterSpacing,
    ...(c.direction ? { direction: c.direction } : {}),
  }).width;
  return cases.map((c) => {
    const measured = dom(c);
    return {
      dom: measured.width,
      starts: measured.starts,
      konva: konva(c),
      ink: c.ink ? ink(c) : undefined,
    };
  });
};
`;

const TOLERANCE = 0.1;

test('Chromium measures the parity cases within 0.1 px of the server', async ({
  page,
}, info) => {
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    write: false,
    format: 'iife',
  });
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: result.outputFiles[0]!.text });
  const fixture = JSON.parse(
    readFileSync('tests/fixtures/shaping-parity.json', 'utf8'),
  ) as ParityCase[];
  const fonts = parityFaces().map((f) => ({
    family: f.family,
    weight: f.weight,
    base64: Buffer.from(f.bytes).toString('base64'),
  }));
  const widths = await page.evaluate(
    ([f, cases, size]) =>
      (
        window as unknown as {
          measureParity: (
            a: unknown,
            b: unknown,
            c: unknown,
          ) => Promise<
            {
              dom: number;
              konva: number;
              starts: number[];
              ink?: { left: number; right: number; top: number };
            }[]
          >;
        }
      ).measureParity(f, cases, size),
    [fonts, fixture, PARITY_SIZE] as const,
  );
  // The measured values, for adjusting the feature list or regenerating the fixture (decision 12).
  const off = fixture
    .map((c, i) => ({ c, chromium: widths[i]!.dom }))
    .filter(({ c, chromium }) => Math.abs(chromium - c.width) > TOLERANCE)
    .map(({ c, chromium }) => `${parityKey(c)}: server ${c.width}, Chromium ${chromium}`);
  expect(off).toEqual([]);
  // The left edge of each code point (stage #2448, decision 10), within the same tolerance.
  const startsOff = fixture.flatMap((c, i) =>
    (c.starts ?? []).flatMap((x, n) => {
      const chromium = widths[i]!.starts[n] ?? NaN;
      return !(Math.abs(chromium - x) <= TOLERANCE)
        ? [`${parityKey(c)} #${n}: server ${x}, Chromium ${chromium}`]
        : [];
    }),
  );
  expect(startsOff).toEqual([]);
  // The ink of the weight cases (stage #2448, BD2, decisions 12 to 14), within 1 px: the fake bold and the slant. The
  // browser rounds the bounds of `measureText` by its own rule (whole pixels on a Linux CI), so each case is compared
  // by its difference to the same text upright at 400, which both sides measure.
  const reference = (c: ParityCase) =>
    fixture.findIndex(
      (r) =>
        r.ink !== undefined &&
        r.font === c.font &&
        r.text === c.text &&
        r.weight === undefined &&
        !r.italic,
    );
  const inkOff = fixture.flatMap((c, i) => {
    const r = reference(c);
    const chromium = widths[i]!.ink;
    const chromiumRef = r < 0 ? undefined : widths[r]!.ink;
    if (
      c.ink === undefined ||
      r < 0 ||
      r === i ||
      chromium === undefined ||
      chromiumRef === undefined
    )
      return [];
    const ref = fixture[r]!.ink!;
    return (['left', 'right', 'top'] as const).flatMap((edge) => {
      const server = c.ink![edge] - ref[edge];
      const browser = chromium[edge] - chromiumRef[edge];
      return !(Math.abs(browser - server) <= INK_TOLERANCE)
        ? [
            `${parityKey(c)} ${edge}: server ${server}, Chromium ${browser} (against the 400 reference)`,
          ]
        : [];
    });
  });
  expect(inkOff).toEqual([]);
  const konva = fixture
    .map((c, i) => ({ c, width: widths[i]!.konva }))
    .filter(({ c, width }) => Math.abs(width - c.width) > TOLERANCE)
    .map(({ c, width }) => `${parityKey(c)}: server ${c.width}, konvaMeasurer ${width}`);
  if (konva.length > 0)
    info.annotations.push({
      type: 'konvaMeasurer differs',
      description: konva.join('; '),
    });
});
