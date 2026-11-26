// The drawing font (stage #2825, decisions 1, 4 and 7), in Chromium against the final `dist/index.html`:
// the four Mapping faces are registered and loaded, the interface keeps the system font, and the app's
// `konvaMeasurer` in the default component font measures the cases of `tests/fixtures/drawing-font-parity.json`
// (the server's widths) within 0.5 px, so a `texto` the MCP fits is not cut in the app.
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { drawingFontEsbuild } from '../../pwa/fontModules.mjs';

interface ParityFixture {
  families: Record<'sans' | 'mono', string>;
  cases: {
    family: 'sans' | 'mono';
    size: number;
    weight: number;
    text: string;
    width: number;
  }[];
}

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/drawing-font-parity.json', 'utf8'),
) as ParityFixture;

const TOLERANCE = 0.5;

// The app's measurer and the registration of the faces, on a blank page (as `textMetrics.spec.ts` does).
const ENTRY = `
import { konvaMeasurer } from './src/canvas/components/konvaMeasurer';
import { registerDrawingFonts } from './src/storage/drawingFonts';
window.ready = registerDrawingFonts();
window.measureWidth = (text, family, size, weight) =>
  konvaMeasurer(text, { family, size, weight, italic: false, lineHeight: Math.round(size * 1.25), letterSpacing: 0, wrap: 'none' }).width;
`;

let bundle = '';

async function loadMeasurer(page: Page): Promise<void> {
  if (bundle === '') {
    const result = await build({
      stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
      plugins: [drawingFontEsbuild],
    });
    bundle = result.outputFiles[0]!.text;
  }
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => (window as unknown as { ready: Promise<void> }).ready);
}

test.describe('the drawing font in dist/index.html', () => {
  test('the four Mapping faces are loaded and the interface keeps the system font', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('#app *');
    const faces = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.family.replace(/"/g, '').startsWith('Mapping '))
        .map((face) => ({
          family: face.family.replace(/"/g, ''),
          weight: face.weight,
          style: face.style,
          status: face.status,
        }))
        .sort((a, b) => `${a.family}${a.weight}`.localeCompare(`${b.family}${b.weight}`)),
    );
    expect(faces).toEqual([
      { family: 'Mapping Mono', weight: '1 599', style: 'normal', status: 'loaded' },
      { family: 'Mapping Mono', weight: '600 1000', style: 'normal', status: 'loaded' },
      { family: 'Mapping Sans', weight: '1 599', style: 'normal', status: 'loaded' },
      { family: 'Mapping Sans', weight: '600 1000', style: 'normal', status: 'loaded' },
    ]);
    const ui = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-sans'),
    );
    expect(ui).not.toContain('Mapping');
    const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(body).not.toContain('Mapping');
  });

  test('the app measures the parity cases like the server, within 0.5 px', async ({
    page,
  }) => {
    await loadMeasurer(page);
    const widths = await page.evaluate(
      (cases) =>
        cases.map((c) =>
          (
            window as unknown as {
              measureWidth: (t: string, f: string, s: number, w: number) => number;
            }
          ).measureWidth(c.text, c.family, c.size, c.weight),
        ),
      FIXTURE.cases.map((c) => ({ ...c, family: FIXTURE.families[c.family] })),
    );
    const off = FIXTURE.cases
      .map((c, i) => ({ c, app: widths[i]!, diff: Math.abs(widths[i]! - c.width) }))
      .filter((x) => x.diff > TOLERANCE)
      .map(
        (x) =>
          `${x.c.family} ${x.c.size}/${x.c.weight} "${x.c.text}": server ${x.c.width}, app ${x.app}`,
      );
    expect(off).toEqual([]);
  });
});
