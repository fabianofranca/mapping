// Stage #2121 (HB3, decision 13): Chromium measures the parity cases within 0.1 px of the widths the MCP server gives
// (`tests/fixtures/shaping-parity.json`, checked by `tests/mcp/shapingParity.test.ts`). It does not open the app: it
// loads the same fonts with `FontFace` from the bytes on a blank page and reads the width of a one-line `<span>`
// (Chromium's own text layout, with the CSS `letter-spacing` rules: no `liga`/`clig` when spaced).
//
// The app's `konvaMeasurer` is reported next to it, not asserted: it reads `measureText` without the canvas
// `letterSpacing` and adds `spacing × length`, so it keeps `liga` when spaced (`ii` → `m`), and the canvas measures
// the pairs around a space without kerning (`AV To Ty` is 3.6 px wider than in the DOM at size 100).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import {
  PARITY_SIZE,
  parityFontBytes,
  parityKey,
  type ParityCase,
} from '../support/shapingParity';

const ENTRY = `
import { konvaMeasurer } from './src/canvas/components/konvaMeasurer';
window.measureParity = async (fonts, cases, size) => {
  for (const [name, base64] of Object.entries(fonts)) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const face = new FontFace('Parity' + name, bytes.buffer);
    document.fonts.add(await face.load());
  }
  const dom = (c) => {
    const span = document.body.appendChild(document.createElement('span'));
    span.style.cssText = 'position:absolute;white-space:pre;font:' + size + 'px Parity' + c.font + ';letter-spacing:' + c.letterSpacing + 'px';
    span.textContent = c.text;
    const width = span.getBoundingClientRect().width;
    span.remove();
    return width;
  };
  const konva = (c) => konvaMeasurer(c.text, {
    family: 'Parity' + c.font, size, weight: 400, italic: false, lineHeight: size * 1.2,
    letterSpacing: c.letterSpacing,
  }).width;
  return cases.map((c) => ({ dom: dom(c), konva: konva(c) }));
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
  const fonts = Object.fromEntries(
    Object.entries(parityFontBytes()).map(([name, bytes]) => [
      name,
      Buffer.from(bytes).toString('base64'),
    ]),
  );
  const widths = await page.evaluate(
    ([f, cases, size]) =>
      (
        window as unknown as {
          measureParity: (
            a: unknown,
            b: unknown,
            c: unknown,
          ) => Promise<{ dom: number; konva: number }[]>;
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
